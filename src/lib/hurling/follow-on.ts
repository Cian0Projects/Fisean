/**
 * What the logger expects to be logging next.
 *
 * Play restarts after a shot, and after a free, so once one of those is saved
 * the next thing a logger records is nearly always the restart. The pad leaves
 * the next entry on that type, ready for the other team, rather than on the
 * type just logged. Nothing is logged for the coach and they can pick any
 * other type as usual; it only saves the tap that comes after almost every
 * shot and free.
 *
 * Whose restart is read from whose ball it was. A shot of ours that is wide,
 * saved or scored is followed by their restart, and the other way round. A
 * free won is ours and a free conceded is theirs, so the restart after it is
 * that team's. Pure, so the rule can be tested without a pad.
 */
import type { Side, StatType } from "./stats";

/**
 * The restart that usually follows `statType`, and whose it is, or null when
 * nothing is expected. `side` is whose shot it was, read only for a shot.
 */
export function restartAfter(statType: StatType, side: Side): { statType: "puckout"; takenBy: Side } | null {
  switch (statType) {
    case "shot":
      return { statType: "puckout", takenBy: side === "us" ? "opposition" : "us" };
    case "free_won":
      return { statType: "puckout", takenBy: "us" };
    case "free_conceded":
      return { statType: "puckout", takenBy: "opposition" };
    default:
      return null;
  }
}
