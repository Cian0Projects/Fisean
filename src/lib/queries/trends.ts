/**
 * Every submitted stat sheet of a team, as the season pages read them.
 *
 * A handful of queries for the whole lot rather than a handful per match: the matches,
 * their entries, their number sheets and the half markers of their footage.
 * Each row's half is settled here, the same way the match's own report
 * settles it (`statTiming`), so a season's first half and second half agree
 * with every sheet in it.
 *
 * Submitted entries only, for coaches as much as players: a draft is still
 * its logger's, and a season figure is the same for everyone who reads it.
 * The rules of the season itself are in src/lib/hurling/trends.ts.
 */
import "server-only";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matchLineups, matchStats, matches, users, videoMarkers, videos } from "@/lib/db/schema";
import { markersFromRows, type Markers } from "@/lib/hurling/notation";
import { statTiming, whistlesOf } from "@/lib/hurling/stats";
import type { SeasonMatch, Sheet } from "@/lib/hurling/trends";
import type { StatRow } from "@/components/stats/types";
import { statColumns } from "./stats";

export type SeasonData = {
  matches: SeasonMatch[];
  sheets: Sheet<StatRow>[];
  /** Everyone at the club by user id, for putting names to season lines. */
  names: Map<string, string>;
  /** Each match's clock, for placing its entries on its footage. */
  clocks: Map<string, { whistles: Markers; halfLengthMin: number }>;
};

/** The half markers of every video the team has, by video. */
async function loadTeamMarkers(teamId: string): Promise<Map<string, Markers>> {
  const rows = await db
    .select({ videoId: videoMarkers.videoId, kind: videoMarkers.kind, atMs: videoMarkers.atMs })
    .from(videoMarkers)
    .innerJoin(videos, eq(videos.id, videoMarkers.videoId))
    .where(eq(videos.teamId, teamId));
  const byVideo = new Map<string, { kind: string; atMs: number }[]>();
  for (const r of rows) {
    const list = byVideo.get(r.videoId) ?? [];
    list.push(r);
    byVideo.set(r.videoId, list);
  }
  return new Map([...byVideo].map(([id, list]) => [id, markersFromRows(list)]));
}

export type SeasonFootage = { id: string; durationMs: number; markers: Markers; storageKey: string };

/**
 * Every ready video of the team's matches, by match, in the order each
 * match's footage plays. For a season's reel of moments; the page signs the
 * links, since only it knows which files the reel will need.
 */
export async function loadSeasonFootage(teamId: string): Promise<Map<string, SeasonFootage[]>> {
  const [files, markers] = await Promise.all([
    db
      .select({ id: videos.id, matchId: videos.matchId, durationMs: videos.durationMs, storageKey: videos.storageKey })
      .from(videos)
      .where(and(eq(videos.teamId, teamId), eq(videos.status, "ready")))
      .orderBy(asc(videos.createdAt)),
    loadTeamMarkers(teamId),
  ]);
  const byMatch = new Map<string, SeasonFootage[]>();
  for (const f of files) {
    if (!f.matchId) continue;
    const list = byMatch.get(f.matchId) ?? [];
    list.push({ id: f.id, durationMs: f.durationMs ?? 0, storageKey: f.storageKey, markers: markers.get(f.id) ?? {} });
    byMatch.set(f.matchId, list);
  }
  return byMatch;
}

export async function loadSeason(teamId: string): Promise<SeasonData> {
  const [played, entries, lineups, markers, people] = await Promise.all([
    db
      .select()
      .from(matches)
      .where(and(eq(matches.teamId, teamId), isNotNull(matches.statsSubmittedAt)))
      .orderBy(asc(matches.playedOn), asc(matches.createdAt)),
    db
      .select({ ...statColumns, matchId: matchStats.matchId })
      .from(matchStats)
      .innerJoin(matches, eq(matches.id, matchStats.matchId))
      .where(
        and(eq(matchStats.teamId, teamId), eq(matchStats.draft, false), isNotNull(matches.statsSubmittedAt)),
      )
      .orderBy(asc(matchStats.createdAt)),
    db
      .select({ matchId: matchLineups.matchId, number: matchLineups.number, userId: matchLineups.userId })
      .from(matchLineups)
      .innerJoin(users, eq(users.id, matchLineups.userId))
      .where(eq(users.teamId, teamId)),
    loadTeamMarkers(teamId),
    db.select({ id: users.id, name: users.displayName }).from(users).where(eq(users.teamId, teamId)),
  ]);

  const rowsOf = new Map<string, StatRow[]>();
  const info = new Map(played.map((m) => [m.id, m]));
  for (const { matchId, ...r } of entries) {
    const match = info.get(matchId);
    if (!match) continue;
    const timed = {
      ...r,
      ...statTiming(r, r.videoId ? markers.get(r.videoId) : undefined, match.halfLengthMin, whistlesOf(match)),
    };
    const list = rowsOf.get(matchId) ?? [];
    list.push(timed);
    rowsOf.set(matchId, list);
  }

  const lineupOf = new Map<string, Map<number, string>>();
  for (const l of lineups) {
    const sheet = lineupOf.get(l.matchId) ?? new Map<number, string>();
    sheet.set(l.number, l.userId);
    lineupOf.set(l.matchId, sheet);
  }

  const seasonMatches: SeasonMatch[] = played.map((m) => ({
    id: m.id,
    opponent: m.opponent,
    playedOn: m.playedOn,
    competition: m.competition,
  }));

  return {
    matches: seasonMatches,
    sheets: seasonMatches.map((match) => ({
      match,
      rows: rowsOf.get(match.id) ?? [],
      lineup: lineupOf.get(match.id) ?? new Map(),
    })),
    names: new Map(people.map((p) => [p.id, p.name])),
    clocks: new Map(played.map((m) => [m.id, { whistles: whistlesOf(m), halfLengthMin: m.halfLengthMin }])),
  };
}
