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
 */
import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { store } from "@/lib/storage";
import { parseRange } from "@/lib/media/range";

/** Cap a single response so one scrub cannot pull hundreds of MB. */
const MAX_CHUNK = 8 * 1024 * 1024;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ key: string[] }> },
) {
  // Footage is squad property; never serve it to an anonymous request.
  const user = await currentUser();
  if (!user) return new NextResponse("Sign in required", { status: 401 });

  const { key: segments } = await ctx.params;
  const key = segments.join("/");

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
  const user = await currentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const { key: segments } = await ctx.params;
  const media = await store();
  const stat = await media.stat(segments.join("/"));
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
