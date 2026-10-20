/**
 * The built-in tags, for all four codes.
 *
 * This is seed data — it is written into `event_types` with a NULL team_id,
 * once, and every club shares those rows; teams may add their own beside
 * them. Change a stored label or a hotkey here and it only affects newly
 * seeded databases.
 *
 * One shared set serves every code, and `tagsForCode` fits it to a club's
 * game when the tags are loaded: a tag that does not exist in that game (a
 * hook in football, a two-pointer in hurling) is not offered, and one that
 * goes by another name there is shown by that name (the poc amach tags read
 * as kick-outs, the 65 as a 45). The slug underneath never changes, so a
 * clip's tags mean the same thing to the scoreline whatever it is called.
 *
 * Irish labels are used where the Irish term is the one people actually say:
 * cúl, cúilín, poc amach. Everything else is in English.
 */
import type { GameCode } from "./codes";

export type EventCategory =
  | "score"
  | "shot"
  | "placed_ball"
  | "restart"
  | "defensive"
  | "skill"
  | "discipline"
  | "phase";

export type EventTypeSeed = {
  slug: string;
  labelEn: string;
  /** Only set where the Irish term is the common one. */
  labelGa?: string;
  category: EventCategory;
  /**
   * Stored with the row, but no longer what a tag is drawn in: the screen
   * colours a tag by its outcome (see `tagTone`), so the stock hues below
   * only survive in the database column.
   */
  colour: string;
  /** cúl = 3 points, cúilín = 1, two-pointer = 2. Everything else contributes nothing. */
  scoreValue?: number;
  /** Number-key binding in the review workspace. */
  hotkey?: string;
  /** The codes this tag exists in. Left out, it is every code's. */
  codes?: readonly GameCode[];
  /** What a code calls it, where that differs from the stored label. */
  as?: Partial<Record<GameCode, { labelEn: string; labelGa?: string | null }>>;
};

const STICK: readonly GameCode[] = ["hurling", "camogie"];
const FOOTBALL: readonly GameCode[] = ["football", "ladies_football"];

/** One label for both football codes, which say these things the same way. */
function inFootball(labelEn: string): Partial<Record<GameCode, { labelEn: string; labelGa: null }>> {
  return { football: { labelEn, labelGa: null }, ladies_football: { labelEn, labelGa: null } };
}

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  score: "Scores",
  shot: "Shots",
  placed_ball: "Placed balls",
  restart: "Restarts",
  defensive: "Defensive",
  skill: "Skills",
  discipline: "Discipline",
  phase: "Phases",
};

/**
 * Hotkeys 1–9 and 0 are assigned to the ten events a selector tags most often,
 * so the common case never needs the mouse. Football has no hook, so its 8 is
 * the two-pointer: the scoreline is read from the tags, and a score is the
 * one thing a selector cannot afford to reach for.
 */
