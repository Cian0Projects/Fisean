"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clipPlayers, clipShares, clipTags, clips, users, videos } from "@/lib/db/schema";
import { assertCanEditOwned, assertSameTeam, Forbidden, requireUserOrThrow } from "@/lib/auth/guard";
import { canShare, normaliseAudience, type Audience } from "@/lib/auth/visibility";
import { MIN_CLIP_MS, MAX_CLIP_MS } from "@/lib/hurling/clip-rules";
import { notifyNewlyReached, notifyUsers } from "@/lib/notify/queue";

export type ClipInput = {
  videoId: string;
  startMs: number;
  endMs: number;
  title?: string;
  eventTypeIds?: string[];
  playerIds?: string[];
  /** Its maker alone, when not given: a clip is shared on purpose, not by default. */
  audience?: Audience;
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
  audience: Audience;
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

  const audience = normaliseAudience(input.audience ?? { visibility: "private", roles: [], userIds: [] }, user.id);

  const [clip] = await db
    .insert(clips)
    .values({
      videoId: video.id,
      teamId: user.teamId,
      createdBy: user.id,
      title: input.title?.trim() ?? "",
      startMs,
      endMs,
      visibility: audience.visibility,
      shareRoles: audience.roles.length ? audience.roles : null,
      pitchX: input.pitchX ?? null,
      pitchY: input.pitchY ?? null,
    })
    .returning();
  const named = await writeShares(clip.id, user.teamId, audience.userIds);

  if (input.eventTypeIds?.length) {
    await db
      .insert(clipTags)
      .values(input.eventTypeIds.map((eventTypeId) => ({ clipId: clip.id, eventTypeId })));
  }

  if (input.playerIds?.length) {
    await db
      .insert(clipPlayers)
      .values(input.playerIds.map((userId) => ({ clipId: clip.id, userId })));
    // A private clip is someone's own review; nobody is told about it. For
    // one shared with some, the email checks again that each can see it.
    if (clip.visibility !== "private") {
      await notifyUsers(
        { teamId: user.teamId, kind: "clip-tagged", subjectId: clip.id, actorId: user.id },
        input.playerIds,
      );
    }
  }

  // Shared with some rather than everyone is a deliberate send, so they are
  // told; anyone in the clip has already heard about it above.
  if (clip.visibility === "assigned") {
    await notifyNewlyReached(
      { teamId: user.teamId, kind: "clip-shared", subjectId: clip.id, actorId: user.id },
      { visibility: "private", createdBy: user.id, shareRoles: null },
      [],
      clip,
      named,
      input.playerIds ?? [],
    );
  }

  revalidatePath(`/review/${video.id}`);

  return {
    id: clip.id,
    startMs: clip.startMs,
    endMs: clip.endMs,
    title: clip.title,
    eventTypeIds: input.eventTypeIds ?? [],
    playerIds: input.playerIds ?? [],
    audience: { ...audience, userIds: named },
    createdBy: clip.createdBy,
    authorName: user.displayName,
  };
}

/**
 * Who can see a clip: everyone, its maker alone, or any mix of all players,
 * all coaches, all admins and named people. Only its maker says (canShare).
 * Only the people it newly reaches are emailed, and only when it was shared
 * with some: opening a clip to everyone would email the whole panel about
 * every clip anyone chose to show, which is noise.
 */
export async function setClipAudience(clipId: string, input: Audience): Promise<Audience> {
  const user = await requireUserOrThrow();
  const [clip] = await db.select().from(clips).where(eq(clips.id, clipId)).limit(1);
  if (!clip) throw new Error("That clip no longer exists.");
  assertSameTeam(user, clip);
  if (!canShare(user, clip)) throw new Forbidden("Only whoever made the clip can change who sees it.");

  const audience = normaliseAudience(input, clip.createdBy);
  const before = (await db.select().from(clipShares).where(eq(clipShares.clipId, clipId))).map((s) => s.userId);

  const [after] = await db
    .update(clips)
    .set({
      visibility: audience.visibility,
      shareRoles: audience.roles.length ? audience.roles : null,
      updatedAt: Date.now(),
    })
    .where(eq(clips.id, clipId))
    .returning();
  await db.delete(clipShares).where(eq(clipShares.clipId, clipId));
  const named = await writeShares(clipId, clip.teamId, audience.userIds);

  if (after.visibility === "assigned") {
    await notifyNewlyReached(
      { teamId: clip.teamId, kind: "clip-shared", subjectId: clipId, actorId: user.id },
      clip,
      before,
      after,
      named,
    );
  }

  revalidatePath(`/review/${clip.videoId}`);
  return { ...audience, userIds: named };
}

/** Record who a clip is shared with by name: people on its team only, since the ids came from a client. */
async function writeShares(clipId: string, teamId: string, userIds: string[]): Promise<string[]> {
  if (!userIds.length) return [];
  const onTeam = (
    await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.teamId, teamId), inArray(users.id, userIds)))
  ).map((u) => u.id);
  if (onTeam.length) await db.insert(clipShares).values(onTeam.map((userId) => ({ clipId, userId })));
  return onTeam;
}

export async function updateClip(
  clipId: string,
  patch: Partial<Pick<ClipInput, "title" | "startMs" | "endMs" | "pitchX" | "pitchY">>,
): Promise<void> {
  const user = await requireUserOrThrow();
  const [clip] = await db.select().from(clips).where(eq(clips.id, clipId)).limit(1);
  if (!clip) throw new Error("That clip no longer exists.");
  assertSameTeam(user, clip);
  assertCanEditOwned(user, clip);

  const startMs = patch.startMs ?? clip.startMs;
  const endMs = patch.endMs ?? clip.endMs;
  if (endMs - startMs < MIN_CLIP_MS) throw new Error("That clip is too short to watch.");
  if (endMs - startMs > MAX_CLIP_MS) throw new Error("Clips are capped at ten minutes.");

  await db
    .update(clips)
    .set({
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      startMs: Math.max(0, Math.round(startMs)),
      endMs: Math.round(endMs),
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
    // Anyone already told about this clip is skipped by the queue itself,
    // and anyone it is not shared with is skipped when the email is made.
    if (clip.visibility !== "private") {
      await notifyUsers({ teamId: clip.teamId, kind: "clip-tagged", subjectId: clipId, actorId: user.id }, playerIds);
    }
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
