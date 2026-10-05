"use client";

/**
 * The scrub bar.
 *
 * The playhead moves 25–60 times a second. Routing that through React state
 * would re-render the whole workspace on every frame, so instead this
 * subscribes to the engine directly and writes a transform onto a ref'd node.
 * React renders this component when the *clips* change, which happens at
 * human speed.
 */
import { useCallback, useEffect, useRef } from "react";
import type { PlayerEngine } from "./engine";
import { formatClock, toGameTime, type Markers } from "@/lib/hurling/notation";

export type TimelineClip = {
  id: string;
  startMs: number;
  endMs: number;
  colour: string;
  title: string;
};

type Props = {
  engine: PlayerEngine;
  durationMs: number;
  clips: TimelineClip[];
  markers: Markers;
  halfLengthMin: number;
  selectedClipId?: string | null;
  inMs: number | null;
  outMs: number | null;
  onSelectClip?: (id: string) => void;
  /**
   * Room on the left for a row label, so lanes stacked underneath share this
   * bar's time axis exactly — a playhead at 40% has to be at 40% in both.
   */
  labelGutterPx?: number;
  /**
   * Half height, for when the bar is a scrubber and nothing else. With the
   * clips hidden the full depth is empty sod, and the lanes below have a far
   * better use for it.
   */
  compact?: boolean;
};

const MARKER_LABELS: { key: keyof Markers; label: string }[] = [
  { key: "throwIn", label: "Throw-in" },
  { key: "halfTime", label: "HT" },
  { key: "secondHalf", label: "2nd" },
  { key: "fullTime", label: "FT" },
];

export function Timeline({
  engine,
  durationMs,
  clips,
  markers,
  halfLengthMin,
  selectedClipId,
  inMs,
  outMs,
  onSelectClip,
  labelGutterPx = 0,
  compact = false,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const bufferedRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const pct = useCallback(
    (ms: number) => (durationMs > 0 ? Math.min(100, Math.max(0, (ms / durationMs) * 100)) : 0),
    [durationMs],
  );

  // Move the playhead by writing to the DOM, never through React state.
  useEffect(() => {
    return engine.subscribe((t) => {
      if (playheadRef.current && durationMs > 0) {
        playheadRef.current.style.left = `${(t.positionMs / durationMs) * 100}%`;
      }
      if (bufferedRef.current && durationMs > 0) {
        bufferedRef.current.style.width = `${(t.bufferedMs / durationMs) * 100}%`;
      }
    });
  }, [engine, durationMs]);

  const msFromEvent = useCallback(
    (clientX: number): number => {
      const rect = trackRef.current!.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return ratio * durationMs;
    },
    [durationMs],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    // Tells the engine to use cheap keyframe seeks while the finger is down.
    engine.setDragging(true);
    engine.seek(msFromEvent(e.clientX));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    // Hover readout, whether or not a drag is in progress.
    if (hoverRef.current && trackRef.current) {
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const ms = ratio * durationMs;
      hoverRef.current.style.left = `${ratio * 100}%`;
      hoverRef.current.style.opacity = "1";
      hoverRef.current.textContent = toGameTime(ms, markers, halfLengthMin).label;
    }
    if (!dragging.current) return;
    engine.seek(msFromEvent(e.clientX));
  };

  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    engine.setDragging(false);
  };

  const onPointerLeave = () => {
    if (hoverRef.current) hoverRef.current.style.opacity = "0";
  };

  return (
    <div className="pt-1 pr-3 pb-3" style={{ paddingLeft: 12 + labelGutterPx }}>
      <div
        ref={trackRef}
        className={`group relative ${compact ? "h-7" : "h-14"} cursor-pointer touch-none select-none rounded-lg`}
        style={{ background: "var(--color-surface-2)" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
      >
        {/* How much is already downloaded — a seek into this range is free. */}
        <div
          ref={bufferedRef}
          className="absolute inset-y-0 left-0 rounded-lg"
          style={{ background: "var(--color-surface-3)", width: "0%" }}
        />

        {/* Half-time and the restart, so the two halves read as two halves. */}
        {MARKER_LABELS.map(({ key, label }) => {
          const at = markers[key];
          if (at == null) return null;
          return (
            <div
              key={key}
              className="pointer-events-none absolute inset-y-0 z-10 w-px"
              style={{ left: `${pct(at)}%`, background: "var(--color-line-strong)" }}
            >
              <span
                className="absolute -top-0.5 left-1 text-[10px] font-semibold whitespace-nowrap"
                style={{ color: "var(--color-ink-faint)" }}
              >
                {label}
              </span>
            </div>
          );
        })}

        {/* Saved clips. Colour comes from the clip's first hurling tag. */}
        <div className={`absolute inset-x-0 ${compact ? "bottom-1 top-3.5" : "bottom-1.5 top-6"}`}>
          {clips.map((c) => {
            const left = pct(c.startMs);
            const width = Math.max(0.35, pct(c.endMs) - left);
            const selected = c.id === selectedClipId;
            return (
              <button
                key={c.id}
                title={c.title || formatClock(c.startMs)}
                onPointerDown={(e) => {
                  // Selecting a clip must not also scrub the timeline.
                  e.stopPropagation();
                  onSelectClip?.(c.id);
                }}
                className="absolute top-0 h-full rounded-sm transition-opacity hover:opacity-100"
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  background: c.colour,
                  opacity: selected ? 1 : 0.6,
                  outline: selected ? "1.5px solid var(--color-ink)" : "none",
                  outlineOffset: "1px",
                }}
              />
            );
          })}
        </div>

        {/* The in/out region being built right now. */}
        {inMs != null && (
          <div
            className="pointer-events-none absolute inset-y-0 z-20 border-x-2"
            style={{
              left: `${pct(inMs)}%`,
              width: `${Math.max(0.2, pct(outMs ?? inMs) - pct(inMs))}%`,
              borderColor: "var(--color-mark)",
              background: "color-mix(in oklab, var(--color-mark) 18%, transparent)",
            }}
          />
        )}

        {/* Playhead. Positioned imperatively by the subscription above. */}
        <div
          ref={playheadRef}
          className="pointer-events-none absolute inset-y-0 z-30 w-0.5"
          style={{ background: "var(--color-ink)", left: "0%" }}
        >
          <div
            className="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45"
            style={{ background: "var(--color-ink)" }}
          />
        </div>

        {/* Game clock under the cursor. */}
        <div
          ref={hoverRef}
          className="tabular pointer-events-none absolute -top-6 z-30 -translate-x-1/2 rounded px-1.5 py-0.5 text-[11px] opacity-0 transition-opacity"
          style={{ background: "var(--color-surface-3)", color: "var(--color-ink)" }}
        />
      </div>

      <div
        className="tabular mt-1 flex justify-between text-[11px]"
        style={{ color: "var(--color-ink-faint)" }}
      >
        <span>0:00</span>
        <span>{formatClock(durationMs)}</span>
      </div>
    </div>
  );
}
