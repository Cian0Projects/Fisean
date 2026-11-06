/**
 * Advanced puckout analysis: whether a short restart did its job.
 *
 * Winning the first ball off a short poc amach is only half of it. A coach
 * judges a short one by whether it was worked out past a line: our 45, our
 * 65 or halfway, whichever the squad plays to. So a squad that switches this
 * on (`teams.restart_line`) gets four answers for every restart that came
 * down short of its line, from either team:
 *
 *   lost on the first ball   the side taking it never had it
 *   lost before the line     won, then turned over short of the line
 *   lost past the line       got over the line and lost it there: a ball
 *                            cleared over it that the other side won, or a
 *                            player dispossessed as soon as they crossed it
 *   worked through           on the ball past the line, and kept it
 *
 * A restart won beyond the line is not in the count at all: it was never a
 * short one. One that broke unclear, or was never settled, is kept apart and
 * left out of the percentage, the way an unclear break always has been.
 *
 * The outcome arrives ten or twenty seconds after the puck, so a won short
 * restart is logged open and settled afterwards: by the next entry where that
 * entry says how it went (`settleFrom`), or by one tap. Each row carries the
 * line it was judged against, so a squad that changes its line mid-season
 * does not quietly re-mark the matches already played.
 *
 * Every stage is named from the side taking the restart. Colour is not:
 * their restart worked through is red, because it is bad for us.
 *
 * Pure, and tested in tests/restart-line.test.mjs. Only types come from
 * stats.ts, which imports this, so there is no cycle at runtime.
 */
import type { GameCode } from "./codes";
import { lineFractions } from "./pitch";
import type { PuckoutLength, PuckoutSide, Side, StatOutcome, StatType } from "./stats";

/* ------------------------------------------------------------ vocabulary */

/** The line a squad judges its short restarts at. Null on the team means the analysis is off. */
export const RESTART_LINES = ["45", "65", "halfway"] as const;
export type RestartLine = (typeof RESTART_LINES)[number];

/** How a restart that the taker won short of the line ended. What is stored. */
export const RESTART_ENDS = ["worked_through", "lost_before", "lost_past"] as const;
export type RestartEnd = (typeof RESTART_ENDS)[number];

/** The four answers, in the order the report reads them, worst first. */
export const RESTART_STAGES = ["lost_first", "lost_before", "lost_past", "worked_through"] as const;
export type RestartStage = (typeof RESTART_STAGES)[number];

/** A judged restart that is not one of the four: broke unclear, or never settled. */
export type RestartAside = "unclear" | "not_settled";

export function isRestartLine(value: unknown): value is RestartLine {
  return typeof value === "string" && (RESTART_LINES as readonly string[]).includes(value);
}

/**
 * Where the line starts when a squad switches the analysis on. Hurling and
 * camogie play the short game to the 45. A kick-out must now clear the 40 m
 * arc, so it is almost never won short of the 45, and football's question is
 * whether it got out of our half.
 */
export function defaultRestartLine(code: GameCode): RestartLine {
  return code === "football" || code === "ladies_football" ? "halfway" : "45";
}

/** "our 45", "their 65", "halfway". */
export function lineName(line: RestartLine, whose: Side): string {
  if (line === "halfway") return "halfway";
  return `${whose === "us" ? "our" : "their"} ${line}`;
}

/** How far up the pitch the line is, from the end of the side taking the restart. */
export function lineReach(line: RestartLine): number {
  if (line === "halfway") return 0.5;
  return lineFractions().own[line === "45" ? 45 : 65];
}

/** Distance from the taker's own end line: their end is the far end of our normalised pitch. */
function reachOf(x: number, takenBy: PuckoutSide): number {
  return takenBy === "opposition" ? 1 - x : x;
}

/** Whether a point is on or past the line, for the side taking the restart. */
export function pastLine(x: number, takenBy: PuckoutSide, line: RestartLine): boolean {
  return reachOf(x, takenBy) >= lineReach(line);
}

/* ---------------------------------------------------------- one restart */

/** What the rules read of a row. Every stat row has these columns. */
export type RestartFacts = {
  statType: StatType;
  outcome: StatOutcome | null;
  puckoutTakenBy?: PuckoutSide | null;
  puckoutLength?: PuckoutLength | null;
  originX?: number | null;
  originY?: number | null;
  restartLine?: RestartLine | null;
  restartEnd?: RestartEnd | null;
};

/**
 * Whether the restart came down short of the line. Read from the mark when
 * there is one. Without a mark the length can still say, except where the
 * line falls inside the length's band (a mid one, judged at the 65): then
 * nobody can tell, and the restart is left out rather than guessed.
 */
