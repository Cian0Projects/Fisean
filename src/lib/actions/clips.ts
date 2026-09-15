"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clipPlayers, clipTags, clips, videos } from "@/lib/db/schema";
import { assertCanEditOwned, assertSameTeam, requireUserOrThrow } from "@/lib/auth/guard";

/** Nothing shorter than this is watchable; nothing longer is a "clip". */
const MIN_CLIP_MS = 500;
const MAX_CLIP_MS = 10 * 60_000;

export type ClipInput = {
  videoId: string;
  startMs: number;
  endMs: number;
  title?: string;
  eventTypeIds?: string[];
  playerIds?: string[];
  visibility?: "team" | "private";
  pitchX?: number | null;
  pitchY?: number | null;
};

export type SavedClip = {
  id: string;
  startMs: number;
  endMs: number;
  title: string;
  eventTypeIds: string[];
  playerIds: string[];
  visibility: "team" | "private";
  createdBy: string | null;
  authorName: string;
};

/**
 * Create a clip.
 *
 * This is an INSERT and nothing else — no transcode, no render queue, no
 * progress bar. The clip is an in/out point against the source video, so a
 * coach pressing the quick-clip key gets a saved clip back in milliseconds
 * and can keep watching. That is the whole reason tagging a match is fast.
 */
export async function createClip(input: ClipInput): Promise<SavedClip> {
  const user = await requireUserOrThrow();

  const [video] = await db
    .select({ id: videos.id, teamId: videos.teamId, durationMs: videos.durationMs })
    .from(videos)
    .where(eq(videos.id, input.videoId))
    .limit(1);
  if (!video) throw new Error("That video no longer exists.");
  assertSameTeam(user, video);

  const startMs = Math.max(0, Math.round(input.startMs));
  const endMs = Math.round(input.endMs);
  if (endMs - startMs < MIN_CLIP_MS) throw new Error("That clip is too short to watch.");
  if (endMs - startMs > MAX_CLIP_MS) throw new Error("Clips are capped at ten minutes.");

  const [clip] = await db
    .insert(clips)
    .values({
      videoId: video.id,
      teamId: user.teamId,
      createdBy: user.id,
      title: input.title?.trim() ?? "",
      startMs,
      endMs,
      visibility: input.visibility ?? "team",
      pitchX: input.pitchX ?? null,
      pitchY: input.pitchY ?? null,
    })
    .returning();

  if (input.eventTypeIds?.length) {
    await db
      .insert(clipTags)
      .values(input.eventTypeIds.map((eventTypeId) => ({ clipId: clip.id, eventTypeId })));
  }

  if (input.playerIds?.length) {
    await db
      .insert(clipPlayers)
      .values(input.playerIds.map((userId) => ({ clipId: clip.id, userId })));
  }

  revalidatePath(`/review/${video.id}`);

  return {
    id: clip.id,
    startMs: clip.startMs,
    endMs: clip.endMs,
    title: clip.title,
    eventTypeIds: input.eventTypeIds ?? [],
    playerIds: input.playerIds ?? [],
    visibility: clip.visibility,
    createdBy: clip.createdBy,
    authorName: user.displayName,
  };
}

export async function updateClip(
  clipId: string,
  patch: Partial<Pick<ClipInput, "title" | "startMs" | "endMs" | "visibility" | "pitchX" | "pitchY">>,
): Promise<void> {
  const user = await requireUserOrThrow();
  const [clip] = await db.select().from(clips).where(eq(clips.id, clipId)).limit(1);
  if (!clip) throw new Error("That clip no longer exists.");
  assertSameTeam(user, clip);
  assertCanEditOwned(user, clip);

  const startMs = patch.startMs ?? clip.startMs;
  const endMs = patch.endMs ?? clip.endMs;
  if (endMs - startMs < MIN_CLIP_MS) throw new Error("That clip is too short to watch.");

  await db
    .update(clips)
    .set({
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      startMs: Math.max(0, Math.round(startMs)),
      endMs: Math.round(endMs),
      ...(patch.visibility ? { visibility: patch.visibility } : {}),
      ...(patch.pitchX !== undefined ? { pitchX: patch.pitchX } : {}),
      ...(patch.pitchY !== undefined ? { pitchY: patch.pitchY } : {}),
      updatedAt: Date.now(),
    })
    .where(eq(clips.id, clipId));

  revalidatePath(`/review/${clip.videoId}`);
}

export async function deleteClip(clipId: string): Promise<void> {
  const user = await requireUserOrThrow();
  const [clip] = await db.select().from(clips).where(eq(clips.id, clipId)).limit(1);
  if (!clip) return;
  assertSameTeam(user, clip);
  assertCanEditOwned(user, clip);

  await db.delete(clips).where(eq(clips.id, clipId));
  revalidatePath(`/review/${clip.videoId}`);
}

/** Replace the whole tag set for a clip; simpler than diffing on the client. */
export async function setClipTags(clipId: string, eventTypeIds: string[]): Promise<void> {
  const user = await requireUserOrThrow();
  const [clip] = await db.select().from(clips).where(eq(clips.id, clipId)).limit(1);
  if (!clip) throw new Error("That clip no longer exists.");
  assertSameTeam(user, clip);
  assertCanEditOwned(user, clip);

  await db.delete(clipTags).where(eq(clipTags.clipId, clipId));
  if (eventTypeIds.length) {
    await db.insert(clipTags).values(eventTypeIds.map((eventTypeId) => ({ clipId, eventTypeId })));
  }
  revalidatePath(`/review/${clip.videoId}`);
}

/**
 * Who is in this clip. This is what makes a player's own page work — they
 * open Físeán and see their clips from Sunday, not a file browser.
 */
export async function setClipPlayers(clipId: string, playerIds: string[]): Promise<void> {
  const user = await requireUserOrThrow();
  const [clip] = await db.select().from(clips).where(eq(clips.id, clipId)).limit(1);
  if (!clip) throw new Error("That clip no longer exists.");
  assertSameTeam(user, clip);
  assertCanEditOwned(user, clip);

  await db.delete(clipPlayers).where(eq(clipPlayers.clipId, clipId));
  if (playerIds.length) {
    await db.insert(clipPlayers).values(playerIds.map((userId) => ({ clipId, userId })));
  }
  revalidatePath(`/review/${clip.videoId}`);
}

/** Bulk delete, for clearing a mis-tagged run. Coaches ask for this quickly. */
export async function deleteClips(clipIds: string[]): Promise<void> {
  const user = await requireUserOrThrow();
  if (!clipIds.length) return;

  const rows = await db.select().from(clips).where(inArray(clips.id, clipIds));
  const deletable = rows.filter((c) => {
    if (c.teamId !== user.teamId) return false;
    return user.role === "admin" || user.role === "coach" || c.createdBy === user.id;
  });
  if (!deletable.length) return;

  await db.delete(clips).where(
    and(
      inArray(
        clips.id,
        deletable.map((c) => c.id),
      ),
      eq(clips.teamId, user.teamId),
    ),
  );
  revalidatePath(`/review/${rows[0].videoId}`);
}
