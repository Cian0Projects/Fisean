/**
 * The post-match stat sheet.
 *
 * Deliberately separate from the clip taxonomy in events.ts: these are the
 * numbers a selector keeps in a notebook on the line and types up afterwards.
 * They are not derived from tags, they do not need footage, and a match
 * nobody filmed still has a stat sheet.
 *
 * The vocabulary follows the summary a club analyst actually hands round —
 * score opportunities for both teams, poc amach by length, deliveries,
 * possessions won and lost, discipline — so the report can be laid out under
 * the same headings the dressing room already reads.
 *
 * Everything here is pure — the vocabulary, the outcome rules and the
 * roll-ups — so the report, the logging form and the database column enums
 * all read from one definition. The arithmetic is unit tested in
 * tests/stats.test.mjs.
 */
import {
  GOAL_VALUE,
  formatScore,
  scoreMargin,
  tallyScore,
  toGameTime,
  type Markers,
  type Score,
} from "./notation";
import { clampToPitch } from "./pitch";

/* ------------------------------------------------------------ vocabulary */

export const STAT_TYPES = [
  "tackle",
  "delivery",
  "turnover",
  "shot",
  "free_conceded",
  "puckout",
  "free_won",
] as const;
export type StatType = (typeof STAT_TYPES)[number];

/**
 * Always read from our point of view — "positive" is good for us whoever the
 * ball belonged to. That is what lets one colour rule cover every map in the
 * report: green for us, red against us, orange where it was genuinely unclear.
 */
export const STAT_OUTCOMES = ["positive", "negative", "unclear"] as const;
export type StatOutcome = (typeof STAT_OUTCOMES)[number];

/** Whose ball it was: whose shot, whose restart. */
export const SIDES = ["us", "opposition"] as const;
export type Side = (typeof SIDES)[number];

/**
 * Whose poc amach it was. Who won it is the outcome — a separate axis, so a
 * coach picks from two short lists rather than one list of four combinations.
 */
export const PUCKOUT_SIDES = SIDES;
export type PuckoutSide = Side;

/**
 * Every way a score attempt can end. A cúl and a cúilín are scores; a wide, a
 * save and a ball dropped short into the keeper's hand are chances gone. A
 * ball dropped short that we kept, or one put out for a 65, is neither yet —
 * the attack is still alive, so it reads as unclear rather than as a miss.
 */
export const SHOT_RESULTS = [
  "goal",
  "point",
  "wide",
  "saved",
  "lost",
  "retained",
  "sixty_five",
] as const;
export type ShotResult = (typeof SHOT_RESULTS)[number];

/** From play, or a placed ball — a scorable free or a 65. */
export const SHOT_KINDS = ["play", "free"] as const;
export type ShotKind = (typeof SHOT_KINDS)[number];

/** What the attempt came from. Anything that is not a restart or a turnover is "other". */
export const ATTEMPT_SOURCES = ["puckout", "turnover", "other"] as const;
export type AttemptSource = (typeof ATTEMPT_SOURCES)[number];

export const PUCKOUT_LENGTHS = ["short", "medium", "long"] as const;
export type PuckoutLength = (typeof PUCKOUT_LENGTHS)[number];

/**
 * How possession changed hands. A turnover is a ball taken off a man; 60/40
 * and 60+ are the contested balls a club analyst counts separately; an
 * unforced loss is ours alone to give away, so it only exists as a loss.
 */
export const POSSESSION_KINDS = ["turnover", "sixty_forty", "sixty_plus", "other", "unforced"] as const;
export type PossessionKind = (typeof POSSESSION_KINDS)[number];

export type Half = 1 | 2;

/** What the logging form and the report both need of a stat row. */
export type StatEntry = {
  statType: StatType;
  outcome: StatOutcome | null;
  /**
   * The jersey number it is credited to — what the logger can see from the
   * line. Who wore it is the match's business, settled when the sheet is read.
   */
  playerNumber?: number | null;
  /** Deliveries only: the number it was aimed at — who won it or lost it. */
  targetNumber?: number | null;
  originX?: number | null;
  originY?: number | null;
  destX?: number | null;
  destY?: number | null;
  half?: number | null;
  side?: Side | null;
  shotResult?: ShotResult | null;
  shotKind?: ShotKind | null;
  attemptSource?: AttemptSource | null;
  ledToScore?: boolean | null;
  possession?: PossessionKind | null;
  frontEight?: boolean | null;
  scorable?: boolean | null;
  puckoutTakenBy?: PuckoutSide | null;
  puckoutLength?: PuckoutLength | null;
  pastSixtyFive?: boolean | null;
};

export type StatTypeMeta = {
  label: string;
  plural: string;
  /**
   * Points this stat puts on the pitch map. A delivery needs two — struck
   * from, landed — and is drawn as an arrow between them.
   */
  points: 0 | 1 | 2;
  /** Outcomes offered when logging. Empty where the stat has no won/lost axis. */
  outcomes: readonly StatOutcome[];
  /** Number key in the logging form; the app is keyboard-first throughout. */
  hotkey: string;
  hint: string;
};

