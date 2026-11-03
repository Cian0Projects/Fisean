/**
 * The how-to videos that are for members only.
 *
 * They live in `content/guides/`, outside `public/`, so the only way to reach
 * one is through here, and here wants a session. The two videos a stranger
 * may watch are plain files under `public/guides/` and never come this way.
 *
 * A browser will not seek or even start some formats without Range, so this
 * speaks it the way `/api/media` does, but over a local file of a few MB
 * rather than a bucket, so it reads the slice straight from disk. Which
 * files may be asked for is the list in `lib/guides.ts`, never a path from
 * the request, so there is nothing to traverse.
 */
import { open, stat } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { guideForFile } from "@/lib/guides";
import { parseRange } from "@/lib/media/range";

const DIR = join(process.cwd(), "content", "guides");
const TYPES = { video: "video/mp4", poster: "image/jpeg" } as const;

async function serve(req: NextRequest, ctx: { params: Promise<{ file: string }> }, head: boolean) {
  const { file } = await ctx.params;
  const found = guideForFile(file);
  // An open guide is a public file, not one of ours to hand out.
  if (!found || found.guide.open) return new NextResponse("Not found", { status: 404 });

  if (!(await currentUser())) return new NextResponse("Sign in required", { status: 401 });

  const path = join(DIR, file);
  const size = await stat(path).then((s) => s.size, () => null);
  if (size === null) return new NextResponse("Not found", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": TYPES[found.kind],
    "Accept-Ranges": "bytes",
    // Members only, and re-recorded now and then, so not immutable.
    "Cache-Control": "private, max-age=3600",
  };

  const range = parseRange(req.headers.get("range"), size);
  if (range === "unsatisfiable") {
    return new NextResponse(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
  }

  const start = range ? range.start : 0;
  const end = range ? range.end : size - 1;
  const length = end - start + 1;
  const status = range ? 206 : 200;
  const meta = {
    ...headers,
    "Content-Length": String(length),
    ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
  };
  if (head) return new NextResponse(null, { status, headers: meta });

  const handle = await open(path, "r");
  try {
    const body = Buffer.alloc(length);
    await handle.read(body, 0, length, start);
    return new NextResponse(body, { status, headers: meta });
  } finally {
    await handle.close();
  }
}

export function GET(req: NextRequest, ctx: { params: Promise<{ file: string }> }) {
  return serve(req, ctx, false);
}

/** Safari probes with HEAD before it will seek. */
export function HEAD(req: NextRequest, ctx: { params: Promise<{ file: string }> }) {
  return serve(req, ctx, true);
}
