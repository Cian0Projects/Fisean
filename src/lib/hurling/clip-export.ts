/**
 * The rules of exporting a playlist, or one clip of it, as a video.
 *
 * The picture itself is drawn in the browser (src/components/playlists/
 * recordPlaylist.ts); what is decided here is everything that can be decided
 * without a canvas, so the tests can pin it: where the comments sit, how long
 * playback waits on a comment, and what the file is called.
 *
 * Comments are handled the way the player handles them (stops.ts): the clip
 * plays, halts on the frame a comment was made on, shows the words and the
 * drawing, then plays on. In a video there is nobody to press "Play on", so
 * the wait is long enough to read.
 */
import { stopsOf, type Stop, type StopComment } from "./stops";

/**
 * Where the comments sit on the picture: the same nine spots the drill board
 * offers for its step notes, without "auto" (a video of match footage has no
 * emptier end to pick), plus off for a video with no comments on it.
 */
export const COMMENT_PLACES = [
  "top-left",
  "top",
  "top-right",
  "left",
  "middle",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
] as const;
export type CommentPlace = (typeof COMMENT_PLACES)[number];
export type CommentsOnVideo = CommentPlace | "off";

/** Low and out of the way of the ball, which is mostly in the middle of the frame. */
export const DEFAULT_COMMENT_PLACE: CommentPlace = "bottom-left";

/** The shortest a comment is held for, however little it says. */
export const MIN_HOLD_MS = 2500;
/** The longest, however much it says: a wall of text is not read in a video anyway. */
export const MAX_HOLD_MS = 10_000;
const BASE_HOLD_MS = 1500;
const READ_MS_PER_CHAR = 60;

/** How long playback waits on a stop: a moment to take in the frame, then time to read. */
export function holdMs(stop: Stop<{ body: string }>): number {
  const chars = stop.comments.reduce((n, c) => n + c.body.trim().length, 0);
  return Math.min(MAX_HOLD_MS, Math.max(MIN_HOLD_MS, BASE_HOLD_MS + chars * READ_MS_PER_CHAR));
}

export type ExportStop<C> = Stop<C> & { holdMs: number };

/** The clip's stops in playing order, each with how long it is held. */
export function exportStops<C extends StopComment & { body: string }>(
  comments: C[],
  clipLengthMs: number,
): ExportStop<C>[] {
  return stopsOf(comments, clipLengthMs).map((s) => ({ ...s, holdMs: holdMs(s) }));
}

/** How long the video of a clip runs: the clip itself plus every wait on a comment. */
export function exportLengthMs<C extends StopComment & { body: string }>(
  comments: C[],
  clipLengthMs: number,
  withComments: boolean,
): number {
  if (!withComments) return clipLengthMs;
  return exportStops(comments, clipLengthMs).reduce((sum, s) => sum + s.holdMs, clipLengthMs);
}

export type Box = { x: number; y: number; w: number; h: number };

/**
 * The top-left corner of a card of `card` size set in `place` within `box`,
 * kept `edge` clear of the box's sides. A card larger than the box is pinned
 * to its top-left rather than hanging off the picture.
 */
export function cardOrigin(
  place: CommentPlace,
  box: Box,
  card: { w: number; h: number },
  edge: number,
): { x: number; y: number } {
  const x = place.includes("left")
    ? box.x + edge
    : place.includes("right")
      ? box.x + box.w - edge - card.w
      : box.x + (box.w - card.w) / 2;
  const y = place.includes("top")
    ? box.y + edge
    : place.includes("bottom")
      ? box.y + box.h - edge - card.h
      : box.y + (box.h - card.h) / 2;
  return { x: Math.max(box.x, x), y: Math.max(box.y, y) };
}

/** Cards against a side are narrow and tall, so they run down the side, not across the play. */
export function isSidePlace(place: CommentPlace): boolean {
  return place.includes("left") || place.includes("right");
}

/** A file name a phone and a laptop both accept. */
export function exportFileName(title: string, fallback = "playlist"): string {
  const base = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
  return base || fallback;
}
