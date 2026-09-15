"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { annotations, clips, comments, type Shape } from "@/lib/db/schema";
import { assertCanEditOwned, assertSameTeam, requireUserOrThrow } from "@/lib/auth/guard";

/* --------------------------------------------------------------- comments */

export type PostedComment = {
  id: string;
  body: string;
  atMs: number | null;
  parentId: string | null;
  createdAt: number;
  authorName: string;
  userId: string | null;
};

export async function addComment(input: {
  clipId: string;
  body: string;
  /** Offset within the clip, so feedback can point at a moment. */
  atMs?: number | null;
  parentId?: string | null;
}): Promise<PostedComment> {
  const user = await requireUserOrThrow();
  const body = input.body.trim();
  if (!body) throw new Error("Write something first.");
  if (body.length > 4000) throw new Error("That comment is too long.");

  const [clip] = await db.select().from(clips).where(eq(clips.id, input.clipId)).limit(1);
  if (!clip) throw new Error("That clip no longer exists.");
  assertSameTeam(user, clip);

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

  const [row] = await db
    .insert(comments)
    .values({ clipId: input.clipId, userId: user.id, body, atMs: input.atMs ?? null, parentId })
    .returning();

  revalidatePath(`/review/${clip.videoId}`);

  return {
    id: row.id,
    body: row.body,
    atMs: row.atMs,
    parentId: row.parentId,
    createdAt: row.createdAt,
    authorName: user.displayName,
    userId: user.id,
  };
}

export async function deleteComment(commentId: string): Promise<void> {
  const user = await requireUserOrThrow();
  const [row] = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);
  if (!row) return;
  assertCanEditOwned(user, row);
  await db.delete(comments).where(eq(comments.id, commentId));
}

/* ------------------------------------------------------------ annotations */

/**
 * Save a drawing over the video.
 *
 * Shapes arrive in normalised 0–1 coordinates, so the same annotation lines
 * up whether it is replayed on a laptop or a phone, and nothing is ever
 * burned into the video file — the drawing stays editable and costs no
 * storage beyond a row of JSON.
 */
export async function saveAnnotation(input: {
  clipId: string;
  atMs: number;
  durationMs?: number;
  shapes: Shape[];
}): Promise<{ id: string }> {
  const user = await requireUserOrThrow();
  if (!input.shapes.length) throw new Error("Draw something first.");

  const [clip] = await db.select().from(clips).where(eq(clips.id, input.clipId)).limit(1);
  if (!clip) throw new Error("That clip no longer exists.");
  assertSameTeam(user, clip);

  for (const s of input.shapes) assertNormalised(s);

  const [row] = await db
    .insert(annotations)
    .values({
      clipId: input.clipId,
      userId: user.id,
      atMs: Math.max(0, Math.round(input.atMs)),
      durationMs: Math.min(30_000, Math.max(500, Math.round(input.durationMs ?? 3000))),
      shapes: input.shapes,
    })
    .returning();

  revalidatePath(`/review/${clip.videoId}`);
  return { id: row.id };
}

export async function deleteAnnotation(annotationId: string): Promise<void> {
  const user = await requireUserOrThrow();
  const [row] = await db
    .select()
    .from(annotations)
    .where(eq(annotations.id, annotationId))
    .limit(1);
  if (!row) return;
  assertCanEditOwned(user, row);
  await db.delete(annotations).where(eq(annotations.id, annotationId));
}

/** Reject anything outside the frame before it reaches the database. */
function assertNormalised(shape: Shape): void {
  const ok = (n: number) => Number.isFinite(n) && n >= -0.5 && n <= 1.5;
  const bad = () => {
    throw new Error("Annotation coordinates must be normalised to the video frame.");
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
      if (shape.body.length > 200) throw new Error("Keep annotation labels short.");
      break;
  }
}
