import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { gpsNames, matchGps, matches } from "@/lib/db/schema";
import { gpsNameKey, type GpsPlayer } from "@/lib/hurling/gps";

/** The GPS figures attached to one match, or an empty list when none were uploaded. */
export async function loadMatchGps(
  matchId: string,
  teamId: string,
): Promise<{ players: GpsPlayer[]; uploadedAt: number | null }> {
  const rows = await db
    .select()
    .from(matchGps)
    .where(and(eq(matchGps.matchId, matchId), eq(matchGps.teamId, teamId)));
  return {
    players: rows.map((r) => ({
      name: r.name,
      totalDistance: r.totalDistance,
      hmld: r.hmld,
      hsr: r.hsr,
      maxSpeed: r.maxSpeed,
      percentSpeed: r.percentSpeed,
      accels: r.accels,
      decels: r.decels,
    })),
    uploadedAt: rows.length > 0 ? Math.max(...rows.map((r) => r.createdAt)) : null,
  };
}

/** The team's saved GPS links, by name key (`gpsNameKey`) to user id. */
export async function loadGpsLinks(teamId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ nameKey: gpsNames.nameKey, userId: gpsNames.userId })
    .from(gpsNames)
    .where(eq(gpsNames.teamId, teamId));
  return new Map(rows.map((r) => [r.nameKey, r.userId]));
}

export type PlayerGps = GpsPlayer & { matchId: string };

/**
 * Every GPS line put to a player, by user id, from matches with a submitted
 * stat sheet: the same matches the season pages count, so a player's
 * running sits beside the stats of the games it came from. A name nobody has
 * been linked to is left out; the match's GPS page is where it is linked.
 */
export async function loadSeasonGps(teamId: string): Promise<Map<string, PlayerGps[]>> {
  const [rows, links] = await Promise.all([
    db
      .select({
        matchId: matchGps.matchId,
        name: matchGps.name,
        totalDistance: matchGps.totalDistance,
        hmld: matchGps.hmld,
        hsr: matchGps.hsr,
        maxSpeed: matchGps.maxSpeed,
        percentSpeed: matchGps.percentSpeed,
        accels: matchGps.accels,
        decels: matchGps.decels,
      })
      .from(matchGps)
      .innerJoin(matches, eq(matches.id, matchGps.matchId))
      .where(and(eq(matchGps.teamId, teamId), isNotNull(matches.statsSubmittedAt))),
    loadGpsLinks(teamId),
  ]);
  const byPlayer = new Map<string, PlayerGps[]>();
  for (const r of rows) {
    const userId = links.get(gpsNameKey(r.name));
    if (!userId) continue;
    const list = byPlayer.get(userId) ?? [];
    list.push(r);
    byPlayer.set(userId, list);
  }
  return byPlayer;
}
