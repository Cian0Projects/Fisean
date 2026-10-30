"use server";

/**
 * Attaching a GPS export to a match.
 *
 * The browser reads the chosen CSV as text and sends that, so there is no
 * file upload to store: the figures are the only thing we keep, and the file
 * itself is never written anywhere. Coaches only, because a player's running
 * load is health data and not for the whole panel.
 */
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { gpsNames, matchGps, matches, users } from "@/lib/db/schema";
import { assertSameTeam, requireCoach } from "@/lib/auth/guard";
import { gpsNameKey, parseGpsCsv } from "@/lib/hurling/gps";

/** A squad's sheet is a few kilobytes; anything near this is the wrong file. */
const MAX_CSV_CHARS = 500_000;

export type GpsUploadResult = { imported: number; skipped: number; ignored: string[] };

async function loadMatch(matchId: string) {
  const user = await requireCoach();
  const [match] = await db
    .select({ id: matches.id, teamId: matches.teamId })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!match) throw new Error("That match no longer exists.");
  assertSameTeam(user, match);
  return match;
}

function refresh(matchId: string) {
  revalidatePath(`/matches/${matchId}/gps`);
  revalidatePath("/stats");
  revalidatePath("/");
}

/** Replace the match's GPS figures with those in `csv`. */
export async function uploadMatchGps(matchId: string, csv: string): Promise<GpsUploadResult> {
  const match = await loadMatch(matchId);
  if (typeof csv !== "string" || csv.length > MAX_CSV_CHARS) {
    throw new Error("That file is too big to be a GPS export. Choose the CSV for one match.");
  }

  const parsed = parseGpsCsv(csv);
  if (parsed.error) throw new Error(parsed.error);

  db.transaction((tx) => {
    tx.delete(matchGps).where(eq(matchGps.matchId, match.id)).run();
    tx.insert(matchGps)
      .values(parsed.players.map((p) => ({ ...p, matchId: match.id, teamId: match.teamId })))
      .run();
  });

  refresh(match.id);
  return { imported: parsed.players.length, skipped: parsed.skipped, ignored: parsed.ignored };
}

/** Take the GPS figures off the match, so a wrong file can be uploaded afresh. */
export async function removeMatchGps(matchId: string): Promise<void> {
  const match = await loadMatch(matchId);
  await db.delete(matchGps).where(eq(matchGps.matchId, match.id));
  refresh(match.id);
}

export type GpsLink = { name: string; userId: string | null };

/**
 * Say which player each GPS name is, or that a name is nobody on the panel
 * with `userId` null. Saved for the club team, not the match: the provider
 * spells an athlete the same way every week, so one link covers every match
 * uploaded before or after (see `gps_names`). Several at once, so "link all
 * suggested" is one round trip.
 */
export async function linkGpsNames(matchId: string, links: GpsLink[]): Promise<void> {
  const match = await loadMatch(matchId);
  if (!Array.isArray(links) || links.length > 200) throw new Error("Too many names at once.");

  const wanted = [...new Set(links.map((l) => l.userId).filter((id): id is string => !!id))];
  for (const id of wanted) {
    const [player] = await db.select({ teamId: users.teamId }).from(users).where(eq(users.id, id)).limit(1);
    // The match is already the coach's team, so the player must be on it too.
    if (!player || player.teamId !== match.teamId) throw new Error("That player is not on the panel.");
  }

  db.transaction((tx) => {
    for (const l of links) {
      const nameKey = gpsNameKey(String(l.name ?? ""));
      if (!nameKey) continue;
      if (l.userId) {
        tx.insert(gpsNames)
          .values({ teamId: match.teamId, nameKey, name: l.name, userId: l.userId })
          .onConflictDoUpdate({
            target: [gpsNames.teamId, gpsNames.nameKey],
            set: { name: l.name, userId: l.userId, updatedAt: Date.now() },
          })
          .run();
      } else {
        tx.delete(gpsNames)
          .where(and(eq(gpsNames.teamId, match.teamId), eq(gpsNames.nameKey, nameKey)))
          .run();
      }
    }
  });

  refresh(match.id);
  revalidatePath("/stats/players", "layout");
}
