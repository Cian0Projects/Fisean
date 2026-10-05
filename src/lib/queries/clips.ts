/**
 * The clips a viewer may see on one video, with their tags, players and
 * counts attached.
 *
 * Shared by the desktop review workspace and the phone watch screen, because
 * the visibility rule has to be the same in both places: a player's private
 * clips are theirs alone, everything else is the squad's. Two copies of that
 * rule would drift, and the one that drifted would leak somebody's notes.
 */
import "server-only";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { annotations, clipPlayers, clipTags, clips, comments, users } from "@/lib/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import type { ClipRow } from "@/components/review/types";

export async function loadVisibleClips(videoId: string, user: SessionUser): Promise<ClipRow[]> {
  const clipRows = await db
    .select({
      id: clips.id,
      startMs: clips.startMs,
      endMs: clips.endMs,
      title: clips.title,
      visibility: clips.visibility,
      createdBy: clips.createdBy,
      authorName: users.displayName,
    })
    .from(clips)
    .leftJoin(users, eq(users.id, clips.createdBy))
    .where(eq(clips.videoId, videoId))
    .orderBy(asc(clips.startMs));

  const visible = clipRows.filter(
    (c) => c.visibility === "team" || c.createdBy === user.id || user.role !== "player",
  );
  const ids = visible.map((c) => c.id);

  // Fetch the child rows in four queries rather than per clip.
  const [tagRows, playerRows, commentCounts, annotationCounts] = ids.length
    ? await Promise.all([
        db.select().from(clipTags).where(inArray(clipTags.clipId, ids)),
        db.select().from(clipPlayers).where(inArray(clipPlayers.clipId, ids)),
        db
          .select({ clipId: comments.clipId, n: sql<number>`count(*)` })
          .from(comments)
          .where(inArray(comments.clipId, ids))
          .groupBy(comments.clipId),
        db
          .select({ clipId: annotations.clipId, n: sql<number>`count(*)` })
          .from(annotations)
          .where(inArray(annotations.clipId, ids))
          .groupBy(annotations.clipId),
      ])
    : [[], [], [], []];

  const tagsByClip = new Map<string, string[]>();
  for (const t of tagRows) {
    tagsByClip.set(t.clipId, [...(tagsByClip.get(t.clipId) ?? []), t.eventTypeId]);
  }
  const playersByClip = new Map<string, string[]>();
  for (const p of playerRows) {
    playersByClip.set(p.clipId, [...(playersByClip.get(p.clipId) ?? []), p.userId]);
  }
  const commentsByClip = new Map(commentCounts.map((r) => [r.clipId, Number(r.n)]));
  const annotationsByClip = new Map(annotationCounts.map((r) => [r.clipId, Number(r.n)]));

  return visible.map((c) => ({
    id: c.id,
    startMs: c.startMs,
    endMs: c.endMs,
    title: c.title,
    visibility: c.visibility,
    createdBy: c.createdBy,
    authorName: c.authorName ?? "Removed",
    eventTypeIds: tagsByClip.get(c.id) ?? [],
    playerIds: playersByClip.get(c.id) ?? [],
    commentCount: commentsByClip.get(c.id) ?? 0,
    annotationCount: annotationsByClip.get(c.id) ?? 0,
  }));
}
