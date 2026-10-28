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
 *
 * The picture itself takes taps: one plays or pauses, two on either half
 * skip ten seconds that way (see taps.ts). Full screen leaves every other
 * control behind, so the stage brings its own bar along: play, the time and
 * a scrub bar, faded out while the match plays and back at a touch.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerEngine, Transport } from "./engine";
import { AnnotationLayer, type Tool } from "./AnnotationLayer";
import { TAP_SKIP_MS, nextTap, sideOf, type TapRun, type TapSide } from "./taps";
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
  /** Drawn over the picture, inside the stage so it goes full screen with it. */
  overlay?: React.ReactNode;
};

/** How long the full-screen bar stays up after the last touch while playing. */
const BAR_IDLE_MS = 2500;

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
  overlay = null,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const preloadRef = useRef<HTMLVideoElement>(null);
  const [full, setFull] = useState(false);
  const [awake, setAwake] = useState(true);
  const sleepTimer = useRef<number | null>(null);
  const tapRun = useRef<TapRun | null>(null);
  const [skipped, setSkipped] = useState<{ side: TapSide; seconds: number; key: number } | null>(null);
  const flashTimer = useRef<number | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    engine.attach(v, fps);
    return () => engine.detach();
  }, [engine, src, fps]);

  // Esc, the browser's own control or the F key can all leave full screen,
  // so the button reads the document rather than keeping its own count. The
  // phone puts a wrapper round the stage full screen, not the stage itself,
  // so anything holding the stage counts.
  useEffect(() => {
    const sync = () => {
      const el = document.fullscreenElement;
      setFull(!!el && !!stageRef.current && el.contains(stageRef.current));
    };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  /** Bring the full-screen bar up, and let it fade again once play has run on untouched. */
  const wake = useCallback(() => {
    setAwake(true);
    if (sleepTimer.current) clearTimeout(sleepTimer.current);
    sleepTimer.current = window.setTimeout(() => {
      if (engine.snapshot.playing) setAwake(false);
    }, BAR_IDLE_MS);
  }, [engine]);

  // Starting or stopping play by any route (space, a button, a tap) wakes
  // the bar, so it fades on play and is there to hand on pause.
  useEffect(() => {
    let playing = engine.snapshot.playing;
    const off = engine.subscribe((t) => {
      if (t.playing === playing) return;
      playing = t.playing;
      wake();
    });
    return () => {
      off();
      if (sleepTimer.current) clearTimeout(sleepTimer.current);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, [engine, wake]);

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

  const tapPicture = (e: React.MouseEvent<HTMLVideoElement>) => {
    if (drawing) return;
    wake();
    const rect = e.currentTarget.getBoundingClientRect();
    const side = sideOf(e.clientX - rect.left, rect.width);
    const tap = nextTap(tapRun.current, e.timeStamp, side);
    tapRun.current = tap.run;
    if (!tap.skip) {
      engine.toggle();
      return;
    }
    if (tap.undoToggle) engine.toggle();
    engine.nudge(side === "back" ? -TAP_SKIP_MS : TAP_SKIP_MS);
    setSkipped({ side, seconds: (tap.run.skips * TAP_SKIP_MS) / 1000, key: tap.run.at });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setSkipped(null), 700);
  };

  return (
    <div
      ref={stageRef}
      data-video-stage
      onPointerMove={full ? wake : undefined}
      className={`group relative flex-1 overflow-hidden bg-black select-none ${full && !awake ? "cursor-none" : ""}`}
    >
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
        // does. Clicking the picture is the way back to playing, and two
        // clicks on a side skip. `manipulation` stops a phone reading the
        // double tap as a zoom.
        onClick={tapPicture}
        style={{ touchAction: "manipulation" }}
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

      {overlay}

      {skipped && (
        <div
          key={skipped.key}
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 z-10 flex w-1/3 items-center justify-center ${
            skipped.side === "back" ? "left-0" : "right-0"
          }`}
        >
          <span
            className="tabular rounded-full px-3.5 py-1.5 text-[15px] font-semibold text-white"
            style={{ background: "rgb(0 0 0 / 0.55)" }}
          >
            {skipped.side === "back" ? "−" : "+"}
            {skipped.seconds}s
          </span>
        </div>
      )}

      {full ? (
        <StageBar
          engine={engine}
          visible={awake}
          onExit={() => toggleStageFullscreen(stageRef.current)}
          onUse={wake}
        />
      ) : (
        /*
          Out of the way in the corner, and faint until the pointer is over
          the picture, so it never sits on a play being reviewed. Above the
          drawing layer, so it still works while a coach is annotating.
        */
        <button
          type="button"
          onClick={() => toggleStageFullscreen(stageRef.current)}
          title="Full screen (F)"
          aria-label="Full screen"
          className="absolute right-3 bottom-3 z-10 flex h-9 w-9 items-center justify-center rounded-[2px] text-white opacity-60 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          style={{ background: "rgb(0 0 0 / 0.55)" }}
        >
          <FullScreenIcon size={16} />
        </button>
      )}
    </div>
  );
}

/**
 * The bar along the foot of the picture in full screen, where the page's own
 * timeline and transport cannot follow. One scrub bar the width of the
 * screen with a touch area a thumb can hit; while a clip is focused it spans
 * the clip, since every seek is held inside it anyway. Like the other
 * readouts it writes straight to the DOM from the engine, so a drag never
 * re-renders React.
 */
function StageBar({
  engine,
  visible,
  onExit,
  onUse,
}: {
  engine: PlayerEngine;
  visible: boolean;
  onExit: () => void;
  onUse: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);
  const [playing, setPlaying] = useState(() => engine.snapshot.playing);

  const range = useCallback(() => {
    const lo = engine.bounds?.startMs ?? 0;
    const hi = engine.bounds?.endMs ?? engine.snapshot.durationMs;
    return { lo, hi, span: Math.max(1, hi - lo) };
  }, [engine]);

  useEffect(
    () =>
      engine.subscribe((t) => {
        setPlaying((was) => (was === t.playing ? was : t.playing));
        const { lo, hi, span } = range();
        const pct = `${Math.min(100, Math.max(0, ((t.positionMs - lo) / span) * 100))}%`;
        if (headRef.current) headRef.current.style.left = pct;
        if (fillRef.current) fillRef.current.style.width = pct;
        if (timeRef.current) timeRef.current.textContent = `${formatClock(t.positionMs)} / ${formatClock(hi)}`;
        trackRef.current?.setAttribute("aria-valuenow", String(Math.round(t.positionMs / 1000)));
      }),
    [engine, range],
  );

  const seekTo = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { lo, span } = range();
    engine.seek(lo + Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * span);
  };

  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    engine.setDragging(false);
  };

  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-20 flex items-center gap-2 px-3 pt-10 text-white transition-opacity duration-300 ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      style={{
        background: "linear-gradient(to top, rgb(0 0 0 / 0.75), transparent)",
        paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)",
      }}
      onPointerDown={onUse}
    >
      <button
        type="button"
        onClick={() => engine.toggle()}
        aria-label={playing ? "Pause" : "Play"}
        className="flex h-11 w-11 shrink-0 items-center justify-center"
      >
        {playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
      </button>

      <div
        ref={trackRef}
        role="slider"
        aria-label="Position in the video"
        aria-valuemin={0}
        aria-valuenow={0}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") engine.nudge(-5000);
          if (e.key === "ArrowRight") engine.nudge(5000);
        }}
        className="relative h-11 min-w-0 flex-1 cursor-pointer"
        // Without this a sideways drag scrolls or swipes back instead.
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragging.current = true;
          engine.setDragging(true);
          seekTo(e.clientX);
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          onUse();
          seekTo(e.clientX);
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className="absolute inset-x-0 top-[19px] h-1.5 overflow-hidden rounded-full"
          style={{ background: "rgb(255 255 255 / 0.3)" }}
        >
          <div ref={fillRef} className="h-full" style={{ background: "rgb(255 255 255 / 0.85)" }} />
        </div>
        <div
          ref={headRef}
          aria-hidden
          className="pointer-events-none absolute top-[14px] h-4 w-4 -translate-x-1/2 rounded-full bg-white"
        />
      </div>

      <span ref={timeRef} className="tabular shrink-0 text-[13px]" />

      <button
        type="button"
        onClick={onExit}
        title="Exit full screen (F)"
        aria-label="Exit full screen"
        className="flex h-11 w-11 shrink-0 items-center justify-center"
      >
        <FullScreenIcon exit size={16} />
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
