"use server";

/**
 * Read-side server functions the client components call directly.
 *
 * Kept apart from the mutating actions so it is obvious at a glance which
 * functions change data and which only fetch it.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clips, matches } from "@/lib/db/schema";
import { assertSameTeam, requireUserOrThrow } from "@/lib/auth/guard";
import { canSeeClipRow } from "@/lib/queries/clips";
import { loadComments } from "@/lib/queries/comments";
import { visiblePlaylists } from "@/lib/queries/playlists";
import type { CommentRow } from "@/components/review/types";
import { whistlesOf } from "@/lib/hurling/stats";
import type { Markers } from "@/lib/hurling/notation";

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

/**
 * The match's whistles and the server's clock, for the running game clock on
 * every logging phone. Asked for every few seconds, so it is one row and two
 * numbers; `serverNow` lets each phone correct for its own clock being off.
 */
export async function readMatchClock(
  matchId: string,
): Promise<{ whistles: Markers; serverNow: number } | null> {
  const user = await requireUserOrThrow();
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) return null;
  assertSameTeam(user, match);
  return { whistles: whistlesOf(match), serverNow: Date.now() };
}
