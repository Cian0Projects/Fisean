"use client";

/**
 * Stops playback at each comment in the clip being watched, and says which
 * stop the playhead is parked on, so the screen can show its words and its
 * drawing. The rules are in src/lib/hurling/stops.ts; this only wires them to
 * the engine, frame by frame.
 *
 * Shared by the playlist player, the review workspace and the phone, so a
 * clip stops in the same places wherever it is watched.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerEngine } from "./engine";
import {
  SAME_FRAME_MS,
  crossedStop,
  playedFrom,
  stopAt,
  stopsOf,
  type Stop,
} from "@/lib/hurling/stops";
import type { CommentRow } from "@/components/review/types";

export function useCommentStops(
  engine: PlayerEngine,
  clip: { startMs: number; endMs: number } | null,
  comments: CommentRow[] | null,
  /** Off while drawing, so the playhead stays where the pen is. */
  enabled = true,
): Stop<CommentRow> | null {
  const startMs = clip?.startMs ?? null;
  const lengthMs = clip ? clip.endMs - clip.startMs : 0;
  const stops = useMemo(
    () => (comments && startMs != null ? stopsOf(comments, lengthMs) : []),
    [comments, startMs, lengthMs],
  );

  const [parked, setParked] = useState<Stop<CommentRow> | null>(null);
  // The clip offset seen on the previous frame, to tell play from a jump.
  const last = useRef<number | null>(null);
  // The stop just halted at, so the seek back onto its frame does not count
  // as reaching it again. Let go once the playhead moves off it.
  const held = useRef<number | null>(null);

  useEffect(() => {
    last.current = null;
    held.current = null;
    if (!enabled || startMs == null) return;

    return engine.subscribe((t) => {
      const offset = t.positionMs - startMs;
      const from = playedFrom(last.current, offset);
      last.current = offset;
      if (held.current != null && Math.abs(offset - held.current) > SAME_FRAME_MS) held.current = null;

      if (t.playing && !t.seeking) {
        const reached = crossedStop(stops, from, offset);
        if (reached && reached.atMs !== held.current) {
          held.current = reached.atMs;
          engine.pause();
          // Back onto the exact frame the comment was made on: the drawing
          // was made against that picture, not the one a frame later.
          engine.seek(startMs + reached.atMs, { exact: true });
          return;
        }
      }

      const here = t.playing ? null : stopAt(stops, offset);
      setParked((prev) => (prev === here ? prev : here));
    });
  }, [engine, enabled, startMs, stops]);

  return enabled && startMs != null ? parked : null;
}

/** Everything drawn on a stop's frame, by everyone who commented there. */
export function shapesOf(stop: Stop<CommentRow> | null) {
  return stop ? stop.comments.flatMap((c) => c.shapes ?? []) : [];
}
