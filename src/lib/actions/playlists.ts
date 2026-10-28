"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, max, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clips, playlistItems, playlistViewers, playlists, users } from "@/lib/db/schema";
import {
  assertCanEditOwned,
  assertSameTeam,
  isCoach,
  requireUserOrThrow,
} from "@/lib/auth/guard";
import { canShare, normaliseAudience, type Audience } from "@/lib/auth/visibility";
import { notifyNewlyReached, notifyUsers } from "@/lib/notify/queue";

export async function createPlaylist(input: {
  title: string;
  description?: string;
  matchId?: string | null;
  isOfficial?: boolean;
  clipIds?: string[];
}): Promise<{ id: string }> {
  const user = await requireUserOrThrow();
  const title = input.title.trim();
  if (!title) throw new Error("Give the playlist a title.");

  // Only a coach can publish a playlist as the team's official cut; a player's
  // playlist is their own work.
  const isOfficial = Boolean(input.isOfficial) && isCoach(user);

  const [playlist] = await db
    .insert(playlists)
    .values({
      teamId: user.teamId,
      matchId: input.matchId ?? null,
      createdBy: user.id,
      title,
      description: input.description?.trim() || null,
      isOfficial,
      // Yours alone until you share it: a cut still being put together
      // should not reach the panel, or email them, one clip at a time.
      visibility: "private",
    })
    .returning();

  if (input.clipIds?.length) {
    await db.insert(playlistItems).values(
      input.clipIds.map((clipId, i) => ({
        playlistId: playlist.id,
        clipId,
        sortOrder: i,
      })),
    );
  }

  revalidatePath("/playlists");
  return { id: playlist.id };
}

export async function addClipToPlaylist(playlistId: string, clipId: string): Promise<void> {
  const user = await requireUserOrThrow();

  const [playlist] = await db
    .select()
    .from(playlists)
    .where(eq(playlists.id, playlistId))
    .limit(1);
  if (!playlist) throw new Error("That playlist no longer exists.");
  assertSameTeam(user, playlist);
  assertCanEditOwned(user, playlist);

  const [clip] = await db
    .select({ id: clips.id, teamId: clips.teamId })
    .from(clips)
    .where(eq(clips.id, clipId))
    .limit(1);
  if (!clip) throw new Error("That clip no longer exists.");
  assertSameTeam(user, clip);

  // Adding the same clip twice is almost always a double keypress, not intent.
  const [existing] = await db
    .select({ id: playlistItems.id })
    .from(playlistItems)
    .where(and(eq(playlistItems.playlistId, playlistId), eq(playlistItems.clipId, clipId)))
    .limit(1);
  if (existing) return;

  const [{ value }] = await db
    .select({ value: max(playlistItems.sortOrder) })
    .from(playlistItems)
    .where(eq(playlistItems.playlistId, playlistId));

  await db.insert(playlistItems).values({
    playlistId,
    clipId,
    sortOrder: (value ?? -1) + 1,
  });

  revalidatePath(`/playlists/${playlistId}`);
}

export async function removePlaylistItem(itemId: string): Promise<void> {
  const user = await requireUserOrThrow();
  const [item] = await db
    .select({ id: playlistItems.id, playlistId: playlistItems.playlistId })
    .from(playlistItems)
    .where(eq(playlistItems.id, itemId))
    .limit(1);
  if (!item) return;

  const [playlist] = await db
    .select()
    .from(playlists)
    .where(eq(playlists.id, item.playlistId))
    .limit(1);
  if (!playlist) return;
  assertSameTeam(user, playlist);
  assertCanEditOwned(user, playlist);

  await db.delete(playlistItems).where(eq(playlistItems.id, itemId));
  revalidatePath(`/playlists/${item.playlistId}`);
}

