/**
 * A season, read across every submitted stat sheet: the team's form and each
 * player's line, match after match.
 *
 * Nothing here is stored. A season is a few dozen sheets of a few hundred
 * entries each, which SQLite hands back in a blink, and a stored roll-up would
 * go stale the moment a sheet is taken back for corrections, an entry is
 * fixed or a number is put to a different name. Every figure is the same
 * per-match arithmetic as the sheet itself (stats.ts), run over more rows.
 *
 * Three rules a season has that one match does not:
 *
 * Only submitted sheets count, and only submitted entries on them. A draft is
 * a coach's work in progress, and a season figure that moves while someone
 * is still logging tells the panel the wrong thing. The query does the
 * filtering; this file trusts it.
 *
 * Not every sheet logs everything. One coach logs the lot, another only the
 * shots. A percentage is safe either way, because a match that logged no
 * restarts adds no restarts to the pile. An average per match is not: it
 * divides by matches, and a match that never logged tackles is not a match
 * with none. So every per-match figure divides by the matches (or the
 * appearances) that logged that kind of stat at all — `logged` below.
 *
 * A player is found through each match's own number sheet. Numbers belong to
 * the match, not the player, so an entry is someone's only where that match
 * put a name to its number. Entries on numbers nobody was put to still count
 * for the team, and are counted apart (`unnamed`) so the gap can be filled.
 *
 * Pure, so the rules are tested rather than the pages: tests/trends.test.mjs.
 */
import {
  STAT_TYPES,
  emptyStatLine,
  matchResult,
  percentOf,
  playerStatLines,
  puckoutBreakdown,
  scorers,
  shotSide,
  summariseShooting,
  summariseStats,
  type MatchResult,
  type PlayerStatLine,
  type PuckoutBreakdown,
  type SideShooting,
  type StatEntry,
  type StatSummary,
  type StatType,
} from "./stats";
import type { GameCode } from "./codes";
import { scoreTotal, type Score } from "./notation";

/* ------------------------------------------------------------- the sheets */

export type SeasonMatch = {
  id: string;
  opponent: string;
  /** ISO date, as on `matches`. */
  playedOn: string;
  competition: string | null;
};

/** One submitted sheet, and who wore which number on it. */
export type Sheet<T extends StatEntry = StatEntry> = {
  match: SeasonMatch;
  rows: readonly T[];
  /** Number to user id, from this match's `match_lineups`. */
  lineup: ReadonlyMap<number, string>;
};

/* ------------------------------------------------------------------ scope */

/**
 * Which matches a season view covers. A season is the calendar year it was
 * played in: the GAA year runs from the league in spring to the club
 * championship in autumn, so the year is the season a club already means.
 * There is no season column to keep in step. `null` is every season, or every
 * competition.
 */
export type Scope = { season: string | null; competition: string | null };

export function seasonOf(playedOn: string): string {
  return playedOn.slice(0, 4);
}

/** Every season with a match in it, newest first. */
export function seasonsOf(matches: readonly Pick<SeasonMatch, "playedOn">[]): string[] {
  return [...new Set(matches.map((m) => seasonOf(m.playedOn)))].sort().reverse();
}

/**
 * The competitions played in a season, as typed on the match. Free text, so
 * "League" and "league" are two; they are only trimmed, never guessed
 * together, because two that look alike may well not be.
 */
