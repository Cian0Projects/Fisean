/**
 * Sweep the bucket for files no database row uses.
 *
 *   npm run reconcile               # record what is unused; remove nothing unless RECONCILE_DELETE=1
 *   npm run reconcile -- --dry-run  # read only: record nothing, remove nothing, email nothing
 *
 * The database is the source of truth (removeFootage in src/lib/storage
 * deletes a video's row first and its file second, and the second step may
 * fail), so a file with no row is a leftover. So is the half of an upload that
 * a browser abandoned. This lists both and works out what is unused. Whether
 * anything may be removed is decided in src/lib/media/orphans.ts, which is
 * where the safety rules are and the tests are; this is the plumbing around it:
 * read the bucket and the database, keep the ledger of nights a file has been
 * unused (table `storage_orphans`), remove what the plan says, and email the
 * host. Run nightly after the backup, from deploy/backup-cron.sh.
 *
 * With RECONCILE_DELETE unset, which is the default, it only reports. Leave it
 * that way for a few nights, read the emails, and set RECONCILE_DELETE=1 once
 * the list is what you expect.
 */
import "./_env";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { inArray, sql } from "drizzle-orm";
import { sendMail } from "../src/lib/mail";
import { storageSweepMail } from "../src/lib/mail/templates";
import {
  planReconcile,
  reconcileDeleteEnabled,
  type LedgerEntry,
  type ReconcilePlan,
} from "../src/lib/media/orphans";
import { storageOrphans, teams, videos } from "../src/lib/db/schema";
import { store } from "../src/lib/storage";

const dryRun = process.argv.includes("--dry-run");
const deleteEnabled = reconcileDeleteEnabled(process.env.RECONCILE_DELETE);
const DB_PATH = resolve(process.env.DATABASE_PATH ?? "./data/fisean.db");
const CHUNK = 500;

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function chunks<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

type Outcome = {
  plan: ReconcilePlan;
  bucketObjects: number;
  removed: number;
  abortedUploads: number;
  failures: string[];
};

async function sweep(): Promise<Outcome> {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const empty = new Set<string>();

  // The database client creates the file if it is missing, so look first.
  // Opening a fresh empty database and finding it has no videos is exactly
  // the mistake the zero-rows rule exists for, but never creating one is better.
  if (!existsSync(DB_PATH)) {
    const plan = planReconcile({
      databaseExists: false,
      videoRows: 0,
      objects: [],
      uploads: [],
      usedKeys: empty,
      usedUploadIds: empty,
      teamIds: empty,
      ledger: [],
      now,
      today,
      deleteEnabled,
    });
    return { plan, bucketObjects: 0, removed: 0, abortedUploads: 0, failures: [] };
  }
  const { db } = await import("../src/lib/db/client");

  const media = await store();
  // List first, read the database second. A new upload writes its row before
  // its file, so a file in the listing already has its row by the time we
  // look; the other order could see a file whose row we missed. The grace
  // period covers whatever is left.
  const objects = await media.listObjects();
  const uploads = await media.listMultipartUploads();

  // Every row, in whatever state: no filter on status, and none on any future
  // soft-delete marker either. A row that is hidden is still a row, and its
  // file is still wanted until the row itself is gone. The derived keys
  // (hls, proxy, sprite) are used the same way, though nothing writes them
  // while the app has no ffmpeg.
  const rows = await db
    .select({
      storageKey: videos.storageKey,
      uploadId: videos.uploadId,
      hlsKey: videos.hlsKey,
      proxyKey: videos.proxyKey,
      spriteKey: videos.spriteKey,
    })
    .from(videos);
  const usedKeys = new Set<string>();
  const usedUploadIds = new Set<string>();
  for (const row of rows) {
    for (const key of [row.storageKey, row.hlsKey, row.proxyKey, row.spriteKey]) {
      if (key) usedKeys.add(key);
    }
    if (row.uploadId) usedUploadIds.add(row.uploadId);
  }
  const teamIds = new Set((await db.select({ id: teams.id }).from(teams)).map((t) => t.id));
  const ledger: LedgerEntry[] = (
    await db
      .select({ key: storageOrphans.key, nights: storageOrphans.nights, lastSeenDay: storageOrphans.lastSeenDay })
      .from(storageOrphans)
  );

  const plan = planReconcile({
    databaseExists: true,
    videoRows: rows.length,
    objects,
    uploads,
    usedKeys,
    usedUploadIds,
    teamIds,
    ledger,
    now,
    today,
    deleteEnabled,
  });
  const outcome: Outcome = { plan, bucketObjects: objects.length, removed: 0, abortedUploads: 0, failures: [] };
  if (plan.abort || dryRun) return outcome;

  // Record the night before removing anything, so a crash part-way leaves the
  // ledger true: what was seen, was seen.
  for (const batch of chunks(plan.ledger.upsert)) {
    await db
      .insert(storageOrphans)
      .values(batch.map((e) => ({ ...e, firstSeenAt: now, lastSeenAt: now })))
      .onConflictDoUpdate({
        target: storageOrphans.key,
        set: {
          nights: sql`excluded.nights`,
          lastSeenDay: sql`excluded.last_seen_day`,
          lastSeenAt: sql`excluded.last_seen_at`,
        },
      });
  }
  for (const batch of chunks(plan.ledger.drop)) {
    await db.delete(storageOrphans).where(inArray(storageOrphans.key, batch));
  }

  // One at a time and each on its own: a failure on one file must not stop
  // the rest. A removed file leaves the ledger; a failed one stays and is
  // tried again tomorrow.
  const gone: string[] = [];
  for (const o of plan.remove) {
    try {
      await media.remove(o.key);
      outcome.removed++;
      gone.push(o.key);
    } catch (err) {
      outcome.failures.push(`${o.key}: ${message(err)}`);
    }
  }
  for (const u of plan.abortUploads) {
    try {
      await media.abortMultipart(u.key, u.uploadId);
      outcome.abortedUploads++;
    } catch (err) {
      outcome.failures.push(`upload ${u.uploadId} (${u.key}): ${message(err)}`);
    }
  }
  for (const batch of chunks(gone)) {
    await db.delete(storageOrphans).where(inArray(storageOrphans.key, batch));
  }
  return outcome;
}

