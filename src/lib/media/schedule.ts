/**
 * Which footage import starts next.
 *
 * Imports used to share two slots across every club, so on a busy Sunday one
 * club pasting six links held everyone else up until its own six were done.
 * The rule now is about fairness between clubs, not speed for any one of them:
 *
 *  - a club has at most one import running at a time;
 *  - only `limit` run at once across the whole instance;
 *  - the next to start is the one that has waited longest, among clubs that
 *    have nothing running.
 *
 * Kept free of the database and the network so the tests can import it. The
 * waiting list is in the order imports joined it, so "oldest" is its first
 * eligible entry; the caller owns that order.
 */

export type Waiting = { id: string; teamId: string };

/**
 * The id of the import to start now, or null if none may start: the instance
 * is at its limit, nothing is waiting, or every waiting club already has an
 * import running.
 *
 * `running` is the team of each import now running, one entry per import.
 */
export function nextImport(waiting: readonly Waiting[], running: readonly string[], limit: number): string | null {
  if (running.length >= limit) return null;
  const busy = new Set(running);
  return waiting.find((w) => !busy.has(w.teamId))?.id ?? null;
}
