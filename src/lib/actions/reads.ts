"use server";

/**
 * Read-side server functions the client components call directly.
 *
 * Kept apart from the mutating actions so it is obvious at a glance which
 * functions change data and which only fetch it.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clips } from "@/lib/db/schema";
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

/** Playlists the signed-in user may add a clip to: ones they can see and edit. */
export async function listEditablePlaylists(): Promise<
  { id: string; title: string; isOfficial: boolean }[]
> {
  const user = await requireUserOrThrow();
  const rows = await visiblePlaylists(user);
  const canEdit = user.role !== "player";
  return rows
    .filter((p) => canEdit || p.createdBy === user.id)
    .map(({ id, title, isOfficial }) => ({ id, title, isOfficial }));
}

