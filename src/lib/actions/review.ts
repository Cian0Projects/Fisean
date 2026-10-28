"use server";

import { revalidatePath } from "next/cache";
import { eq, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clips, comments, type Shape } from "@/lib/db/schema";
import { assertCanEditOwned, assertSameTeam, Forbidden, requireUserOrThrow } from "@/lib/auth/guard";
import { canSeeClipRow } from "@/lib/queries/clips";
import type { CommentRow } from "@/components/review/types";

/* --------------------------------------------------------------- comments */

/** Enough for any drawing a coach makes on one frame; more is a stuck pointer. */
const MAX_SHAPES = 60;

/**
 * Post a comment on a clip, at a moment in it, perhaps with a drawing.
 *
 * A top-level comment always has a moment: it is where playback stops to show
 * it (src/lib/hurling/stops.ts). The drawing belongs to that same frame, so a
 * comment may be only a drawing, but never a drawing somewhere else. Replies
 * are conversation under a comment, so they take neither.
 *
 * Shapes arrive in normalised 0–1 coordinates, so the drawing lines up
 * whether it is replayed on a laptop or a phone, and nothing is ever burned
 * into the video file: it stays deletable and costs a row of JSON.
 */
export async function addComment(input: {
  clipId: string;
  body: string;
  /** Offset within the clip. */
  atMs?: number | null;
  shapes?: Shape[] | null;
  parentId?: string | null;
}): Promise<CommentRow> {
  const user = await requireUserOrThrow();
  const body = input.body.trim();
  if (body.length > 4000) throw new Error("That comment is too long.");

  const [clip] = await db.select().from(clips).where(eq(clips.id, input.clipId)).limit(1);
  if (!clip) throw new Error("That clip no longer exists.");
  assertSameTeam(user, clip);
  if (!(await canSeeClipRow(user, clip))) throw new Forbidden("That clip is private.");

  // Threading stops at one level. Deeper threads are unreadable on a phone,
  // which is where most players will be reading them.
  let parentId: string | null = null;
  if (input.parentId) {
    const [parent] = await db
      .select({ id: comments.id, parentId: comments.parentId })
      .from(comments)
      .where(eq(comments.id, input.parentId))
      .limit(1);
    parentId = parent ? (parent.parentId ?? parent.id) : null;
  }

  const shapes = parentId ? [] : (input.shapes ?? []);
  if (!body && !shapes.length) throw new Error("Write something or draw on the frame first.");
  if (shapes.length > MAX_SHAPES) throw new Error("That drawing has too much in it to store.");
  for (const s of shapes) assertNormalised(s);

  const atMs = parentId
    ? null
    : Math.min(clip.endMs - clip.startMs, Math.max(0, Math.round(input.atMs ?? 0)));

  const [row] = await db
    .insert(comments)
    .values({
      clipId: input.clipId,
      userId: user.id,
      body,
      atMs,
      shapes: shapes.length ? shapes : null,
      parentId,
    })
    .returning();

  revalidatePath(`/review/${clip.videoId}`);

  return {
    id: row.id,
    body: row.body,
    atMs: row.atMs,
    shapes: row.shapes,
    parentId: row.parentId,
    createdAt: row.createdAt,
    authorName: user.displayName,
    userId: user.id,
    editedAt: null,
  };
}

/**
 * Only the author may reword a comment, coaches included: editing someone
 * else's words would put them in that person's mouth. Deleting stays open to
 * coaches via assertCanEditOwned.
 */
export async function editComment(input: {
  commentId: string;
  body: string;
}): Promise<{ body: string; editedAt: number }> {
  const user = await requireUserOrThrow();
  const body = input.body.trim();
  if (body.length > 4000) throw new Error("That comment is too long.");

  const [row] = await db.select().from(comments).where(eq(comments.id, input.commentId)).limit(1);
  if (!row) throw new Error("That comment no longer exists.");
  // Emptying a comment that carries a drawing leaves the drawing to speak.
  if (!body && !row.shapes?.length) throw new Error("Write something first.");
  const [clip] = await db.select().from(clips).where(eq(clips.id, row.clipId)).limit(1);
  if (!clip) throw new Error("That clip no longer exists.");
  assertSameTeam(user, clip);
  if (row.userId !== user.id) throw new Error("You can only edit your own comments.");

  if (body === row.body) return { body: row.body, editedAt: row.editedAt ?? row.createdAt };

  const editedAt = Date.now();
  await db.update(comments).set({ body, editedAt }).where(eq(comments.id, row.id));
  revalidatePath(`/review/${clip.videoId}`);
  return { body, editedAt };
}

/** Deletes the comment, its drawing and any replies under it. */
export async function deleteComment(commentId: string): Promise<void> {
  const user = await requireUserOrThrow();
  const [row] = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);
  if (!row) return;
  const [clip] = await db.select().from(clips).where(eq(clips.id, row.clipId)).limit(1);
  if (!clip) return;
  assertSameTeam(user, clip);
  assertCanEditOwned(user, row);
  await db.delete(comments).where(or(eq(comments.id, commentId), eq(comments.parentId, commentId)));
  revalidatePath(`/review/${clip.videoId}`);
}

/** Reject anything outside the frame before it reaches the database. */
function assertNormalised(shape: Shape): void {
  const ok = (n: number) => Number.isFinite(n) && n >= -0.5 && n <= 1.5;
  const bad = () => {
    throw new Error("Drawing coordinates must be normalised to the video frame.");
  };

  switch (shape.type) {
    case "arrow":
    case "line":
      if (![shape.x1, shape.y1, shape.x2, shape.y2].every(ok)) bad();
      break;
    case "ellipse":
      if (![shape.cx, shape.cy, shape.rx, shape.ry].every(ok)) bad();
      break;
    case "rect":
      if (![shape.x, shape.y, shape.w, shape.h].every(ok)) bad();
      break;
    case "freehand":
      if (shape.points.length > 2000) throw new Error("That drawing is too detailed to store.");
      if (!shape.points.every(([x, y]) => ok(x) && ok(y))) bad();
      break;
    case "spotlight":
      if (![shape.cx, shape.cy, shape.r].every(ok)) bad();
      break;
    case "text":
      if (![shape.x, shape.y].every(ok)) bad();
      if (shape.body.length > 200) throw new Error("Keep labels on the video short.");
      break;
    default:
      bad();
  }
}
