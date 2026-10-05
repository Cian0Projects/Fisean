import { notFound } from "next/navigation";
import { asc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { eventTypes, matches, users, videoMarkers, videos } from "@/lib/db/schema";
import { requireUserFor } from "@/lib/auth/guard";
import { store } from "@/lib/storage";
import { codecWarning } from "@/lib/media/probe";
import { loadVisibleClips } from "@/lib/queries/clips";
import { PhoneWatch } from "@/components/mobile/PhoneWatch";

/**
 * Watching and clipping on a phone.
 *
 * Loads what the desktop review page loads, less the stat sheet: the footage,
 * the clips this viewer may see, the tag taxonomy and the squad to credit.
 */
export default async function PhoneWatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ videoId: string }>;
  searchParams: Promise<{ clip?: string }>;
}) {
  const { videoId } = await params;
  const { clip } = await searchParams;
  const user = await requireUserFor(`/m/watch/${videoId}${clip ? `?clip=${clip}` : ""}`);

  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video || video.teamId !== user.teamId) notFound();

  const [match] = video.matchId
    ? await db.select().from(matches).where(eq(matches.id, video.matchId)).limit(1)
    : [null];

  const [events, squad, markerRows, initialClips, media] = await Promise.all([
    db
      .select()
      .from(eventTypes)
      .where(or(isNull(eventTypes.teamId), eq(eventTypes.teamId, user.teamId)))
      .orderBy(asc(eventTypes.sortOrder)),
    db
      .select({
        id: users.id,
        displayName: users.displayName,
        position: users.position,
        role: users.role,
      })
      .from(users)
      .where(eq(users.teamId, user.teamId))
      .orderBy(asc(users.displayName)),
    db
      .select({ kind: videoMarkers.kind, atMs: videoMarkers.atMs })
      .from(videoMarkers)
      .where(eq(videoMarkers.videoId, videoId)),
    loadVisibleClips(videoId, user),
    store(),
  ]);

  return (
    <PhoneWatch
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
      openClipId={clip ?? null}
    />
  );
}
