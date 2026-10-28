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
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matchGps, matches } from "@/lib/db/schema";
import { assertSameTeam, requireCoach } from "@/lib/auth/guard";
import { parseGpsCsv } from "@/lib/hurling/gps";

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