export const BUILT_IN_EVENTS: EventTypeSeed[] = [
  /* ---------------------------------------------------------------- scores */
  {
    slug: "cul",
    labelEn: "Goal",
    labelGa: "Cúl",
    category: "score",
    colour: "#16a34a",
    scoreValue: 3,
    hotkey: "1",
  },
  {
    slug: "cuilin",
    labelEn: "Point",
    labelGa: "Cúilín",
    category: "score",
    colour: "#4ade80",
    scoreValue: 1,
    hotkey: "2",
  },
  // Over the bar from outside the 40 m arc: football since 2025, ladies
  // football since 2026. It counts in the points column at face value.
  {
    slug: "two_pointer",
    labelEn: "Two-pointer",
    category: "score",
    colour: "#22c55e",
    scoreValue: 2,
    hotkey: "8",
    codes: FOOTBALL,
  },

  /* ----------------------------------------------------------------- shots */
  { slug: "wide", labelEn: "Wide", category: "shot", colour: "#f87171", hotkey: "3" },
  { slug: "short", labelEn: "Dropped short", category: "shot", colour: "#fb923c" },
  { slug: "saved", labelEn: "Saved", category: "shot", colour: "#38bdf8" },
  { slug: "off_post", labelEn: "Off the post", category: "shot", colour: "#facc15" },

  /* ----------------------------------------------------------- placed ball */
  // The free given when a defender puts it over their own end line: a 65 in
  // hurling, a 45 in camogie and both footballs. One slug, so a sheet reads
  // the same whichever it is called.
  { slug: "free_shot", labelEn: "Free (shot)", category: "placed_ball", colour: "#a78bfa" },
  {
    slug: "sixty_five",
    labelEn: "65",
    category: "placed_ball",
    colour: "#8b5cf6",
    as: { camogie: { labelEn: "45" }, ...inFootball("45") },
  },
  { slug: "penalty", labelEn: "Penalty", category: "placed_ball", colour: "#7c3aed" },
  {
    slug: "sideline_cut",
    labelEn: "Sideline cut",
    category: "placed_ball",
    colour: "#c084fc",
    as: inFootball("Sideline kick"),
  },

  /* -------------------------------------------------------------- restarts */
  // The goalkeeper's restart: a poc amach with a stick, a kick-out in either
  // football. Retention off it is the single most analysed number in the
  // modern game, so the outcomes are split out.
  {
    slug: "poc_amach_won",
    labelEn: "Puckout won",
    labelGa: "Poc amach won",
    category: "restart",
    colour: "#0ea5e9",
    hotkey: "4",
    as: inFootball("Kick-out won"),
  },
  {
    slug: "poc_amach_lost",
    labelEn: "Puckout lost",
    labelGa: "Poc amach lost",
    category: "restart",
    colour: "#e11d48",
    hotkey: "5",
    as: inFootball("Kick-out lost"),
  },
  {
    slug: "poc_amach_short",
    labelEn: "Puckout short",
    labelGa: "Short poc amach",
    category: "restart",
    colour: "#22d3ee",
    as: inFootball("Short kick-out"),
  },
  {
    slug: "poc_amach_break",
    labelEn: "Puckout breaking ball",
    labelGa: "Poc amach broken",
    category: "restart",
    colour: "#67e8f9",
    as: inFootball("Kick-out breaking ball"),
  },
  { slug: "throw_in", labelEn: "Throw-in", category: "restart", colour: "#94a3b8" },
  { slug: "sideline_ball", labelEn: "Sideline ball", category: "restart", colour: "#cbd5e1" },

  /* ------------------------------------------------------------- defensive */
  { slug: "turnover_won", labelEn: "Turnover won", category: "defensive", colour: "#14b8a6", hotkey: "6" },
  {
    slug: "turnover_conceded",
    labelEn: "Turnover conceded",
    category: "defensive",
    colour: "#f43f5e",
    hotkey: "7",
  },
  // Hooking and blocking are the defining defensive skills of the stick
  // game. Football has no hook; its block is the block down.
  { slug: "hook", labelEn: "Hook", category: "defensive", colour: "#2dd4bf", hotkey: "8", codes: STICK },
  { slug: "block", labelEn: "Block", category: "defensive", colour: "#5eead4", as: inFootball("Block down") },
  { slug: "tackle", labelEn: "Tackle", category: "defensive", colour: "#99f6e4" },
  { slug: "dispossession", labelEn: "Dispossession", category: "defensive", colour: "#0d9488" },
  { slug: "interception", labelEn: "Interception", category: "defensive", colour: "#115e59" },

  /* ---------------------------------------------------------------- skills */
  { slug: "ground_stroke", labelEn: "Ground stroke", category: "skill", colour: "#eab308", codes: STICK },
  { slug: "doubling", labelEn: "Doubling / first-time pull", category: "skill", colour: "#ca8a04", codes: STICK },
  { slug: "jab_lift", labelEn: "Jab lift", category: "skill", colour: "#fde047", codes: STICK },
  { slug: "roll_lift", labelEn: "Roll lift", category: "skill", colour: "#fef08a", codes: STICK },
  {
    slug: "overhead_catch",
    labelEn: "Overhead catch",
    category: "skill",
    colour: "#fbbf24",
    as: inFootball("High catch"),
  },
  // A clean catch that earns a free kick: the mark, in both footballs.
  { slug: "mark", labelEn: "Mark", category: "skill", colour: "#f97316", codes: FOOTBALL },
  { slug: "kick_pass", labelEn: "Kick pass", category: "skill", colour: "#ea580c", codes: FOOTBALL },
  { slug: "breaking_ball_win", labelEn: "Breaking ball won", category: "skill", colour: "#f59e0b" },
  { slug: "solo_run", labelEn: "Solo run", category: "skill", colour: "#d97706" },
  { slug: "handpass", labelEn: "Handpass", category: "skill", colour: "#b45309" },

  /* ------------------------------------------------------------ discipline */
  { slug: "free_won", labelEn: "Free won", category: "discipline", colour: "#34d399", hotkey: "9" },
  { slug: "free_conceded", labelEn: "Free conceded", category: "discipline", colour: "#fb7185", hotkey: "0" },
  { slug: "yellow_card", labelEn: "Yellow card", category: "discipline", colour: "#facc15" },
  { slug: "red_card", labelEn: "Red card", category: "discipline", colour: "#dc2626" },
  // Since 2022 a cynical foul inside the 20m line or the arc concedes a penalty
  // and the offender goes to the sin bin for ten minutes.
  { slug: "cynical_foul", labelEn: "Cynical foul / sin bin", category: "discipline", colour: "#991b1b" },

  /* ---------------------------------------------------------------- phases */
  { slug: "attacking_transition", labelEn: "Attacking transition", category: "phase", colour: "#6366f1" },
  { slug: "defensive_setup", labelEn: "Defensive setup", category: "phase", colour: "#4f46e5" },
  { slug: "restart_phase", labelEn: "Restart phase", category: "phase", colour: "#818cf8" },
];

