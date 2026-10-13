/**
 * The rest of a browser upload, once /api/upload has started it.
 *
 *   GET    ?parts=1,2,3   signed URLs to PUT those parts to  →  { urls }
 *   POST                  finish: check the parts, stitch them, probe the file
 *   DELETE                cancel: abandon the upload and drop the row
 *
 * The bytes never come through here. The browser PUTs each part straight to
 * the URL it is given — R2 in production, /api/media on the local driver —
 * and this route only signs, checks and finishes.
 */
import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth/session";
import { isCoach } from "@/lib/auth/guard";
import { db } from "@/lib/db/client";
import { videos } from "@/lib/db/schema";
import { store } from "@/lib/storage";
import { missingParts, parsePartList, planParts } from "@/lib/media/upload";
import { codecWarning, probeRanges } from "@/lib/media/probe";

type Ctx = { params: Promise<{ videoId: string }> };

function problem(message: string, status: number, extra: object = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** The upload this request is about, if the caller may write to it. */
async function uploadFor(ctx: Ctx) {
  const user = await currentUser();
  if (!user) return { error: problem("Please sign in.", 401) };
  if (!isCoach(user)) return { error: problem("Only coaches and admins can add footage.", 403) };

  const { videoId } = await ctx.params;
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video || video.teamId !== user.teamId) return { error: problem("No such upload.", 404) };
  if (video.status !== "uploading" || !video.uploadId) {
    return { error: problem("That file has already finished uploading.", 409) };
  }

  return { video: { ...video, uploadId: video.uploadId }, media: await store(), plan: planParts(video.sizeBytes) };
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const found = await uploadFor(ctx);
  if ("error" in found) return found.error;
  const { video, media, plan } = found;

  const parts = parsePartList(req.nextUrl.searchParams.get("parts"), plan);
  if (!parts) return problem("Ask for between one and fifty valid part numbers.", 400);

  const urls: Record<number, string> = {};
  for (const n of parts) urls[n] = media.presignPart(video.storageKey, video.uploadId, n);
  return NextResponse.json({ urls });
}

export async function POST(_req: NextRequest, ctx: Ctx) {
  const found = await uploadFor(ctx);
  if ("error" in found) return found.error;
  const { video, media, plan } = found;

  const held = await media.listParts(video.storageKey, video.uploadId);
  const missing = missingParts(plan, video.sizeBytes, held);
  if (missing.length) {
    return problem("Some of the file has not arrived yet.", 409, { missing });
  }

  await media.completeMultipart(video.storageKey, video.uploadId, held);

  // Duration, frame rate and codec come from the file's own index, read from
  // its two ends — no ffmpeg, and no reading the gigabytes in between.
  const probe = await probeRanges(video.sizeBytes, async (start, length) => {
    const stream = await media.readRange(video.storageKey, { start, end: start + length - 1 });
    return new Uint8Array(await new Response(stream).arrayBuffer());
  });

  await db
    .update(videos)
    .set({
      durationMs: probe.durationMs,
      width: probe.width,
      height: probe.height,
      fps: probe.fps,
      codec: probe.codec,
      moovAtStart: probe.moovAtStart,
      uploadId: null,
      // Ready as it stands: the player seeks the original with range
      // requests, so there is nothing to transcode.
      status: "ready",
    })
    .where(eq(videos.id, video.id));

  revalidatePath("/");
  revalidatePath("/admin");
  return NextResponse.json({ videoId: video.id, warning: codecWarning(probe.codec) });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const found = await uploadFor(ctx);
  if ("error" in found) return found.error;
  const { video, media } = found;

  await db.delete(videos).where(eq(videos.id, video.id));
  await media.abortMultipart(video.storageKey, video.uploadId).catch(() => {});
  revalidatePath("/admin");
  return new NextResponse(null, { status: 204 });
}