export const STAT_TYPE_META: Record<StatType, StatTypeMeta> = {
  tackle: {
    label: "Tackle",
    plural: "Tackles",
    points: 1,
    outcomes: [],
    hotkey: "1",
    hint: "Where it was made. Flag it when one of the front eight made it.",
  },
  delivery: {
    label: "Delivery",
    plural: "Deliveries",
    points: 2,
    outcomes: ["positive", "negative"],
    hotkey: "2",
    hint: "From inside our 65 to beyond theirs. Click where it was struck from, then where it landed.",
  },
  turnover: {
    label: "Turnover",
    plural: "Turnovers",
    points: 1,
    outcomes: ["positive", "negative"],
    hotkey: "3",
    hint: "Possession won or lost, and how — a turnover, a 60/40 ball, an unforced loss. Flag the ones we scored from.",
  },
  shot: {
    label: "Shot",
    plural: "Shots",
    points: 1,
    outcomes: [],
    hotkey: "4",
    hint: "Either team's, from where it was struck. From play or a placed ball.",
  },
  free_conceded: {
    label: "Free conceded",
    plural: "Frees conceded",
    points: 1,
    outcomes: [],
    hotkey: "5",
    hint: "Always against us — where it was given is what matters.",
  },
  puckout: {
    label: "Poc amach",
    plural: "Poc amach",
    points: 1,
    outcomes: ["positive", "negative", "unclear"],
    hotkey: "6",
    hint: "Whose poc amach it was, how far it went, then who won the break.",
  },
  free_won: {
    label: "Free won",
    plural: "Frees won",
    points: 1,
    outcomes: [],
    hotkey: "7",
    hint: "Where we were fouled.",
  },
};

export const SHOT_RESULT_LABELS: Record<ShotResult, string> = {
  goal: "Cúl",
  point: "Cúilín",
  wide: "Wide",
  saved: "Saved",
  lost: "Possession lost",
  retained: "Possession retained",
  sixty_five: "Won a 65",
};

export const SHOT_KIND_LABELS: Record<ShotKind, string> = {
  play: "From play",
  free: "Free or 65",
};

export const ATTEMPT_SOURCE_LABELS: Record<AttemptSource, string> = {
  puckout: "Poc amach",
  turnover: "Turnover",
  other: "Other",
};

export const PUCKOUT_LENGTH_LABELS: Record<PuckoutLength, string> = {
  short: "Short",
  medium: "Mid",
  long: "Long",
};

export const POSSESSION_KIND_LABELS: Record<PossessionKind, string> = {
  turnover: "Turnover",
  sixty_forty: "60/40 ball",
  sixty_plus: "60+ ball",
  other: "Other",
  unforced: "Unforced",
};

export const SIDE_LABELS: Record<Side, string> = {
  us: "Ours",
  opposition: "Theirs",
};

export const PUCKOUT_SIDE_LABELS = SIDE_LABELS;

export function isScore(result: ShotResult | null | undefined): boolean {
  return result === "goal" || result === "point";
}

/** Legacy rows predate the side column, and every one of them was ours. */
export function shotSide(entry: Pick<StatEntry, "side">): Side {
  return entry.side ?? "us";
}

/**
 * The same three outcomes say different things depending on the stat, and a
 * coach reads the specific word much faster than the generic one.
 */
const OUTCOME_LABELS: Record<StatType, Partial<Record<StatOutcome, string>>> = {
  tackle: {},
  delivery: { positive: "Won", negative: "Lost", unclear: "Unclear" },
  // "Lost" rather than "conceded": it covers a 60/40 ball as well as a turnover.
  turnover: { positive: "Won", negative: "Lost", unclear: "Unclear" },
  shot: {},
  free_conceded: {},
  puckout: { positive: "Won by us", negative: "Won by them", unclear: "Broke unclear" },
  free_won: {},
};

const GENERIC_OUTCOME_LABELS: Record<StatOutcome, string> = {
  positive: "Positive",
  negative: "Negative",
  unclear: "Unclear",
};

export function outcomeLabel(type: StatType, outcome: StatOutcome | null): string {
  if (!outcome) return "";
  return OUTCOME_LABELS[type][outcome] ?? GENERIC_OUTCOME_LABELS[outcome];
}

/* -------------------------------------------------------- the colour rule */

/**
 * One rule for every map in the report: green is a positive outcome for us,
 * red a negative one, orange genuinely unclear. The tokens are the app's own,
 * so the maps stay in step with the rest of the interface.
 */
export const OUTCOME_COLOURS: Record<StatOutcome, string> = {
  positive: "var(--color-brand)",
  negative: "var(--color-danger)",
  unclear: "var(--color-mark)",
};

/**
 * For a stat with no outcome axis at all, e.g. a tackle. Chalk rather than a
 * hue, so it stays clear of the three that mean something — but dim chalk,
 * not a line colour, because tackles now go on a map and have to be seen.
 */
export const NEUTRAL_COLOUR = "var(--color-ink-dim)";

/**
 * One colour per kind of stat, for labelling a lane of them on the timeline.
 *
 * This does not compete with the three above: it names a category, never an
 * outcome, and is kept off green, red and amber for exactly that reason. A
 * mark inside a lane is still coloured by how it went — the lane says *what*
 * these are, the marks say *how they went*.
 */
export const STAT_TYPE_COLOURS: Record<StatType, string> = {
  tackle: "var(--color-lane-tackle)",
  delivery: "var(--color-lane-delivery)",
  turnover: "var(--color-lane-turnover)",
  shot: "var(--color-lane-shot)",
  free_conceded: "var(--color-lane-free)",
  puckout: "var(--color-lane-puckout)",
  free_won: "var(--color-lane-free-won)",
};

export type PuckoutWinner = "us" | "opposition" | "unclear";

/**
 * A poc amach's colour follows who won it, never whose puck it was: winning
 * the opposition's restart is as green for us as holding our own, and losing
 * ours is as red as failing to break theirs.
 */
export function puckoutOutcome(wonBy: PuckoutWinner): StatOutcome {
  if (wonBy === "us") return "positive";
  if (wonBy === "opposition") return "negative";
  return "unclear";
}

