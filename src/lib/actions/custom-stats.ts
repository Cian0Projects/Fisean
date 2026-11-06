"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { customStatEntries, customStats, hiddenStats, matches, teams, videos } from "@/lib/db/schema";
import { isRestartLine, type RestartLine } from "@/lib/hurling/restart-line";
import { assertSameTeam, requireCoach } from "@/lib/auth/guard";
import { statVocabulary, type StatType } from "@/lib/hurling/stats";
import {
  MAX_CUSTOM_STATS,
  canRemoveStandard,
  normaliseCustomEntry,
  normaliseSpec,
  sameName,
  type CustomDraft,
  type CustomEntryRow,
  type CustomStatDef,
  type CustomStatSpec,
} from "@/lib/hurling/custom-stats";
import { loadStatClock } from "@/lib/queries/stats";
import { loadHiddenStats } from "@/lib/queries/custom-stats";

/**
 * Defining a squad's own stats, and logging against them.
 *
 * The same tier as the built-in sheet: a coach or an admin makes and changes
 * the stats, and logs them. Reading the report is open to the whole panel. The
 * rules are in src/lib/hurling/custom-stats.ts, applied here again because a
 * server action is reachable by POST whatever the form does.
 */

function revalidateCustom(matchId?: string): void {
  revalidatePath("/admin");
  if (matchId) {
    revalidatePath(`/matches/${matchId}/stats`);
    revalidatePath(`/matches/${matchId}/stats/log`);
  }
}

function toDef(row: typeof customStats.$inferSelect): CustomStatDef {
  return {
    id: row.id,
    name: row.name,
    sideMode: row.sideMode,
    askPlayer: row.askPlayer,
    askOpposition: row.askOpposition,
    askOutcome: row.askOutcome,
    scoreMode: row.scoreMode,
    points: row.points,
    archivedAt: row.archivedAt,
  };
}

async function ownStat(user: Awaited<ReturnType<typeof requireCoach>>, statId: string) {
  const [stat] = await db.select().from(customStats).where(eq(customStats.id, statId)).limit(1);
  if (!stat) throw new Error("That stat no longer exists.");
  assertSameTeam(user, stat);
  return stat;
}

/** A name already in use on this squad, retired ones included: the report would show two of the same. */
async function assertNameFree(teamId: string, name: string, exceptId?: string): Promise<void> {
  const rows = await db
    .select({ id: customStats.id, name: customStats.name })
    .from(customStats)
    .where(eq(customStats.teamId, teamId));
  if (rows.some((r) => r.id !== exceptId && sameName(r.name, name))) {
    throw new Error("You already have a stat with that name.");
  }
}

/* ------------------------------------------------------------- definitions */

export async function createCustomStat(input: CustomStatSpec): Promise<CustomStatDef> {
  const user = await requireCoach();
  const spec = normaliseSpec(input);

  const [{ n }] = await db
    .select({ n: count() })
    .from(customStats)
    .where(eq(customStats.teamId, user.teamId));
  if (n >= MAX_CUSTOM_STATS) {
    throw new Error(`A squad can have ${MAX_CUSTOM_STATS} stats of its own. Delete one you no longer use first.`);
  }
  await assertNameFree(user.teamId, spec.name);

  const [row] = await db
    .insert(customStats)
    .values({ ...spec, teamId: user.teamId, createdBy: user.id })
    .returning();

  revalidateCustom();
  return toDef(row);
}

/**
 * Change a stat. Entries already logged keep what they hold: a number added
 * to a stat later is simply empty on the older entries, and a question
 * removed leaves its old answers stored but unread.
 */
export async function updateCustomStat(statId: string, input: CustomStatSpec): Promise<CustomStatDef> {
  const user = await requireCoach();
  const stat = await ownStat(user, statId);
  const spec = normaliseSpec(input);
  await assertNameFree(user.teamId, spec.name, stat.id);

  const [row] = await db
    .update(customStats)
    .set({ ...spec, updatedAt: Date.now() })
    .where(eq(customStats.id, stat.id))
    .returning();

  revalidateCustom();
  return toDef(row);
}

