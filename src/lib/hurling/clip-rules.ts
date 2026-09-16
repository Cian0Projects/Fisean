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
