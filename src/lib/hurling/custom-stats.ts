/**
 * Stats a squad defines for itself.
 *
 * The built-in sheet (stats.ts) is the vocabulary a club analyst hands round,
 * and it is fixed on purpose: every club's tackles and shots mean the same
 * thing. A coach still counts things the sheet has no heading for: a
 * breakdown ball won around the middle, a runner released, a restart we
 * pressed. So a squad's admin or coach describes the stat once, and it is
 * logged and reported beside the built-in ones.
 *
 * What a custom stat can ask is a small fixed menu, because every option has
 * to be something the logging form can draw and the report can total: whose
 * it was, our player's number, one of theirs, how it ended, whether a score
 * came of it, and up to two points on the pitch. The coach picks which of
 * those the stat asks; the rest are never shown when logging it.
 *
 * A custom stat never feeds the scoreline. A score recorded here is a fact
 * about the stat ("led to a point"), not a second way of scoring: a shot is
 * logged as a shot, and counting it twice would put the totals out.
 *
 * Everything here is pure, so the builder, the logging forms, the server
 * actions and the report read one definition. Tests: tests/custom-stats.test.mjs.
 */
import { termsFor, type GameCode } from "./codes";
import { clampToPitch } from "./pitch";
import {
  NEUTRAL_COLOUR,
  OUTCOME_COLOURS,
  OUTCOME_SHAPES,
  STAT_OUTCOMES,
  SIDES,
  jerseyNumber,
  type Half,
  type OutcomeShape,
  type Side,
  type StatOutcome,
  type StatVocabulary,
} from "./stats";

/* ------------------------------------------------------------ the options */

/**
 * Whose the stat is. Fixed for a stat that is always ours (or always theirs),
 * or asked each time for one that could be either.
 */
export const CUSTOM_SIDE_MODES = ["us", "opposition", "ask"] as const;
export type CustomSideMode = (typeof CUSTOM_SIDE_MODES)[number];

/**
 * Whether a score is involved: not at all, a yes or no ("led to a score"), or
 * which score it was. Neither adds to the match score; see the file note.
 */
export const CUSTOM_SCORE_MODES = ["none", "led_to", "which"] as const;
export type CustomScoreMode = (typeof CUSTOM_SCORE_MODES)[number];

/** The score a stat can name, when it asks which. A two-pointer only where the game has the arc. */
export const CUSTOM_SCORES = ["goal", "point", "two_pointer"] as const;
export type CustomScore = (typeof CUSTOM_SCORES)[number];

export const CUSTOM_SCORE_LABELS: Record<CustomScore, string> = {
  goal: "Cúl",
  point: "Cúilín",
  two_pointer: "Two-pointer",
};

export const CUSTOM_SIDE_MODE_LABELS: Record<CustomSideMode, string> = {
  us: "Ours",
  opposition: "Theirs",
  ask: "Either, asked each time",
};

export const CUSTOM_SCORE_MODE_LABELS: Record<CustomScoreMode, string> = {
  none: "No score",
  led_to: "Did it lead to a score",
  which: "Which score it was",
};

export const CUSTOM_POINT_LABELS: Record<0 | 1 | 2, string> = {
  0: "No place on the pitch",
  1: "One place",
  2: "From here to there",
};

export const CUSTOM_OUTCOME_LABELS: Record<StatOutcome, string> = {
  positive: "Good for us",
  negative: "Against us",
  unclear: "Unclear",
};

/** Enough for a squad's own counts; more than that is a second sheet. */
export const MAX_CUSTOM_STATS = 12;
export const CUSTOM_NAME_MAX = 30;

/** What a coach chose when they made the stat. */
export type CustomStatSpec = {
  name: string;
  sideMode: CustomSideMode;
  /** Ask for one of our players' numbers. */
  askPlayer: boolean;
  /** Ask for one of their players' numbers. */
  askOpposition: boolean;
  /** Ask whether it was good for us, against us or unclear. */
  askOutcome: boolean;
  scoreMode: CustomScoreMode;
  /** Points put on the pitch map: none, one place, or from one place to another. */
  points: 0 | 1 | 2;
};