/** The inverse, for showing a stored row back in the logging form. */
export function puckoutWinner(outcome: StatOutcome | null): PuckoutWinner {
  if (outcome === "positive") return "us";
  if (outcome === "negative") return "opposition";
  return "unclear";
}

/** How a shot went for whoever struck it — flipped for theirs, below. */
const SHOT_RESULT_OUTCOME: Record<ShotResult, StatOutcome> = {
  goal: "positive",
  point: "positive",
  wide: "negative",
  saved: "negative",
  lost: "negative",
  retained: "unclear",
  sixty_five: "unclear",
};

function flip(outcome: StatOutcome): StatOutcome {
  if (outcome === "positive") return "negative";
  if (outcome === "negative") return "positive";
  return outcome;
}

/**
 * The outcome a row actually carries, relative to us.
 *
 * Three stats do not store one. A shot's outcome follows its result — and
 * whose shot it was, because their wide is good news. A free conceded is
 * inherently against us and a free won inherently for us, which is why
 * neither has a won/lost axis to log.
 */
export function effectiveOutcome(entry: StatEntry): StatOutcome | null {
  switch (entry.statType) {
    case "shot": {
      if (!entry.shotResult) return null;
      const forShooter = SHOT_RESULT_OUTCOME[entry.shotResult];
      return shotSide(entry) === "us" ? forShooter : flip(forShooter);
    }
    case "free_conceded":
      return "negative";
    case "free_won":
      return "positive";
    case "tackle":
      return null;
    default:
      return entry.outcome ?? null;
  }
}

export function statColour(entry: StatEntry): string {
  const outcome = effectiveOutcome(entry);
  return outcome ? OUTCOME_COLOURS[outcome] : NEUTRAL_COLOUR;
}

/**
 * The same three outcomes said a second way, in shape.
 *
 * Green against red is the one pair a colour-blind reader cannot separate by
 * hue, so every mark on a pitch map is also filled, hollow or dashed. It
 * means a shot map still reads when it is photocopied for the dressing room.
 */
export type OutcomeShape = "filled" | "ring" | "dashed";

export const OUTCOME_SHAPES: Record<StatOutcome, OutcomeShape> = {
  positive: "filled",
  negative: "ring",
  unclear: "dashed",
};

export function statShape(entry: StatEntry): OutcomeShape {
  const outcome = effectiveOutcome(entry);
  return outcome ? OUTCOME_SHAPES[outcome] : "dashed";
}

/** "Turnover won", "60/40 ball lost", "Unforced loss". */
export function possessionLabel(kind: PossessionKind | null | undefined, won: boolean): string {
  const k = kind ?? "turnover";
  if (k === "unforced") return "Unforced loss";
  if (k === "turnover") return won ? "Turnover won" : "Turnover conceded";
  if (k === "other") return won ? "Other possession won" : "Other possession lost";
  return `${POSSESSION_KIND_LABELS[k]} ${won ? "won" : "lost"}`;
}

function shotPhrase(entry: StatEntry): string {
  const free = entry.shotKind === "free";
  const what = free ? "Free" : "Shot";
  switch (entry.shotResult) {
    case "goal":
      return free ? "Cúl from a free" : "Cúl";
    case "point":
      return free ? "Cúilín from a free" : "Cúilín";
    case "wide":
      return `${what} wide`;
    case "saved":
      return `${what} saved`;
    case "lost":
      return `${what} dropped short, possession lost`;
    case "retained":
      return `${what} dropped short, possession retained`;
    case "sixty_five":
      return `${what} put out for a 65`;
    default:
      return what;
  }
}

/**
 * One entry, said the way a coach would say it: "Our poc amach, lost",
 * "Turnover won, we scored from it". Written out rather than assembled from
 * fragments joined by dots, because this is the line somebody reads when they
 * are checking whether they typed the right thing.
 */
export function describeStat(entry: StatEntry): string {
  switch (entry.statType) {
    case "tackle":
      return entry.frontEight ? "Front eight tackle" : "Tackle";

    case "free_conceded":
      return entry.scorable ? "Scorable free conceded" : "Free conceded";

    case "free_won":
      return "Free won";

    case "shot": {
      const phrase = shotPhrase(entry);
      if (shotSide(entry) === "us") return phrase;
      return `Their ${phrase.charAt(0).toLowerCase()}${phrase.slice(1)}`;
    }

    case "delivery":
      return entry.outcome === "negative" ? "Delivery lost" : "Delivery won";

    case "turnover": {
      const base = possessionLabel(entry.possession, entry.outcome !== "negative");
      return entry.ledToScore ? `${base}, we scored from it` : base;
    }

    case "puckout": {
      const length = entry.puckoutLength ? `${PUCKOUT_LENGTH_LABELS[entry.puckoutLength].toLowerCase()} ` : "";
      const whose = entry.puckoutTakenBy === "opposition" ? `Their ${length}poc amach` : `Our ${length}poc amach`;
      if (entry.outcome === "unclear") return `${whose}, broke unclear`;
      if (entry.puckoutTakenBy === "opposition") {
        return entry.outcome === "positive" ? `${whose}, we won it` : `${whose}, they won it`;
      }
      if (entry.outcome !== "positive") return `${whose}, lost`;
      if (entry.pastSixtyFive === true) return `${whose}, won and worked past our 65`;
      if (entry.pastSixtyFive === false) return `${whose}, won but held inside our 65`;
      return `${whose}, won`;
    }
  }
}

/* ----------------------------------------------------- one entry's rules */

/** What arrives from the logging form, before the rules are applied. */
export type StatDraft = Partial<Omit<StatEntry, "statType">> & { statType: StatType };

