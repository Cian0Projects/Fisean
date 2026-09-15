import { notFound } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  annotations,
  clipTags,
  clips,
  eventTypes,
  playlistItems,
  playlists,
  videos,
} from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/guard";
import { store } from "@/lib/storage";
import { PlaylistPlayer, type PlaylistClip } from "@/components/playlists/PlaylistPlayer";
import { eventLabelOf } from "@/components/review/types";

export default async function PlaylistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const [playlist] = await db.select().from(playlists).where(eq(playlists.id, id)).limit(1);
  if (!playlist || playlist.teamId !== user.teamId) notFound();

  const items = await db
    .select({
      itemId: playlistItems.id,
      note: playlistItems.note,
      clipId: clips.id,
      videoId: clips.videoId,
      title: clips.title,
      startMs: clips.startMs,
      endMs: clips.endMs,
      storageKey: videos.storageKey,
    })
    .from(playlistItems)
    .innerJoin(clips, eq(clips.id, playlistItems.clipId))
    .innerJoin(videos, eq(videos.id, clips.videoId))
    .where(eq(playlistItems.playlistId, id))
    .orderBy(asc(playlistItems.sortOrder));

  const clipIds = items.map((i) => i.clipId);

  const [tagRows, annotationRows, events] = clipIds.length
    ? await Promise.all([
        db.select().from(clipTags).where(inArray(clipTags.clipId, clipIds)),
        db.select().from(annotations).where(inArray(annotations.clipId, clipIds)),
        db.select().from(eventTypes),
      ])
    : [[], [], []];

  const eventById = new Map(events.map((e) => [e.id, e]));
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
    tags: tagRows
      .filter((t) => t.clipId === i.clipId)
      .map((t) => eventById.get(t.eventTypeId))
      .filter((e): e is NonNullable<typeof e> => !!e)
      .map((e) => ({ label: eventLabelOf(e), colour: e.colour })),
    annotations: annotationRows
      .filter((a) => a.clipId === i.clipId)
      .map((a) => ({ atMs: a.atMs, durationMs: a.durationMs, shapes: a.shapes })),
  }));

  return (
    <PlaylistPlayer
      playlistId={playlist.id}
      title={playlist.title}
      clips={playlistClips}
      viewerName={user.displayName}
    />
  );
}
