/**
 * Which files in the bucket nothing uses any more: the decision, with no
 * storage and no database in it, so a test can state every case.
 *
 * Footage ends up orphaned in ordinary ways. Deleting a video removes its row
 * first and its file second (removeFootage in src/lib/storage), and the second
 * step is allowed to fail. A browser that dies mid-upload leaves parts behind
 * that no one will finish. Both cost money for ever unless something sweeps
 * them, and the sweep runs on a timer (scripts/reconcile-storage.ts).
 *
 * Everything here errs on keeping things. Deleting a club's footage that was
 * in use is the one mistake in this app with no undo, and keeping a stray file
 * a little longer costs a fraction of a cent. So the sweep is layered, and
 * each layer is its own rule:
 *
 *   1. It only looks at keys the app itself writes: <teamId>/<uuid>.<ext>
 *      for a team that exists. Backups, and anything put in the bucket by
 *      hand, are never candidates, never counted and never touched.
 *   2. A candidate must be unreferenced and older than a week.
 *   3. It must have been seen unreferenced on several separate nights, and
 *      be so again now (the ledger, table `storage_orphans`).
 *   4. The night's removals must be few, in absolute numbers and as a share
 *      of the bucket, or the whole run stops: that many at once means the
 *      sweep or the database is wrong, not that the bucket is untidy.
 *   5. It does nothing unless deletion has been switched on.
 *
 * And it stops before any of that if the database looks absent or empty.
 */
import type { StoredObject, StoredUpload } from "../storage";

/**
 * How old something must be before it can be swept. It covers the gap between
 * a file being written and its row being updated, and a coach resuming an
 * upload after a weekend, with a large margin.
 */
export const ORPHAN_GRACE_DAYS = 7;

/** Earlier nights a file must already have been seen unreferenced, before the night it is removed. */
export const MIN_PRIOR_NIGHTS = 3;
/** The most a single run may remove (files plus abandoned uploads). */
export const MAX_REMOVALS = 20;
/** And the most as a percentage of every object in the bucket. */
export const MAX_REMOVAL_PERCENT = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

/** `uploadKey` in src/lib/media/upload.ts: team id, a random uuid, the extension. */
const MANAGED_KEY = /^([^/]+)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$/;

/**
 * True for a key of the shape the app writes, under a team that exists. A
 * deleted club's team is gone, so its leftovers are not swept; they are rare
 * (closing a club removes its footage) and the host can clear them by hand.
 */
export function isManagedKey(key: string, teamIds: ReadonlySet<string>): boolean {
  const m = MANAGED_KEY.exec(key);
  return m !== null && teamIds.has(m[1]);
}

/** True when `lastModified` is a real time at least `graceDays` before `now`. */
function oldEnough(lastModified: number, now: number, graceDays: number): boolean {
  // A time we could not read (0, NaN) is treated as brand new: when in doubt, keep.
  return Number.isFinite(lastModified) && lastModified > 0 && now - lastModified > graceDays * DAY_MS;
}

/**
 * Objects with no row, past the grace period. This is rule 2 alone; the
 * sweep calls it through planReconcile, which applies the rest.
 * `usedKeys` must hold every key any row refers to, whatever state that row is in.
 */
export function findOrphanObjects(
  objects: readonly StoredObject[],
  usedKeys: ReadonlySet<string>,
  now: number,
  graceDays = ORPHAN_GRACE_DAYS,
): StoredObject[] {
  return objects.filter((o) => !usedKeys.has(o.key) && oldEnough(o.lastModified, now, graceDays));
}

/**
 * Multipart uploads begun more than the grace period ago and not the upload
 * id of any row. A row that still holds an upload id is an upload someone can
 * resume, however long ago it started.
 */
export function findStaleUploads(
  uploads: readonly StoredUpload[],
  usedUploadIds: ReadonlySet<string>,
  now: number,
  graceDays = ORPHAN_GRACE_DAYS,
): StoredUpload[] {
  return uploads.filter(
    (u) => !usedUploadIds.has(u.uploadId) && oldEnough(u.initiated, now, graceDays),
  );
}

/** The switch for deleting at all. Only the exact value "1" turns it on. */
export function reconcileDeleteEnabled(value: string | undefined): boolean {
  return value === "1";
}

/** A row of `storage_orphans`. */
export type LedgerEntry = { key: string; nights: number; lastSeenDay: string };

