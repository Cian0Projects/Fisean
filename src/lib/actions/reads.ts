"use server";

/**
 * Read-side server functions the client components call directly.
 *
 * Kept apart from the mutating actions so it is obvious at a glance which
 * functions change data and which only fetch it.
 */
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { annotations, clips, comments, playlists, users } from "@/lib/db/schema";
import { assertSameTeam, requireUserOrThrow } from "@/lib/auth/guard";
import type { AnnotationRow, CommentRow } from "@/components/review/types";

export async function listComments(clipId: string): Promise<CommentRow[]> {
  const user = await requireUserOrThrow();
  const [clip] = await db
    .select({ id: clips.id, teamId: clips.teamId })
    .from(clips)
    .where(eq(clips.id, clipId))
    .limit(1);
  if (!clip) return [];
  assertSameTeam(user, clip);

  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      atMs: comments.atMs,
      parentId: comments.parentId,
      createdAt: comments.createdAt,
      userId: comments.userId,
      authorName: users.displayName,
    })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.userId))
    .where(eq(comments.clipId, clipId))
    .orderBy(asc(comments.createdAt));

  return rows.map((r) => ({ ...r, authorName: r.authorName ?? "Removed" }));
}

export async function listAnnotations(clipId: string): Promise<AnnotationRow[]> {
  const user = await requireUserOrThrow();
  const [clip] = await db
    .select({ id: clips.id, teamId: clips.teamId })
    .from(clips)
    .where(eq(clips.id, clipId))
    .limit(1);
  if (!clip) return [];
  assertSameTeam(user, clip);

  const rows = await db
    .select({
      id: annotations.id,
      atMs: annotations.atMs,
      durationMs: annotations.durationMs,
      shapes: annotations.shapes,
      userId: annotations.userId,
      authorName: users.displayName,
    })
    .from(annotations)
    .leftJoin(users, eq(users.id, annotations.userId))
    .where(eq(annotations.clipId, clipId))
    .orderBy(asc(annotations.atMs));

  return rows.map((r) => ({ ...r, authorName: r.authorName ?? "Removed" }));
}

/** Playlists the signed-in user may add a clip to. */
export async function listEditablePlaylists(): Promise<
  { id: string; title: string; isOfficial: boolean }[]
> {
  const user = await requireUserOrThrow();
  const rows = await db
    .select({
      id: playlists.id,
      title: playlists.title,
      isOfficial: playlists.isOfficial,
      createdBy: playlists.createdBy,
    })
    .from(playlists)
    .where(eq(playlists.teamId, user.teamId))
    .orderBy(desc(playlists.createdAt));

  const canEdit = user.role !== "player";
  return rows
    .filter((p) => canEdit || p.createdBy === user.id)
    .map(({ id, title, isOfficial }) => ({ id, title, isOfficial }));
}
