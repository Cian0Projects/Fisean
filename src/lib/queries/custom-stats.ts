/**
 * A squad's own stats and what has been logged against them.
 *
 * One column list, like the built-in sheet's (queries/stats.ts), so every
 * screen that shows an entry reads the same shape. Drafts follow the same
 * rule too: an entry logged on the line is its logger's alone until they
 * submit, on every screen that counts it.
 */
import "server-only";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { customStatEntries, customStats, hiddenStats } from "@/lib/db/schema";
import type { CustomEntryRow, CustomStatDef } from "@/lib/hurling/custom-stats";
import type { StatType } from "@/lib/hurling/stats";

const defColumns = {
  id: customStats.id,
  name: customStats.name,
  sideMode: customStats.sideMode,
  askPlayer: customStats.askPlayer,
  askOpposition: customStats.askOpposition,
  askOutcome: customStats.askOutcome,
  scoreMode: customStats.scoreMode,
  points: customStats.points,
  archivedAt: customStats.archivedAt,
};

/** The squad's stats in the order they were made. Retired ones only when asked for. */
export async function loadCustomStats(
  teamId: string,
  options: { withRetired?: boolean } = {},
): Promise<CustomStatDef[]> {
  return db
    .select(defColumns)
    .from(customStats)
    .where(
      options.withRetired
        ? eq(customStats.teamId, teamId)
        : and(eq(customStats.teamId, teamId), isNull(customStats.archivedAt)),
    )
    .orderBy(asc(customStats.createdAt));
}

/** The standard stats this squad has removed from logging. Their entries, if any, are kept. */
export async function loadHiddenStats(teamId: string): Promise<StatType[]> {
  const rows = await db.select({ statType: hiddenStats.statType }).from(hiddenStats).where(eq(hiddenStats.teamId, teamId));
  return rows.map((r) => r.statType);
}

const entryColumns = {
  id: customStatEntries.id,
  statId: customStatEntries.statId,
  side: customStatEntries.side,
  playerNumber: customStatEntries.playerNumber,
  oppositionNumber: customStatEntries.oppositionNumber,
  outcome: customStatEntries.outcome,
  ledToScore: customStatEntries.ledToScore,
  score: customStatEntries.score,
  originX: customStatEntries.originX,
  originY: customStatEntries.originY,
  destX: customStatEntries.destX,
  destY: customStatEntries.destY,
  half: customStatEntries.half,
  halfMs: customStatEntries.halfMs,
  videoId: customStatEntries.videoId,
  atMs: customStatEntries.atMs,
  draft: customStatEntries.draft,
  createdAt: customStatEntries.createdAt,
};

/** Everything submitted, and the viewer's own drafts. Scoped by team as well as match. */
export async function loadCustomEntries(matchId: string, teamId: string, viewerId: string): Promise<CustomEntryRow[]> {
  return db
    .select(entryColumns)
    .from(customStatEntries)
    .where(
      and(
        eq(customStatEntries.matchId, matchId),
        eq(customStatEntries.teamId, teamId),
        or(eq(customStatEntries.draft, false), eq(customStatEntries.createdBy, viewerId)),
      ),
    )
    .orderBy(asc(customStatEntries.createdAt));
}

/** Only this logger's own, for the logging screen on the line. */
export async function loadOwnCustomEntries(matchId: string, teamId: string, userId: string): Promise<CustomEntryRow[]> {
  return db
    .select(entryColumns)
    .from(customStatEntries)
    .where(
      and(
        eq(customStatEntries.matchId, matchId),
        eq(customStatEntries.teamId, teamId),
        eq(customStatEntries.createdBy, userId),
      ),
    )
    .orderBy(asc(customStatEntries.createdAt));
}
