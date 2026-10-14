"use client";

/**
 * The video surface: the visible element, a hidden preloader beside it, and
 * the annotation overlay on top.
 *
 * The second <video> is the trick that makes playlist playback feel like an
 * editor rather than a website. While clip N plays on element A, element B
 * holds the same source pre-seeked to clip N+1's in point. Swapping them at
 * the boundary starts the next clip immediately instead of showing a spinner
 * between every clip. Because clips are ranges over one file, B usually
 * shares A's HTTP cache while keeping its own decode pipeline.
 *
 * B must be muted and playsInline or iOS will refuse to start it
 * programmatically; it is unmuted on the swap, which follows a user gesture.
 */
import { useEffect, useRef, useState } from "react";
import type { PlayerEngine, Transport } from "./engine";
import { AnnotationLayer, type Tool } from "./AnnotationLayer";
import type { Shape } from "@/lib/db/schema";
import { FullScreenIcon, PauseIcon, PlayIcon } from "@/components/ui/Icon";
import { formatClock, formatClockPrecise, toGameTime, type Markers } from "@/lib/hurling/notation";

type Props = {
  engine: PlayerEngine;
  src: string;
  fps?: number;
  poster?: string;
  shapes?: Shape[];
  onShapesChange?: (shapes: Shape[]) => void;
  drawing?: boolean;
  tool?: Tool;
  colour?: string;
  /** In point of the clip queued next, so the hidden element can pre-seek. */
  preloadMs?: number | null;
};

export function VideoStage({
  engine,
  src,
  fps,
  poster,
  shapes = [],
  onShapesChange,
  drawing = false,
  tool = "arrow",
  colour,
  preloadMs = null,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const preloadRef = useRef<HTMLVideoElement>(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    engine.attach(v, fps);
    return () => engine.detach();
  }, [engine, src, fps]);

  // Esc, the browser's own control or the F key can all leave full screen,
  // so the button reads the document rather than keeping its own count.
  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  // Keep the shadow element parked on whatever is coming next.
  useEffect(() => {
    const p = preloadRef.current;
    if (!p || preloadMs == null) return;
    const target = preloadMs / 1000;
    if (Math.abs(p.currentTime - target) > 0.25) {
      try {
        p.currentTime = target;
      } catch {
        // Metadata not loaded yet; the next effect run will catch it.
      }
    }
  }, [preloadMs, src]);

  return (
    <div ref={stageRef} data-video-stage className="group relative flex-1 overflow-hidden bg-black">
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        // `metadata` is not enough — scrubbing needs the browser willing to
        // pull ranges eagerly.
        preload="auto"
        playsInline
        className="h-full w-full object-contain"
        onContextMenu={(e) => e.preventDefault()}
        // The keyboard is the fast path, but it only reaches the transport
        // when nothing else holds focus — and while logging, something always
        // does. Clicking the picture is the way back to playing.
        onClick={() => !drawing && engine.toggle()}
      />

      <video
        ref={preloadRef}
        src={preloadMs != null ? src : undefined}
        preload="auto"
        muted
        playsInline
        aria-hidden
        tabIndex={-1}
        className="pointer-events-none absolute h-px w-px opacity-0"
      />

      <AnnotationLayer
        shapes={shapes}
        onChange={onShapesChange}
        tool={tool}
        colour={colour}
        editable={drawing}
      />

      {/*
        Out of the way in the corner, and faint until the pointer is over the
        picture, so it never sits on a play being reviewed. Above the drawing
        layer, so it still works while a coach is annotating.
      */}
      <button
        type="button"
        onClick={() => toggleStageFullscreen(stageRef.current)}
        title={full ? "Exit full screen (F)" : "Full screen (F)"}
        aria-label={full ? "Exit full screen" : "Full screen"}
        className="absolute right-3 bottom-3 z-10 flex h-9 w-9 items-center justify-center rounded-[2px] text-white opacity-60 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        style={{ background: "rgb(0 0 0 / 0.55)" }}
      >
        <FullScreenIcon exit={full} size={16} />
      </button>
    </div>
  );
}

