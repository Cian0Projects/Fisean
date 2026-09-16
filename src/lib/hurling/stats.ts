/**
 * The post-match stat sheet.
 *
 * Deliberately separate from the clip taxonomy in events.ts: these are the
 * numbers a selector keeps in a notebook on the line and types up afterwards.
 * They are not derived from tags, they do not need footage, and a match
 * nobody filmed still has a stat sheet.
 *
 * Everything here is pure — the vocabulary, the outcome rules and the
 * roll-ups — so the report, the logging form and the database column enums
 * all read from one definition. The arithmetic is unit tested in
 * tests/stats.test.mjs.
 */
import { GOAL_VALUE, formatScore, tallyScore, type Score } from "./notation";
import { clampToPitch } from "./pitch";

/* ------------------------------------------------------------ vocabulary */

export const STAT_TYPES = [
  "tackle",
  "delivery",
  "turnover",
  "shot",
  "free_conceded",
  "puckout",
] as const;
export type StatType = (typeof STAT_TYPES)[number];

/**
 * Always read from our point of view — "positive" is good for us whoever the
 * ball belonged to. That is what lets one colour rule cover every map in the
 * report: green for us, red against us, orange where it was genuinely unclear.
 */
export const STAT_OUTCOMES = ["positive", "negative", "unclear"] as const;
export type StatOutcome = (typeof STAT_OUTCOMES)[number];

export const SHOT_RESULTS = ["goal", "point", "wide"] as const;
export type ShotResult = (typeof SHOT_RESULTS)[number];

/**
 * Whose poc amach it was. Who won it is the outcome — a separate axis, so a
 * coach picks from two short lists rather than one list of four combinations.
 */
export const PUCKOUT_SIDES = ["us", "opposition"] as const;
export type PuckoutSide = (typeof PUCKOUT_SIDES)[number];

/** What the logging form and the report both need of a stat row. */
export type StatEntry = {
  statType: StatType;
  outcome: StatOutcome | null;
  playerId?: string | null;
  originX?: number | null;
  originY?: number | null;
  destX?: number | null;
  destY?: number | null;
  shotResult?: ShotResult | null;
  ledToScore?: boolean | null;
  puckoutTakenBy?: PuckoutSide | null;
};

