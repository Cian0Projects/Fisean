"use server";

import { revalidatePath } from "next/cache";
import { and, eq, max, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clips, playlistItems, playlistViewers, playlists } from "@/lib/db/schema";
import {
  assertCanEditOwned,
  assertSameTeam,
  isCoach,
  requireUserOrThrow,
} from "@/lib/auth/guard";

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
      visibility: "team",
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
 * Assign a playlist to specific players. Coaches only — this is what turns a
 * pile of clips into homework for a named group.
 */
export async function assignPlaylist(playlistId: string, userIds: string[]): Promise<void> {
  const user = await requireUserOrThrow();
  if (!isCoach(user)) throw new Error("Only coaches and admins can assign playlists.");

  const [playlist] = await db
    .select()
    .from(playlists)
    .where(eq(playlists.id, playlistId))
    .limit(1);
  if (!playlist) throw new Error("That playlist no longer exists.");
  assertSameTeam(user, playlist);

  await db.delete(playlistViewers).where(eq(playlistViewers.playlistId, playlistId));
  if (userIds.length) {
    await db
      .insert(playlistViewers)
      .values(userIds.map((userId) => ({ playlistId, userId })));
  }
  revalidatePath(`/playlists/${playlistId}`);
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
