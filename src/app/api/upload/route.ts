/**
 * Start (or resume) a browser upload of a match file.
 *
 *   POST /api/upload  { filename, size, matchId? , newMatch?: { title, playedOn } }
 *     →  { videoId, partSize, partCount, done, match: { opponent, playedOn } }
 *     or { needsMatch: true }
 *
 * The match does not exist until its footage is uploaded, so the usual call
 * names a new one — a title and a date typed when the file is dropped — and
 * the match and the video row are written together. `matchId` instead adds
 * the file to a match already listed: a second camera angle, a recording that
 * split part-way.
 *
 * A drop first arrives with neither. If the same file is already part-way up
 * — the laptop slept, the clubhouse WiFi dropped — it simply resumes, with no
 * questions, sending only the parts the store does not hold. Otherwise the
 * answer is `needsMatch`, and the browser asks for the title.
 *
 * Nothing is written until the file is known to fit the club's allowance and
 * the store has started the upload, so a refused upload leaves no empty match
 * behind. The parts go straight from the browser to the store at URLs from
 * /api/upload/[videoId]; the rules for them are in src/lib/media/upload.ts.
 */
import { NextResponse, type NextRequest } from "next/server";
import { and, eq, ne, sum } from "drizzle-orm";
import { currentUser } from "@/lib/auth/session";
import { isCoach } from "@/lib/auth/guard";
import { db } from "@/lib/db/client";
import { matches, teams, videos } from "@/lib/db/schema";
import { contentTypeFor, store } from "@/lib/storage";
import {
  isAcceptedVideo,
  missingParts,
  planParts,
  quotaProblem,
  readNewMatch,
  teamQuotaBytes,
  uploadKey,
  type NewMatch,
} from "@/lib/media/upload";

function problem(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return problem("Please sign in.", 401);
  if (!isCoach(user)) return problem("Only coaches and admins can add footage.", 403);

  const body = (await req.json().catch(() => null)) as {
    filename?: unknown;
    size?: unknown;
    matchId?: unknown;
    newMatch?: { title?: unknown; playedOn?: unknown };
  } | null;
  const filename = typeof body?.filename === "string" ? body.filename.slice(0, 255) : "";
  const size = typeof body?.size === "number" ? body.size : NaN;
  const matchId = typeof body?.matchId === "string" ? body.matchId : null;

  if (!isAcceptedVideo(filename)) {
    return problem("That is not a video Ardawn can play. Use an MP4, MOV or WebM file.", 400);
  }
  if (!Number.isInteger(size) || size <= 0) return problem("That file looks empty.", 400);

  const media = await store();
  const plan = planParts(size);

  // The same file, part-way up already? Then carry on with it, whatever match
  // it was started against — dropping it again should not ask anything.
  const [partial] = await db
    .select({ video: videos, match: { opponent: matches.opponent, playedOn: matches.playedOn } })
    .from(videos)
    .innerJoin(matches, eq(matches.id, videos.matchId))
    .where(
      and(
        eq(videos.teamId, user.teamId),
        eq(videos.originalFilename, filename),
        eq(videos.sizeBytes, size),
        eq(videos.status, "uploading"),
        ...(matchId ? [eq(videos.matchId, matchId)] : []),
      ),
    )
    .limit(1);

  if (partial?.video.uploadId) {
    const held = await media.listParts(partial.video.storageKey, partial.video.uploadId).catch(() => null);
    if (held) {
      const missing = new Set(missingParts(plan, size, held));
      const done: number[] = [];
      for (let n = 1; n <= plan.count; n++) if (!missing.has(n)) done.push(n);
      return NextResponse.json({
        videoId: partial.video.id,
        partSize: plan.partSize,
        partCount: plan.count,
        done,
        match: partial.match,
      });
    }
    // The store has forgotten the upload (R2 clears unfinished ones after a
    // few days). Drop the row; the file starts again below, against the same
    // match unless another is named.
    await db.delete(videos).where(eq(videos.id, partial.video.id));
  }

  // Where the file goes: a match already listed, or a new one named now.
  let existing: { id: string; opponent: string; playedOn: string } | null = null;
  let named: NewMatch | null = null;
  const fallbackMatchId = matchId ?? partial?.video.matchId ?? null;

  if (body?.newMatch) {
    const read = readNewMatch(body.newMatch);
    if ("error" in read) return problem(read.error, 400);
    named = read;
  } else if (fallbackMatchId) {
    const [match] = await db.select().from(matches).where(eq(matches.id, fallbackMatchId)).limit(1);
    // Not found and not yours read the same, so ids from other clubs reveal nothing.
    if (!match || match.teamId !== user.teamId) return problem("That match is not one of yours.", 404);
    existing = match;
  } else {
    return NextResponse.json({ needsMatch: true });
  }

  const [{ used }] = await db
    .select({ used: sum(videos.sizeBytes) })
    .from(videos)
    .where(and(eq(videos.teamId, user.teamId), ne(videos.status, "failed")));
  const tooBig = quotaProblem(Number(used ?? 0), size, teamQuotaBytes(process.env.TEAM_STORAGE_GB));
  if (tooBig) return problem(tooBig, 413);

  const [team] = await db
    .select({ halfLengthMin: teams.halfLengthMin })
    .from(teams)
    .where(eq(teams.id, user.teamId))
    .limit(1);

  const storageKey = uploadKey(user.teamId, filename, crypto.randomUUID());
  const uploadId = await media.createMultipart(storageKey, contentTypeFor(filename));

  try {
    // The new match and its video row land together or not at all.
    const created = db.transaction((tx) => {
      const match =
        existing ??
        tx
          .insert(matches)
          .values({
            teamId: user.teamId,
            opponent: named!.opponent,
            playedOn: named!.playedOn,
            // The club's usual half length; 35 at senior inter-county, 30 at
            // most club grades.
            halfLengthMin: team?.halfLengthMin ?? 30,
            createdBy: user.id,
          })
          .returning()
          .get();

      const video = tx
        .insert(videos)
        .values({
          matchId: match.id,
          teamId: user.teamId,
          originalFilename: filename,
          storageKey,
          uploadId,
          // The size the browser declared. The upload only completes when
          // every part is held at the size this implies.
          sizeBytes: size,
          status: "uploading",
          uploadedBy: user.id,
        })
        .returning()
        .get();

      return { video, match };
    });

    return NextResponse.json({
      videoId: created.video.id,
      partSize: plan.partSize,
      partCount: plan.count,
      done: [],
      match: { opponent: created.match.opponent, playedOn: created.match.playedOn },
      createdMatch: !existing,
    });
  } catch (err) {
    await media.abortMultipart(storageKey, uploadId).catch(() => {});
    throw err;
  }
}
