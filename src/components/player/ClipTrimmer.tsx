"use client";

/**
 * Drag handles for resizing the selected clip.
 *
 * The main timeline shows the whole match, so an 11-second clip inside a
 * 70-minute one is a sliver a pixel or two wide — nowhere near precise
 * enough to grab and drag. This renders a second, zoomed strip scoped to
 * just the clip plus some padding either side, so the in and out points are
 * always big enough on screen to drag confidently.
 *
 * Three ways to adjust a clip, all committed the same way:
 *  - Drag the left or right handle to trim that end.
 *  - Drag the body between them to shift the whole clip earlier or later
 *    without changing its length.
 *  - The nudge buttons, for half-second adjustments without a drag.
 *
 * While dragging, the video previews the exact frame under the handle —
 * `engine.setBounds` widens or narrows the focused region on every pointer
 * move, and a seek to the handle's position is never rejected as "outside
 * the clip" because the bounds already moved to include it.
 *
 * How much of the match the strip covers is the coach's choice, not a
 * formula: the dial adds or removes ten seconds of room either side of the
 * clip, and that empty room is what you drag a handle out into. It replaced
 * padding that scaled with the clip's own length, which had two faults — the
 * room available depended on the length you were trying to change, and every
 * pixel of a drag rescaled the strip, so the far end of a long clip moved in
 * jumps rather than following the pointer.
 *
 * For the same reason the window freezes for the duration of a drag. A strip
 * that rescales while you are dragging on it is a strip you are chasing.
 */
import { useRef, useState } from "react";
import type { PlayerEngine } from "./engine";
import {
  MAX_CLIP_MS,
  MAX_ROOM_MS,
  MIN_CLIP_MS,
  MIN_ROOM_MS,
  ROOM_STEP_MS,
  clampRoom,
  trimWindow,
} from "@/lib/hurling/clip-rules";
import { formatClockPrecise } from "@/lib/hurling/notation";

type Draft = { startMs: number; endMs: number };
type Handle = "start" | "end" | "body" | null;
/** The slice of the match the strip is currently showing. */
type Window = { startMs: number; endMs: number };

type Props = {
  engine: PlayerEngine;
  videoDurationMs: number;
  clip: { id: string; startMs: number; endMs: number };
  onCommit: (startMs: number, endMs: number) => void;
};

const NUDGE_MS = 500;

