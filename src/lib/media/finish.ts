/**
 * The last step of getting a match file in, however it came: stitch the
 * parts, read the file's own index, and mark the video ready. The browser's
 * upload and the server's fetch from another app both end here, so a file
 * brought across from Veo is in every way the same as one dropped on the page.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { videos } from "@/lib/db/schema";
import type { MediaStore, StoredPart } from "@/lib/storage";
import { codecWarning, probeRanges } from "./probe";

export async function finishUpload(
  media: MediaStore,
  video: { id: string; storageKey: string; uploadId: string; sizeBytes: number },
  held: StoredPart[],
): Promise<{ warning: string | null }> {
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

  return { warning: codecWarning(probe.codec) };
}
