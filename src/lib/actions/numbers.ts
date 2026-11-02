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
import { suggestPlayer } from "@/lib/hurling/gps";
import { parseLineupCsv } from "@/lib/hurling/lineup-csv";
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

/**
 * Put names to numbers from a CSV of the match day panel.
 *
 * Each name is matched to the panel the way the GPS import does it (same name
 * with fadas and case ignored, or a lone surname with the same initial). A
 * name that matches nobody is added to the panel as a member with no account,
 * as `addPlayer` does, so a squad's first sheet needs no typing at all. The
 * names that were added are returned, because a typo shows up there first.
 *
 * It sets the numbers the file names and leaves every other number as it was,
 * so uploading a corrected file over an earlier one just moves people. A
 * player in the file who already wears another number is moved, as in
 * `setMatchNumber`. All of it lands together or not at all.
 */
export async function importMatchLineup(
  matchId: string,
  csvText: string,
): Promise<{
  sheet: SheetEntry[];
  added: { id: string; displayName: string }[];
  assigned: number;
  problems: string[];
}> {
  const user = await requireCoach();

  const [match] = await db
    .select({ id: matches.id, teamId: matches.teamId, deletedAt: matches.deletedAt })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!match || match.deletedAt !== null) throw new Error("That match no longer exists.");
  assertSameTeam(user, match);

  if (typeof csvText !== "string" || csvText.length > 50_000) throw new Error("That file is too big to be a panel.");
  const read = parseLineupCsv(csvText);
  if (read.error) throw new Error(read.error);

  const panel = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(eq(users.teamId, user.teamId));

  const problems = [...read.problems];
  const added: { id: string; displayName: string }[] = [];
  let assigned = 0;

  db.transaction((tx) => {
    const placed = new Set<string>();
    for (const row of read.rows) {
      let player = suggestPlayer(row.name, panel);
      if (!player) {
        const created = tx
          .insert(users)
          .values({ teamId: user.teamId, displayName: row.name, role: "player" })
          .returning({ id: users.id, displayName: users.displayName })
          .get();
        panel.push(created);
        added.push(created);
        player = created;
      }
      if (placed.has(player.id)) {
        problems.push(`${player.displayName} is on the sheet twice, so ${row.name} was left out.`);
        continue;
      }
      placed.add(player.id);

      tx.delete(matchLineups)
        .where(and(eq(matchLineups.matchId, match.id), eq(matchLineups.number, row.number)))
        .run();
      tx.delete(matchLineups)
        .where(and(eq(matchLineups.matchId, match.id), eq(matchLineups.userId, player.id)))
        .run();
      tx.insert(matchLineups).values({ matchId: match.id, number: row.number, userId: player.id }).run();
      assigned++;
    }
  });

  revalidatePath("/admin");
  revalidatePath(`/matches/${match.id}/numbers`);
  revalidatePath(`/matches/${match.id}/stats`);
  revalidatePath(`/matches/${match.id}/stats/log`);
  return { sheet: await loadNumberSheet(match.id, user.teamId), added, assigned, problems };
}
