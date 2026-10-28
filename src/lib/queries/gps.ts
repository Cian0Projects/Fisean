import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matchGps } from "@/lib/db/schema";
import type { GpsPlayer } from "@/lib/hurling/gps";

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
