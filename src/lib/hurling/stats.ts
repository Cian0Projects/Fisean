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
 *
 * The sheet is the same for all four codes; only the words differ. A restart
 * is stored as `puckout` and the end-line free as `sixty_five` whichever game
 * logged them, and `statVocabulary(code)` says them as that code does: a
 * kick-out and a 45 for football. The one rule that differs is the
 * two-pointer, which only a code with the arc can log.
 */
import { termsFor, type CodeTerms, type GameCode } from "./codes";
import {
  GOAL_VALUE,
  formatScore,
  scoreMargin,
  scoreTotal,
  tallyScore,
  toGameTime,
  type Markers,
  type Score,
} from "./notation";
import { clampToPitch, outsideTwoPointArc } from "./pitch";

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
 * Whose restart it was, a poc amach or a kick-out. Who won it is the outcome,
 * a separate axis, so a coach picks from two short lists rather than one list
 * of four combinations.
 */
export const PUCKOUT_SIDES = SIDES;
export type PuckoutSide = Side;

/**
 * Every way a score attempt can end. A cúl, a cúilín and a two-pointer are
 * scores; a wide, a save and a ball dropped short into the keeper's hand are
 * chances gone. A ball dropped short that we kept, or one put out for a 65 or
 * a 45, is neither yet — the attack is still alive, so it reads as unclear
 * rather than as a miss.
 *
 * `sixty_five` is the end-line free in every code: hurling's 65, the 45 for
 * everyone else. Only the label changes.
 */
export const SHOT_RESULTS = [
  "goal",
  "point",
  "two_pointer",
  "wide",
  "saved",
  "lost",
  "retained",
  "sixty_five",
] as const;
export type ShotResult = (typeof SHOT_RESULTS)[number];

/** From play, or a placed ball: a scorable free, a 65 or a 45. */
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

/** "Poc amach" stays as written mid-sentence; "Kick-out" drops its capital. */
function lower(term: string): string {
  return term.charAt(0).toLowerCase() + term.slice(1);
}

function statTypeMeta(t: CodeTerms): Record<StatType, StatTypeMeta> {
  return {
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
      hint: `From inside our ${t.line} to beyond theirs. Click where it was struck from, then where it landed.`,
    },
    turnover: {
      label: "Turnover",
      plural: "Turnovers",
      points: 1,
      outcomes: ["positive", "negative"],
      hotkey: "3",
      hint: "Possession won or lost, and how: a turnover, a 60/40 ball, an unforced loss. Flag the ones we scored from.",
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
      hint: "Always against us. Where it was given is what matters.",
    },
    puckout: {
      label: t.restart,
      plural: t.restarts,
      points: 1,
      outcomes: ["positive", "negative", "unclear"],
      hotkey: "6",
      hint: `Whose ${lower(t.restart)} it was, how far it went, then who won the break.`,
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
}

/**
 * Everything the sheet says, in one code's words. The logging form, the
 * report and the timeline lanes each take one of these for the club's
 * `teams.code`, so no screen can say "poc amach" to a football club.
 */
export type StatVocabulary = {
  code: GameCode;
  terms: CodeTerms;
  meta: Record<StatType, StatTypeMeta>;
  /** The results a shot can be logged with: the two-pointer only where there is an arc. */
  shotResults: readonly ShotResult[];
  shotResultLabels: Record<ShotResult, string>;
  shotKindLabels: Record<ShotKind, string>;
  attemptSourceLabels: Record<AttemptSource, string>;
};

const VOCABULARIES = new Map<GameCode, StatVocabulary>();

export function statVocabulary(code: GameCode): StatVocabulary {
  const cached = VOCABULARIES.get(code);
  if (cached) return cached;
  const t = termsFor(code);
  const vocabulary: StatVocabulary = {
    code,
    terms: t,
    meta: statTypeMeta(t),
    shotResults: SHOT_RESULTS.filter((r) => r !== "two_pointer" || t.twoPointArc),
    shotResultLabels: {
      goal: "Cúl",
      point: "Cúilín",
      two_pointer: "Two-pointer",
      wide: "Wide",
      saved: "Saved",
      lost: "Possession lost",
      retained: "Possession retained",
      sixty_five: `Won a ${t.endLineFree}`,
    },
    shotKindLabels: {
      play: "From play",
      free: `Free or ${t.endLineFree}`,
    },
    attemptSourceLabels: {
      puckout: t.restart,
      turnover: "Turnover",
      other: "Other",
    },
  };
  VOCABULARIES.set(code, vocabulary);
  return vocabulary;
}

/** What a stat type asks for, which is the same in every code. Its words are in `statVocabulary`. */
export type StatTypeShape = Pick<StatTypeMeta, "points" | "outcomes" | "hotkey">;

export const STAT_TYPE_SHAPE = Object.fromEntries(
  STAT_TYPES.map((type) => {
    const { points, outcomes, hotkey } = statVocabulary("hurling").meta[type];
    return [type, { points, outcomes, hotkey }];
  }),
) as Record<StatType, StatTypeShape>;

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
  return result === "goal" || result === "point" || result === "two_pointer";
}