export type ReconcileInput = {
  /** Whether the database file exists. Checked before it is opened, which would otherwise create it. */
  databaseExists: boolean;
  /** Every row of `videos`, in any state. */
  videoRows: number;
  objects: readonly StoredObject[];
  uploads: readonly StoredUpload[];
  usedKeys: ReadonlySet<string>;
  usedUploadIds: ReadonlySet<string>;
  teamIds: ReadonlySet<string>;
  ledger: readonly LedgerEntry[];
  now: number;
  /** The UTC day, YYYY-MM-DD. A night is a day: two runs on one day are one night. */
  today: string;
  deleteEnabled: boolean;
};

export type Candidate = { object: StoredObject; nights: number };

export type ReconcilePlan = {
  /** Why nothing may be removed tonight, or null. When set, the other lists are empty. */
  abort: string | null;
  /** Unreferenced, old, app-written files, with the nights each has now been seen. */
  orphans: Candidate[];
  /** The orphans seen on enough earlier nights to be removed, whether or not deletion is on. */
  ready: StoredObject[];
  /** Abandoned uploads with no row, old enough to abort, whether or not deletion is on. */
  staleUploads: StoredUpload[];
  /** What to actually delete: `ready`, unless aborted or deletion is off. */
  remove: StoredObject[];
  /** What to actually abort: `staleUploads`, unless aborted or deletion is off. */
  abortUploads: StoredUpload[];
  /** Changes to the ledger. Empty when aborted, so an odd night counts for nothing. */
  ledger: { upsert: LedgerEntry[]; drop: string[] };
};

function stopped(abort: string): ReconcilePlan {
  return {
    abort,
    orphans: [],
    ready: [],
    staleUploads: [],
    remove: [],
    abortUploads: [],
    ledger: { upsert: [], drop: [] },
  };
}

export function planReconcile(input: ReconcileInput): ReconcilePlan {
  if (!input.databaseExists) {
    return stopped("The database file does not exist. DATABASE_PATH may be wrong, so nothing was removed.");
  }
  if (input.videoRows === 0) {
    return stopped("The database has no video rows. It may be the wrong or an empty database, so nothing was removed.");
  }

  const managed = (key: string) => isManagedKey(key, input.teamIds);
  const found = findOrphanObjects(input.objects.filter((o) => managed(o.key)), input.usedKeys, input.now);
  const staleUploads = findStaleUploads(
    input.uploads.filter((u) => managed(u.key)),
    input.usedUploadIds,
    input.now,
  );

  const seen = new Map(input.ledger.map((e) => [e.key, e]));
  const orphans: Candidate[] = [];
  const ready: StoredObject[] = [];
  const upsert: LedgerEntry[] = [];
  for (const object of found) {
    const before = seen.get(object.key);
    // A second run on the same day is the same night, so it adds nothing; and
    // the nights before tonight are what a removal is waiting on.
    const sameDay = before?.lastSeenDay === input.today;
    const prior = before ? (sameDay ? before.nights - 1 : before.nights) : 0;
    const nights = before ? (sameDay ? before.nights : before.nights + 1) : 1;
    orphans.push({ object, nights });
    upsert.push({ key: object.key, nights, lastSeenDay: input.today });
    if (prior >= MIN_PRIOR_NIGHTS) ready.push(object);
  }
  const orphanKeys = new Set(found.map((o) => o.key));
  const drop = input.ledger.filter((e) => !orphanKeys.has(e.key)).map((e) => e.key);

  const removals = ready.length + staleUploads.length;
  if (removals > MAX_REMOVALS) {
    return stopped(
      `Tonight's run would remove ${removals} items, more than the limit of ${MAX_REMOVALS}, so nothing was removed.`,
    );
  }
  // Whole numbers, so 2% of 500 is exactly 10 and not 10.000000000000002.
  if (removals * 100 > input.objects.length * MAX_REMOVAL_PERCENT) {
    return stopped(
      `Tonight's run would remove ${removals} of ${input.objects.length} objects, more than ${MAX_REMOVAL_PERCENT}% of the bucket, so nothing was removed.`,
    );
  }

  return {
    abort: null,
    orphans,
    ready,
    staleUploads,
    remove: input.deleteEnabled ? ready : [],
    abortUploads: input.deleteEnabled ? staleUploads : [],
    ledger: { upsert, drop },
  };
}
