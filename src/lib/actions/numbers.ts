"use server";

/**
 * Putting names to one match's jersey numbers.
 *
 * The stat sheet is logged by number, because a number is what a selector
 * can see from the line. This is the other half: who wore it. It can be done
 * before the throw-in, after the final whistle, or halfway through typing up
 * the notebook — every entry against a number follows whoever is put to it.
 */
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matchLineups, matches, users } from "@/lib/db/schema";
import { assertSameTeam, requireCoach } from "@/lib/auth/guard";
import { jerseyNumber } from "@/lib/hurling/stats";
import { loadNumberSheet } from "@/lib/queries/stats";
import type { SheetEntry } from "@/components/stats/types";

/**
 * Put a player to a number, or take the name off it with `userId` null.
 *
 * A player already on another number is moved, not doubled: one person wears
 * one jersey in a match. Returns the whole sheet, since a move changes two
 * rows and the page would otherwise have to work out which.
 */
export async function setMatchNumber(
  matchId: string,
  number: number,
  userId: string | null,
): Promise<SheetEntry[]> {
  const user = await requireCoach();

  const [match] = await db
    .select({ id: matches.id, teamId: matches.teamId })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!match) throw new Error("That match no longer exists.");
  assertSameTeam(user, match);

  const n = jerseyNumber(number);
  if (n == null) throw new Error("Which number?");

  if (userId) {
    const [player] = await db
      .select({ id: users.id, teamId: users.teamId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!player) throw new Error("That player is not on the panel.");
    assertSameTeam(user, player);
  }

  db.transaction((tx) => {
    tx.delete(matchLineups)
      .where(and(eq(matchLineups.matchId, match.id), eq(matchLineups.number, n)))
      .run();
    if (userId) {
      tx.delete(matchLineups)
        .where(and(eq(matchLineups.matchId, match.id), eq(matchLineups.userId, userId)))
        .run();
      tx.insert(matchLineups).values({ matchId: match.id, number: n, userId }).run();
    }
  });

  revalidatePath(`/matches/${match.id}/numbers`);
  revalidatePath(`/matches/${match.id}/stats`);
  revalidatePath(`/matches/${match.id}/stats/log`);
  return loadNumberSheet(match.id, user.teamId);
}
