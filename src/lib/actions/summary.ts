"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { customStats, matches, statTargets, summaryPicks, summaryPins } from "@/lib/db/schema";
import { assertSameTeam, requireCoach } from "@/lib/auth/guard";
import { statVocabulary, type StatType } from "@/lib/hurling/stats";
import {
  MAX_PICKS,
  SUMMARY_STAGES,
  TARGET_DIRECTIONS,
  customIdOf,
  measuresFor,
  targetValue,
  type SummaryStage,
  type Target,
  type TargetDirection,
  type TargetMeasure,
  type TileKey,
} from "@/lib/hurling/summary";

/**
 * The match summary's settings and the analyst's confirmed tiles.
 *
 * Coaches as well as admins, like the rest of the stats settings: they are
 * the ones logging and talking to the room. The rules are in
 * src/lib/hurling/summary.ts, applied here because a server action is
 * reachable by POST whatever the form does.
 */

type Coach = Awaited<ReturnType<typeof requireCoach>>;

/** A tile key this squad can have: a stat its game logs, or one of its own stats. */
async function assertOurKey(user: Coach, key: TileKey): Promise<{ customStatId: string | null; askOutcome: boolean }> {
  const id = customIdOf(key);
  if (id) {
    const [stat] = await db
      .select({ id: customStats.id, teamId: customStats.teamId, askOutcome: customStats.askOutcome })
      .from(customStats)
      .where(eq(customStats.id, id))
      .limit(1);
    if (!stat) throw new Error("That stat no longer exists.");
    assertSameTeam(user, stat);
    return { customStatId: stat.id, askOutcome: stat.askOutcome };
  }
  if (!statVocabulary(user.teamCode).statTypes.includes(key as StatType)) {
    throw new Error("That is not a stat your game logs.");
  }
  return { customStatId: null, askOutcome: false };
}

function revalidateSummary(): void {
  revalidatePath("/admin");
  revalidatePath("/matches", "layout");
}

/** Set one stat's target: count or rate, at least or at most, and the number (null for none). */
export async function setStatTarget(
  key: TileKey,
  input: { measure: TargetMeasure; direction: TargetDirection; value: number | string | null },
): Promise<Target> {
  const user = await requireCoach();
  const { customStatId, askOutcome } = await assertOurKey(user, key);

  const measures = measuresFor(key, customStatId ? [{ id: customStatId, askOutcome }] : []);
  if (!measures.includes(input.measure)) throw new Error("That stat cannot be judged that way.");
  if (!TARGET_DIRECTIONS.includes(input.direction)) throw new Error("Pick at least or at most.");
  const value = targetValue(input.measure, input.value);

  const set = { measure: input.measure, direction: input.direction, target: value, customStatId, updatedAt: Date.now() };
  await db
    .insert(statTargets)
    .values({ teamId: user.teamId, statKey: key, ...set })
    .onConflictDoUpdate({ target: [statTargets.teamId, statTargets.statKey], set });

  revalidateSummary();
  return { measure: input.measure, direction: input.direction, value };
}

/** Put a stat's target back to the default for the team's code. */
export async function resetStatTarget(key: TileKey): Promise<void> {
  const user = await requireCoach();
  await db.delete(statTargets).where(and(eq(statTargets.teamId, user.teamId), eq(statTargets.statKey, key)));
  revalidateSummary();
}

/** The two tiles the players always see. */
export async function setSummaryPins(first: TileKey, second: TileKey): Promise<TileKey[]> {
  const user = await requireCoach();
  if (first === second) throw new Error("Pick two different stats.");
  await assertOurKey(user, first);
  await assertOurKey(user, second);
  const set = { first, second, updatedAt: Date.now() };
  await db
    .insert(summaryPins)
    .values({ teamId: user.teamId, ...set })
    .onConflictDoUpdate({ target: summaryPins.teamId, set });
  revalidateSummary();
  return [first, second];
}

/**
 * Confirm the tiles beside the fixed two for one match and stage. Any coach
 * may, wherever they are: the laptop in the dressing room and the phone in
 * the stand see the same choice.
 */
export async function setSummaryPicks(matchId: string, stage: SummaryStage, picks: TileKey[]): Promise<TileKey[]> {
  const user = await requireCoach();
  if (!SUMMARY_STAGES.includes(stage)) throw new Error("That is not half time or full time.");
  const [match] = await db
    .select({ id: matches.id, teamId: matches.teamId })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!match) throw new Error("That match no longer exists.");
  assertSameTeam(user, match);

  const clean = [...new Set(Array.isArray(picks) ? picks.filter((p) => typeof p === "string") : [])];
  if (clean.length > MAX_PICKS) throw new Error(`Pick ${MAX_PICKS} at most.`);
  for (const key of clean) await assertOurKey(user, key);

  const set = { picks: clean, chosenBy: user.id, updatedAt: Date.now() };
  await db
    .insert(summaryPicks)
    .values({ matchId: match.id, teamId: user.teamId, stage, ...set })
    .onConflictDoUpdate({ target: [summaryPicks.matchId, summaryPicks.stage], set });

  revalidatePath(`/matches/${match.id}/stats/summary`);
  return clean;
}