export function competitionsOf(matches: readonly SeasonMatch[], season: string | null): string[] {
  const names = matches
    .filter((m) => season == null || seasonOf(m.playedOn) === season)
    .map((m) => m.competition?.trim())
    .filter((c): c is string => !!c);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

export function inScope(match: SeasonMatch, scope: Scope): boolean {
  if (scope.season != null && seasonOf(match.playedOn) !== scope.season) return false;
  if (scope.competition != null && match.competition?.trim() !== scope.competition) return false;
  return true;
}

/**
 * The scope a page asked for, made safe. An unknown season falls back to the
 * latest one, because a link from last year still wants a season; "all" asks
 * for every season. A competition not played in that season is dropped
 * rather than giving an empty page with no way back.
 */
export function readScope(
  matches: readonly SeasonMatch[],
  asked: { season?: string | null; competition?: string | null },
): Scope {
  const seasons = seasonsOf(matches);
  const season = asked.season === "all" ? null : seasons.includes(asked.season ?? "") ? asked.season! : (seasons[0] ?? null);
  const competition = asked.competition && competitionsOf(matches, season).includes(asked.competition) ? asked.competition : null;
  return { season, competition };
}

/** Oldest first, the order a season is read in. */
export function scoped<T extends StatEntry>(sheets: readonly Sheet<T>[], scope: Scope): Sheet<T>[] {
  return sheets
    .filter((s) => inScope(s.match, scope))
    .sort((a, b) => a.match.playedOn.localeCompare(b.match.playedOn));
}

/* --------------------------------------------------------------- coverage */

/**
 * What a sheet logged at all. Their shots count as a kind of their own: a
 * sheet that logged only our shots says nothing about what the other side
 * scored, and must not average in as a match where they scored nothing.
 */
export type Logged = StatType | "their_shot";

export function loggedOn(rows: readonly StatEntry[]): Set<Logged> {
  const kinds = new Set<Logged>();
  for (const r of rows) {
    if (r.statType === "shot" && shotSide(r) === "opposition") kinds.add("their_shot");
    else kinds.add(r.statType);
  }
  return kinds;
}

function noneLogged(): Record<Logged, number> {
  return Object.fromEntries([...STAT_TYPES, "their_shot"].map((k) => [k, 0])) as Record<Logged, number>;
}

/**
 * A total per match, to one decimal, over the matches that logged it. Null
 * when none did: a dash, not a confident zero.
 */
export function perMatch(total: number, matches: number): number | null {
  return matches === 0 ? null : Math.round((total / matches) * 10) / 10;
}

/* ------------------------------------------------------------------- team */

/** One match, as the season's form guide and trend lines read it. */
export type MatchLine = {
  match: SeasonMatch;
  result: MatchResult | null;
  logged: Set<Logged>;
  /** Ours. Null where none of our shots were logged. */
  shooting: SideShooting | null;
  /** Theirs, from our side. Null where their shots were not logged. */
  theirShooting: SideShooting | null;
  /** Our own restarts. Null where none were logged. */
  restarts: PuckoutBreakdown | null;
  summary: StatSummary;
};

export function matchLines(sheets: readonly Sheet[], code?: GameCode): MatchLine[] {
  return sheets.map((s) => {
    const logged = loggedOn(s.rows);
    const ours = s.rows.some((r) => r.statType === "shot" && shotSide(r) === "us");
    const ourRestarts = s.rows.some((r) => r.statType === "puckout" && r.puckoutTakenBy === "us");
    return {
      match: s.match,
      result: matchResult(s.rows),
      logged,
      shooting: ours ? summariseShooting(s.rows, "us", code) : null,
      theirShooting: logged.has("their_shot") ? summariseShooting(s.rows, "opposition", code) : null,
      restarts: ourRestarts ? puckoutBreakdown(s.rows, "us") : null,
      summary: summariseStats(s.rows),
    };
  });
}

/**
 * Won, drawn and lost, from the sheets that logged both sides' scores. A
 * sheet with only our shots has a score but no result, and is counted as
 * such rather than as a win.
 */
export type SeasonRecord = { played: number; won: number; drawn: number; lost: number; noResult: number };

export function seasonRecord(lines: readonly MatchLine[]): SeasonRecord {
  const record: SeasonRecord = { played: lines.length, won: 0, drawn: 0, lost: 0, noResult: 0 };
  for (const l of lines) {
    const m = l.result?.margin;
    if (m == null) record.noResult += 1;
    else if (m > 0) record.won += 1;
    else if (m < 0) record.lost += 1;
    else record.drawn += 1;
  }
  return record;
}

export type TeamSeason = {
  matches: number;
  /** How many matches logged each kind of stat: the divisor for any per-match figure. */
  logged: Record<Logged, number>;
  summary: StatSummary;
  shooting: SideShooting;
  /** Null when no sheet in scope logged their shots. */
  theirShooting: SideShooting | null;
  restarts: PuckoutBreakdown;
  theirRestarts: PuckoutBreakdown;
  /**
   * Our shooting in each half, for the question every coach asks of a
   * season: do we fade? Shots with no half settled are left out of both.
   */
  halves: { first: SideShooting; second: SideShooting; unhalved: number };
};

/**
 * The season's totals. Every percentage is worked out over the season's
 * rows in one pile, so a match with twenty shots counts for more than one
 * with five, which is what a season's efficiency means. An average of each
 * match's percentage would let a quiet match swing it.
 */
export function teamSeason(sheets: readonly Sheet[], code?: GameCode): TeamSeason {
  const rows = sheets.flatMap((s) => s.rows);
  const logged = noneLogged();
  for (const s of sheets) for (const k of loggedOn(s.rows)) logged[k] += 1;
  const ourShots = rows.filter((r) => r.statType === "shot" && shotSide(r) === "us");

  return {
    matches: sheets.length,
    logged,
    summary: summariseStats(rows),
    shooting: summariseShooting(rows, "us", code),
    theirShooting: logged.their_shot > 0 ? summariseShooting(rows, "opposition", code) : null,
    restarts: puckoutBreakdown(rows, "us"),
    theirRestarts: puckoutBreakdown(rows, "opposition"),
    halves: {
      first: summariseShooting(
        ourShots.filter((r) => r.half === 1),
        "us",
        code,
      ),
      second: summariseShooting(
        ourShots.filter((r) => r.half === 2),
        "us",
        code,
      ),
      unhalved: ourShots.filter((r) => r.half !== 1 && r.half !== 2).length,
    },
  };
}

/**
 * Entries credited to a number the match never put a name to. They count for
 * the team; they are nobody's in a player's line until someone fills in that
 * match's numbers, so the page says how many and where.
 */
export function unnamed(sheets: readonly Sheet[]): { entries: number; matches: SeasonMatch[] } {
  let entries = 0;
  const matches: SeasonMatch[] = [];
  for (const s of sheets) {
    const n = s.rows.filter(
      (r) =>
        (r.playerNumber != null && !s.lineup.has(r.playerNumber)) ||
        (r.targetNumber != null && !s.lineup.has(r.targetNumber)),
    ).length;
    if (n > 0) {
      entries += n;
      matches.push(s.match);
    }
  }
  return { entries, matches };
}

/* ---------------------------------------------------------------- players */

/** What one player did in one match. */
export type PlayerMatch = {
  match: SeasonMatch;
  number: number;
  line: PlayerStatLine;
  /** Deliveries aimed at them: won in the air, or lost. The sheet credits these to the target. */
  received: number;
  lostAsTarget: number;
  score: Score;
  fromFrees: Score;
  logged: Set<Logged>;
};

type Totals = Omit<PlayerStatLine, "playerNumber">;

export type SeasonLine = {
  userId: string;
  appearances: number;
  /** Of those appearances, how many were on a sheet that logged each kind of stat. */
  logged: Record<Logged, number>;
  totals: Totals;
  received: number;
  lostAsTarget: number;
  score: Score;
  fromFrees: Score;
};

/**
 * Whether a number played. The fifteen on the sheet always did; a sub only
 * if something was logged involving them, since a programme lists the subs
 * who came on, not the whole bench. Same rule as the match's own table.
 */
function appeared(number: number, line: PlayerStatLine, received: number, lostAsTarget: number): boolean {
  return number <= 15 || line.entries > 0 || received + lostAsTarget > 0;
}

/** Every named player's match on one sheet, by user id. */
function playersOn(sheet: Sheet): Map<string, PlayerMatch> {
  const lines = playerStatLines(sheet.rows);
  const scoring = new Map(scorers(sheet.rows, "us").map((l) => [l.playerNumber, l]));
  const logged = loggedOn(sheet.rows);
  const out = new Map<string, PlayerMatch>();

  for (const [number, userId] of sheet.lineup) {
    const line = lines.get(number) ?? emptyStatLine(number);
    let received = 0;
    let lostAsTarget = 0;
    for (const r of sheet.rows) {
      if (r.statType !== "delivery" || r.targetNumber !== number) continue;
      if (r.outcome === "positive") received += 1;
      else if (r.outcome === "negative") lostAsTarget += 1;
    }
    if (!appeared(number, line, received, lostAsTarget)) continue;
    const scorer = scoring.get(number);
    out.set(userId, {
      match: sheet.match,
      number,
      line,
      received,
      lostAsTarget,
      score: scorer?.score ?? { cul: 0, cuilin: 0 },
      fromFrees: scorer?.fromFrees ?? { cul: 0, cuilin: 0 },
      logged,
    });
  }
  return out;
}

/** One player's matches in the season, oldest first. */
export function playerMatches(sheets: readonly Sheet[], userId: string): PlayerMatch[] {
  return sheets.flatMap((s) => {
    const m = playersOn(s).get(userId);
    return m ? [m] : [];
  });
}

/**
 * Every entry credited to one player across the season, through the number
 * they wore in each match: what their season's maps are drawn from. Only
 * matches where they appeared, so a number they wore once does not drag in
 * whoever wore it the week after.
 */
export function creditedRows<T extends StatEntry>(sheets: readonly Sheet<T>[], userId: string): T[] {
  return sheets.flatMap((s) => {
    const m = playersOn(s).get(userId);
    return m ? s.rows.filter((r) => r.playerNumber === m.number) : [];
  });
}

function emptyTotals(): Totals {
  const { playerNumber, ...rest } = emptyStatLine(0);
  void playerNumber;
  return rest;
}

function addScore(a: Score, b: Score): Score {
  return { cul: a.cul + b.cul, cuilin: a.cuilin + b.cuilin };
}

function addMatch(season: SeasonLine, m: PlayerMatch): void {
  season.appearances += 1;
  for (const k of m.logged) season.logged[k] += 1;
  for (const key of Object.keys(season.totals) as (keyof Totals)[]) season.totals[key] += m.line[key];
  season.received += m.received;
  season.lostAsTarget += m.lostAsTarget;
  season.score = addScore(season.score, m.score);
  season.fromFrees = addScore(season.fromFrees, m.fromFrees);
}

function emptySeason(userId: string): SeasonLine {
  return {
    userId,
    appearances: 0,
    logged: noneLogged(),
    totals: emptyTotals(),
    received: 0,
    lostAsTarget: 0,
    score: { cul: 0, cuilin: 0 },
    fromFrees: { cul: 0, cuilin: 0 },
  };
}

/** One player's season, from their matches. */
export function seasonLineOf(userId: string, matches: readonly PlayerMatch[]): SeasonLine {
  const season = emptySeason(userId);
  for (const m of matches) addMatch(season, m);
  return season;
}

/** Every player who appeared in scope, by user id. */
export function squadSeason(sheets: readonly Sheet[]): Map<string, SeasonLine> {
  const squad = new Map<string, SeasonLine>();
  for (const s of sheets) {
    for (const [userId, m] of playersOn(s)) {
      const season = squad.get(userId) ?? emptySeason(userId);
      addMatch(season, m);
      squad.set(userId, season);
    }
  }
  return squad;
}

/** Scores per appearance on sheets that logged our shots. */
export function scoresPerMatch(line: SeasonLine): number | null {
  return perMatch(scoreTotal(line.score), line.logged.shot);
}

/** Shots and how many went over or in, for a season line. */
export function seasonShots(line: SeasonLine): { scored: number; total: number; percent: number } {
  const t = line.totals;
  const scored = t.goals + t.points + t.twoPointers;
  const total = scored + t.missed;
  return { scored, total, percent: percentOf(scored, total) };
}