/** A row, with every column that does not apply to this stat set to null. */
export type NormalisedStat = Required<Omit<StatDraft, "statType" | "half">> & {
  statType: StatType;
  half: Half | null;
};

/** A point only counts when both halves of it arrived. */
function normalisePoint(x: number | null | undefined, y: number | null | undefined) {
  if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return clampToPitch(x, y);
}

function oneOf<T extends string>(list: readonly T[], value: unknown): T | null {
  return typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : null;
}

/** Subs are numbered on past 15, sometimes into the thirties — never to three figures. */
export const MAX_JERSEY = 99;

/**
 * A jersey number as typed, or none. One nobody could wear is refused rather
 * than quietly dropped: the logger meant somebody, and should get to fix it.
 */
export function jerseyNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(n) || n < 1 || n > MAX_JERSEY) {
    throw new Error(`Jersey numbers run from 1 to ${MAX_JERSEY}.`);
  }
  return n;
}

/**
 * Put one entry into the shape the schema promises, or refuse it.
 *
 * These are the rules that make the stat sheet mean anything, so they live
 * here rather than in the form: a shot's outcome is derived from its result
 * and never asked for twice, a turnover only carries the led-to-a-score flag
 * when we won it, and a poc amach names the receiver or nobody — crediting a
 * lost one to a player is blame, not analysis. Their shots name nobody either:
 * the panel list is ours. The server action calls this before writing,
 * because a server action is reachable by POST whatever the form does.
 */
export function normaliseEntry(draft: StatDraft): NormalisedStat {
  const statType = draft.statType;
  if (!STAT_TYPES.includes(statType)) throw new Error("That is not a stat we log.");
  const meta = STAT_TYPE_META[statType];

  const origin = meta.points >= 1 ? normalisePoint(draft.originX, draft.originY) : null;
  const dest = meta.points === 2 ? normalisePoint(draft.destX, draft.destY) : null;

  let outcome: StatOutcome | null = null;
  let playerNumber = jerseyNumber(draft.playerNumber);
  let targetNumber: number | null = null;
  let side: Side | null = null;
  let shotResult: ShotResult | null = null;
  let shotKind: ShotKind | null = null;
  let attemptSource: AttemptSource | null = null;
  let ledToScore: boolean | null = null;
  let possession: PossessionKind | null = null;
  let frontEight: boolean | null = null;
  let scorable: boolean | null = null;
  let puckoutTakenBy: PuckoutSide | null = null;
  let puckoutLength: PuckoutLength | null = null;
  let pastSixtyFive: boolean | null = null;

  if (meta.outcomes.length) {
    const chosen = draft.outcome ?? null;
    if (!chosen || !meta.outcomes.includes(chosen)) {
      throw new Error(`How did that ${meta.label.toLowerCase()} end up?`);
    }
    outcome = chosen;
  }

  switch (statType) {
    case "tackle":
      frontEight = Boolean(draft.frontEight);
      break;

    case "delivery":
      targetNumber = jerseyNumber(draft.targetNumber);
      break;

    case "turnover":
      possession = draft.possession == null ? "turnover" : oneOf(POSSESSION_KINDS, draft.possession);
      if (!possession) throw new Error("How did the ball change hands?");
      if (possession === "unforced" && outcome === "positive") {
        throw new Error("An unforced loss is only ever a loss.");
      }
      ledToScore = outcome === "positive" ? Boolean(draft.ledToScore) : null;
      break;

    case "shot":
      shotResult = oneOf(SHOT_RESULTS, draft.shotResult);
      if (!shotResult) throw new Error("What came of it — a cúl, a cúilín or a wide, or something else?");
      side = draft.side == null ? "us" : oneOf(SIDES, draft.side);
      if (!side) throw new Error("Whose shot was it?");
      shotKind = draft.shotKind == null ? "play" : oneOf(SHOT_KINDS, draft.shotKind);
      if (!shotKind) throw new Error("From play, or a free?");
      attemptSource = draft.attemptSource == null ? null : oneOf(ATTEMPT_SOURCES, draft.attemptSource);
      outcome = effectiveOutcome({ statType, outcome: null, shotResult, side });
      if (side === "opposition") playerNumber = null;
      break;

    case "free_conceded":
      scorable = Boolean(draft.scorable);
      break;

    case "puckout":
      puckoutTakenBy = oneOf(PUCKOUT_SIDES, draft.puckoutTakenBy);
      if (!puckoutTakenBy) throw new Error("Whose poc amach was it?");
      puckoutLength = draft.puckoutLength == null ? null : oneOf(PUCKOUT_LENGTHS, draft.puckoutLength);
      // Only ours, only short, only won: the question is whether a short one
      // we held on to was worked out past our own 65 or died in our half.
      if (puckoutTakenBy === "us" && puckoutLength === "short" && outcome === "positive") {
        pastSixtyFive = Boolean(draft.pastSixtyFive);
      }
      if (outcome !== "positive") playerNumber = null;
      break;

    case "free_won":
      break;
  }

  const half = draft.half === 1 || draft.half === 2 ? draft.half : null;

  return {
    statType,
    outcome,
    playerNumber,
    targetNumber,
    originX: origin?.x ?? null,
    originY: origin?.y ?? null,
    destX: dest?.x ?? null,
    destY: dest?.y ?? null,
    half,
    side,
    shotResult,
    shotKind,
    attemptSource,
    ledToScore,
    possession,
    frontEight,
    scorable,
    puckoutTakenBy,
    puckoutLength,
    pastSixtyFive,
  };
}

