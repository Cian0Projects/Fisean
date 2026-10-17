/**
 * The four Gaelic games a club can play on Ardawn.
 *
 * Ardawn is for hurling, camogie, Gaelic football and ladies Gaelic football
 * alike: the same footage, the same clips, the same panel on their phones.
 * A club says which it plays when it signs up, so that anything that differs
 * between the codes can follow the club rather than assume hurling. Today
 * that is the ball a new drill starts with; the kick-out beside the puck-out,
 * the 45 beside the 65 and football's two-point arc are next, and they read
 * from here when they come.
 *
 * Dual clubs field a team in each code. Each team is its own space on Ardawn,
 * with its own code, panel and footage.
 *
 * The folder is still called `hurling/` because that is where the domain
 * logic began. It holds the rules for every code.
 */
import type { BallKind } from "./drill";

export const GAME_CODES = ["hurling", "camogie", "football", "ladies_football"] as const;
export type GameCode = (typeof GAME_CODES)[number];

export const GAME_LABELS: Record<GameCode, string> = {
  hurling: "Hurling",
  camogie: "Camogie",
  football: "Gaelic football",
  ladies_football: "Ladies Gaelic football",
};

export function isGameCode(value: unknown): value is GameCode {
  return typeof value === "string" && (GAME_CODES as readonly string[]).includes(value);
}

/** Hurling and camogie are played with a sliotar; both footballs with a football. */
export function ballFor(code: GameCode): BallKind {
  return code === "hurling" || code === "camogie" ? "sliotar" : "football";
}