/** A stat a squad defined, as the forms and the report hold it. */
export type CustomStatDef = CustomStatSpec & {
  id: string;
  /** Retired stats are not offered for logging but keep their history on the report. */
  archivedAt: number | null;
};

export const DEFAULT_SPEC: CustomStatSpec = {
  name: "",
  sideMode: "us",
  askPlayer: true,
  askOpposition: false,
  askOutcome: false,
  scoreMode: "none",
  points: 1,
};

function oneOf<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** The name as it will be shown: trimmed, spaces collapsed, never empty, never long. */
export function customStatName(value: unknown): string {
  const name = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!name) throw new Error("Give the stat a name.");
  if (name.length > CUSTOM_NAME_MAX) throw new Error(`Keep the name to ${CUSTOM_NAME_MAX} characters or fewer.`);
  return name;
}

/**
 * A stat's definition as the database should hold it, or a refusal. The
 * builder form and the server action both call it, because a server action is
 * reachable by POST whatever the form does.
 */
export function normaliseSpec(input: Partial<Record<keyof CustomStatSpec, unknown>>): CustomStatSpec {
  const points = input.points === 1 || input.points === 2 ? input.points : 0;
  return {
    name: customStatName(input.name),
    sideMode: oneOf(CUSTOM_SIDE_MODES, input.sideMode, "us"),
    askPlayer: input.askPlayer === true,
    askOpposition: input.askOpposition === true,
    askOutcome: input.askOutcome === true,
    scoreMode: oneOf(CUSTOM_SCORE_MODES, input.scoreMode, "none"),
    points,
  };
}