/** Retire a stat so it leaves the logging screens, or bring it back. Its history stays either way. */
export async function setCustomStatRetired(statId: string, retired: boolean): Promise<CustomStatDef> {
  const user = await requireCoach();
  const stat = await ownStat(user, statId);

  const [row] = await db
    .update(customStats)
    .set({ archivedAt: retired ? Date.now() : null, updatedAt: Date.now() })
    .where(eq(customStats.id, stat.id))
    .returning();

  revalidateCustom();
  return toDef(row);
}

/** Delete a stat and every entry logged against it, in every match. The builder asks first. */
export async function deleteCustomStat(statId: string): Promise<void> {
  const user = await requireCoach();
  const [stat] = await db.select().from(customStats).where(eq(customStats.id, statId)).limit(1);
  if (!stat) return;
  assertSameTeam(user, stat);

  await db.delete(customStats).where(eq(customStats.id, stat.id));
  revalidateCustom();
  revalidatePath("/matches", "layout");
}

/* ------------------------------------------ advanced puckout analysis */

/**
 * Switch advanced puckout analysis on at a line, or off (null). Coaches as
 * well as admins: they are the ones logging. Only restarts logged from now on
 * take the line; those already logged keep the line they were judged at, so
 * turning it off hides nothing and re-marks nothing.
 */
export async function setRestartLine(line: RestartLine | null): Promise<RestartLine | null> {
  const user = await requireCoach();
  if (line !== null && !isRestartLine(line)) throw new Error("That is not a line on the pitch.");
  await db.update(teams).set({ restartLine: line }).where(eq(teams.id, user.teamId));
  revalidateCustom();
  revalidatePath("/matches", "layout");
  revalidatePath("/review", "layout");
  return line;
}

/* ------------------------------------------------------ standard stats */

/**
 * Remove a standard stat from this squad's logging screens and report, or
 * bring it back. Only hides: what was logged under it is kept, so nothing is
 * lost either way. Not enforced when logging, because an entry of a removed
 * stat can still be edited; the screens simply stop offering it.
 */
export async function setStandardStatRemoved(statType: StatType, removed: boolean): Promise<StatType[]> {
  const user = await requireCoach();
  const offered = statVocabulary(user.teamCode).statTypes;
  if (!offered.includes(statType)) throw new Error("That is not a stat your game logs.");

  const hidden = await loadHiddenStats(user.teamId);
  if (removed) {
    if (!canRemoveStandard(offered, hidden, statType)) {
      throw new Error("Keep at least one standard stat. Add your own stats if you want to log something else.");
    }
    await db.insert(hiddenStats).values({ teamId: user.teamId, statType }).onConflictDoNothing();
  } else {
    await db.delete(hiddenStats).where(and(eq(hiddenStats.teamId, user.teamId), eq(hiddenStats.statType, statType)));
  }

  revalidateCustom();
  revalidatePath("/matches", "layout");
  return loadHiddenStats(user.teamId);
}

/* ----------------------------------------------------------------- entries */

export type CustomEntryInput = CustomDraft & {
  /** Set by the live pad, off the video's own clock. Never typed. */
  videoId?: string | null;
  atMs?: number | null;
  /** How far into its half, off the logger's own clock on the line. */
  halfMs?: number | null;
};

/** What the logging forms keep in their lists. */
export type SavedCustomEntry = CustomEntryRow;

function toSaved(row: typeof customStatEntries.$inferSelect): SavedCustomEntry {
  return {
    id: row.id,
    statId: row.statId,
    side: row.side,
    playerNumber: row.playerNumber,
    oppositionNumber: row.oppositionNumber,
    outcome: row.outcome,
    ledToScore: row.ledToScore,
    score: row.score,
    originX: row.originX,
    originY: row.originY,
    destX: row.destX,
    destY: row.destY,
    half: row.half,
    halfMs: row.halfMs,
    videoId: row.videoId,
    atMs: row.atMs,
    draft: row.draft,
    createdAt: row.createdAt,
  };
}

