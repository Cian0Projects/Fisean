"use server";

/**
 * Read-side server functions the client components call directly.
 *
 * Kept apart from the mutating actions so it is obvious at a glance which
 * functions change data and which only fetch it.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clips, playlistItems } from "@/lib/db/schema";
import { assertSameTeam, requireUserOrThrow } from "@/lib/auth/guard";
import { canSeeClipRow } from "@/lib/queries/clips";
import { loadComments } from "@/lib/queries/comments";
import { visiblePlaylists } from "@/lib/queries/playlists";
import type { CommentRow } from "@/components/review/types";

export async function listComments(clipId: string): Promise<CommentRow[]> {
  const user = await requireUserOrThrow();
  const [clip] = await db
    .select({
      id: clips.id,
      teamId: clips.teamId,
      visibility: clips.visibility,
      shareRoles: clips.shareRoles,
      createdBy: clips.createdBy,
    })
    .from(clips)
    .where(eq(clips.id, clipId))
    .limit(1);
  if (!clip) return [];
  assertSameTeam(user, clip);
  if (!(await canSeeClipRow(user, clip))) return [];

  return (await loadComments([clipId])).get(clipId) ?? [];
}

/**
 * Playlists the signed-in user may add a clip to (ones they can see and edit),
 * each marked with whether this clip is already in it, so the picker can show
 * ticks and the same tap can add or remove.
 */
export async function listPlaylistsForClip(
  clipId: string,
): Promise<{ id: string; title: string; isOfficial: boolean; hasClip: boolean }[]> {
  const user = await requireUserOrThrow();
  const rows = await visiblePlaylists(user);
  const canEdit = user.role !== "player";
  const editable = rows.filter((p) => canEdit || p.createdBy === user.id);
  if (editable.length === 0) return [];

  const holding = await db
    .select({ playlistId: playlistItems.playlistId })
    .from(playlistItems)
    .where(
      and(
        eq(playlistItems.clipId, clipId),
        inArray(
          playlistItems.playlistId,
          editable.map((p) => p.id),
        ),
      ),
    );
  const has = new Set(holding.map((h) => h.playlistId));
  return editable.map(({ id, title, isOfficial }) => ({ id, title, isOfficial, hasClip: has.has(id) }));
}

