"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clips, matchStats, matches, videos } from "@/lib/db/schema";
import { assertSameTeam, requireCoach } from "@/lib/auth/guard";
import { normaliseEntry, type StatDraft } from "@/lib/hurling/stats";
import type { StatRow } from "@/components/stats/types";

export type StatInput = StatDraft & {
  matchId: string;
  clipId?: string | null;
  /** Set by the live logging pad, off the video's own clock. Never typed. */
  videoId?: string | null;
  atMs?: number | null;
};

/** What the logging form keeps in its list. Names come from the match's number sheet. */
export type SavedStat = StatRow;

type StatValues = Omit<SavedStat, "id" | "createdAt" | "gameMs">;

/**
 * The rules live in src/lib/hurling/stats.ts, where they are unit tested; a
 * server action is reachable by POST whatever the form does, so they are
 * applied here rather than trusted from the client.
 */
function normalise(input: StatInput | Omit<StatInput, "matchId">): StatValues {
  const videoId = input.videoId?.trim() || null;
  return {
    ...normaliseEntry(input),
    clipId: input.clipId?.trim() || null,
    videoId,
    // A timestamp only means anything alongside the video it was read from.
    atMs: videoId && Number.isFinite(input.atMs) ? Math.max(0, Math.trunc(input.atMs!)) : null,
  };
}

/**
 * Everything a stat points at has to belong to the same squad. Players are
 * not among them: a stat names a jersey number, and a number is only a
 * number until this match's own sheet puts a name to it.
 */
async function assertReferencesAreOurs(
  user: Awaited<ReturnType<typeof requireCoach>>,
  values: StatValues,
): Promise<void> {
  if (values.clipId) {
    const [clip] = await db
      .select({ id: clips.id, teamId: clips.teamId })
      .from(clips)
      .where(eq(clips.id, values.clipId))
      .limit(1);
    if (!clip) throw new Error("That clip no longer exists.");
    assertSameTeam(user, clip);
  }

  if (values.videoId) {
    const [video] = await db
      .select({ id: videos.id, teamId: videos.teamId, durationMs: videos.durationMs })
      .from(videos)
      .where(eq(videos.id, values.videoId))
      .limit(1);
    if (!video) throw new Error("That video no longer exists.");
    assertSameTeam(user, video);
    if (values.atMs != null && video.durationMs > 0) {
      values.atMs = Math.min(values.atMs, video.durationMs);
    }
  }
}

function revalidateStats(matchId: string): void {
  revalidatePath(`/matches/${matchId}/stats`);
  revalidatePath(`/matches/${matchId}/stats/log`);
}

/** The row as the forms hold it — the stored columns, less the bookkeeping. */
function toSaved(row: typeof matchStats.$inferSelect): SavedStat {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { matchId, teamId, createdBy, updatedAt, ...saved } = row;
  return saved;
}

/**
 * Log one stat.
 *
 * Coach and admin only — the same tier that creates matches and uploads
 * footage. Reading the finished report is open to the whole squad.
 */
export async function logMatchStat(input: StatInput): Promise<SavedStat> {
  const user = await requireCoach();

  const [match] = await db
    .select({ id: matches.id, teamId: matches.teamId })
    .from(matches)
    .where(eq(matches.id, input.matchId))
    .limit(1);
  if (!match) throw new Error("That match no longer exists.");
  assertSameTeam(user, match);

  const values = normalise(input);
  await assertReferencesAreOurs(user, values);

  const [row] = await db
    .insert(matchStats)
    .values({ ...values, matchId: match.id, teamId: user.teamId, createdBy: user.id })
    .returning();

  revalidateStats(match.id);
  return toSaved(row);
}

/**
 * Replace a stat entry outright rather than diffing it.
 *
 * Editing one means opening it back up in the same form, so the client
 * already holds every field — and a whole-row write cannot leave a shot
 * carrying a stale poc amach column from a previous edit.
 */
export async function updateMatchStat(
  statId: string,
  input: Omit<StatInput, "matchId">,
): Promise<SavedStat> {
  const user = await requireCoach();

  const [existing] = await db
    .select()
    .from(matchStats)
    .where(eq(matchStats.id, statId))
    .limit(1);
  if (!existing) throw new Error("That entry no longer exists.");
  assertSameTeam(user, existing);

  const values = normalise(input);
  await assertReferencesAreOurs(user, values);

  const [row] = await db
    .update(matchStats)
    .set({ ...values, updatedAt: Date.now() })
    .where(eq(matchStats.id, statId))
    .returning();

  revalidateStats(existing.matchId);
  return toSaved(row);
}

export async function deleteMatchStat(statId: string): Promise<void> {
  const user = await requireCoach();

  const [existing] = await db
    .select({ id: matchStats.id, teamId: matchStats.teamId, matchId: matchStats.matchId })
    .from(matchStats)
    .where(eq(matchStats.id, statId))
    .limit(1);
  if (!existing) return;
  assertSameTeam(user, existing);

  await db.delete(matchStats).where(eq(matchStats.id, statId));
  revalidateStats(existing.matchId);
}
