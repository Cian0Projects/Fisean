/**
 * The playlists a viewer may open, coaches' official cuts first, newest
 * first within each.
 *
 * Every list of playlists goes through here (the playlists page, "add to
 * playlist", the playlist page itself) so the rule in
 * src/lib/auth/visibility.ts is applied the same way wherever one is named.
 */
import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clips, playlistItems, playlistViewers, playlists, users, videos } from "@/lib/db/schema";
import { visibleClipIds } from "@/lib/queries/clips";
import { store } from "@/lib/storage";
import { canSeePlaylist, type Shared } from "@/lib/auth/visibility";
import type { SessionUser } from "@/lib/auth/session";

export async function visiblePlaylists(user: SessionUser) {
  const rows = await db
    .select({
      id: playlists.id,
      title: playlists.title,
      description: playlists.description,
      isOfficial: playlists.isOfficial,
      visibility: playlists.visibility,
      shareRoles: playlists.shareRoles,
      createdBy: playlists.createdBy,
      authorName: users.displayName,
      // Whether this viewer is one of the people it was shared with.
      chosen: playlistViewers.userId,
    })
    .from(playlists)
    .leftJoin(users, eq(users.id, playlists.createdBy))
    .leftJoin(
      playlistViewers,
      and(eq(playlistViewers.playlistId, playlists.id), eq(playlistViewers.userId, user.id)),
    )
    .where(eq(playlists.teamId, user.teamId))
    .orderBy(desc(playlists.isOfficial), desc(playlists.createdAt));

  return rows
    .filter((p) => canSeePlaylist(user, p, p.chosen != null))
    .map(({ chosen: _chosen, ...p }) => p);
}

/** Whether `user` may open this one playlist. */
export async function canOpenPlaylist(
  user: SessionUser,
  playlist: Shared & { id: string; teamId: string },
): Promise<boolean> {
  if (playlist.teamId !== user.teamId) return false;
  const [chosen] = await db
    .select({ userId: playlistViewers.userId })
    .from(playlistViewers)
    .where(and(eq(playlistViewers.playlistId, playlist.id), eq(playlistViewers.userId, user.id)))
    .limit(1);
  return canSeePlaylist(user, playlist, !!chosen);
}

export type FootageClip = { clipId: string; title: string; src: string; startMs: number; endMs: number };

/**
 * A playlist's clips in playing order, with a link to play each, for a
 * drill's exported video. Null when the playlist is gone or `user` may not
 * open it. As on the playlist page, a clip someone made private stays theirs:
 * it is left out for anyone who could not open it on its own.
 */
export async function playlistFootage(
  user: SessionUser,
  playlistId: string,
): Promise<{ title: string; clips: FootageClip[] } | null> {
  const [playlist] = await db.select().from(playlists).where(eq(playlists.id, playlistId)).limit(1);
  if (!playlist || !(await canOpenPlaylist(user, playlist))) return null;

  const rows = await db
    .select({
      clipId: clips.id,
      title: clips.title,
      startMs: clips.startMs,
      endMs: clips.endMs,
      visibility: clips.visibility,
      shareRoles: clips.shareRoles,
      createdBy: clips.createdBy,
      teamId: clips.teamId,
      storageKey: videos.storageKey,
    })
    .from(playlistItems)
    .innerJoin(clips, eq(clips.id, playlistItems.clipId))
    .innerJoin(videos, eq(videos.id, clips.videoId))
    .where(eq(playlistItems.playlistId, playlistId))
    .orderBy(asc(playlistItems.sortOrder));

  const seen = await visibleClipIds(
    user,
    rows.map((r) => ({ ...r, id: r.clipId })),
  );
  const media = await store();
  return {
    title: playlist.title,
    clips: rows
      .filter((r) => seen.has(r.clipId))
      .map((r) => ({
        clipId: r.clipId,
        title: r.title,
        src: media.readUrl(r.storageKey),
        startMs: r.startMs,
        endMs: r.endMs,
      })),
  };
}
