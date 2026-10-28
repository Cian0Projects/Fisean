/**
 * The playlists a viewer may open, coaches' official cuts first, newest
 * first within each.
 *
 * Every list of playlists goes through here (the playlists page, "add to
 * playlist", the playlist page itself) so the rule in
 * src/lib/auth/visibility.ts is applied the same way wherever one is named.
 */
import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { playlistViewers, playlists, users } from "@/lib/db/schema";
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