/**
 * Put the video stage full screen, or bring it back. The stage rather than
 * the bare <video> goes full screen, so drawings stay over the picture and
 * the app's own keys (space, J K L, the tags) keep working. An iPhone cannot
 * put an element full screen, only hand the <video> to its own player.
 */
export function toggleStageFullscreen(stage: HTMLElement | null): void {
  if (!stage) return;
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => {});
    return;
  }
  if (document.fullscreenEnabled) {
    void stage.requestFullscreen().catch(() => {});
    return;
  }
  const video = stage.querySelector("video") as
    | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
    | null;
  video?.webkitEnterFullscreen?.();
}

/**
 * Play / pause, as a button.
 *
 * The transport is otherwise keyboard-only, which is right for tagging at
 * speed and wrong the moment a form has focus — a `<select>` eats the space
 * bar, and then there is nothing left to press. Play state changes at human
 * speed, so this one readout can afford React state; the bail-out in the
 * setter keeps the frame-rate updates from re-rendering anything.
 */
export function PlayToggle({ engine }: { engine: PlayerEngine }) {
  const [playing, setPlaying] = useState(false);

  useEffect(
    () => engine.subscribe((t) => setPlaying((was) => (was === t.playing ? was : t.playing))),
    [engine],
  );

  return (
    <button
      onClick={() => engine.toggle()}
      title={playing ? "Pause" : "Play"}
      className="btn-outline shrink-0 text-xs"
    >
      {playing ? <PauseIcon size={11} /> : <PlayIcon size={11} />}
      {playing ? "Pause" : "Play"}
      <span className="kbd">Space</span>
    </button>
  );
}

/**
 * Timecode that updates itself.
 *
 * Subscribes to the engine and writes into a DOM node, so the clock can tick
 * at frame rate without React re-rendering anything around it.
 */
export function Timecode({
  engine,
  markers,
  halfLengthMin,
  precise = false,
}: {
  engine: PlayerEngine;
  markers: Markers;
  halfLengthMin: number;
  precise?: boolean;
}) {
  const fileRef = useRef<HTMLSpanElement>(null);
  const gameRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const render = (t: Transport) => {
      if (fileRef.current) {
        fileRef.current.textContent = precise
          ? formatClockPrecise(t.positionMs)
          : formatClock(t.positionMs);
      }
      if (gameRef.current) {
        gameRef.current.textContent = toGameTime(t.positionMs, markers, halfLengthMin).label;
      }
    };
    return engine.subscribe(render);
  }, [engine, markers, halfLengthMin, precise]);

  return (
    <div className="tabular flex items-baseline gap-2">
      <span ref={gameRef} className="text-sm font-semibold" style={{ color: "var(--color-ink)" }} />
      <span ref={fileRef} className="text-xs" style={{ color: "var(--color-ink-faint)" }} />
    </div>
  );
}

/** Shows the shuttle rate so a coach knows they are running at 4×, not 1×. */
export function RateBadge({ engine }: { engine: PlayerEngine }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(
    () =>
      engine.subscribe((t) => {
        if (!ref.current) return;
        if (!t.playing || t.rate === 0) {
          ref.current.textContent = "";
          ref.current.style.opacity = "0";
          return;
        }
        ref.current.style.opacity = "1";
        ref.current.textContent =
          t.rate < 0 ? `Reverse ${Math.abs(t.rate)}×` : t.rate === 1 ? "" : `${t.rate}×`;
      }),
    [engine],
  );

  return (
    <span
      ref={ref}
      className="tabular rounded-[2px] px-1.5 py-0.5 text-[11px] font-semibold transition-opacity"
      style={{ background: "var(--color-surface-3)", color: "var(--color-ink)", opacity: 0 }}
    />
  );
}
