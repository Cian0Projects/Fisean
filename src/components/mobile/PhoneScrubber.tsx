"use client";

/**
 * The phone's scrub bar.
 *
 * The desktop timeline is built for a mouse: stat lanes, a label gutter,
 * handles a few pixels wide. None of that survives a thumb. This is one bar,
 * the full width of the screen, with a 44 px touch area around a thin track
 * — the size Apple and Google both give as the smallest thing a finger hits
 * reliably. Clips sit on it as ticks so you can see where the squad has been.
 *
 * Like the desktop timeline, the playhead is written straight to the DOM
 * from the engine's subscription, so dragging never re-renders React.
 * `touch-action: none` is what stops a sideways drag from scrolling the page
 * or triggering the browser's back gesture instead.
 */
import { useEffect, useRef } from "react";
import type { PlayerEngine } from "@/components/player/engine";

type Tick = { id: string; startMs: number; endMs: number; colour: string };

type Props = {
  engine: PlayerEngine;
  durationMs: number;
  ticks: Tick[];
  /** The clip currently playing, drawn as a lit band behind the track. */
  focus: { startMs: number; endMs: number } | null;
  inMs: number | null;
  /** Called as a drag begins, so the screen can leave a focused clip. */
  onScrubStart: () => void;
};

export function PhoneScrubber({ engine, durationMs, ticks, focus, inMs, onScrubStart }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const bufferRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const length = (ms: number) => `${(ms / Math.max(1, durationMs)) * 100}%`;

  useEffect(
    () =>
      engine.subscribe((t) => {
        const total = Math.max(1, t.durationMs || durationMs);
        if (headRef.current) headRef.current.style.left = `${(t.positionMs / total) * 100}%`;
        if (bufferRef.current) bufferRef.current.style.width = `${(t.bufferedMs / total) * 100}%`;
        barRef.current?.setAttribute("aria-valuenow", String(Math.round(t.positionMs / 1000)));
      }),
    [engine, durationMs],
  );

  const seekTo = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || durationMs <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    engine.seek(ratio * durationMs);
  };

  return (
    <div
      ref={barRef}
      role="slider"
      aria-label="Position in the match"
      aria-valuemin={0}
      aria-valuemax={Math.round(durationMs / 1000)}
      aria-valuenow={0}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") engine.nudge(-5000);
        if (e.key === "ArrowRight") engine.nudge(5000);
      }}
      className="relative h-11 select-none"
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        onScrubStart();
        engine.setDragging(true);
        seekTo(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && seekTo(e.clientX)}
      onPointerUp={() => {
        if (!dragging.current) return;
        dragging.current = false;
        engine.setDragging(false);
      }}
      onPointerCancel={() => {
        dragging.current = false;
        engine.setDragging(false);
      }}
    >
      {/* Clip ticks sit above the track, where a thumb is not covering them. */}
      {ticks.map((c) => (
        <span
          key={c.id}
          aria-hidden
          className="absolute top-2 h-1.5 rounded-sm"
          style={{
            left: length(c.startMs),
            width: `max(3px, ${length(c.endMs - c.startMs)})`,
            background: c.colour,
          }}
        />
      ))}

      <div
        className="absolute inset-x-0 top-[22px] h-1.5 overflow-hidden rounded-full"
        style={{ background: "var(--color-surface-3)" }}
      >
        <div ref={bufferRef} className="h-full" style={{ background: "var(--color-line-strong)" }} />
        {focus && (
          <div
            className="absolute inset-y-0"
            style={{
              left: length(focus.startMs),
              width: length(focus.endMs - focus.startMs),
              background: "var(--color-ash-dim)",
            }}
          />
        )}
      </div>

      {inMs != null && (
        <span
          aria-hidden
          className="absolute top-[16px] h-[18px] w-0.5"
          style={{ left: length(inMs), background: "var(--color-ash)" }}
        />
      )}

      <div
        ref={headRef}
        aria-hidden
        className="pointer-events-none absolute top-[17px] h-4 w-4 -translate-x-1/2 rounded-full"
        style={{ background: "var(--color-ink)", boxShadow: "0 0 0 3px var(--color-stage)" }}
      />
    </div>
  );
}
