import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { isPhoneRequest } from "@/lib/device";
import { asc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { eventTypes, matches, users, videoMarkers, videos } from "@/lib/db/schema";
import { loadNumberSheet, loadStatRows } from "@/lib/queries/stats";
import { whistlesOf } from "@/lib/hurling/stats";
import { isCoach, requireUser } from "@/lib/auth/guard";
import { store } from "@/lib/storage";
import { codecWarning } from "@/lib/media/probe";
import { ReviewWorkspace } from "@/components/review/ReviewWorkspace";
import { loadVisibleClips } from "@/lib/queries/clips";
import { tagsForCode } from "@/lib/hurling/events";

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ videoId: string }>;
  /** `clip` opens on that clip, as the "shared with you" email links. */
  searchParams: Promise<{ full?: string; clip?: string }>;
}) {
  const { videoId } = await params;
  const { full, clip } = await searchParams;

  // The workspace is a keyboard and a wide screen: a side panel that will not
  // narrow, and a timeline and transport that each keep their height. On a
  // phone that leaves the video a sliver, so a phone is handed the screen
  // built for it, whichever link it came in by. `?full=1` opts out, for the
  // odd tablet that calls itself a phone.
  const h = await headers();
  if (full !== "1" && isPhoneRequest(h.get("user-agent") ?? "", h.get("sec-ch-ua-mobile"))) {
    redirect(`/m/watch/${videoId}${clip ? `?clip=${encodeURIComponent(clip)}` : ""}`);
  }

  const user = await requireUser();

  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  // A file still uploading is half a file; it opens once it has all arrived.
  if (!video || video.teamId !== user.teamId || video.status !== "ready") notFound();

  const [match] = video.matchId
    ? await db.select().from(matches).where(eq(matches.id, video.matchId)).limit(1)
    : [null];

  const allEvents = await db
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

  // Built-in taxonomy, fitted to the club's code, plus anything this squad
  // has added of its own, plus any tag these clips carry from before the
  // club changed its game.
  const events = tagsForCode(allEvents, user.teamCode, {
    onClips: initialClips.flatMap((c) => c.eventTypeIds),
  });

  const markerRows = await db
    .select({ kind: videoMarkers.kind, atMs: videoMarkers.atMs })
    .from(videoMarkers)
    .where(eq(videoMarkers.videoId, videoId));

  // The live stat pad needs the sheet already logged for this match, same as
  // the standalone logging page — only fetched when there is a match to log
  // against, since a training clip with no match cannot carry a stat sheet.
  // Coaches only: nobody else sees the pad, and a draft sheet sent to a
  // player's browser is a draft they can read.
  const [statRows, statNumbers] = match && isCoach(user)
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
        ourEndFirstHalf: video.ourEndFirstHalf,
      }}
      match={{
        id: match?.id ?? null,
        opponent: match?.opponent ?? "Training",
        competition: match?.competition ?? null,
        playedOn: match?.playedOn ?? "",
        halfLengthMin: match?.halfLengthMin ?? 30,
        whistles: match ? whistlesOf(match) : {},
      }}
      eventTypes={events}
      code={user.teamCode}
      squad={squad}
      initialClips={initialClips}
      // Only a clip this viewer can see: the rest are not in the list.
      openClipId={initialClips.some((c) => c.id === clip) ? clip : undefined}
      markerRows={markerRows}
      viewer={{ id: user.id, displayName: user.displayName, role: user.role }}
      statNumbers={statNumbers}
      initialStatRows={statRows}
    />
  );
}
