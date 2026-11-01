/**
 * How much footage a club holds against its tier.
 *
 * The allowance is per club, not per team: every team's files are summed, so
 * a dual club's hurlers and footballers share one tier. Files that failed
 * hold nothing in storage and are left out; one still uploading counts at its
 * declared size, because that is the room it will take.
 */
import { eq, ne, and, sum } from "drizzle-orm";
// Relative imports, so `npm run set-storage` can use it outside Next's aliases.
import { db } from "../db/client";
import { clubs, teams, videos } from "../db/schema";
import { clubQuotaBytes } from "../media/upload";

export type ClubStorage = { usedBytes: number; quotaBytes: number; storageGb: number };

export async function clubStorage(clubId: string): Promise<ClubStorage> {
  const [club] = await db.select({ storageGb: clubs.storageGb }).from(clubs).where(eq(clubs.id, clubId)).limit(1);
  const [{ used }] = await db
    .select({ used: sum(videos.sizeBytes) })
    .from(videos)
    .innerJoin(teams, eq(teams.id, videos.teamId))
    .where(and(eq(teams.clubId, clubId), ne(videos.status, "failed")));
  const storageGb = club?.storageGb ?? 0;
  return { usedBytes: Number(used ?? 0), quotaBytes: clubQuotaBytes(storageGb), storageGb };
}