/* ------------------------------------------------------ when it happened */

/**
 * Which half a stat fell in, and the game clock, if we can know it.
 *
 * An entry logged live against the footage carries a file position; once the
 * video's throw-in and half-time are marked, that converts to game time —
 * worked out when the report is read, not stored, so marking the halves later
 * fixes every entry at once. An entry typed up from the notebook has only the
 * half the coach picked, and no clock at all.
 */
export function statTiming(
  row: { half?: number | null; atMs?: number | null },
  markers: Markers | undefined,
  halfLengthMin = 30,
): { half: Half | null; gameMs: number | null } {
  const stored = row.half === 1 || row.half === 2 ? row.half : null;
  if (markers && row.atMs != null) {
    const t = toGameTime(row.atMs, markers, halfLengthMin);
    if (t.half) return { half: t.half, gameMs: t.gameMs };
  }
  return { half: stored, gameMs: null };
}

/** The game minute a coach would name: 26:30 on the clock is the 27th. */
export function gameMinute(gameMs: number): number {
  return Math.floor(gameMs / 60_000) + 1;
}

/**
 * The sheet in the order it happened.
 *
 * Halves first. Within a half, the game clock when every entry has one;
 * otherwise the order they were logged in, which is the notebook's own order.
 * Mixing the two would make a sort that disagrees with itself, so a half is
 * ordered one way or the other, never both.
 */
export function chronological<
  T extends { half?: number | null; gameMs?: number | null; createdAt: number },
