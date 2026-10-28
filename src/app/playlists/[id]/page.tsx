import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clips, playlistItems, playlistViewers, playlists, users, videos } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/guard";
import { canShare } from "@/lib/auth/visibility";
import { visibleClipIds } from "@/lib/queries/clips";
import { canOpenPlaylist } from "@/lib/queries/playlists";
import { loadComments } from "@/lib/queries/comments";
import { store } from "@/lib/storage";
import { PlaylistPlayer, type PlaylistClip } from "@/components/playlists/PlaylistPlayer";
import { PlaylistAudience } from "@/components/playlists/PlaylistAudience";

export default async function PlaylistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  // A playlist you may not open is one that does not exist, as far as you
  // can tell: saying "private" would still say it is there.
  const [playlist] = await db.select().from(playlists).where(eq(playlists.id, id)).limit(1);
  if (!playlist || !(await canOpenPlaylist(user, playlist))) notFound();

  const rows = await db
    .select({
      itemId: playlistItems.id,
      note: playlistItems.note,
      clipId: clips.id,
      videoId: clips.videoId,
      title: clips.title,
      startMs: clips.startMs,
      endMs: clips.endMs,
      visibility: clips.visibility,
      shareRoles: clips.shareRoles,
      createdBy: clips.createdBy,
      storageKey: videos.storageKey,
    })
    .from(playlistItems)
    .innerJoin(clips, eq(clips.id, playlistItems.clipId))
    .innerJoin(videos, eq(videos.id, clips.videoId))
    .where(eq(playlistItems.playlistId, id))
    .orderBy(asc(playlistItems.sortOrder));

  // Someone's private clip put on a shared playlist stays theirs: it is left
  // out for anyone who could not open it on its own.
  const seen = await visibleClipIds(
    user,
    rows.map((r) => ({ ...r, id: r.clipId })),
  );
  const items = rows.filter((i) => seen.has(i.clipId));
  const clipIds = items.map((i) => i.clipId);

  const commentsByClip = await loadComments(clipIds);

  // Who set it, said in the header the way a coach would hand it over.
  const [setBy] = playlist.createdBy
    ? await db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, playlist.createdBy))
        .limit(1)
    : [];

  const media = await store();

  const playlistClips: PlaylistClip[] = items.map((i) => ({
    itemId: i.itemId,
    clipId: i.clipId,
    videoId: i.videoId,
    src: media.readUrl(i.storageKey),
    title: i.title,
    note: i.note,
    startMs: i.startMs,
    endMs: i.endMs,
    comments: commentsByClip.get(i.clipId) ?? [],
  }));

  // Its maker says who sees it.
  let audience = null;
  if (canShare(user, playlist)) {
    const [people, chosen] = await Promise.all([
      db
        .select({ id: users.id, displayName: users.displayName, role: users.role })
        .from(users)
        .where(eq(users.teamId, playlist.teamId))
        .orderBy(asc(users.displayName)),
      db
        .select({ userId: playlistViewers.userId, viewedAt: playlistViewers.viewedAt })
        .from(playlistViewers)
        .where(eq(playlistViewers.playlistId, playlist.id)),
    ]);
    audience = (
      <PlaylistAudience
        playlistId={playlist.id}
        audience={{
          visibility: playlist.visibility,
          roles: playlist.shareRoles ?? [],
          userIds: chosen.map((c) => c.userId),
        }}
        makerId={playlist.createdBy}
        maker={playlist.createdBy === user.id ? "you" : (setBy?.displayName ?? "its maker")}
        people={people}
        watched={chosen.filter((c) => c.viewedAt != null).map((c) => c.userId)}
      />
    );
  }

  return (
    <PlaylistPlayer
      playlistId={playlist.id}
      title={playlist.title}
      note={playlist.description}
      setBy={setBy?.displayName ?? null}
      clips={playlistClips}
      viewer={{ id: user.id, displayName: user.displayName, role: user.role }}
      audience={audience}
    />
  );
}
