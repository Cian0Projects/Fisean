/**
 * The comments on a set of clips, oldest first, with their authors' names.
 *
 * Shared by the clip panel, the playlist page and the phone, which all show
 * the same comments and stop playback on them. The caller has already
 * decided the viewer may see these clips.
 */
import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { comments, users } from "@/lib/db/schema";
import type { CommentRow } from "@/components/review/types";

export async function loadComments(clipIds: string[]): Promise<Map<string, CommentRow[]>> {
  const byClip = new Map<string, CommentRow[]>();
  if (!clipIds.length) return byClip;

  const rows = await db
    .select({
      clipId: comments.clipId,
      id: comments.id,
      body: comments.body,
      atMs: comments.atMs,
      shapes: comments.shapes,
      parentId: comments.parentId,
      createdAt: comments.createdAt,
      editedAt: comments.editedAt,
      userId: comments.userId,
      authorName: users.displayName,
    })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.userId))
    .where(inArray(comments.clipId, clipIds))
    .orderBy(asc(comments.createdAt));

  for (const { clipId, ...r } of rows) {
    const row: CommentRow = { ...r, authorName: r.authorName ?? "Removed" };
    byClip.set(clipId, [...(byClip.get(clipId) ?? []), row]);
  }
  return byClip;
}