>(rows: readonly T[]): T[] {
  const groups = new Map<number, T[]>();
  for (const r of rows) {
    const key = r.half === 1 || r.half === 2 ? r.half : 3;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  return [1, 2, 3].flatMap((key) => {
    const group = groups.get(key) ?? [];
    const clocked = group.every((r) => r.gameMs != null);
    return [...group].sort((a, b) =>
      clocked ? a.gameMs! - b.gameMs! || a.createdAt - b.createdAt : a.createdAt - b.createdAt,
    );
  });
}

/**
 * Spells where they had four or more shots in a row without one from us.
 *
 * This is the page an analyst uses to find the ten minutes the game got away,
 * so it counts attempts, not scores — four wides in a row is still four times
 * they got through us. A spell can run across half-time; nothing about the
 * interval stops them building pressure.
 */
export function oppositionRuns<T extends StatEntry & { createdAt: number }>(
  rows: readonly T[],
  minRun = 4,
): T[][] {
  const shots = chronological(rows.filter((r) => r.statType === "shot" && r.shotResult));
  const runs: T[][] = [];
  let current: T[] = [];

  const close = () => {
    if (current.length >= minRun) runs.push(current);
    current = [];
  };

  for (const s of shots) {
    if (shotSide(s) === "opposition") current.push(s);
    else close();
  }
  close();
  return runs;
}

/* ------------------------------------------------- watching a type back */

/**
 * How far before a stat's timestamp playback starts.
 *
 * An entry is logged at the moment a coach reacts to it, which is already
 * slightly after the ball — so landing exactly on the timestamp shows the
 * aftermath. Six seconds back covers the delivery into the contest that was
 * actually being judged.
 */
export const STAT_LEAD_IN_MS = 6000;

/** Enough to not re-land on the entry you are already watching. */
const STEP_EPSILON_MS = 500;

/**
 * The next (or previous) logged entry from where the playhead is.
 *
 * This is what makes "show me every delivery" a pair of buttons rather than a
 * search: the entries are already timestamped, so stepping through them is
 * just picking the nearest one in a direction. The cursor is offset by the
 * lead-in because a jump deliberately lands early — without that, "next"
 * would find the entry you were already on its way to.
 *
 * Entries with no timestamp (typed up afterwards, with no footage open) are
 * not on the timeline and cannot be stepped to.
 */
export function stepToStat<T extends { atMs?: number | null }>(
  entries: readonly T[],
  positionMs: number,
  direction: 1 | -1,
): T | null {
  const timed = entries
    .filter((e): e is T & { atMs: number } => typeof e.atMs === "number")
    .sort((a, b) => a.atMs - b.atMs);
  const cursor = positionMs + STAT_LEAD_IN_MS;

  if (direction === 1) {
    return timed.find((e) => e.atMs > cursor + STEP_EPSILON_MS) ?? null;
  }
  return [...timed].reverse().find((e) => e.atMs < cursor - STEP_EPSILON_MS) ?? null;
}

/* --------------------------------------------------------------- roll-ups */

/** Whole percentages; never divides by zero, so the report cannot print NaN. */
export function percentOf(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

/** Every attempt that was not a cúl or a cúilín is `missed`, whatever became of it. */
export type ShotCounts = { goals: number; points: number; missed: number };

function countShotRows(rows: readonly StatEntry[]): ShotCounts {
  let goals = 0;
  let points = 0;
  let missed = 0;
  for (const r of rows) {
    if (r.statType !== "shot" || !r.shotResult) continue;
    if (r.shotResult === "goal") goals += 1;
    else if (r.shotResult === "point") points += 1;
    else missed += 1;
  }
  return { goals, points, missed };
}

/** One side's attempts, ours unless told otherwise. */
export function countShots(rows: readonly StatEntry[], side: Side = "us"): ShotCounts {
  return countShotRows(rows.filter((r) => r.statType === "shot" && shotSide(r) === side));
}

export type Efficiency = {
  scored: number;
  total: number;
  /** "9/14" */
  fraction: string;
  percent: number;
  /** "9/14 · 64%" — the form a coach reads first. */
  label: string;
  score: Score;
  /** "2-7 from 14 shots" — the same thing in GAA notation. */
  notation: string;
};

/**
 * Shooting efficiency: scored ÷ attempts.
 *
 * Derived, never logged, so there is no efficiency field to drift out of step
 * with the shots it came from. The scoreline runs through `tallyScore` like
 * every other score in the app, so a cúl is worth three here too.
 */
export function shootingEfficiency(counts: ShotCounts): Efficiency {
  const score = tallyScore([
    ...Array.from({ length: counts.goals }, () => ({ scoreValue: GOAL_VALUE })),
    ...Array.from({ length: counts.points }, () => ({ scoreValue: 1 })),
  ]);
  const scored = counts.goals + counts.points;
  const total = scored + counts.missed;
  const percent = percentOf(scored, total);

  return {
    scored,
    total,
    fraction: `${scored}/${total}`,
    percent,
    label: `${scored}/${total} · ${percent}%`,
    score,
    notation: `${formatScore(score)} from ${total} shot${total === 1 ? "" : "s"}`,
  };
}

/**
 * A match's result, as far as the stat sheet can say.
 *
 * Our score comes from our logged shots. Theirs is only known when somebody
 * logged their shots too — plenty of sheets track just our own team — so
 * `them` is null rather than a confident 0-0, and so is the margin. A sheet
 * with no shots on it at all has no result to show.
 */
export type MatchResult = { us: Score; them: Score | null; margin: number | null };

export function matchResult(rows: readonly StatEntry[]): MatchResult | null {
  const ours = countShots(rows, "us");
  const theirs = countShots(rows, "opposition");
  const theirAttempts = theirs.goals + theirs.points + theirs.missed;
  if (ours.goals + ours.points + ours.missed + theirAttempts === 0) return null;

  const us = shootingEfficiency(ours).score;
  const them = theirAttempts > 0 ? shootingEfficiency(theirs).score : null;
  return { us, them, margin: them ? scoreMargin(us, them) : null };
}

export type SourceLine = { attempts: number; scored: number };

/** One team's score opportunities, laid out the way the summary sheet has them. */
export type SideShooting = {
  overall: Efficiency;
  fromPlay: Efficiency;
  placed: Efficiency;
  /** How each attempt ended, split by from play and placed ball. */
  playResults: Record<ShotResult, number>;
  placedResults: Record<ShotResult, number>;
  /** What the attempts came from. `unrecorded` is anything logged without it. */
  sources: Record<AttemptSource | "unrecorded", SourceLine>;
};

function emptyResults(): Record<ShotResult, number> {
  return Object.fromEntries(SHOT_RESULTS.map((r) => [r, 0])) as Record<ShotResult, number>;
}

export function summariseShooting(rows: readonly StatEntry[], side: Side): SideShooting {
  const shots = rows.filter((r) => r.statType === "shot" && r.shotResult && shotSide(r) === side);
  const play = shots.filter((r) => r.shotKind !== "free");
  const placed = shots.filter((r) => r.shotKind === "free");

  const playResults = emptyResults();
  for (const r of play) playResults[r.shotResult!] += 1;
  const placedResults = emptyResults();
  for (const r of placed) placedResults[r.shotResult!] += 1;

  const sources: Record<AttemptSource | "unrecorded", SourceLine> = {
    puckout: { attempts: 0, scored: 0 },
    turnover: { attempts: 0, scored: 0 },
    other: { attempts: 0, scored: 0 },
    unrecorded: { attempts: 0, scored: 0 },
  };
  for (const r of shots) {
    const line = sources[r.attemptSource ?? "unrecorded"];
    line.attempts += 1;
    if (isScore(r.shotResult)) line.scored += 1;
  }

  return {
    overall: shootingEfficiency(countShotRows(shots)),
    fromPlay: shootingEfficiency(countShotRows(play)),
    placed: shootingEfficiency(countShotRows(placed)),
    playResults,
    placedResults,
    sources,
  };
}

export type DeliverySummary = {
  total: number;
  won: number;
  lost: number;
  unclear: number;
  percent: number;
};

export type TurnoverSummary = {
  total: number;
  won: number;
  conceded: number;
  /** Of the ones we won, how many we scored from. */
  ledToScore: number;
  ledToScorePercent: number;
};

export type PuckoutSummary = {
  taken: number;
  won: number;
  lost: number;
  unclear: number;
  percent: number;
};

export type StatSummary = {
  entries: number;
  tackles: number;
  frontEightTackles: number;
  freesConceded: number;
  scorableFreesConceded: number;
  freesWon: number;
  deliveries: DeliverySummary;
  turnovers: TurnoverSummary;
  /** Ours. Theirs is in `summariseShooting`. */
  shooting: Efficiency;
  /** Split by whose restart it was; both counted by who won it. */
  ourPuckouts: PuckoutSummary;
  theirPuckouts: PuckoutSummary;
};

function summarisePuckouts(rows: readonly StatEntry[], takenBy: PuckoutSide): PuckoutSummary {
  const taken = rows.filter((r) => r.statType === "puckout" && r.puckoutTakenBy === takenBy);
  const won = taken.filter((r) => r.outcome === "positive").length;
  const lost = taken.filter((r) => r.outcome === "negative").length;
  return {
    taken: taken.length,
    won,
    lost,
    unclear: taken.length - won - lost,
    percent: percentOf(won, taken.length),
  };
}

export function summariseStats(rows: readonly StatEntry[]): StatSummary {
  const deliveries = rows.filter((r) => r.statType === "delivery");
  const deliveriesWon = deliveries.filter((r) => r.outcome === "positive").length;
  const deliveriesLost = deliveries.filter((r) => r.outcome === "negative").length;

  const turnovers = rows.filter((r) => r.statType === "turnover");
  const turnoversWon = turnovers.filter((r) => r.outcome === "positive");
  // "Turnover leading to a score" is a flag on a turnover we won, not a stat
  // type of its own — the same turnover, counted once and described twice.
  const ledToScore = turnoversWon.filter((r) => r.ledToScore).length;

  const tackles = rows.filter((r) => r.statType === "tackle");
  const frees = rows.filter((r) => r.statType === "free_conceded");

  return {
    entries: rows.length,
    tackles: tackles.length,
    frontEightTackles: tackles.filter((r) => r.frontEight).length,
    freesConceded: frees.length,
    scorableFreesConceded: frees.filter((r) => r.scorable).length,
    freesWon: rows.filter((r) => r.statType === "free_won").length,
    deliveries: {
      total: deliveries.length,
      won: deliveriesWon,
      lost: deliveriesLost,
      unclear: deliveries.length - deliveriesWon - deliveriesLost,
      percent: percentOf(deliveriesWon, deliveries.length),
    },
    turnovers: {
      total: turnovers.length,
      won: turnoversWon.length,
      conceded: turnovers.filter((r) => r.outcome === "negative").length,
      ledToScore,
      ledToScorePercent: percentOf(ledToScore, turnoversWon.length),
    },
    shooting: shootingEfficiency(countShots(rows)),
    ourPuckouts: summarisePuckouts(rows, "us"),
    theirPuckouts: summarisePuckouts(rows, "opposition"),
  };
}

/* ------------------------------------------------------ poc amach by length */

export type LengthLine = { kept: number; lost: number; unclear: number };

export type PuckoutBreakdown = {
  taken: number;
  /**
   * Read from the side taking it, not from ours: "kept" on their poc amach
   * means they kept it. The summary sheet reads each team's restarts as that
   * team's own, and so does this.
   */
  byLength: Record<PuckoutLength | "unrecorded", LengthLine>;
  /** Ours only: the short ones we won, split by whether they got out past our 65. */
  shortPastSixtyFive: number;
  shortHeldInside: number;
  /**
   * Kept, less the short ones that never got out past the taker's own 65.
   * A short poc amach recycled around the square has not done its job, which
   * is why an analyst does not count it as a success.
   */
  retained: number;
  retainedPercent: number;
};

export function puckoutBreakdown(rows: readonly StatEntry[], takenBy: PuckoutSide): PuckoutBreakdown {
  const taken = rows.filter((r) => r.statType === "puckout" && r.puckoutTakenBy === takenBy);
  const keptOutcome: StatOutcome = takenBy === "us" ? "positive" : "negative";
  const lostOutcome: StatOutcome = takenBy === "us" ? "negative" : "positive";

  const byLength: Record<PuckoutLength | "unrecorded", LengthLine> = {
    short: { kept: 0, lost: 0, unclear: 0 },
    medium: { kept: 0, lost: 0, unclear: 0 },
    long: { kept: 0, lost: 0, unclear: 0 },
    unrecorded: { kept: 0, lost: 0, unclear: 0 },
  };
  let shortPastSixtyFive = 0;
  let shortHeldInside = 0;
  let retained = 0;

  for (const r of taken) {
    const line = byLength[r.puckoutLength ?? "unrecorded"];
    if (r.outcome === keptOutcome) {
      line.kept += 1;
      if (r.pastSixtyFive === true) shortPastSixtyFive += 1;
      if (r.pastSixtyFive === false) shortHeldInside += 1;
      if (r.pastSixtyFive !== false) retained += 1;
    } else if (r.outcome === lostOutcome) {
      line.lost += 1;
    } else {
      line.unclear += 1;
    }
  }

  return {
    taken: taken.length,
    byLength,
    shortPastSixtyFive,
    shortHeldInside,
    retained,
    retainedPercent: percentOf(retained, taken.length),
  };
}

/* ------------------------------------------------------ player by player */

/** One jersey's line. Keyed by number: the name is put to it by whoever reads it. */
export type PlayerStatLine = {
  playerNumber: number;
  tackles: number;
  deliveriesWon: number;
  deliveriesLost: number;
  turnoversWon: number;
  turnoversConceded: number;
  turnoversLedToScore: number;
  goals: number;
  points: number;
  /** Attempts that did not score — wide, saved, dropped short, out for a 65. */
  missed: number;
  freesConceded: number;
  freesWon: number;
  /** A poc amach is credited to whoever won it, so this is always a plus. */
  puckoutsWon: number;
  /** Everything credited to them, for sorting the table by involvement. */
  entries: number;
};

export function emptyStatLine(playerNumber: number): PlayerStatLine {
  return {
    playerNumber,
    tackles: 0,
    deliveriesWon: 0,
    deliveriesLost: 0,
    turnoversWon: 0,
    turnoversConceded: 0,
    turnoversLedToScore: 0,
    goals: 0,
    points: 0,
    missed: 0,
    freesConceded: 0,
    freesWon: 0,
    puckoutsWon: 0,
    entries: 0,
  };
}

/**
 * Roll the attributed rows up per player.
 *
 * Rows with nobody named still count in the team totals — a tackle happened
 * whether or not the coach caught the number — they simply have no line here.
 */
export function playerStatLines(rows: readonly StatEntry[]): Map<number, PlayerStatLine> {
  const lines = new Map<number, PlayerStatLine>();

  for (const r of rows) {
    if (r.playerNumber == null) continue;
    const line = lines.get(r.playerNumber) ?? emptyStatLine(r.playerNumber);
    line.entries += 1;

    switch (r.statType) {
      case "tackle":
        line.tackles += 1;
        break;
      case "delivery":
        if (r.outcome === "positive") line.deliveriesWon += 1;
        else if (r.outcome === "negative") line.deliveriesLost += 1;
        break;
      case "turnover":
        if (r.outcome === "positive") {
          line.turnoversWon += 1;
          if (r.ledToScore) line.turnoversLedToScore += 1;
        } else if (r.outcome === "negative") {
          line.turnoversConceded += 1;
        }
        break;
      case "shot":
        if (r.shotResult === "goal") line.goals += 1;
        else if (r.shotResult === "point") line.points += 1;
        else if (r.shotResult) line.missed += 1;
        break;
      case "free_conceded":
        line.freesConceded += 1;
        break;
      case "free_won":
        line.freesWon += 1;
        break;
      case "puckout":
        // Only a won poc amach names anybody: it is the receiver. Losing one
        // is a team failure, and guessing whose fault it was is not analysis.
        if (r.outcome === "positive") line.puckoutsWon += 1;
        break;
    }

    lines.set(r.playerNumber, line);
  }

  return lines;
}

/** A player's shooting, in the same two forms as the team's. */
export function lineShooting(line: PlayerStatLine): Efficiency {
  return shootingEfficiency({ goals: line.goals, points: line.points, missed: line.missed });
}

/* ------------------------------------------- one section, player by player */

export type Tone = "positive" | "negative" | "neutral";

export type TallyColumn = { key: string; label: string; tone: Tone; group?: string };

/** Who each row credits, and under which column. One row can credit two people. */
type Credit = { key: string; playerNumber: number | null };

export type PlayerTally = {
  columns: TallyColumn[];
  /** `playerNumber` null is the "nobody named" line. Numbers with nothing are left out. */
  lines: { playerNumber: number | null; counts: Record<string, number>; total: number }[];
  totals: Record<string, number>;
};

function tallyByPlayer(
  rows: readonly StatEntry[],
  columns: TallyColumn[],
  credit: (row: StatEntry) => Credit[],
): PlayerTally {
  const zero = () => Object.fromEntries(columns.map((c) => [c.key, 0])) as Record<string, number>;
  const byPlayer = new Map<number | null, Record<string, number>>();
  const totals = zero();

  for (const r of rows) {
    for (const c of credit(r)) {
      if (!(c.key in totals)) continue;
      const counts = byPlayer.get(c.playerNumber) ?? zero();
      counts[c.key] += 1;
      totals[c.key] += 1;
      byPlayer.set(c.playerNumber, counts);
    }
  }

  const lines = [...byPlayer.entries()].map(([playerNumber, counts]) => ({
    playerNumber,
    counts,
    total: Object.values(counts).reduce((a, b) => a + b, 0),
  }));
  return { columns, lines, totals };
}

export const DELIVERY_COLUMNS: TallyColumn[] = [
  { key: "struck", label: "Delivered", tone: "neutral" },
  { key: "received", label: "Received", tone: "positive" },
  { key: "lost", label: "Lost", tone: "negative" },
];

/**
 * A delivery credits two people: whoever struck it, and whoever it was aimed
 * at — who either won it or lost it. The striker's column is attempts, so it
 * adds up to every delivery; the other two add up to it again between them.
 */
export function deliveryTally(rows: readonly StatEntry[]): PlayerTally {
  return tallyByPlayer(rows, DELIVERY_COLUMNS, (r) => {
    if (r.statType !== "delivery") return [];
    const credits: Credit[] = [{ key: "struck", playerNumber: r.playerNumber ?? null }];
    if (r.outcome === "positive") credits.push({ key: "received", playerNumber: r.targetNumber ?? null });
    if (r.outcome === "negative") credits.push({ key: "lost", playerNumber: r.targetNumber ?? null });
    return credits;
  });
}

export const POSSESSION_COLUMNS: TallyColumn[] = [
  { key: "front_eight_tackle", label: "Front 8 tackle", tone: "neutral", group: "Tackles" },
  { key: "tackle", label: "Tackle", tone: "neutral", group: "Tackles" },
  { key: "turnover_won", label: "Turnover", tone: "positive", group: "Won" },
  { key: "sixty_forty_won", label: "60/40", tone: "positive", group: "Won" },
  { key: "sixty_plus_won", label: "60+", tone: "positive", group: "Won" },
  { key: "other_won", label: "Other", tone: "positive", group: "Won" },
  { key: "sixty_forty_lost", label: "60/40", tone: "negative", group: "Lost" },
  { key: "turnover_lost", label: "Turnover", tone: "negative", group: "Lost" },
  { key: "unforced_lost", label: "Unforced", tone: "negative", group: "Lost" },
  { key: "sixty_plus_lost", label: "60+", tone: "negative", group: "Lost" },
  { key: "other_lost", label: "Other", tone: "negative", group: "Lost" },
];

/** Tackles and possessions, won and lost, per player — the analyst's pivot. */
export function possessionTally(rows: readonly StatEntry[]): PlayerTally {
  return tallyByPlayer(rows, POSSESSION_COLUMNS, (r) => {
    const playerNumber = r.playerNumber ?? null;
    if (r.statType === "tackle") {
      return [{ key: r.frontEight ? "front_eight_tackle" : "tackle", playerNumber }];
    }
    if (r.statType === "turnover" && (r.outcome === "positive" || r.outcome === "negative")) {
      const kind = r.possession ?? "turnover";
      return [{ key: `${kind}_${r.outcome === "positive" ? "won" : "lost"}`, playerNumber }];
    }
    return [];
  });
}
