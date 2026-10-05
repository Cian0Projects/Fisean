import { notFound } from "next/navigation";
import { asc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { eventTypes, matches, users, videoMarkers, videos } from "@/lib/db/schema";
import { loadNumberSheet, loadStatRows } from "@/lib/queries/stats";
import { requireUser } from "@/lib/auth/guard";
import { store } from "@/lib/storage";
import { codecWarning } from "@/lib/media/probe";
import { ReviewWorkspace } from "@/components/review/ReviewWorkspace";
import { loadVisibleClips } from "@/lib/queries/clips";

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
      position: users.position,
      role: users.role,
    })
    .from(users)
    .where(eq(users.teamId, user.teamId))
    .orderBy(asc(users.displayName));

  const initialClips = await loadVisibleClips(videoId, user);

  const markerRows = await db
    .select({ kind: videoMarkers.kind, atMs: videoMarkers.atMs })
    .from(videoMarkers)
    .where(eq(videoMarkers.videoId, videoId));

  // The live stat pad needs the sheet already logged for this match, same as
  // the standalone logging page — only fetched when there is a match to log
  // against, since a training clip with no match cannot carry a stat sheet.
  const [statRows, statNumbers] = match
    ? await Promise.all([loadStatRows(match.id, user.teamId), loadNumberSheet(match.id, user.teamId)])
    : [[], []];

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
      statNumbers={statNumbers}
      initialStatRows={statRows}
    />
  );
}