/** Persist a drag-reorder as the full ordered list of item ids. */
export async function reorderPlaylist(playlistId: string, itemIds: string[]): Promise<void> {
  const user = await requireUserOrThrow();
  const [playlist] = await db
    .select()
    .from(playlists)
    .where(eq(playlists.id, playlistId))
    .limit(1);
  if (!playlist) throw new Error("That playlist no longer exists.");
  assertSameTeam(user, playlist);
  assertCanEditOwned(user, playlist);

  for (const [i, itemId] of itemIds.entries()) {
    await db
      .update(playlistItems)
      .set({ sortOrder: i })
      .where(and(eq(playlistItems.id, itemId), eq(playlistItems.playlistId, playlistId)));
  }
  revalidatePath(`/playlists/${playlistId}`);
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  const user = await requireUserOrThrow();
  const [playlist] = await db
    .select()
    .from(playlists)
    .where(eq(playlists.id, playlistId))
    .limit(1);
  if (!playlist) return;
  assertSameTeam(user, playlist);
  assertCanEditOwned(user, playlist);

  await db.delete(playlists).where(eq(playlists.id, playlistId));
  revalidatePath("/playlists");
}

/**
 * Who can open a playlist: everyone, its maker alone, or any mix of all
 * players, all coaches, all admins and named people, by the same rule as a
 * clip (src/lib/auth/visibility.ts). Its maker says, so a player can send
 * their own cut to a teammate, and a coach can turn a pile of clips into
 * homework for the half-back line, without anyone else widening either.
 *
 * The named people are kept as a diff rather than replaced, so someone who
 * stays on the list keeps their "watched" record, and only people newly
 * added get an email about it.
 */
export async function setPlaylistAudience(playlistId: string, input: Audience): Promise<void> {
  const user = await requireUserOrThrow();

  const [playlist] = await db
    .select()
    .from(playlists)
    .where(eq(playlists.id, playlistId))
    .limit(1);
  if (!playlist) throw new Error("That playlist no longer exists.");
  assertSameTeam(user, playlist);
  if (!canShare(user, playlist)) throw new Error("Only whoever made the playlist can change who sees it.");

  const audience = normaliseAudience(input, playlist.createdBy);
  // Only people on this team: the ids came from a client.
  const chosen = audience.userIds.length
    ? (
        await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.teamId, playlist.teamId), inArray(users.id, audience.userIds)))
      ).map((u) => u.id)
    : [];

  const before = (
    await db
      .select({ userId: playlistViewers.userId })
      .from(playlistViewers)
      .where(eq(playlistViewers.playlistId, playlistId))
  ).map((v) => v.userId);
  const removed = before.filter((id) => !chosen.includes(id));
  const added = chosen.filter((id) => !before.includes(id));

  if (removed.length) {
    await db
      .delete(playlistViewers)
      .where(and(eq(playlistViewers.playlistId, playlistId), inArray(playlistViewers.userId, removed)));
  }
  if (added.length) {
    await db.insert(playlistViewers).values(added.map((userId) => ({ playlistId, userId })));
  }
  const [after] = await db
    .update(playlists)
    .set({ visibility: audience.visibility, shareRoles: audience.roles.length ? audience.roles : null })
    .where(eq(playlists.id, playlistId))
    .returning();

  const share = { teamId: playlist.teamId, subjectId: playlistId, actorId: user.id };
  // Named people are each told it is for them.
  if (added.length) await notifyUsers({ ...share, kind: "playlist-assigned" }, added);
  // Whole groups are told only about the coaches' published cut. A player's
  // own playlist opened to the team is there to find, not to be emailed.
  if (playlist.isOfficial) {
    await notifyNewlyReached({ ...share, kind: "team-playlist" }, playlist, before, after, chosen, chosen);
  }

  revalidatePath(`/playlists/${playlistId}`);
  revalidatePath("/playlists");
  revalidatePath("/");
}

/**
 * Record that the signed-in player has watched this playlist. Cheap to store
 * and it answers the question every selector asks on a Tuesday night.
 */
export async function markPlaylistViewed(playlistId: string): Promise<void> {
  const user = await requireUserOrThrow();
  await db
    .update(playlistViewers)
    .set({
      viewedAt: Date.now(),
      firstViewedAt: sql`COALESCE(${playlistViewers.firstViewedAt}, ${Date.now()})`,
    })
    .where(
      and(
        eq(playlistViewers.playlistId, playlistId),
        eq(playlistViewers.userId, user.id),
      ),
    );
}