export function landedShort(entry: RestartFacts, line: RestartLine): boolean | null {
  const takenBy = entry.puckoutTakenBy;
  if (!takenBy) return null;
  if (entry.originX != null && entry.originY != null) return !pastLine(entry.originX, takenBy, line);
  switch (entry.puckoutLength) {
    case "short":
      return true;
    case "medium":
      return line === "halfway" ? true : line === "45" ? false : null;
    case "long":
      return false;
    default:
      return null;
  }
}

/** Whether the side taking it won the first ball. Outcomes are always ours. */
export function takerWonIt(entry: Pick<RestartFacts, "outcome" | "puckoutTakenBy">): boolean {
  return entry.puckoutTakenBy === "opposition" ? entry.outcome === "negative" : entry.outcome === "positive";
}

/** Whether a restart asks how it ended: judged, short of its line, and won by the side taking it. */
export function asksHowItEnded(entry: RestartFacts): boolean {
  return (
    entry.statType === "puckout" &&
    entry.restartLine != null &&
    landedShort(entry, entry.restartLine) === true &&
    takerWonIt(entry)
  );
}

/** Asks, and has not been answered yet. */
export function awaitingEnd(entry: RestartFacts): boolean {
  return asksHowItEnded(entry) && entry.restartEnd == null;
}

/** Where a judged restart stands. Null for anything not in the analysis. */
export function restartStage(entry: RestartFacts): RestartStage | RestartAside | null {
  if (entry.statType !== "puckout" || !entry.restartLine || !entry.puckoutTakenBy) return null;
  if (landedShort(entry, entry.restartLine) !== true) return null;
  if (entry.outcome == null || entry.outcome === "unclear") return "unclear";
  if (!takerWonIt(entry)) return "lost_first";
  return entry.restartEnd ?? "not_settled";
}

/** Good or bad for us: their restart worked through is a red one. */
export function stageOutcome(stage: RestartStage, takenBy: PuckoutSide): StatOutcome {
  const forTaker: StatOutcome = stage === "worked_through" ? "positive" : "negative";
  if (takenBy === "us") return forTaker;
  return forTaker === "positive" ? "negative" : "positive";
}

/** Each stage, said from our side of the ball. */
export function stageLabel(stage: RestartStage | RestartAside, takenBy: PuckoutSide, line: RestartLine | null): string {
  const ours = takenBy === "us";
  const at = line ? lineName(line, takenBy) : "the line";
  switch (stage) {
    case "lost_first":
      return ours ? "Lost on the first ball" : "Won on the first ball";
    case "lost_before":
      return ours ? `Lost before ${at}` : `Turned over before ${at}`;
    case "lost_past":
      return ours ? `Lost past ${at}` : `Won past ${at}`;
    case "worked_through":
      return ours ? "Worked through" : "They worked through";
    case "unclear":
      return "Broke unclear";
    case "not_settled":
      return "Not settled";
  }
}

/** The three buttons that settle an open restart, said for whose restart it is. */
export function endChoices(takenBy: PuckoutSide, line: RestartLine): { value: RestartEnd; label: string }[] {
  const ours = takenBy === "us";
  const at = lineName(line, takenBy);
  return [
    { value: "worked_through", label: ours ? "Worked through" : "They worked through" },
    { value: "lost_before", label: ours ? `Lost before ${at}` : `We won it before ${at}` },
    { value: "lost_past", label: ours ? `Lost past ${at}` : `We won it past ${at}` },
  ];
}

/* ------------------------------------------------- settled by what follows */

/** What the next entry can say about an open restart. */
export type NextFacts = RestartFacts & {
  side?: Side | null;
  playerNumber?: number | null;
  oppositionNumber?: number | null;
  destX?: number | null;
  destY?: number | null;
  videoId?: string | null;
  atMs?: number | null;
  half?: number | null;
  halfMs?: number | null;
};

export type Settlement = {
  restartEnd: RestartEnd;
  /** Who was on the ball when it went, where the entry named them. */
  lostByNumber: number | null;
  /** Where it went, where the entry was placed. Stored as the restart's second point. */
  lostAt: { x: number; y: number } | null;
};

/**
 * Whether `next` happened after `open`, where their times can say. An entry
 * typed up out of order (an earlier shot added while watching back) must not
 * settle a restart that came after it. With no comparable times, the order
 * they were logged in is all there is, and it is taken as the order of play.
 */
export function comesAfter(open: NextFacts, next: NextFacts): boolean {
  if (open.videoId && open.videoId === next.videoId && open.atMs != null && next.atMs != null) {
    return next.atMs >= open.atMs;
  }
  if (open.half != null && next.half != null && open.halfMs != null && next.halfMs != null) {
    return next.half > open.half || (next.half === open.half && next.halfMs >= open.halfMs);
  }
  return true;
}

/**
 * How the entry after an open restart settles it, or null when that entry
 * says nothing either way and the restart stays open.
 *
 * Our restart: a shot or mark of ours, or a free won, means we got out with
 * it. A ball we lost, or a free we gave away with it, is lost: before or
 * past the line by where that entry was placed. Unplaced, nobody can say
 * which, so it waits for the tap. Their restart is the same seen from our
 * side: their shot, mark or a free we gave away means they worked it
 * through; a ball we won off them, or a free they gave away, means our press
 * won it back.
 */