/** A position only means anything alongside the video it was read from, and inside it. */
async function timingOf(user: Awaited<ReturnType<typeof requireCoach>>, input: CustomEntryInput) {
  const videoId = input.videoId?.trim() || null;
  let atMs = videoId && Number.isFinite(input.atMs) ? Math.max(0, Math.trunc(input.atMs!)) : null;
  if (videoId) {
    const [video] = await db
      .select({ id: videos.id, teamId: videos.teamId, durationMs: videos.durationMs })
      .from(videos)
      .where(eq(videos.id, videoId))
      .limit(1);
    if (!video) throw new Error("That video no longer exists.");
    assertSameTeam(user, video);
    if (atMs != null && video.durationMs > 0) atMs = Math.min(atMs, video.durationMs);
  }
  const half = input.half === 1 || input.half === 2 ? input.half : null;
  const halfMs = half && Number.isFinite(input.halfMs) ? Math.max(0, Math.trunc(input.halfMs!)) : null;
  return { videoId, atMs, halfMs };
}

export async function logCustomEntry(
  matchId: string,
  statId: string,
  input: CustomEntryInput,
): Promise<SavedCustomEntry> {
  const user = await requireCoach();

  const [match] = await db
    .select({ id: matches.id, teamId: matches.teamId })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!match) throw new Error("That match no longer exists.");
  assertSameTeam(user, match);

  const stat = await ownStat(user, statId);
  if (stat.archivedAt != null) throw new Error("That stat has been retired. Bring it back to log more.");

  const values = normaliseCustomEntry(toDef(stat), input, user.teamCode);
  const timing = await timingOf(user, input);
  // Logged on the line, it stays this logger's own until they submit. Off
  // footage there is no draft, exactly as the built-in sheet does it.
  const draft = !timing.videoId && (await loadStatClock(match.id, user.id)).submittedAt == null;

  const [row] = await db
    .insert(customStatEntries)
    .values({
      ...values,
      ...timing,
      draft,
      statId: stat.id,
      matchId: match.id,
      teamId: user.teamId,
      createdBy: user.id,
    })
    .returning();

  revalidateCustom(match.id);
  return toSaved(row);
}

/** Another logger's unsubmitted entry is theirs alone: nobody else may change or delete it. */
function assertNotSomeoneElsesDraft(user: { id: string }, row: { draft: boolean; createdBy: string | null }): void {
  if (row.draft && row.createdBy !== user.id) throw new Error("That entry no longer exists.");
}

/** Replace an entry outright, as the built-in sheet does, so a stale column cannot survive an edit. */
export async function updateCustomEntry(entryId: string, input: CustomEntryInput): Promise<SavedCustomEntry> {
  const user = await requireCoach();

  const [existing] = await db.select().from(customStatEntries).where(eq(customStatEntries.id, entryId)).limit(1);
  if (!existing) throw new Error("That entry no longer exists.");
  assertSameTeam(user, existing);
  assertNotSomeoneElsesDraft(user, existing);

  const stat = await ownStat(user, existing.statId);
  const values = normaliseCustomEntry(toDef(stat), input, user.teamCode);
  const timing = await timingOf(user, input);

  const [row] = await db
    .update(customStatEntries)
    .set({ ...values, ...timing, updatedAt: Date.now() })
    .where(eq(customStatEntries.id, entryId))
    .returning();

  revalidateCustom(existing.matchId);
  return toSaved(row);
}

export async function deleteCustomEntry(entryId: string): Promise<void> {
  const user = await requireCoach();

  const [existing] = await db
    .select({
      id: customStatEntries.id,
      teamId: customStatEntries.teamId,
      matchId: customStatEntries.matchId,
      createdBy: customStatEntries.createdBy,
      draft: customStatEntries.draft,
    })
    .from(customStatEntries)
    .where(eq(customStatEntries.id, entryId))
    .limit(1);
  if (!existing) return;
  assertSameTeam(user, existing);
  assertNotSomeoneElsesDraft(user, existing);

  await db.delete(customStatEntries).where(eq(customStatEntries.id, entryId));
  revalidateCustom(existing.matchId);
}
