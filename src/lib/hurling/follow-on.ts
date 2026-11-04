/**
 * What the logger expects to be logging next.
 *
 * Play restarts after a shot, and a free is followed by the placed ball, so
 * once one of those is saved the next thing a logger records is nearly always
 * the entry that follows it. The pad leaves the next entry on that type, ready
 * for the right team, rather than on the type just logged. Nothing is logged
 * for the coach and they can pick any other type as usual; it only saves the
 * taps that come after almost every shot and free.
 *
 * Whose entry it is is read from whose ball it was. A shot of ours that is
 * wide, saved or scored is followed by their restart, and the other way round.
 * A free won is ours, so the next thing is our shot from the free (or the 65,
 * or the 45); a free conceded is theirs, so the next thing is their shot. Pure,
 * so the rule can be tested without a pad.
 */
import type { Side, ShotKind, StatType } from "./stats";

export type FollowOn =
  | { statType: "puckout"; takenBy: Side }
  | { statType: "shot"; side: Side; shotKind: ShotKind };

/**
 * The entry that usually follows `statType`, or null when nothing is
 * expected. `side` is whose shot it was, read only for a shot.
 */
export function followOn(statType: StatType, side: Side): FollowOn | null {
  switch (statType) {
    case "shot":
      return { statType: "puckout", takenBy: side === "us" ? "opposition" : "us" };
    case "free_won":
      return { statType: "shot", side: "us", shotKind: "free" };
    case "free_conceded":
      return { statType: "shot", side: "opposition", shotKind: "free" };
    default:
      return null;
  }
}

/** The form fields `next` pre-fills, for the pad to merge into its details. */
export function followOnDetail(
  next: FollowOn,
): { puckoutTakenBy: Side } | { side: Side; shotKind: ShotKind } {
  return next.statType === "puckout"
    ? { puckoutTakenBy: next.takenBy }
    : { side: next.side, shotKind: next.shotKind };
}
