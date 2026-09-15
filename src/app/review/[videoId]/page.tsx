import { notFound } from "next/navigation";
import { asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  annotations,
  clipPlayers,
  clipTags,
  clips,
  comments,
  eventTypes,
  matches,
  users,
  videoMarkers,
  videos,
} from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/guard";
import { store } from "@/lib/storage";
import { codecWarning } from "@/lib/media/probe";
import { ReviewWorkspace } from "@/components/review/ReviewWorkspace";
import type { ClipRow } from "@/components/review/types";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const user = await requireUser();
  const { videoId } = await params;

  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video || video.teamId !== user.teamId) notFound();

  const [match] = video.matchId
    ? await db.select().from(matches).where(eq(matches.id, video.matchId)).limit(1)
    : [null];

  // Built-in taxonomy plus anything this squad has added of its own.
  const events = await db
    .select()
    .from(eventTypes)
    .where(or(isNull(eventTypes.teamId), eq(eventTypes.teamId, user.teamId)))
    .orderBy(asc(eventTypes.sortOrder));

  const squad = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      jerseyNumber: users.jerseyNumber,
      position: users.position,
      role: users.role,
    })
    .from(users)
    .where(eq(users.teamId, user.teamId))
    .orderBy(asc(users.jerseyNumber), asc(users.displayName));

  // A player's private clips are theirs alone; everything else is the squad's.
  const clipRows = await db
    .select({
      id: clips.id,
      startMs: clips.startMs,
      endMs: clips.endMs,
      title: clips.title,
      visibility: clips.visibility,
      createdBy: clips.createdBy,
      authorName: users.displayName,
    })
    .from(clips)
    .leftJoin(users, eq(users.id, clips.createdBy))
    .where(eq(clips.videoId, videoId))
    .orderBy(asc(clips.startMs));

  const visible = clipRows.filter(
    (c) => c.visibility === "team" || c.createdBy === user.id || user.role !== "player",
  );
  const ids = visible.map((c) => c.id);

  // Fetch the child rows in three queries rather than per clip.
  const [tagRows, playerRows, commentCounts, annotationCounts] = ids.length
    ? await Promise.all([
        db.select().from(clipTags).where(inArray(clipTags.clipId, ids)),
        db.select().from(clipPlayers).where(inArray(clipPlayers.clipId, ids)),
        db
          .select({ clipId: comments.clipId, n: sql<number>`count(*)` })
          .from(comments)
          .where(inArray(comments.clipId, ids))
          .groupBy(comments.clipId),
        db
          .select({ clipId: annotations.clipId, n: sql<number>`count(*)` })
          .from(annotations)
          .where(inArray(annotations.clipId, ids))
          .groupBy(annotations.clipId),
      ])
    : [[], [], [], []];

  const tagsByClip = new Map<string, string[]>();
  for (const t of tagRows) {
    tagsByClip.set(t.clipId, [...(tagsByClip.get(t.clipId) ?? []), t.eventTypeId]);
  }
  const playersByClip = new Map<string, string[]>();
  for (const p of playerRows) {
    playersByClip.set(p.clipId, [...(playersByClip.get(p.clipId) ?? []), p.userId]);
  }
  const commentsByClip = new Map(commentCounts.map((r) => [r.clipId, Number(r.n)]));
  const annotationsByClip = new Map(annotationCounts.map((r) => [r.clipId, Number(r.n)]));

  const initialClips: ClipRow[] = visible.map((c) => ({
    id: c.id,
    startMs: c.startMs,
    endMs: c.endMs,
    title: c.title,
    visibility: c.visibility,
    createdBy: c.createdBy,
    authorName: c.authorName ?? "Removed",
    eventTypeIds: tagsByClip.get(c.id) ?? [],
    playerIds: playersByClip.get(c.id) ?? [],
    commentCount: commentsByClip.get(c.id) ?? 0,
    annotationCount: annotationsByClip.get(c.id) ?? 0,
  }));

  const markerRows = await db
    .select({ kind: videoMarkers.kind, atMs: videoMarkers.atMs })
    .from(videoMarkers)
    .where(eq(videoMarkers.videoId, videoId));

  const media = await store();

  return (
    <ReviewWorkspace
      video={{
        id: video.id,
        src: media.readUrl(video.storageKey),
        durationMs: video.durationMs,
        fps: video.fps,
        width: video.width,
        height: video.height,
        originalFilename: video.originalFilename,
        codecWarning: codecWarning(video.codec),
      }}
      match={{
        id: match?.id ?? null,
        opponent: match?.opponent ?? "Training",
        competition: match?.competition ?? null,
        playedOn: match?.playedOn ?? "",
        halfLengthMin: match?.halfLengthMin ?? 30,
      }}
      eventTypes={events}
      squad={squad}
      initialClips={initialClips}
      markerRows={markerRows}
      viewer={{ id: user.id, displayName: user.displayName, role: user.role }}
    />
  );
}