/** What a scoring result is worth, in points. Zero for anything that did not score. */
export function resultValue(result: ShotResult | null | undefined): number {
  if (result === "goal") return GOAL_VALUE;
  if (result === "two_pointer") return 2;
  if (result === "point") return 1;
  return 0;
}

/**
 * A score's result, given where it was struck from. In a code with the arc,
 * a point marked outside it is a two-pointer, whether the coach pressed
 * "Point" or said "point": people call anything over the bar a point, and
 * the mark on the map is what settles what it was worth. This holds for a
 * free or a 45 as much as for a score from play.
 *
 * Only a point is ever moved. One said or pressed as a two-pointer stays one
 * when its mark sits inside the arc, because a dot dropped by hand is rougher
 * than the word of someone who saw it go over. With no mark there is nothing
 * to measure, and the result stands as given.
 *
 * Measured on the default pitch, which is the one every stat map is drawn
 * on, so the arc a coach sees is the arc that decides.
 */
export function resultFromWhere<R extends ShotResult | null>(
  result: R,
  origin: { x: number; y: number } | null,
  code: GameCode,
): R | "two_pointer" {
  if (result !== "point" || !origin || !termsFor(code).twoPointArc) return result;
  return outsideTwoPointArc(origin.x, origin.y) ? "two_pointer" : result;
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
  two_pointer: "positive",
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

function shotPhrase(entry: StatEntry, t: CodeTerms): string {
  const free = entry.shotKind === "free";
  const what = free ? "Free" : "Shot";
  switch (entry.shotResult) {
    case "goal":
      return free ? "Cúl from a free" : "Cúl";
    case "point":
      return free ? "Cúilín from a free" : "Cúilín";
    case "two_pointer":
      return free ? "Two-pointer from a free" : "Two-pointer";
    case "wide":
      return `${what} wide`;
    case "saved":
      return `${what} saved`;
    case "lost":
      return `${what} dropped short, possession lost`;
    case "retained":
      return `${what} dropped short, possession retained`;
    case "sixty_five":
      return `${what} put out for a ${t.endLineFree}`;
    default:
      return what;
  }
}

/**
 * One entry, said the way a coach would say it: "Our poc amach, lost",
 * "Their kick-out, we won it", "Turnover won, we scored from it". Written out
 * rather than assembled from fragments joined by dots, because this is the
 * line somebody reads when they are checking whether they typed the right
 * thing.
 */
export function describeStat(entry: StatEntry, code: GameCode): string {
  const t = termsFor(code);
  switch (entry.statType) {
    case "tackle":
      return entry.frontEight ? "Front eight tackle" : "Tackle";

    case "free_conceded":
      return entry.scorable ? "Scorable free conceded" : "Free conceded";

    case "free_won":
      return "Free won";

    case "shot": {
      const phrase = shotPhrase(entry, t);
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
      const restart = lower(t.restart);
      const whose = entry.puckoutTakenBy === "opposition" ? `Their ${length}${restart}` : `Our ${length}${restart}`;
      if (entry.outcome === "unclear") return `${whose}, broke unclear`;
      if (entry.puckoutTakenBy === "opposition") {
        return entry.outcome === "positive" ? `${whose}, we won it` : `${whose}, they won it`;
      }
      if (entry.outcome !== "positive") return `${whose}, lost`;
      if (entry.pastSixtyFive === true) return `${whose}, won and worked past our ${t.line}`;
      if (entry.pastSixtyFive === false) return `${whose}, won but held inside our ${t.line}`;
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
 *
 * The code is the club's, read on the server: it words the refusals, and it
 * is what keeps a two-pointer off a sheet whose game has no arc.
 */
export function normaliseEntry(draft: StatDraft, code: GameCode): NormalisedStat {
  const statType = draft.statType;
  if (!STAT_TYPES.includes(statType)) throw new Error("That is not a stat we log.");
  const vocabulary = statVocabulary(code);
  const meta = vocabulary.meta[statType];

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
      shotResult = oneOf(vocabulary.shotResults, draft.shotResult);
      if (!shotResult) {
        throw new Error(
          draft.shotResult === "two_pointer"
            ? "A two-pointer is only scored in football, from outside the arc."
            : "What came of it: a cúl, a cúilín or a wide, or something else?",
        );
      }
      shotResult = resultFromWhere(shotResult, origin, code);
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
      if (!puckoutTakenBy) throw new Error(`Whose ${lower(vocabulary.terms.restart)} was it?`);
      puckoutLength = draft.puckoutLength == null ? null : oneOf(PUCKOUT_LENGTHS, draft.puckoutLength);
      // Only ours, only short, only won: the question is whether a short one
      // we held on to was worked out past our own 65 (or 45, in football) or
      // died in our half.
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
 * fixes every entry at once.
 *
 * An entry logged on the line with no footage carries the real-world moment
 * it was seen instead, and the match's whistles are real-world times too, so
 * the same conversion applies to them unchanged. The footage wins where both
 * exist: a file position was read off the play itself.
 *
 * An entry typed up from the notebook has only the half the coach picked,
 * and no clock at all.
 */
export function statTiming(
  row: { half?: number | null; atMs?: number | null; seenAt?: number | null },
  markers: Markers | undefined,
  halfLengthMin = 30,
  whistles?: Markers,
): { half: Half | null; gameMs: number | null } {
  const stored = row.half === 1 || row.half === 2 ? row.half : null;
  if (markers && row.atMs != null) {
    const t = toGameTime(row.atMs, markers, halfLengthMin);
    if (t.half) return { half: t.half, gameMs: t.gameMs };
  }
  if (whistles?.throwIn != null && row.seenAt != null) {
    const t = liveGameTime(row.seenAt, whistles, halfLengthMin);
    if (t?.half) return { half: t.half, gameMs: t.gameMs };
  }
  return { half: stored, gameMs: null };
}

/**
 * However long stoppage time runs, a half is over well before this. Past it,
 * with nobody having tapped the next whistle, an entry was typed up after the
 * game rather than seen during it, and has no place on the clock.
 */
export const STOPPAGE_ALLOWANCE_MS = 20 * 60_000;

/** The match's whistle times, in the shape the game clock reads. */
export function whistlesOf(match: {
  throwInAt: number | null;
  halfTimeAt: number | null;
  secondHalfAt: number | null;
  fullTimeAt: number | null;
}): Markers {
  return {
    throwIn: match.throwInAt,
    halfTime: match.halfTimeAt,
    secondHalf: match.secondHalfAt,
    fullTime: match.fullTimeAt,
  };
}

/**
 * The game clock at a real-world moment, from the match's whistles. Null
 * before throw-in is tapped, and for a moment too long after the last
 * whistle to be in play (see above). The logging screens use this for the
 * running clock, the report for each entry.
 */
export function liveGameTime(at: number, whistles: Markers, halfLengthMin = 30) {
  if (whistles.throwIn == null) return null;
  const t = toGameTime(at, whistles, halfLengthMin);
  if (t.half && t.halfMs > halfLengthMin * 60_000 + STOPPAGE_ALLOWANCE_MS) return null;
  return t;
}

/**
 * Logging off a live stream rather than from the line.
 *
 * A stream runs behind the pitch, by twenty seconds to a minute depending on
 * who carries it, and every stat is stamped with when it was seen. So a
 * logger watching one keeps their phone that far behind: stamps, whistles
 * and the running clock all read the stream's moment, not the pitch's. The
 * delay belongs to one screen, not the match, since a coach on the line and
 * one at home on the stream want different answers.
 *
 * The easy way to measure it is the whistle someone on the line has already
 * tapped: when it shows on the stream, the gap since is the delay.
 */
export const MAX_STREAM_DELAY_MS = 10 * 60_000;

const WHISTLE_ORDER = ["fullTime", "secondHalf", "halfTime", "throwIn"] as const;

/** The last whistle blown so far, to measure a stream's delay against. */
export function latestWhistle(whistles: Markers): { key: (typeof WHISTLE_ORDER)[number]; at: number } | null {
  for (const key of WHISTLE_ORDER) {
    const at = whistles[key];
    if (at != null) return { key, at };
  }
  return null;
}

/** The delay that puts a whistle seen on the stream just now at the moment it was tapped on the line. */
export function streamDelayFrom(whistleAt: number, seenAt: number): number {
  return Math.min(MAX_STREAM_DELAY_MS, Math.max(0, Math.round(seenAt - whistleAt)));
}

/**
 * Where in a video a stat seen on the line happened.
 *
 * The match's whistles turn the moment it was seen into a half and a time
 * within it; the video's own throw-in and second-half markers turn that into
 * a file position. Footage rarely starts on the whistle, and a camera
 * stopped at half time leaves a gap no real-world clock knows about, so each
 * half is measured from its own marker rather than from the start of the
 * file. Null until the half's marker is set on the video, and for anything
 * seen during the interval or past the end of the file.
 */
export function footageMomentOf(
  seenAt: number,
  whistles: Markers,
  videoMarkers: Markers,
  halfLengthMin = 30,
  durationMs = Infinity,
): number | null {
  const t = liveGameTime(seenAt, whistles, halfLengthMin);
  if (!t?.half) return null;
  const start = t.half === 1 ? videoMarkers.throwIn : videoMarkers.secondHalf;
  if (start == null) return null;
  const at = start + t.halfMs;
  return at <= durationMs ? at : null;
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

/**
 * Every attempt that did not score is `missed`, whatever became of it.
 * `twoPointers` is counted apart from `points` because it is one score worth
 * two: "9 of 14" counts it once, the scoreline counts it twice.
 */
export type ShotCounts = { goals: number; points: number; twoPointers: number; missed: number };

function countShotRows(rows: readonly StatEntry[]): ShotCounts {
  let goals = 0;
  let points = 0;
  let twoPointers = 0;
  let missed = 0;
  for (const r of rows) {
    if (r.statType !== "shot" || !r.shotResult) continue;
    if (r.shotResult === "goal") goals += 1;
    else if (r.shotResult === "point") points += 1;
    else if (r.shotResult === "two_pointer") twoPointers += 1;
    else missed += 1;
  }
  return { goals, points, twoPointers, missed };
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
  /** "9 of 14, 64%" — the form a coach reads first. */
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
 * every other score in the app, so a cúl is worth three here too, and a
 * two-pointer two.
 */
export function shootingEfficiency(
  counts: Pick<ShotCounts, "goals" | "points" | "missed"> & { twoPointers?: number },
): Efficiency {
  const twoPointers = counts.twoPointers ?? 0;
  const score = tallyScore([
    ...Array.from({ length: counts.goals }, () => ({ scoreValue: GOAL_VALUE })),
    ...Array.from({ length: counts.points }, () => ({ scoreValue: 1 })),
    ...Array.from({ length: twoPointers }, () => ({ scoreValue: 2 })),
  ]);
  const scored = counts.goals + counts.points + twoPointers;
  const total = scored + counts.missed;
  const percent = percentOf(scored, total);

  return {
    scored,
    total,
    fraction: `${scored}/${total}`,
    percent,
    label: `${scored} of ${total}, ${percent}%`,
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
  const attempts = (c: ShotCounts) => c.goals + c.points + c.twoPointers + c.missed;
  const theirAttempts = attempts(theirs);
  if (attempts(ours) + theirAttempts === 0) return null;

  const us = shootingEfficiency(ours).score;
  const them = theirAttempts > 0 ? shootingEfficiency(theirs).score : null;
  return { us, them, margin: them ? scoreMargin(us, them) : null };
}

/**
 * The scorers, the way a match report prints them under the result.
 *
 * Every club reads a line like "R Hayes 0-4 (0-2f), A Considine 1-1" before
 * it reads any percentage, so the sheet leads with it. A score off a free or
 * a 65 is the free-taker's, and is shown in brackets with an "f" because that
 * is the notation a programme uses — it is how a selector tells a good day
 * from play apart from a good day over the dead ball. A score logged without
 * a number still counts, under `playerNumber: null`.
 */
export type ScorerLine = { playerNumber: number | null; score: Score; fromFrees: Score };

export function scorers(rows: readonly StatEntry[], side: Side = "us"): ScorerLine[] {
  const byNumber = new Map<number | null, ScorerLine>();
  for (const r of rows) {
    if (r.statType !== "shot" || shotSide(r) !== side) continue;
    if (!isScore(r.shotResult)) continue;
    const key = r.playerNumber ?? null;
    const line = byNumber.get(key) ?? {
      playerNumber: key,
      score: { cul: 0, cuilin: 0 },
      fromFrees: { cul: 0, cuilin: 0 },
    };
    // A two-pointer goes in the points column at its face value, the way a
    // football programme prints it: two of them and a point is 0-5.
    const part = r.shotResult === "goal" ? "cul" : "cuilin";
    const worth = r.shotResult === "goal" ? 1 : resultValue(r.shotResult);
    line.score[part] += worth;
    if (r.shotKind === "free") line.fromFrees[part] += worth;
    byNumber.set(key, line);
  }
  // Top scorer first, as a report lists them; the unnamed scores go last.
  return [...byNumber.values()].sort((a, b) => {
    if (a.playerNumber === null) return 1;
    if (b.playerNumber === null) return -1;
    return (
      scoreTotal(b.score) - scoreTotal(a.score) ||
      b.score.cul - a.score.cul ||
      a.playerNumber - b.playerNumber
    );
  });
}

/** "0-4 (0-2f)", "1-1", or "0-3f" when every score was off the dead ball. */
export function formatScorerTally(line: ScorerLine): string {
  const all = formatScore(line.score);
  const frees = line.fromFrees.cul + line.fromFrees.cuilin;
  if (frees === 0) return all;
  if (frees === line.score.cul + line.score.cuilin) return `${all}f`;
  return `${all} (${formatScore(line.fromFrees)}f)`;
}

/**
 * The score at half time, read from the shots logged in the first half.
 * Only given when every scoring shot has a half — a guess at a half-time
 * score is worse than none — and theirs only when their shots were logged.
 */
export function halfTimeScore(rows: readonly StatEntry[]): { us: Score; them: Score | null } | null {
  const scoring = rows.filter((r) => r.statType === "shot" && isScore(r.shotResult));
  if (scoring.length === 0 || scoring.some((r) => r.half == null)) return null;
  const firstHalf = rows.filter((r) => r.half === 1);
  const theirsLogged = rows.some((r) => r.statType === "shot" && shotSide(r) === "opposition");
  const ours = shootingEfficiency(countShots(firstHalf, "us")).score;
  const theirs = theirsLogged ? shootingEfficiency(countShots(firstHalf, "opposition")).score : null;
  return { us: ours, them: theirs };
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
  twoPointers: number;
  /** Attempts that did not score — wide, saved, dropped short, out for a 65 or a 45. */
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
    twoPointers: 0,
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
        else if (r.shotResult === "two_pointer") line.twoPointers += 1;
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
  return shootingEfficiency({
    goals: line.goals,
    points: line.points,
    twoPointers: line.twoPointers,
    missed: line.missed,
  });
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