export type StatTypeMeta = {
  label: string;
  plural: string;
  /**
   * Points this stat puts on the pitch map. A delivery needs two — struck
   * from, landed — and is drawn as an arrow between them. A tackle is a pure
   * tally and needs none.
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
    points: 0,
    outcomes: [],
    hotkey: "1",
    hint: "A tally. Name the player if you have it.",
  },
  delivery: {
    label: "Delivery",
    plural: "Deliveries",
    points: 2,
    outcomes: ["positive", "negative"],
    hotkey: "2",
    hint: "Click where it was struck from, then where it landed.",
  },
  turnover: {
    label: "Turnover",
    plural: "Turnovers",
    points: 1,
    outcomes: ["positive", "negative"],
    hotkey: "3",
    hint: "Won or conceded. Flag the ones we scored from.",
  },
  shot: {
    label: "Shot",
    plural: "Shots",
    points: 1,
    outcomes: [],
    hotkey: "4",
    hint: "Cúl, cúilín or wide, from where it was struck.",
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
    hint: "Whose poc amach it was, then who won the break.",
  },
};

export const SHOT_RESULT_LABELS: Record<ShotResult, string> = {
  goal: "Cúl",
  point: "Cúilín",
  wide: "Wide",
};

export const PUCKOUT_SIDE_LABELS: Record<PuckoutSide, string> = {
  us: "Ours",
  opposition: "Theirs",
};

/**
 * The same three outcomes say different things depending on the stat, and a
 * coach reads the specific word much faster than the generic one.
 */
const OUTCOME_LABELS: Record<StatType, Partial<Record<StatOutcome, string>>> = {
  tackle: {},
  delivery: { positive: "Won", negative: "Lost", unclear: "Unclear" },
  turnover: { positive: "Won", negative: "Conceded", unclear: "Unclear" },
  shot: {},
  free_conceded: {},
  puckout: { positive: "Won by us", negative: "Won by them", unclear: "Broke unclear" },
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

/** For a stat with no outcome axis at all, e.g. a tackle. */
export const NEUTRAL_COLOUR = "var(--color-line-strong)";

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

/**
 * The outcome a row actually carries, relative to us.
 *
 * Two stats do not store one. A shot's outcome follows its result, and a free
 * conceded is inherently against us — there is no version of it that is good
 * news, which is why it has no won/lost axis to log.
 */
export function effectiveOutcome(entry: StatEntry): StatOutcome | null {
  switch (entry.statType) {
    case "shot":
      if (!entry.shotResult) return null;
      return entry.shotResult === "wide" ? "negative" : "positive";
    case "free_conceded":
      return "negative";
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

/**
 * One entry, said the way a coach would say it: "Our poc amach, lost",
 * "Turnover won, we scored from it". Written out rather than assembled from
 * fragments joined by dots, because this is the line somebody reads when they
 * are checking whether they typed the right thing.
 */
export function describeStat(entry: StatEntry): string {
  switch (entry.statType) {
    case "tackle":
      return "Tackle";

    case "free_conceded":
      return "Free conceded";

    case "shot":
      if (!entry.shotResult) return "Shot";
      return entry.shotResult === "wide" ? "Shot wide" : SHOT_RESULT_LABELS[entry.shotResult];

    case "delivery":
      return entry.outcome === "negative" ? "Delivery lost" : "Delivery won";

    case "turnover": {
      const base = entry.outcome === "negative" ? "Turnover conceded" : "Turnover won";
      return entry.ledToScore ? `${base}, we scored from it` : base;
    }

    case "puckout": {
      const whose = entry.puckoutTakenBy === "opposition" ? "Their poc amach" : "Our poc amach";
      if (entry.outcome === "unclear") return `${whose}, broke unclear`;
      if (entry.puckoutTakenBy === "opposition") {
        return entry.outcome === "positive" ? `${whose}, we won it` : `${whose}, they won it`;
      }
      return entry.outcome === "positive" ? `${whose}, won` : `${whose}, lost`;
    }
  }
}

/* ----------------------------------------------------- one entry's rules */

/** What arrives from the logging form, before the rules are applied. */
export type StatDraft = {
  statType: StatType;
  outcome?: StatOutcome | null;
  playerId?: string | null;
  originX?: number | null;
  originY?: number | null;
  destX?: number | null;
  destY?: number | null;
  shotResult?: ShotResult | null;
  ledToScore?: boolean | null;
  puckoutTakenBy?: PuckoutSide | null;
};

/** A row, with every column that does not apply to this stat set to null. */
export type NormalisedStat = Required<Omit<StatDraft, "statType">> & { statType: StatType };

/** A point only counts when both halves of it arrived. */
function normalisePoint(x: number | null | undefined, y: number | null | undefined) {
  if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return clampToPitch(x, y);
}

/**
 * Put one entry into the shape the schema promises, or refuse it.
 *
 * These are the rules that make the stat sheet mean anything, so they live
 * here rather than in the form: a shot's outcome is derived from its result
 * and never asked for twice, a turnover only carries the led-to-a-score flag
 * when we won it, and a poc amach names the receiver or nobody — crediting a
 * lost one to a player is blame, not analysis. The server action calls this
 * before writing, because a server action is reachable by POST whatever the
 * form does.
 */
export function normaliseEntry(draft: StatDraft): NormalisedStat {
  const statType = draft.statType;
  if (!STAT_TYPES.includes(statType)) throw new Error("That is not a stat we log.");
  const meta = STAT_TYPE_META[statType];

  const origin = meta.points >= 1 ? normalisePoint(draft.originX, draft.originY) : null;
  const dest = meta.points === 2 ? normalisePoint(draft.destX, draft.destY) : null;

  let outcome: StatOutcome | null = null;
  let shotResult: ShotResult | null = null;
  let ledToScore: boolean | null = null;
  let puckoutTakenBy: PuckoutSide | null = null;
  let playerId = draft.playerId?.trim() || null;

  if (meta.outcomes.length) {
    const chosen = draft.outcome ?? null;
    if (!chosen || !meta.outcomes.includes(chosen)) {
      throw new Error(`How did that ${meta.label.toLowerCase()} end up?`);
    }
    outcome = chosen;
  }

  if (statType === "shot") {
    if (!draft.shotResult || !SHOT_RESULTS.includes(draft.shotResult)) {
      throw new Error("Was that a cúl, a cúilín or a wide?");
    }
    shotResult = draft.shotResult;
    outcome = effectiveOutcome({ statType, outcome: null, shotResult });
  }

  if (statType === "turnover") {
    ledToScore = outcome === "positive" ? Boolean(draft.ledToScore) : null;
  }

  if (statType === "puckout") {
    if (!draft.puckoutTakenBy || !PUCKOUT_SIDES.includes(draft.puckoutTakenBy)) {
      throw new Error("Whose poc amach was it?");
    }
    puckoutTakenBy = draft.puckoutTakenBy;
    if (outcome !== "positive") playerId = null;
  }

  return {
    statType,
    outcome,
    playerId,
    originX: origin?.x ?? null,
    originY: origin?.y ?? null,
    destX: dest?.x ?? null,
    destY: dest?.y ?? null,
    shotResult,
    ledToScore,
    puckoutTakenBy,
  };
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

export type ShotCounts = { goals: number; points: number; wides: number };

export function countShots(rows: StatEntry[]): ShotCounts {
  let goals = 0;
  let points = 0;
  let wides = 0;
  for (const r of rows) {
    if (r.statType !== "shot") continue;
    if (r.shotResult === "goal") goals += 1;
    else if (r.shotResult === "point") points += 1;
    else if (r.shotResult === "wide") wides += 1;
  }
  return { goals, points, wides };
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
 * Shooting efficiency: scored ÷ shots taken.
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
  const total = scored + counts.wides;
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
  freesConceded: number;
  deliveries: DeliverySummary;
  turnovers: TurnoverSummary;
  shooting: Efficiency;
  /** Split by whose restart it was; both counted by who won it. */
  ourPuckouts: PuckoutSummary;
  theirPuckouts: PuckoutSummary;
};

function summarisePuckouts(rows: StatEntry[], takenBy: PuckoutSide): PuckoutSummary {
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

export function summariseStats(rows: StatEntry[]): StatSummary {
  const deliveries = rows.filter((r) => r.statType === "delivery");
  const deliveriesWon = deliveries.filter((r) => r.outcome === "positive").length;
  const deliveriesLost = deliveries.filter((r) => r.outcome === "negative").length;

  const turnovers = rows.filter((r) => r.statType === "turnover");
  const turnoversWon = turnovers.filter((r) => r.outcome === "positive");
  // "Turnover leading to a score" is a flag on a turnover we won, not a stat
  // type of its own — the same turnover, counted once and described twice.
  const ledToScore = turnoversWon.filter((r) => r.ledToScore).length;

  return {
    entries: rows.length,
    tackles: rows.filter((r) => r.statType === "tackle").length,
    freesConceded: rows.filter((r) => r.statType === "free_conceded").length,
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

/* ------------------------------------------------------ player by player */

export type PlayerStatLine = {
  playerId: string;
  tackles: number;
  deliveriesWon: number;
  deliveriesLost: number;
  turnoversWon: number;
  turnoversConceded: number;
  turnoversLedToScore: number;
  goals: number;
  points: number;
  wides: number;
  freesConceded: number;
  /** A poc amach is credited to whoever won it, so this is always a plus. */
  puckoutsWon: number;
  /** Everything credited to them, for sorting the table by involvement. */
  entries: number;
};

export function emptyStatLine(playerId: string): PlayerStatLine {
  return {
    playerId,
    tackles: 0,
    deliveriesWon: 0,
    deliveriesLost: 0,
    turnoversWon: 0,
    turnoversConceded: 0,
    turnoversLedToScore: 0,
    goals: 0,
    points: 0,
    wides: 0,
    freesConceded: 0,
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
export function playerStatLines(rows: StatEntry[]): Map<string, PlayerStatLine> {
  const lines = new Map<string, PlayerStatLine>();

  for (const r of rows) {
    if (!r.playerId) continue;
    const line = lines.get(r.playerId) ?? emptyStatLine(r.playerId);
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
        else if (r.shotResult === "wide") line.wides += 1;
        break;
      case "free_conceded":
        line.freesConceded += 1;
        break;
      case "puckout":
        // Only a won poc amach names anybody: it is the receiver. Losing one
        // is a team failure, and guessing whose fault it was is not analysis.
        if (r.outcome === "positive") line.puckoutsWon += 1;
        break;
    }

    lines.set(r.playerId, line);
  }

  return lines;
}

/** A player's shooting, in the same two forms as the team's. */
export function lineShooting(line: PlayerStatLine): Efficiency {
  return shootingEfficiency({ goals: line.goals, points: line.points, wides: line.wides });
}
