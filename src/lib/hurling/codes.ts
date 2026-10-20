/**
 * The four Gaelic games a club can play on Ardawn.
 *
 * Ardawn is for hurling, camogie, Gaelic football and ladies Gaelic football
 * alike: the same footage, the same clips, the same panel on their phones.
 * A club says which it plays when it signs up (the admin can change it later
 * on the squad page, since nothing stored depends on it), and everything that differs
 * between the codes follows the club from here rather than assuming one
 * code: the ball a new drill starts with, the words for the restart and the
 * placed balls on the stat sheet and the tags, which built-in tags are
 * offered at all, and football's two-point arc.
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

/**
 * The words that differ between the codes, said the way each code says them.
 *
 * Only what genuinely differs is here. The stored values underneath stay the
 * same for every code (a restart is `puckout`, the end-line free is
 * `sixty_five`), so a stat sheet means the same thing to the roll-ups
 * whichever game it came from, and no row ever needs migrating because a
 * club plays football.
 */
export type CodeTerms = {
  /** The goalkeeper's restart. The Irish term stays Irish where it is the one said. */
  restart: string;
  /** Its plural, for headings and counts. "Poc amach" is its own plural. */
  restarts: string;
  /** The free given when a defender puts it over their own end line. */
  endLineFree: "65" | "45";
  /**
   * The line a coach measures territory by: "a delivery from inside our 65",
   * "a short one worked out past our 65". Camogie keeps hurling's here, on the
   * same pitch with the same short restart game, though its free is a 45.
   */
  line: "65" | "45";
  /** The sideline ball struck as a placed ball, and so as a score attempt. */
  sideline: string;
  /**
   * A score from outside the 40 m arc is worth two points. Gaelic football
   * brought it in in 2025, and the LGFA adopted it in April 2026; hurling and
   * camogie have no arc.
   */
  twoPointArc: boolean;
};

const STICK_TERMS = {
  restart: "Poc amach",
  restarts: "Poc amach",
  line: "65",
  sideline: "Sideline cut",
  twoPointArc: false,
} as const;

const FOOTBALL_TERMS: CodeTerms = {
  restart: "Kick-out",
  restarts: "Kick-outs",
  endLineFree: "45",
  line: "45",
  sideline: "Sideline kick",
  twoPointArc: true,
};

const TERMS: Record<GameCode, CodeTerms> = {
  hurling: { ...STICK_TERMS, endLineFree: "65" },
  camogie: { ...STICK_TERMS, endLineFree: "45" },
  football: FOOTBALL_TERMS,
  ladies_football: FOOTBALL_TERMS,
};

export function termsFor(code: GameCode): CodeTerms {
  return TERMS[code];
}

/** Radius of football's two-point arc, measured from the centre of the goal line. */
export const TWO_POINT_ARC_M = 40;
