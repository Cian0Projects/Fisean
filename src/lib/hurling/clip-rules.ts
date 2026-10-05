/**
 * Minimum and maximum clip length.
 *
 * Shared between the server action that persists a clip
 * ([`src/lib/actions/clips.ts`](../actions/clips.ts)) and the client trim UI
 * that resizes one, so a drag can never propose a length the server would
 * then reject.
 */
export const MIN_CLIP_MS = 500;
export const MAX_CLIP_MS = 10 * 60_000;

/* --------------------------------------------------------- the trim strip */

/**
 * How much of the match the trim strip shows either side of the clip.
 *
 * This is the coach's choice, set by a dial, and not a formula. It used to be
 * derived from the clip's own length, which had two faults: the room to
 * extend a clip depended on the length you were trying to change, and the
 * strip rescaled on every pointer move mid-drag, so the far end of a long
 * clip moved in jumps instead of following the pointer.
 *
 * Ten seconds a click is about a poc amach and the break that follows it.
 */
export const ROOM_STEP_MS = 10_000;
export const MIN_ROOM_MS = 10_000;
/** Five minutes either side is far more than anyone trims by hand. */
export const MAX_ROOM_MS = 300_000;

export function clampRoom(ms: number): number {
  return Math.min(MAX_ROOM_MS, Math.max(MIN_ROOM_MS, ms));
}

/**
 * The slice of the match the strip covers: the clip, plus the room asked for,
 * kept inside the video.
 *
 * Near either end of a file the room on that side is cut short — there is no
 * footage before zero — so the window is not always symmetrical, and callers
 * must read both ends rather than assuming the clip sits in the middle.
 */
export function trimWindow(
  clip: { startMs: number; endMs: number },
  roomMs: number,
  videoDurationMs: number,
): { startMs: number; endMs: number } {
  const room = clampRoom(roomMs);
  const startMs = Math.max(0, clip.startMs - room);
  const endMs = Math.min(Math.max(videoDurationMs, clip.endMs), clip.endMs + room);
  return { startMs, endMs };
}

/* ------------------------------------------------------ the phone's nudges */

/**
 * Move one end of a clip by a fixed step, as the phone's −1 s / +1 s buttons
 * do in place of the desktop's drag handles.
 *
 * A thumb cannot drag a handle to a tenth of a second on a 6 cm strip, but it
 * can tap a button four times. Each tap is clamped the same way the server
 * checks a save: never before zero or past the end of the file, never
 * shorter than `MIN_CLIP_MS`, never longer than `MAX_CLIP_MS`. An end that
 * cannot move holds still rather than dragging the other end with it — the
 * point you already set is the one you meant.
 */
export function nudgeEdge(
  clip: { startMs: number; endMs: number },
  edge: "start" | "end",
  deltaMs: number,
  videoDurationMs: number,
): { startMs: number; endMs: number } {
  const fileEnd = videoDurationMs > 0 ? videoDurationMs : Number.MAX_SAFE_INTEGER;
  if (edge === "start") {
    const lo = Math.max(0, clip.endMs - MAX_CLIP_MS);
    const hi = clip.endMs - MIN_CLIP_MS;
    return { startMs: Math.min(hi, Math.max(lo, clip.startMs + deltaMs)), endMs: clip.endMs };
  }
  const lo = clip.startMs + MIN_CLIP_MS;
  const hi = Math.min(fileEnd, clip.startMs + MAX_CLIP_MS);
  return { startMs: clip.startMs, endMs: Math.min(hi, Math.max(lo, clip.endMs + deltaMs)) };
}

/* ------------------------------------------------------ the match preview */

/**
 * Which clip stands in for a match on the matches page.
 *
 * No ffmpeg means no generated thumbnails, so a match's picture is one of its
 * own clips, played from the footage itself. It comes from the first few by
 * game time — the preview should look like the start of that match, not
 * whichever moment was tagged last — and among those a clip somebody took the
 * trouble to name is the better bet than an untitled one. A clip shorter than
 * a couple of seconds is a flicker, so it only wins when nothing else will.
 */
export const PREVIEW_CANDIDATES = 3;
export const PREVIEW_MIN_MS = 2_000;

/** A preview loops this much of its clip at most: a glimpse, not a replay. */
export const PREVIEW_MAX_MS = 8_000;

export function previewClip<T extends { title: string; startMs: number; endMs: number }>(
  clips: readonly T[],
): T | null {
  const early = [...clips].sort((a, b) => a.startMs - b.startMs).slice(0, PREVIEW_CANDIDATES);
  const longEnough = early.filter((c) => c.endMs - c.startMs >= PREVIEW_MIN_MS);
  return longEnough.find((c) => c.title.trim()) ?? longEnough[0] ?? early[0] ?? null;
}

/** The stretch of a clip the preview loops over. */
export function previewWindow(clip: { startMs: number; endMs: number }): {
  startMs: number;
  endMs: number;
} {
  return {
    startMs: clip.startMs,
    endMs: Math.max(clip.startMs, Math.min(clip.endMs, clip.startMs + PREVIEW_MAX_MS)),
  };
}