/** Two names are the same stat if they differ only in case or spacing. */
export function sameName(a: string, b: string): boolean {
  return a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * What logging this stat will ask, in the order the form asks it. Shown under
 * the builder so a coach sees the form they are making, and used in tests as
 * the one place the options are put into words.
 */
export function specQuestions(spec: CustomStatSpec, code: GameCode = "hurling"): string[] {
  const questions: string[] = [];
  if (spec.sideMode === "ask") questions.push("Whose it was, ours or theirs");
  if (spec.askPlayer) questions.push("Our player's number");
  if (spec.askOpposition) questions.push("Their player's number");
  if (spec.askOutcome) questions.push("Good for us, against us or unclear");
  if (spec.scoreMode === "led_to") questions.push("Whether it led to a score");
  if (spec.scoreMode === "which") {
    questions.push(`Which score it was: ${scoreChoices(code).map((s) => CUSTOM_SCORE_LABELS[s]).join(", ")}, or none`);
  }
  if (spec.points === 1) questions.push("Where on the pitch");
  if (spec.points === 2) questions.push("Where it started and where it went");
  return questions;
}

/** The scores a game's stat can name: the two-pointer only where there is an arc. */
export function scoreChoices(code: GameCode): CustomScore[] {
  return CUSTOM_SCORES.filter((s) => s !== "two_pointer" || termsFor(code).twoPointArc);
}

/* ----------------------------------------------- removing standard stats */

/**
 * A squad can take standard stats off its logging screens, for the ones it
 * never counts. These are the rules for that, kept here so the settings
 * panel, the server action and the logging screens agree.
 */

/** The stat types a squad still logs, in the sheet's order. */
export function shownStatTypes<T extends string>(all: readonly T[], hidden: readonly string[]): T[] {
  return all.filter((t) => !hidden.includes(t));
}

/**
 * Whether a standard stat can be removed. At least one has to stay, because
 * the logging form is built around picking one, and it has nothing to open on
 * otherwise. A stat already removed can always be brought back.
 */
export function canRemoveStandard<T extends string>(all: readonly T[], hidden: readonly string[], type: T): boolean {
  if (hidden.includes(type)) return true;
  return shownStatTypes(all, hidden).filter((t) => t !== type).length > 0;
}

/** The code's vocabulary with the squad's removed stats left out of its tab order. */
export function withoutStats(vocabulary: StatVocabulary, hidden: readonly string[]): StatVocabulary {
  if (hidden.length === 0) return vocabulary;
  return { ...vocabulary, statTypes: shownStatTypes(vocabulary.statTypes, hidden) };
}

/* ------------------------------------------------------------ the entries */

/** What the form sends. Numbers may arrive as typed text; the rules below settle them. */
export type CustomDraft = {
  side?: Side | null;
  playerNumber?: unknown;
  oppositionNumber?: unknown;
  outcome?: StatOutcome | null;
  ledToScore?: boolean | null;
  score?: CustomScore | null;
  originX?: number | null;
  originY?: number | null;
  destX?: number | null;
  destY?: number | null;
  half?: number | null;
};

/** One logged entry as it is stored: every column that does not apply is null. */
export type CustomValues = {
  side: Side;
  playerNumber: number | null;
  oppositionNumber: number | null;
  outcome: StatOutcome | null;
  ledToScore: boolean | null;
  score: CustomScore | null;
  originX: number | null;
  originY: number | null;
  destX: number | null;
  destY: number | null;
  half: Half | null;
};

function normalisePoint(x: number | null | undefined, y: number | null | undefined) {
  if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return clampToPitch(x, y);
}

/**
 * Put one entry into the shape its stat promises, or refuse it. Anything the
 * stat does not ask is dropped rather than trusted: a number sent for a stat
 * that never asked for one is not kept.
 */
export function normaliseCustomEntry(spec: CustomStatSpec, draft: CustomDraft, code: GameCode): CustomValues {
  let side: Side;
  if (spec.sideMode === "ask") {
    if (!draft.side || !SIDES.includes(draft.side)) throw new Error("Say whose it was, ours or theirs.");
    side = draft.side;
  } else {
    side = spec.sideMode;
  }

  let outcome: StatOutcome | null = null;
  if (spec.askOutcome) {
    if (!draft.outcome || !STAT_OUTCOMES.includes(draft.outcome)) throw new Error("Pick how it went.");
    outcome = draft.outcome;
  }

  let ledToScore: boolean | null = null;
  let score: CustomScore | null = null;
  if (spec.scoreMode === "led_to") ledToScore = draft.ledToScore === true;
  if (spec.scoreMode === "which" && draft.score) {
    if (!scoreChoices(code).includes(draft.score)) throw new Error("That score is not played in this game.");
    score = draft.score;
  }

  const origin = spec.points >= 1 ? normalisePoint(draft.originX, draft.originY) : null;
  // A second point is a place to, so it means nothing without the first.
  const dest = spec.points === 2 && origin ? normalisePoint(draft.destX, draft.destY) : null;

  return {
    side,
    playerNumber: spec.askPlayer ? jerseyNumber(draft.playerNumber) : null,
    oppositionNumber: spec.askOpposition ? jerseyNumber(draft.oppositionNumber) : null,
    outcome,
    ledToScore,
    score,
    originX: origin?.x ?? null,
    originY: origin?.y ?? null,
    destX: dest?.x ?? null,
    destY: dest?.y ?? null,
    half: draft.half === 1 || draft.half === 2 ? draft.half : null,
  };
}

/** Whether the form has everything the stat insists on, for the log button. */
export function customReady(
  spec: CustomStatSpec,
  form: { side: Side | null; outcome: StatOutcome | null; playerNumber: string; oppositionNumber: string },
): boolean {
  if (spec.sideMode === "ask" && !form.side) return false;
  if (spec.askOutcome && !form.outcome) return false;
  const numberOk = (value: string) => {
    if (!value.trim()) return true;
    try {
      return jerseyNumber(value) !== null;
    } catch {
      return false;
    }
  };
  if (spec.askPlayer && !numberOk(form.playerNumber)) return false;
  if (spec.askOpposition && !numberOk(form.oppositionNumber)) return false;
  return true;
}

/** What the logging forms and the report read of a stored entry. */
export type CustomEntryRow = CustomValues & {
  id: string;
  statId: string;
  videoId: string | null;
  atMs: number | null;
  halfMs: number | null;
  draft: boolean;
  createdAt: number;
  /** Game clock, filled in by the report page from the markers or the whistles. */
  gameMs?: number | null;
};

/* ------------------------------------------------------------ how it looks */

/** One colour rule for every map: green good for us, red against, amber unclear; chalk where no outcome was asked. */
export function customColour(entry: Pick<CustomValues, "outcome">): string {
  return entry.outcome ? OUTCOME_COLOURS[entry.outcome] : NEUTRAL_COLOUR;
}

/** The same outcomes in shape, so the map survives colour-blindness and photocopying. */
export function customShape(entry: Pick<CustomValues, "outcome">): OutcomeShape {
  return entry.outcome ? OUTCOME_SHAPES[entry.outcome] : "filled";
}

/** "Breakdown won, ours, good for us, led to a cúilín" in the words of whatever the stat asked. */
export function describeCustom(spec: CustomStatSpec, entry: CustomValues): string {
  const parts = [spec.name];
  if (spec.sideMode === "ask") parts.push(entry.side === "opposition" ? "theirs" : "ours");
  if (entry.outcome) parts.push(CUSTOM_OUTCOME_LABELS[entry.outcome].toLowerCase());
  if (entry.ledToScore) parts.push("led to a score");
  if (entry.score) parts.push(CUSTOM_SCORE_LABELS[entry.score].toLowerCase());
  return parts.join(", ");
}

/* --------------------------------------------------------------- the totals */

export type CustomSummary = {
  total: number;
  ours: number;
  theirs: number;
  outcomes: Record<StatOutcome, number>;
  ledToScore: number;
  scores: Record<CustomScore, number>;
  firstHalf: number;
  secondHalf: number;
  noHalf: number;
  /** Our players, most first. Only entries that named a number. */
  players: { number: number; count: number }[];
  /** Their players, most first. */
  opposition: { number: number; count: number }[];
};

/**
 * A stat's totals as the sentence a match report opens a section with. Says
 * only what the stat asked: a stat with no outcome has no "good for us".
 */
export function customSentence(spec: CustomStatSpec, s: CustomSummary): string {
  const sentences = [
    `${s.total} ${s.total === 1 ? "entry" : "entries"}${spec.sideMode === "ask" ? `, ${s.ours} ours and ${s.theirs} theirs` : ""}.`,
  ];
  if (spec.askOutcome) {
    sentences.push(`${s.outcomes.positive} good for us, ${s.outcomes.negative} against us and ${s.outcomes.unclear} unclear.`);
  }
  if (spec.scoreMode === "led_to") {
    sentences.push(`${s.ledToScore} led to a score.`);
  }
  if (spec.scoreMode === "which") {
    const named = CUSTOM_SCORES.filter((k) => s.scores[k] > 0).map((k) => `${CUSTOM_SCORE_LABELS[k]} ${s.scores[k]}`);
    if (named.length > 0) sentences.push(`Scores: ${named.join(", ")}.`);
  }
  return sentences.join(" ");
}

function ranked(counts: Map<number, number>): { number: number; count: number }[] {
  return [...counts]
    .map(([number, count]) => ({ number, count }))
    .sort((a, b) => b.count - a.count || a.number - b.number);
}

/**
 * Roll a stat's entries up. Derived each time the report is read, with no
 * stored total, so a corrected entry corrects the report.
 */
export function summariseCustom(entries: readonly CustomValues[]): CustomSummary {
  const summary: CustomSummary = {
    total: entries.length,
    ours: 0,
    theirs: 0,
    outcomes: { positive: 0, negative: 0, unclear: 0 },
    ledToScore: 0,
    scores: { goal: 0, point: 0, two_pointer: 0 },
    firstHalf: 0,
    secondHalf: 0,
    noHalf: 0,
    players: [],
    opposition: [],
  };
  const players = new Map<number, number>();
  const opposition = new Map<number, number>();

  for (const e of entries) {
    if (e.side === "opposition") summary.theirs++;
    else summary.ours++;
    if (e.outcome) summary.outcomes[e.outcome]++;
    if (e.ledToScore) summary.ledToScore++;
    if (e.score) summary.scores[e.score]++;
    if (e.half === 1) summary.firstHalf++;
    else if (e.half === 2) summary.secondHalf++;
    else summary.noHalf++;
    if (e.playerNumber != null) players.set(e.playerNumber, (players.get(e.playerNumber) ?? 0) + 1);
    if (e.oppositionNumber != null) opposition.set(e.oppositionNumber, (opposition.get(e.oppositionNumber) ?? 0) + 1);
  }

  summary.players = ranked(players);
  summary.opposition = ranked(opposition);
  return summary;
}
