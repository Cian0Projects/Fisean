/**
 * HTTP Range header parsing.
 *
 * Kept separate from the route handler so it can be unit tested without
 * standing up Next — and because getting this wrong is the difference between
 * a video that seeks instantly and one that re-downloads from the start on
 * every scrub.
 */

export type ParsedRange = { start: number; end: number } | "unsatisfiable" | null;

/**
 * Parse a single-range `Range` header against a known size.
 *
 * Multi-range requests are legal but no browser issues them for video, so the
 * extra ranges are ignored rather than answered with a multipart body.
 *
 * Returns `null` when there is no usable Range header (serve the whole
 * resource), `"unsatisfiable"` when the range falls outside the file (answer
 * 416), or the inclusive byte range to serve.
 */
export function parseRange(header: string | null, size: number): ParsedRange {
  if (!header) return null;

  const first = header.trim().split(",")[0].trim();
  const m = /^bytes=(\d*)-(\d*)$/.exec(first);
  if (!m) return null;

  const [, rawStart, rawEnd] = m;
  if (rawStart === "" && rawEnd === "") return "unsatisfiable";

  let start: number;
  let end: number;

  if (rawStart === "") {
    // Suffix form — `bytes=-500` means the last 500 bytes.
    const n = Number(rawEnd);
    if (n <= 0) return "unsatisfiable";
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start >= size || start < 0 || end < start) return "unsatisfiable";

  return { start, end: Math.min(end, size - 1) };
}
