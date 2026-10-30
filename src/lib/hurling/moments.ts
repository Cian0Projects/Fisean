/**
 * The stat sheet watched back: every logged entry as a few seconds of footage.
 *
 * A stat already knows when it happened, one of two ways. Logged against the
 * footage, it carries the file position it was logged at. Logged on the line,
 * it carries its half and how far into it, which the footage's own half
 * markers turn into a file position (`lineEntryMoment`). Either way the passage is worked out when the sheet is
 * read, never stored: a number put to a name afterwards, or a marker nudged,
 * moves every passage with it, and there is no second copy to go stale.
 *
 * Pure, so the rules are tested rather than the page.
 */
import { effectiveOutcome, lineEntryMoment, type StatEntry, type StatOutcome, type StatType } from "./stats";
import type { Markers } from "./notation";

/**
 * How far before a stat's moment its passage starts.
 *
 * Longer than the review workspace's six-second jump (`STAT_LEAD_IN_MS`).
 * That jump serves a coach stepping through entries with the match already
 * in their head; a player opening one moment cold needs the passage of play
 * that led to it, not only the contest itself.
 */
export const MOMENT_LEAD_IN_MS = 10_000;

/** And how far after: long enough to see the ball land or go over. */
export const MOMENT_TAIL_MS = 3_000;

/** One file of the match's footage, as far as placing a stat on it goes. */
export type Footage = {
  id: string;
  /** Zero when the file's length is not known yet, which means no limit. */
  durationMs: number;
  /** The file's own throw-in and second-half markers. */
  markers: Markers;
};

/** What placing reads of a stat row. */
export type Timed = {
  videoId?: string | null;
  atMs?: number | null;
  half?: number | null;
  halfMs?: number | null;
  seenAt?: number | null;
};

/**
 * Where in the footage a stat happened, or null when it cannot be said.
 *
 * A file position logged against the footage wins: it was read off the
 * picture itself. Otherwise the moment it was seen on the line is tried
 * against each file in turn, so a match filmed as one file per half still
 * finds both halves. A stat logged against a file that is not among this
 * match's footage any more falls back to the line the same way.
 */
export function placeStat(
  row: Timed,
  footage: readonly Footage[],
  whistles: Markers,
  halfLengthMin = 30,
): { videoId: string; atMs: number } | null {
  if (row.videoId && row.atMs != null) {
    const file = footage.find((f) => f.id === row.videoId);
    if (file) return { videoId: file.id, atMs: file.durationMs > 0 ? Math.min(row.atMs, file.durationMs) : row.atMs };
  }
  for (const file of footage) {
    const atMs = lineEntryMoment(row, whistles, file.markers, halfLengthMin, file.durationMs || Infinity);
    if (atMs != null) return { videoId: file.id, atMs };
  }
  return null;
}

/** The passage around a moment, kept inside the file. */
export function momentWindow(atMs: number, durationMs: number): { startMs: number; endMs: number } {
  const endMs = atMs + MOMENT_TAIL_MS;
  return {
    startMs: Math.max(0, atMs - MOMENT_LEAD_IN_MS),
    endMs: durationMs > 0 ? Math.min(endMs, durationMs) : endMs,
  };
}

export type Moment<T> = { row: T; videoId: string; atMs: number; startMs: number; endMs: number };

/**
 * Every stat that can be found on the footage, in the order it is played:
 * file by file as the footage is listed, then by position in the file. The
 * ones that cannot be found are handed back too, so the page can say how
 * many and why, rather than leaving a reel that is quietly short.
 */
export function statMoments<T extends Timed>(
  rows: readonly T[],
  footage: readonly Footage[],
  whistles: Markers,
  halfLengthMin = 30,
): { placed: Moment<T>[]; unplaced: T[] } {
  const order = new Map(footage.map((f, i) => [f.id, i]));
  const placed: Moment<T>[] = [];
  const unplaced: T[] = [];
  for (const row of rows) {
    const at = placeStat(row, footage, whistles, halfLengthMin);
    if (!at) {
      unplaced.push(row);
      continue;
    }
    const file = footage[order.get(at.videoId)!];
    placed.push({ row, ...at, ...momentWindow(at.atMs, file.durationMs) });
  }
  placed.sort((a, b) => order.get(a.videoId)! - order.get(b.videoId)! || a.atMs - b.atMs);
  return { placed, unplaced };
}

/* ---------------------------------------------------------------- filters */

export type MomentFilter = {
  /** The jersey number whose moments these are; null for everyone's. */
  number: number | null;
  /** The kinds of stat to show; empty for every kind. */
  types: readonly StatType[];
  /** Good for us, against us or unclear; null for any. */
  outcome: StatOutcome | null;
  half: 1 | 2 | null;
};

export const ALL_MOMENTS: MomentFilter = { number: null, types: [], outcome: null, half: null };

/**
 * Whether a stat is one of this number's moments.
 *
 * A delivery belongs to whoever it was aimed at as much as to whoever struck
 * it: winning a ball in the air or losing it is that player's moment, and
 * the sheet already credits "received" and "lost" to the target.
 */
export function involves(row: Pick<StatEntry, "playerNumber" | "targetNumber">, number: number): boolean {
  return row.playerNumber === number || row.targetNumber === number;
}

export function inFilter(row: StatEntry, filter: MomentFilter): boolean {
  if (filter.number != null && !involves(row, filter.number)) return false;
  if (filter.types.length > 0 && !filter.types.includes(row.statType)) return false;
  if (filter.outcome != null && effectiveOutcome(row) !== filter.outcome) return false;
  if (filter.half != null && row.half !== filter.half) return false;
  return true;
}

/* ------------------------------------------------------------------- reel */

/** One stretch of footage played without a cut, and the moments it covers. */
export type Passage<T> = { videoId: string; startMs: number; endMs: number; moments: Moment<T>[] };

/**
 * Moments run together into what is actually played.
 *
 * Two stats seconds apart, a turnover won and the point off it, have
 * overlapping passages; played one after the other the viewer would watch the
 * same ten seconds twice. Overlapping or touching passages in the same file
 * are joined into one. Expects the moments in playing order, as
 * `statMoments` gives them.
 */
export function reelOf<T>(moments: readonly Moment<T>[]): Passage<T>[] {
  const reel: Passage<T>[] = [];
  for (const m of moments) {
    const last = reel[reel.length - 1];
    if (last && last.videoId === m.videoId && m.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, m.endMs);
      last.moments.push(m);
    } else {
      reel.push({ videoId: m.videoId, startMs: m.startMs, endMs: m.endMs, moments: [m] });
    }
  }
  return reel;
}

/* ----------------------------------------------------------------- season */

/** One match's share of a season reel: its rows, its footage and its clock. */
export type MatchMoments<T> = {
  rows: readonly T[];
  footage: readonly Footage[];
  whistles: Markers;
  halfLengthMin: number;
};

/**
 * Moments across a season: each match placed against its own footage and
 * its own clock, since a half is 30 minutes one week and 35 the next, then
 * the matches run one after another in the order given (oldest first, as a
 * season is read). Each match's footage is its own, so a passage never joins
 * across two matches.
 */
export function seasonMoments<T extends Timed>(matches: readonly MatchMoments<T>[]): {
  placed: Moment<T>[];
  unplaced: T[];
} {
  const placed: Moment<T>[] = [];
  const unplaced: T[] = [];
  for (const m of matches) {
    const one = statMoments(m.rows, m.footage, m.whistles, m.halfLengthMin);
    placed.push(...one.placed);
    unplaced.push(...one.unplaced);
  }
  return { placed, unplaced };
}
