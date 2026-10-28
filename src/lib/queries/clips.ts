/**
 * The clips a viewer may see, and the lookups every screen needs to decide it.
 *
 * Shared by the desktop review workspace, the phone, the playlists and the
 * emails, because the visibility rule has to be the same in all of them. The
 * rule itself is in src/lib/auth/visibility.ts; what lives here is reading
 * who a clip was shared with by name, which the rule needs and cannot fetch.
 */
import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clipPlayers, clipShares, clipTags, clips, comments, users } from "@/lib/db/schema";
import { canSeeClip, type Shared, type Viewer } from "@/lib/auth/visibility";
import type { ClipRow } from "@/components/review/types";

/** Which of these clips `viewer` may see. One query, however many clips. */
export async function visibleClipIds(
  viewer: Viewer,
  rows: (Shared & { id: string })[],
): Promise<Set<string>> {
  const named = rows.filter((r) => r.visibility === "assigned").map((r) => r.id);
  const chosen = named.length
    ? new Set(
        (
          await db
            .select({ clipId: clipShares.clipId })
            .from(clipShares)
            .where(and(eq(clipShares.userId, viewer.id), inArray(clipShares.clipId, named)))
        ).map((r) => r.clipId),
      )
    : new Set<string>();
  return new Set(rows.filter((r) => canSeeClip(viewer, r, chosen.has(r.id))).map((r) => r.id));
}

/** Whether `viewer` may see this one clip. */
export async function canSeeClipRow(viewer: Viewer, row: Shared & { id: string }): Promise<boolean> {
  return (await visibleClipIds(viewer, [row])).has(row.id);
}

/** The people each clip was shared with by name. */
export async function sharesOf(clipIds: string[]): Promise<Map<string, string[]>> {
  const byClip = new Map<string, string[]>();
  if (!clipIds.length) return byClip;
  const rows = await db.select().from(clipShares).where(inArray(clipShares.clipId, clipIds));
  for (const r of rows) byClip.set(r.clipId, [...(byClip.get(r.clipId) ?? []), r.userId]);
  return byClip;
}

/** The clips on one video the viewer may see, with tags, players and counts. */
export async function loadVisibleClips(videoId: string, user: Viewer): Promise<ClipRow[]> {
  const clipRows = await db
    .select({
      id: clips.id,
      startMs: clips.startMs,
      endMs: clips.endMs,
      title: clips.title,
      visibility: clips.visibility,
      shareRoles: clips.shareRoles,
      createdBy: clips.createdBy,
      authorName: users.displayName,
    })
    .from(clips)
    .leftJoin(users, eq(users.id, clips.createdBy))
    .where(eq(clips.videoId, videoId))
    .orderBy(asc(clips.startMs));

  const seen = await visibleClipIds(user, clipRows);
  const visible = clipRows.filter((c) => seen.has(c.id));
  const ids = visible.map((c) => c.id);

  // Fetch the child rows in four queries rather than per clip.
  const [tagRows, playerRows, commentCounts, shared] = ids.length
    ? await Promise.all([
        db.select().from(clipTags).where(inArray(clipTags.clipId, ids)),
        db.select().from(clipPlayers).where(inArray(clipPlayers.clipId, ids)),
        db
          .select({
            clipId: comments.clipId,
            n: sql<number>`count(*)`,
            drawn: sql<number>`count(${comments.shapes})`,
          })
          .from(comments)
          .where(inArray(comments.clipId, ids))
          .groupBy(comments.clipId),
        sharesOf(ids),
      ])
    : [[], [], [], new Map<string, string[]>()];

  const tagsByClip = new Map<string, string[]>();
  for (const t of tagRows) {
    tagsByClip.set(t.clipId, [...(tagsByClip.get(t.clipId) ?? []), t.eventTypeId]);
  }
  const playersByClip = new Map<string, string[]>();
  for (const p of playerRows) {
    playersByClip.set(p.clipId, [...(playersByClip.get(p.clipId) ?? []), p.userId]);
  }
  const commentsByClip = new Map(commentCounts.map((r) => [r.clipId, Number(r.n)]));
  const annotationsByClip = new Map(commentCounts.map((r) => [r.clipId, Number(r.drawn)]));

  return visible.map((c) => ({
    id: c.id,
    startMs: c.startMs,
    endMs: c.endMs,
    title: c.title,
    audience: { visibility: c.visibility, roles: c.shareRoles ?? [], userIds: shared.get(c.id) ?? [] },
    createdBy: c.createdBy,
    authorName: c.authorName ?? "Removed",
    eventTypeIds: tagsByClip.get(c.id) ?? [],
    playerIds: playersByClip.get(c.id) ?? [],
    commentCount: commentsByClip.get(c.id) ?? 0,
    annotationCount: annotationsByClip.get(c.id) ?? 0,
  }));
}