const SEED_BY_SLUG = new Map(BUILT_IN_EVENTS.map((e) => [e.slug, e]));

/** Whether a built-in tag exists in this code at all. */
export function inCode(seed: Pick<EventTypeSeed, "codes">, code: GameCode): boolean {
  return !seed.codes || seed.codes.includes(code);
}

/** The built-in tags one code is offered, labelled as that code says them. */
export function builtInEventsFor(code: GameCode): EventTypeSeed[] {
  return BUILT_IN_EVENTS.filter((e) => inCode(e, code)).map((e) => {
    const as = e.as?.[code];
    return as ? { ...e, labelEn: as.labelEn, labelGa: as.labelGa ?? undefined } : e;
  });
}

type EventRowLike = {
  id: string;
  teamId: string | null;
  slug: string;
  labelEn: string;
  labelGa: string | null;
  hotkey?: string | null;
};

/**
 * Fit the shared tag rows to one club's game, wherever the tags are loaded.
 *
 * Built-in rows (team_id NULL) are matched to their seed by slug: dropped if
 * the code does not have them, relabelled if it calls them something else.
 * A club's own tags are its own, and pass through untouched.
 *
 * An admin can change the club's game on the squad page, so clips may carry
 * a tag the new code does not offer. Pass `keepUnoffered` where the rows only
 * name tags already on clips, or `onClips` with the ids on the clips in view:
 * either way a clip still says what it was tagged with. A tag kept that way
 * loses its hotkey, because the new code's own tags hold every number key.
 */
export function tagsForCode<T extends EventRowLike>(
  rows: readonly T[],
  code: GameCode,
  { keepUnoffered = false, onClips = [] }: { keepUnoffered?: boolean; onClips?: Iterable<string> } = {},
): T[] {
  const used = new Set(onClips);
  const out: T[] = [];
  for (const row of rows) {
    const seed = row.teamId === null ? SEED_BY_SLUG.get(row.slug) : undefined;
    if (!seed) {
      out.push(row);
      continue;
    }
    if (!inCode(seed, code)) {
      if (keepUnoffered) out.push(row);
      else if (used.has(row.id)) out.push("hotkey" in row ? { ...row, hotkey: null } : row);
      continue;
    }
    const as = seed.as?.[code];
    out.push(as ? { ...row, labelEn: as.labelEn, labelGa: as.labelGa ?? null } : row);
  }
  return out;
}

/**
 * What a tag says about the game, which is the only thing its colour is
 * allowed to say.
 *
 * Colour in Físeán means an outcome — good for us, against us, unclear — and
 * the tags are drawn with the same three marks as the stat sheet's pitch maps
 * (filled, ring, dashed ring), so a clip list reads the way a shot map does.
 * A tag that only names a skill or a phase ("Hook", "Solo run", "Throw-in")
 * is not an outcome and stays in ink; giving each its own hue was decoration,
 * and with forty tags the hues ran out of meaning long before they ran out.
 *
 * Cards are the one literal colour, because a referee's card is yellow or red
 * whatever it means for the game, and they are drawn card-shaped so neither
 * is mistaken for an outcome. A team's own tags are unknown here and stay in
 * ink until someone says what they mean.
 */
export type TagTone = "good" | "against" | "unclear" | "yellow_card" | "red_card" | "plain";

const TONES: Record<string, TagTone> = {
  cul: "good",
  cuilin: "good",
  two_pointer: "good",
  // Our own shot that did not score is a chance gone, which is against us.
  wide: "against",
  short: "against",
  saved: "against",
  // Off the post can fall either way.
  off_post: "unclear",
  poc_amach_won: "good",
  poc_amach_lost: "against",
  poc_amach_break: "unclear",
  turnover_won: "good",
  turnover_conceded: "against",
  dispossession: "good",
  interception: "good",
  breaking_ball_win: "good",
  free_won: "good",
  free_conceded: "against",
  cynical_foul: "against",
  yellow_card: "yellow_card",
  red_card: "red_card",
};

export function tagTone(slug: string): TagTone {
  return TONES[slug] ?? "plain";
}

/**
 * A clip's tone is its first tag that says something, so a clip tagged
 * "Hook" and then "Turnover won" still reads as won.
 */
export function clipTagTone(slugs: string[]): TagTone {
  for (const slug of slugs) {
    const tone = tagTone(slug);
    if (tone !== "plain") return tone;
  }
  return "plain";
}

/** The label to show a user: the Irish term where we have one. */
export function eventLabel(e: { labelEn: string; labelGa?: string | null }): string {
  return e.labelGa ?? e.labelEn;
}
