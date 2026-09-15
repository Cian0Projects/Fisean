/**
 * The built-in hurling event taxonomy.
 *
 * This is seed data, not application logic — it is written into `event_types`
 * with a NULL team_id on first run, and teams may add their own rows beside it.
 * Change a label or a hotkey here and it only affects newly seeded databases.
 *
 * Irish labels are used where the Irish term is the one people actually say on
 * a hurling pitch: cúl, cúilín, poc amach. Everything else is in English.
 */

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
  colour: string;
  /** cúl = 3 points, cúilín = 1. Everything else contributes nothing. */
  scoreValue?: number;
  /** Number-key binding in the review workspace. */
  hotkey?: string;
};

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
 * Hotkeys 1–9 and 0 are assigned to the ten events a selector tags most often
 * in a hurling match, so the common case never needs the mouse.
 */
export const HURLING_EVENTS: EventTypeSeed[] = [
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

  /* ----------------------------------------------------------------- shots */
  { slug: "wide", labelEn: "Wide", category: "shot", colour: "#f87171", hotkey: "3" },
  { slug: "short", labelEn: "Dropped short", category: "shot", colour: "#fb923c" },
  { slug: "saved", labelEn: "Saved", category: "shot", colour: "#38bdf8" },
  { slug: "off_post", labelEn: "Off the post", category: "shot", colour: "#facc15" },

  /* ----------------------------------------------------------- placed ball */
  // A 65 is hurling's equivalent of the football 45 — a free from the 65m line.
  { slug: "free_shot", labelEn: "Free (shot)", category: "placed_ball", colour: "#a78bfa" },
  { slug: "sixty_five", labelEn: "65", category: "placed_ball", colour: "#8b5cf6" },
  { slug: "penalty", labelEn: "Penalty", category: "placed_ball", colour: "#7c3aed" },
  { slug: "sideline_cut", labelEn: "Sideline cut", category: "placed_ball", colour: "#c084fc" },

  /* -------------------------------------------------------------- restarts */
  // The goalkeeper's restart. Retention off the poc amach is the single most
  // analysed number in modern hurling, so the outcomes are split out.
  {
    slug: "poc_amach_won",
    labelEn: "Puckout won",
    labelGa: "Poc amach — won",
    category: "restart",
    colour: "#0ea5e9",
    hotkey: "4",
  },
  {
    slug: "poc_amach_lost",
    labelEn: "Puckout lost",
    labelGa: "Poc amach — lost",
    category: "restart",
    colour: "#e11d48",
    hotkey: "5",
  },
  {
    slug: "poc_amach_short",
    labelEn: "Puckout short",
    labelGa: "Poc amach — short",
    category: "restart",
    colour: "#22d3ee",
  },
  {
    slug: "poc_amach_break",
    labelEn: "Puckout breaking ball",
    labelGa: "Poc amach — breaking ball",
    category: "restart",
    colour: "#67e8f9",
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
  // Hooking and blocking are the defining defensive skills of the game.
  { slug: "hook", labelEn: "Hook", category: "defensive", colour: "#2dd4bf", hotkey: "8" },
  { slug: "block", labelEn: "Block", category: "defensive", colour: "#5eead4" },
  { slug: "tackle", labelEn: "Tackle", category: "defensive", colour: "#99f6e4" },
  { slug: "dispossession", labelEn: "Dispossession", category: "defensive", colour: "#0d9488" },
  { slug: "interception", labelEn: "Interception", category: "defensive", colour: "#115e59" },

  /* ---------------------------------------------------------------- skills */
  { slug: "ground_stroke", labelEn: "Ground stroke", category: "skill", colour: "#eab308" },
  { slug: "doubling", labelEn: "Doubling / first-time pull", category: "skill", colour: "#ca8a04" },
  { slug: "jab_lift", labelEn: "Jab lift", category: "skill", colour: "#fde047" },
  { slug: "roll_lift", labelEn: "Roll lift", category: "skill", colour: "#fef08a" },
  { slug: "overhead_catch", labelEn: "Overhead catch", category: "skill", colour: "#fbbf24" },
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

/** Events bound to number keys, in hotkey order, for the tagging bar. */
export const HOTKEY_EVENTS = HURLING_EVENTS.filter((e) => e.hotkey).sort((a, b) =>
  // "0" sits at the end of the row on a keyboard, not the start.
  (a.hotkey === "0" ? "10" : a.hotkey!).localeCompare(b.hotkey === "0" ? "10" : b.hotkey!, undefined, {
    numeric: true,
  }),
);

/** The label to show a user: the Irish term where we have one. */
export function eventLabel(e: { labelEn: string; labelGa?: string | null }): string {
  return e.labelGa ?? e.labelEn;
}
