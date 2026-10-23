/**
 * Back the database up, and get the copy off the server.
 *
 *   npm run backup
 *
 * The database is the work product: every club, clip, tag, stat and comment.
 * Footage in R2 survives the server dying; the database does not, unless a
 * copy lives somewhere else. So this takes a snapshot next to the app (kept
 * 30 days, for a quick restore after a bad migration) and, when footage is in
 * R2, sends the same snapshot to the bucket under `backups/`. The bucket's
 * lifecycle rule decides how long those are kept (docs/DEPLOYMENT.md).
 *
 * Run nightly from /etc/cron.daily/fisean-backup, and by deploy/update.sh
 * before every update, because a migration is the one step that pulling an
 * older commit cannot undo.
 */
import "./_env";
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { partBytes, planParts } from "../src/lib/media/upload";
import { storageDriver, store } from "../src/lib/storage";

const DB_PATH = resolve(process.env.DATABASE_PATH ?? "./data/fisean.db");
const BACKUP_DIR = resolve(process.env.BACKUP_DIR ?? "./data/backups");
const KEEP_DAYS = 30;

/** Where tonight's copy goes in the bucket. scripts/preflight.ts looks for the same name. */
function backupKey(day: string): string {
  return `backups/fisean-${day}.db`;
}

async function sendToBucket(file: string, key: string): Promise<void> {
  const media = await store();
  const bytes = await readFile(file);
  const plan = planParts(bytes.length);
  const uploadId = await media.createMultipart(key, "application/vnd.sqlite3");
  try {
    for (let n = 1; n <= plan.count; n++) {
      const start = (n - 1) * plan.partSize;
      // A copy, not a view: putPart wants its own ArrayBuffer.
      const part = new Uint8Array(bytes.subarray(start, start + partBytes(n, plan, bytes.length)));
      await media.putPart(key, uploadId, n, part);
    }
    await media.completeMultipart(key, uploadId, await media.listParts(key, uploadId));
  } catch (err) {
    await media.abortMultipart(key, uploadId).catch(() => {});
    throw err;
  }
}

async function pruneLocal(): Promise<number> {
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const name of await readdir(BACKUP_DIR)) {
    if (!/^fisean-\d{4}-\d{2}-\d{2}\.db$/.test(name)) continue;
    const path = join(BACKUP_DIR, name);
    if ((await stat(path)).mtimeMs < cutoff) {
      await rm(path);
      removed++;
    }
  }
  return removed;
}

async function main() {
  const day = new Date().toISOString().slice(0, 10);
  const file = join(BACKUP_DIR, `fisean-${day}.db`);
  await mkdir(BACKUP_DIR, { recursive: true });

  // SQLite's own backup API, which is safe against a live database in WAL
  // mode. Copying the file is not: it can catch a write halfway.
  const sqlite = new Database(DB_PATH, { fileMustExist: true });
  try {
    await sqlite.backup(file);
  } finally {
    sqlite.close();
  }
  console.log(`  Saved ${file}`);

  const removed = await pruneLocal();
  if (removed) console.log(`  Removed ${removed} local backup(s) older than ${KEEP_DAYS} days`);

  if (storageDriver() === "r2") {
    await sendToBucket(file, backupKey(day));
    console.log(`  Sent to the bucket as ${backupKey(day)}`);
  } else {
    // Not an error on a laptop, but on a server it means one disk holds the
    // only copy. scripts/preflight.ts reports it too.
    console.warn("  Footage is not in R2, so this backup stays on this machine only. Copy it off yourself.");
  }
}

main().catch((err) => {
  console.error("  Backup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