function mb(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function day(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function print(o: Outcome): void {
  const { plan } = o;
  console.log(`  Reconciled the bucket against the database${dryRun ? " (dry run, nothing recorded or removed)" : ""}`);
  if (plan.abort) {
    console.error(`  Stopped: ${plan.abort}`);
    return;
  }
  console.log(`  ${o.bucketObjects} object(s) in the bucket, deletion is ${deleteEnabled ? "on" : "off"}`);
  for (const c of plan.orphans) {
    const due = plan.ready.includes(c.object) ? ", due" : "";
    console.log(`    unused   ${c.object.key} (${mb(c.object.sizeBytes)}, written ${day(c.object.lastModified)}, night ${c.nights}${due})`);
  }
  for (const u of plan.staleUploads) {
    console.log(`    upload   ${u.key} (${u.uploadId}, begun ${day(u.initiated)})`);
  }
  console.log(`  ${plan.orphans.length} unused file(s), ${plan.ready.length} due for removal, ${plan.staleUploads.length} abandoned upload(s)`);
  console.log(`  Removed ${o.removed} file(s) and aborted ${o.abortedUploads} upload(s)`);
}

/** Tell the host. Never throws; a mail failure must not hide the result of the sweep. */
async function tell(o: Outcome): Promise<boolean> {
  const to = process.env.ALERT_EMAIL?.trim();
  if (!to) {
    console.warn("  ALERT_EMAIL is not set, so the host was not emailed.");
    return true;
  }
  try {
    await sendMail({
      to,
      ...storageSweepMail({
        aborted: o.plan.abort,
        deleteEnabled,
        bucketObjects: o.bucketObjects,
        orphans: o.plan.orphans.map((c) => ({ key: c.object.key, nights: c.nights })),
        due: o.plan.ready.length,
        removed: o.removed,
        abortedUploads: o.abortedUploads,
        failures: o.failures,
        at: new Date().toISOString(),
      }),
    });
    return true;
  } catch (err) {
    console.error("  Could not email the host:", message(err));
    return false;
  }
}

async function main() {
  let outcome: Outcome;
  try {
    outcome = await sweep();
  } catch (err) {
    // Anything that stops the run before a plan exists (the bucket would not
    // list, the table is missing) is an abort too, and the host hears of it.
    const reason = `The sweep failed before it could decide anything: ${message(err)}`;
    outcome = {
      plan: {
        abort: reason,
        orphans: [],
        ready: [],
        staleUploads: [],
        remove: [],
        abortUploads: [],
        ledger: { upsert: [], drop: [] },
      },
      bucketObjects: 0,
      removed: 0,
      abortedUploads: 0,
      failures: [],
    };
  }

  print(outcome);
  let ok = !outcome.plan.abort && outcome.failures.length === 0;
  for (const f of outcome.failures) console.error(`    could not remove ${f}`);
  if (!dryRun && !(await tell(outcome))) ok = false;
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error("  Reconcile failed:", message(err));
  process.exit(1);
});