export function settleFrom(open: NextFacts, next: NextFacts): Settlement | null {
  if (!awaitingEnd(open) || next.statType === "puckout" || !comesAfter(open, next)) return null;
  const takenBy = open.puckoutTakenBy!;
  const line = open.restartLine!;
  const through: Settlement = { restartEnd: "worked_through", lostByNumber: null, lostAt: null };
  const lostAt = (x: number | null | undefined, y: number | null | undefined, by: number | null | undefined) =>
    x == null || y == null
      ? null
      : ({
          restartEnd: pastLine(x, takenBy, line) ? "lost_past" : "lost_before",
          lostByNumber: by ?? null,
          lostAt: { x, y },
        } satisfies Settlement);
  const nextSide = next.side ?? "us";

  if (takenBy === "us") {
    switch (next.statType) {
      case "shot":
      case "mark":
        return nextSide === "us" ? through : null;
      case "free_won":
        return through;
      case "delivery":
        // Delivered and won is out; delivered and lost went where it landed.
        if (next.outcome === "positive") return through;
        if (next.outcome === "negative") {
          return next.destX != null ? lostAt(next.destX, next.destY, null) : lostAt(next.originX, next.originY, null);
        }
        return null;
      case "turnover":
        return next.outcome === "negative" ? lostAt(next.originX, next.originY, next.playerNumber) : null;
      case "free_conceded":
        return lostAt(next.originX, next.originY, next.playerNumber);
      default:
        return null;
    }
  }

  switch (next.statType) {
    case "shot":
    case "mark":
      return nextSide === "opposition" ? through : null;
    case "free_conceded":
      return through;
    case "turnover":
      return next.outcome === "positive" ? lostAt(next.originX, next.originY, next.oppositionNumber) : null;
    case "free_won":
      return lostAt(next.originX, next.originY, next.oppositionNumber);
    default:
      return null;
  }
}

/**
 * The restart a logging screen is waiting on: the last restart logged, while
 * it is still open. A newer restart closes it, unsettled, because play has
 * moved on and the answer is no longer in the logger's head.
 */
export function openRestart<T extends RestartFacts & { createdAt: number }>(rows: readonly T[]): T | null {
  let last: T | null = null;
  for (const r of rows) {
    if (r.statType === "puckout" && (!last || r.createdAt >= last.createdAt)) last = r;
  }
  return last && awaitingEnd(last) ? last : null;
}

/* ---------------------------------------------------------- the ladder */

export type RestartLadder = {
  /** The line they were judged at, or null when the rows mix lines (a season that changed it). */
  line: RestartLine | null;
  /** The four answers. Their sum is what the percentage is out of. */
  counted: number;
  lostFirst: number;
  lostBefore: number;
  lostPast: number;
  workedThrough: number;
  /** Judged, but in none of the four. */
  unclear: number;
  notSettled: number;
  /** Worked through, out of `counted`. From the taker's side: theirs is how often they got out. */
  percent: number;
};

/** One side's judged restarts, or null when none of theirs were judged. */
export function restartLadder(rows: readonly RestartFacts[], takenBy: PuckoutSide): RestartLadder | null {
  const ladder = { lostFirst: 0, lostBefore: 0, lostPast: 0, workedThrough: 0, unclear: 0, notSettled: 0 };
  const lines = new Set<RestartLine>();
  for (const r of rows) {
    if (r.puckoutTakenBy !== takenBy) continue;
    const stage = restartStage(r);
    if (!stage) continue;
    lines.add(r.restartLine!);
    if (stage === "lost_first") ladder.lostFirst += 1;
    else if (stage === "lost_before") ladder.lostBefore += 1;
    else if (stage === "lost_past") ladder.lostPast += 1;
    else if (stage === "worked_through") ladder.workedThrough += 1;
    else if (stage === "unclear") ladder.unclear += 1;
    else ladder.notSettled += 1;
  }
  const counted = ladder.lostFirst + ladder.lostBefore + ladder.lostPast + ladder.workedThrough;
  if (counted + ladder.unclear + ladder.notSettled === 0) return null;
  return {
    line: lines.size === 1 ? [...lines][0] : null,
    counted,
    ...ladder,
    percent: counted ? Math.round((ladder.workedThrough / counted) * 100) : 0,
  };
}

/** Each stage's count, in ladder order, for drawing the bar. */
export function ladderParts(l: RestartLadder): { stage: RestartStage; n: number }[] {
  return [
    { stage: "lost_first", n: l.lostFirst },
    { stage: "lost_before", n: l.lostBefore },
    { stage: "lost_past", n: l.lostPast },
    { stage: "worked_through", n: l.workedThrough },
  ];
}
