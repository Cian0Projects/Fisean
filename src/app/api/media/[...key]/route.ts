/**
 * Range-capable media serving.
 *
 * This route is the reason scrubbing a 90-minute file feels quick. An MP4's
 * `moov` atom carries the full sample table, so once the browser has parsed
 * it, it knows the exact byte offset of the keyframe nearest any timestamp
 * and asks for precisely that range. Seek cost is one round trip and one GOP,
 * and seek accuracy is GOP-level — better than HLS, which can only seek to a
 * segment boundary two to six seconds away.
 *
 * All this route has to do is speak Range correctly. Getting the 206, the
 * Content-Range and Accept-Ranges right is the whole job.
 *
 * On the local driver it is also the stand-in for the R2 bucket: it serves
 * the signed URLs `readUrl` hands out, without a session, as R2 would, and it
 * accepts upload parts PUT to the signed URLs `presignPart` hands out. On R2
 * the browser goes to the bucket itself and this route is only reached by a
 * signed-in request without a signature.
 */
import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { videos } from "@/lib/db/schema";
import { store, storageDriver } from "@/lib/storage";
import { LocalDiskStore, verifyLocalUrl } from "@/lib/storage/local";
import { parseRange } from "@/lib/media/range";

/** Cap a single response so one scrub cannot pull hundreds of MB. */
const MAX_CHUNK = 8 * 1024 * 1024;

/**
 * Signed in is not enough when one instance hosts many clubs: the file has to
 * be your club's. Keys made by an upload start with the team id, which
 * settles it without a query. A file registered in place by `ingest` may sit
 * anywhere in the media folder, so for those the video row decides.
 */
async function belongsToTeam(key: string, teamId: string): Promise<boolean> {
  if (key.startsWith(`${teamId}/`)) return true;
  const [row] = await db
    .select({ id: videos.id })
    .from(videos)
    .where(and(eq(videos.storageKey, key), eq(videos.teamId, teamId)))
    .limit(1);
  return Boolean(row);
}

/**
 * Null when the request may read `key`, or the response refusing it. A signed
 * URL stands on its own, as R2's do: the page that signed it already checked
 * the viewer's club. Without a signature, a session from the right club.
 */
async function refuseRead(req: NextRequest, key: string): Promise<NextResponse | null> {
  const search = req.nextUrl.searchParams;
  if (search.has("sig")) {
    if (storageDriver() !== "local") return new NextResponse("Not found", { status: 404 });
    const check = verifyLocalUrl("GET", key, search);
    if (check === "ok") return null;
    return new NextResponse(check === "expired" ? "This link has expired" : "Bad signature", {
      status: 403,
    });
  }

  // Footage is squad property; never serve it to an anonymous request.
  const user = await currentUser();
  if (!user) return new NextResponse("Sign in required", { status: 401 });
  // 404, not 403: another club's file should look like no file at all.
  if (!(await belongsToTeam(key, user.teamId))) return new NextResponse("Not found", { status: 404 });
  return null;
}

/** Largest part the local bucket accepts; planParts never asks for more than ~11 MB. */
const MAX_PART_BYTES = 128 * 1024 * 1024;

/**
 * An upload part, PUT by the browser to a URL from `presignPart`. Local
 * driver only — on R2 the parts go to the bucket and never reach the app.
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  if (storageDriver() !== "local") return new NextResponse("Not found", { status: 404 });

  const { key: segments } = await ctx.params;
  const key = segments.join("/");
  const search = req.nextUrl.searchParams;
  const check = verifyLocalUrl("PUT", key, search);
  if (check !== "ok") {
    return new NextResponse(check === "expired" ? "This link has expired" : "Bad signature", {
      status: 403,
    });
  }

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_PART_BYTES) return new NextResponse("Part too large", { status: 413 });
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > MAX_PART_BYTES) return new NextResponse("Part too large", { status: 413 });

  const media = (await store()) as LocalDiskStore;
  try {
    await media.putPart(key, search.get("uploadId") ?? "", Number(search.get("partNumber")), bytes);
  } catch {
    return new NextResponse("No such upload", { status: 404 });
  }
  return new NextResponse(null, { status: 200 });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ key: string[] }> },
) {
  const { key: segments } = await ctx.params;
  const key = segments.join("/");
  const refused = await refuseRead(req, key);
  if (refused) return refused;

  let media;
  try {
    media = await store();
  } catch (err) {
    return new NextResponse((err as Error).message, { status: 500 });
  }

  const stat = await media.stat(key);
  if (!stat) return new NextResponse("Not found", { status: 404 });

  const range = parseRange(req.headers.get("range"), stat.sizeBytes);

  if (range === "unsatisfiable") {
    return new NextResponse(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${stat.sizeBytes}`,
        "Accept-Ranges": "bytes",
      },
    });
  }

  const baseHeaders: Record<string, string> = {
    "Content-Type": stat.contentType,
    // Without this the browser will not attempt ranged seeks at all, and
    // scrubbing collapses to downloading from the start every time.
    "Accept-Ranges": "bytes",
    // A given media key's bytes never change, so this can be cached hard.
    // `private` because the content is squad-only.
    "Cache-Control": "private, max-age=31536000, immutable",
  };

  if (!range) {
    // No Range header — hand back the first chunk and advertise ranges, so
    // the browser switches to ranged requests from here on.
    const end = Math.min(MAX_CHUNK, stat.sizeBytes) - 1;
    const body = await media.readRange(key, { start: 0, end });
    return new NextResponse(body, {
      status: end === stat.sizeBytes - 1 ? 200 : 206,
      headers: {
        ...baseHeaders,
        "Content-Length": String(end + 1),
        ...(end === stat.sizeBytes - 1
          ? {}
          : { "Content-Range": `bytes 0-${end}/${stat.sizeBytes}` }),
      },
    });
  }

  const end = Math.min(range.end, range.start + MAX_CHUNK - 1);
  const body = await media.readRange(key, { start: range.start, end });

  return new NextResponse(body, {
    status: 206,
    headers: {
      ...baseHeaders,
      "Content-Length": String(end - range.start + 1),
      "Content-Range": `bytes ${range.start}-${end}/${stat.sizeBytes}`,
    },
  });
}

/** Safari probes with HEAD before it will seek. */
export async function HEAD(
  req: NextRequest,
  ctx: { params: Promise<{ key: string[] }> },
) {
  const { key: segments } = await ctx.params;
  const key = segments.join("/");
  const refused = await refuseRead(req, key);
  if (refused) return new NextResponse(null, { status: refused.status });

  const media = await store();
  const stat = await media.stat(key);
  if (!stat) return new NextResponse(null, { status: 404 });

  return new NextResponse(null, {
    status: 200,
    headers: {
      "Content-Type": stat.contentType,
      "Content-Length": String(stat.sizeBytes),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