export function ClipTrimmer({ engine, videoDurationMs, clip, onCommit }: Props) {
  const [draft, setDraft] = useState<Draft>({ startMs: clip.startMs, endMs: clip.endMs });
  const [dragging, setDragging] = useState<Handle>(null);
  const [bodyDragStart, setBodyDragStart] = useState<{ pointerMs: number; draft: Draft } | null>(
    null,
  );
  // Measured once against the whole strip, not whichever element the pointer
  // happens to be captured on — the body drag target is much narrower than
  // the strip, and using its own rect would badly misread the drag distance.
  const stripRef = useRef<HTMLDivElement>(null);

  /** Room either side of the clip, in milliseconds. The dial sets it. */
  const [roomMs, setRoomMs] = useState(MIN_ROOM_MS);
  // Held while a drag is in flight, so the scale cannot shift underfoot.
  const [heldWindow, setHeldWindow] = useState<Window | null>(null);

  // Where the strip sits when nothing is being dragged: the clip, plus the
  // room the coach has asked for, kept inside the video.
  const restingWindow: Window = trimWindow(draft, roomMs, videoDurationMs);

  const view = heldWindow ?? restingWindow;
  const windowStart = view.startMs;
  const windowLen = Math.max(1, view.endMs - windowStart);

  const pct = (ms: number) => ((ms - windowStart) / windowLen) * 100;
  const msFromClientX = (stripRect: DOMRect, clientX: number) => {
    const ratio = Math.min(1, Math.max(0, (clientX - stripRect.left) / stripRect.width));
    return windowStart + ratio * windowLen;
  };

  const preview = (startMs: number, endMs: number, at: number) => {
    engine.setBounds(startMs, endMs);
    engine.seek(at, { exact: true });
  };

  const commitIfChanged = (next: Draft) => {
    if (next.startMs !== clip.startMs || next.endMs !== clip.endMs) {
      onCommit(next.startMs, next.endMs);
    }
  };

  const onHandleDown = (which: "start" | "end") => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    engine.pause();
    setHeldWindow(restingWindow);
    setDragging(which);
  };

  // A flat handler rather than a curried one keyed by "which" — `dragging`
  // already says which handle is active, so both handles can share it, and
  // it keeps the ref read inside a plain event handler body rather than
  // behind a returned closure.
  const onHandleMove = (e: React.PointerEvent) => {
    if (!dragging || dragging === "body" || !stripRef.current) return;
    const raw = msFromClientX(stripRef.current.getBoundingClientRect(), e.clientX);

    if (dragging === "start") {
      const next = Math.min(raw, draft.endMs - MIN_CLIP_MS);
      const clamped = Math.max(0, next);
      setDraft((d) => ({ ...d, startMs: clamped }));
      preview(clamped, draft.endMs, clamped);
    } else {
      const furthest = Math.min(videoDurationMs, draft.startMs + MAX_CLIP_MS);
      const next = Math.max(raw, draft.startMs + MIN_CLIP_MS);
      const clamped = Math.min(next, furthest);
      setDraft((d) => ({ ...d, endMs: clamped }));
      preview(draft.startMs, clamped, clamped);
    }
  };

  const onHandleUp = () => {
    if (!dragging) return;
    setDragging(null);
    setHeldWindow(null);
    commitIfChanged(draft);
  };

  const onBodyDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    engine.pause();
    if (!stripRef.current) return;
    const pointerMs = msFromClientX(stripRef.current.getBoundingClientRect(), e.clientX);
    setBodyDragStart({ pointerMs, draft });
    setHeldWindow(restingWindow);
    setDragging("body");
  };

  const onBodyMove = (e: React.PointerEvent) => {
    if (dragging !== "body" || !bodyDragStart || !stripRef.current) return;
    const pointerMs = msFromClientX(stripRef.current.getBoundingClientRect(), e.clientX);
    const delta = pointerMs - bodyDragStart.pointerMs;

    const len = bodyDragStart.draft.endMs - bodyDragStart.draft.startMs;
    let nextStart = bodyDragStart.draft.startMs + delta;
    nextStart = Math.max(0, Math.min(nextStart, videoDurationMs - len));
    const nextEnd = nextStart + len;

    setDraft({ startMs: nextStart, endMs: nextEnd });
    preview(nextStart, nextEnd, nextStart);
  };

  const onBodyUp = () => {
    if (dragging !== "body") return;
    setDragging(null);
    setBodyDragStart(null);
    setHeldWindow(null);
    commitIfChanged(draft);
  };

  /**
   * Grow or shrink the room either side of the clip.
   *
   * Nothing about the clip changes here — this only widens the view, which is
   * what gives a handle somewhere to be dragged to. Growing it costs
   * precision (the same strip now covers more of the match), so it is a
   * deliberate click rather than something that happens on its own.
   */
  const adjustRoom = (deltaMs: number) => {
    setRoomMs((ms) => clampRoom(ms + deltaMs));
  };

  const nudgeStart = (deltaMs: number) => {
    const next = { ...draft, startMs: Math.max(0, Math.min(draft.startMs + deltaMs, draft.endMs - MIN_CLIP_MS)) };
    setDraft(next);
    preview(next.startMs, next.endMs, next.startMs);
    commitIfChanged(next);
  };

  const nudgeEnd = (deltaMs: number) => {
    const furthest = Math.min(videoDurationMs, draft.startMs + MAX_CLIP_MS);
    const next = { ...draft, endMs: Math.min(furthest, Math.max(draft.endMs + deltaMs, draft.startMs + MIN_CLIP_MS)) };
    setDraft(next);
    preview(next.startMs, next.endMs, next.endMs);
    commitIfChanged(next);
  };

  return (
    <div
      className="shrink-0 border-t px-3 py-2.5"
      style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}
    >
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="label">Trim</span>

        <div className="flex items-center gap-3">
          {/* The dial. Empty strip either side of the clip is what a handle
              gets dragged out into, so this is "how much further can I go". */}
          <div className="flex items-center gap-1">
            <NudgeButton
              label="−"
              title="Ten seconds less room either side of the clip"
              onClick={() => adjustRoom(-ROOM_STEP_MS)}
              disabled={roomMs <= MIN_ROOM_MS}
            />
            <span
              className="tabular w-24 text-center text-[11px]"
              style={{ color: "var(--color-ink-dim)" }}
              title="How much of the match is shown either side of the clip. Drag a handle out into it to extend the clip."
            >
              {Math.round(roomMs / 1000)}s either side
            </span>
            <NudgeButton
              label="+"
              title="Ten seconds more room either side of the clip"
              onClick={() => adjustRoom(ROOM_STEP_MS)}
              disabled={roomMs >= MAX_ROOM_MS}
            />
          </div>

          <span className="tabular text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
            {((draft.endMs - draft.startMs) / 1000).toFixed(1)}s
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <NudgeButton label="−" title="Trim in point back 0.5s" onClick={() => nudgeStart(-NUDGE_MS)} />
          <span
            className="tabular w-16 text-center text-[11px]"
            style={{ color: "var(--color-mark)" }}
          >
            {formatClockPrecise(draft.startMs)}
          </span>
          <NudgeButton label="+" title="Trim in point forward 0.5s" onClick={() => nudgeStart(NUDGE_MS)} />
        </div>

        {/* The zoomed strip. */}
        <div
          ref={stripRef}
          className="relative h-9 flex-1 touch-none rounded-md"
          style={{ background: "var(--color-surface-2)" }}
        >
          {/* The kept region — also the drag target for shifting the clip. */}
          <div
            onPointerDown={onBodyDown}
            onPointerMove={onBodyMove}
            onPointerUp={onBodyUp}
            onPointerCancel={onBodyUp}
            title="Drag to shift the whole clip"
            className="absolute inset-y-0 cursor-grab rounded-sm active:cursor-grabbing"
            style={{
              left: `${pct(draft.startMs)}%`,
              width: `${Math.max(0.5, pct(draft.endMs) - pct(draft.startMs))}%`,
              background: "color-mix(in oklab, var(--color-brand) 35%, transparent)",
              border: "1px solid var(--color-brand)",
            }}
          />

          {/* Left (in point) handle. */}
          <div
            onPointerDown={onHandleDown("start")}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
            title="Drag to trim the in point"
            className="absolute inset-y-0 z-10 w-3 cursor-ew-resize"
            style={{ left: `calc(${pct(draft.startMs)}% - 6px)` }}
          >
            <div
              className="mx-auto h-full w-1.5 rounded-full"
              style={{ background: "var(--color-mark)" }}
            />
          </div>

          {/* Right (out point) handle. */}
          <div
            onPointerDown={onHandleDown("end")}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
            title="Drag to trim the out point"
            className="absolute inset-y-0 z-10 w-3 cursor-ew-resize"
            style={{ left: `calc(${pct(draft.endMs)}% - 6px)` }}
          >
            <div
              className="mx-auto h-full w-1.5 rounded-full"
              style={{ background: "var(--color-mark)" }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <NudgeButton label="−" title="Trim out point back 0.5s" onClick={() => nudgeEnd(-NUDGE_MS)} />
          <span
            className="tabular w-16 text-center text-[11px]"
            style={{ color: "var(--color-mark)" }}
          >
            {formatClockPrecise(draft.endMs)}
          </span>
          <NudgeButton label="+" title="Trim out point forward 0.5s" onClick={() => nudgeEnd(NUDGE_MS)} />
        </div>
      </div>
    </div>
  );
}

function NudgeButton({
  label,
  title,
  onClick,
  disabled = false,
}: {
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs transition-colors disabled:opacity-35"
      style={{ background: "var(--color-surface-3)", color: "var(--color-ink-dim)" }}
    >
      {label}
    </button>
  );
}
