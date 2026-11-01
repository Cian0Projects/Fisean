/**
 * Recently deleted: how long a deleted match or video is kept before it goes
 * for good.
 *
 * Deleting a match used to remove its footage from the bucket on the spot,
 * and the footage has no second copy, so one stray click lost a match and
 * every clip, comment and stat on it. Now a delete only stamps `deleted_at`.
 * The row and the file stay, hidden from every screen, and an admin can put
 * them back from the squad page. The nightly purge (scripts/purge-deleted.ts)
 * removes them once the time below has passed.
 *
 * The purge can only ever remove rows someone deleted on purpose at least
 * this long ago, so unlike the bucket sweep it has no way to mistake a
 * missing database for permission to delete everything.
 *
 * Kept free of the database so the tests can import it.
 */

export const KEEP_DAYS = 20;

const DAY_MS = 86_400_000;
export const KEEP_MS = KEEP_DAYS * DAY_MS;

/** Deleted at or before this time means due for the purge. */
export function purgeCutoff(now: number): number {
  return now - KEEP_MS;
}

export function isDueForPurge(deletedAt: number, now: number): boolean {
  return deletedAt <= purgeCutoff(now);
}

/** Whole days until the purge may take it, never below nought. */
export function daysLeft(deletedAt: number, now: number): number {
  return Math.max(0, Math.ceil((deletedAt + KEEP_MS - now) / DAY_MS));
}

/** What the admin reads beside something they deleted. */
export function daysLeftLabel(deletedAt: number, now: number): string {
  const left = daysLeft(deletedAt, now);
  if (left === 0) return "Goes for good tonight";
  return left === 1 ? "1 day left to put it back" : `${left} days left to put it back`;
}

/**
 * The videos that come back when a match is put back: those deleted with it,
 * which carry the match's own stamp. A video deleted on its own before the
 * match was stays deleted, as the admin left it.
 */
export function deletedWithMatch<T extends { deletedAt: number | null }>(
  matchDeletedAt: number,
  footage: T[],
): T[] {
  return footage.filter((v) => v.deletedAt === matchDeletedAt);
}
