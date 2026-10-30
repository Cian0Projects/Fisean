/**
 * The stat sheet for one match, as every screen that shows it reads it.
 *
 * Four pages load the same rows — the report, the logging form, the review
 * workspace's pad and, for its scoreline, the home page — and a column added
 * to the sheet has to reach all of them. One column list means it does.
 */
import "server-only";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matchLineups, matchStats, statClocks, users, videoMarkers, videos } from "@/lib/db/schema";
import { markersFromRows, type Markers } from "@/lib/hurling/notation";
import type { SheetEntry, StatRow } from "@/components/stats/types";

export const statColumns = {
  id: matchStats.id,
  statType: matchStats.statType,
  outcome: matchStats.outcome,
  playerNumber: matchStats.playerNumber,
  targetNumber: matchStats.targetNumber,
  oppositionNumber: matchStats.oppositionNumber,
  originX: matchStats.originX,
  originY: matchStats.originY,
  destX: matchStats.destX,
  destY: matchStats.destY,
  half: matchStats.half,
  side: matchStats.side,
  shotResult: matchStats.shotResult,
  shotKind: matchStats.shotKind,
  attemptSource: matchStats.attemptSource,
  ledToScore: matchStats.ledToScore,
  possession: matchStats.possession,
  frontEight: matchStats.frontEight,
  scorable: matchStats.scorable,
  puckoutTakenBy: matchStats.puckoutTakenBy,
  puckoutLength: matchStats.puckoutLength,
  pastSixtyFive: matchStats.pastSixtyFive,
  markKind: matchStats.markKind,
  clipId: matchStats.clipId,
  videoId: matchStats.videoId,
  atMs: matchStats.atMs,
  seenAt: matchStats.seenAt,
  halfMs: matchStats.halfMs,
  draft: matchStats.draft,
  createdAt: matchStats.createdAt,
};

/**
 * The entries one person may see: everything submitted, and their own drafts.
 * Every query of the sheet carries this, so an entry logged on the line stays
 * with whoever logged it until they submit, on every screen that counts it.
 */
export function visibleStat(viewerId: string) {
  return or(eq(matchStats.draft, false), eq(matchStats.createdBy, viewerId))!;
}

/** Scoped by team as well as match: a match id is a URL, and a URL travels. */
export async function loadStatRows(matchId: string, teamId: string, viewerId: string): Promise<StatRow[]> {
  return db
    .select(statColumns)
    .from(matchStats)
    .where(and(eq(matchStats.matchId, matchId), eq(matchStats.teamId, teamId), visibleStat(viewerId)))
    .orderBy(asc(matchStats.createdAt));
}

/** Only this logger's own entries, for the logging screen on the line. */
export async function loadOwnStatRows(matchId: string, teamId: string, userId: string): Promise<StatRow[]> {
  return db
    .select(statColumns)
    .from(matchStats)
    .where(and(eq(matchStats.matchId, matchId), eq(matchStats.teamId, teamId), eq(matchStats.createdBy, userId)))
    .orderBy(asc(matchStats.createdAt));
}

/** This logger's own clock for the match, or an unstarted one. */
export type SavedClock = { whistles: Markers; pausedAt: number | null; submittedAt: number | null };

export async function loadStatClock(matchId: string, userId: string): Promise<SavedClock> {
  const [row] = await db
    .select()
    .from(statClocks)
    .where(and(eq(statClocks.matchId, matchId), eq(statClocks.userId, userId)))
    .limit(1);
  return row ? clockOf(row) : { whistles: {}, pausedAt: null, submittedAt: null };
}

export function clockOf(row: typeof statClocks.$inferSelect): SavedClock {
  return {
    whistles: {
      throwIn: row.throwInAt,
      halfTime: row.halfTimeAt,
      secondHalf: row.secondHalfAt,
      fullTime: row.fullTimeAt,
    },
    pausedAt: row.pausedAt,
    submittedAt: row.submittedAt,
  };
}

/**
 * Who wore which number in this match, in number order. The stat sheet is
 * logged by number; this is what puts names to it. Scoped by team through the
 * player, for the same reason as above.
 */
export async function loadNumberSheet(matchId: string, teamId: string): Promise<SheetEntry[]> {
  return db
    .select({ number: matchLineups.number, userId: users.id, displayName: users.displayName })
    .from(matchLineups)
    .innerJoin(users, eq(users.id, matchLineups.userId))
    .where(and(eq(matchLineups.matchId, matchId), eq(users.teamId, teamId)))
    .orderBy(asc(matchLineups.number));
}

/**
 * The half-time markers of every video of this match, by video — what turns a
 * live-logged entry's file position into a half and a game clock.
 */
export async function loadMatchMarkers(matchId: string): Promise<Map<string, Markers>> {
  const footage = await db.select({ id: videos.id }).from(videos).where(eq(videos.matchId, matchId));
  if (!footage.length) return new Map();

  const rows = await db
    .select({ videoId: videoMarkers.videoId, kind: videoMarkers.kind, atMs: videoMarkers.atMs })
    .from(videoMarkers)
    .where(
      inArray(
        videoMarkers.videoId,
        footage.map((v) => v.id),
      ),
    );

  const byVideo = new Map<string, { kind: string; atMs: number }[]>();
  for (const r of rows) byVideo.set(r.videoId, [...(byVideo.get(r.videoId) ?? []), r]);
  return new Map([...byVideo].map(([id, list]) => [id, markersFromRows(list)]));
}
