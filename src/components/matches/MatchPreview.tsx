"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PlayIcon } from "@/components/ui/Icon";
import { formatClock } from "@/lib/hurling/notation";

/**
 * One of the match's first few clips and the footage it lives in — or, for a
 * match with no clips yet, a frame from the footage itself (`clipId` null).
 */
export type PreviewSource = {
  clipId: string | null;
  videoId: string;
  /** The footage URL; the preview seeks inside it rather than fetching a copy. */
  src: string;
  title: string;
  startMs: number;
  /** Already cut to the preview's loop length. */
  endMs: number;
};

/**
 * A match's thumbnail, made of its own footage.
 *
 * There is no ffmpeg to render a poster frame, so the preview is the video
 * itself: a muted `<video>` pointed at the match file and seeked to the start
 * of an early clip. The media route answers Range requests, so that costs the
 * file's index and one keyframe's worth of bytes — not the match.
 *
 * It rests on the clip's opening frame and plays the clip on a loop while
 * its host is under the pointer or holds focus. The host is the nearest
 * `[data-preview-host]` — a whole fixture row, so hovering anywhere along it
 * wakes its picture — or the preview itself. Nothing loads until the preview
 * is near the viewport, so a season of fixtures does not open twenty files
 * at once, and nothing plays for anyone who has asked for reduced motion.
 */
export function MatchPreview({
  preview,
  size,
  empty,
  fallback = null,
}: {
  preview: PreviewSource | null;
  size: "lead" | "row";
  /** Said in the slot when there is nothing to show. */
  empty: string;
  /** Shown instead when there is no picture — the cover's shot map. */
  fallback?: React.ReactNode;
}) {
  const box = useRef<HTMLAnchorElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [ready, setReady] = useState(false);
  // A file the browser cannot decode (HEVC on Windows Chrome, a truncated
  // upload) falls back to the empty slot rather than a black box forever.
  const [failed, setFailed] = useState(false);

  const frame =
    size === "lead" ? "aspect-video w-full" : "aspect-video w-24 shrink-0 sm:w-32";

  useEffect(() => {
    const el = box.current;
    if (!el || !preview) return;
    const seen = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          seen.disconnect();
        }
      },
      { rootMargin: "240px" },
    );
    seen.observe(el);
    return () => seen.disconnect();
  }, [preview]);

  useEffect(() => {
    const v = video.current;
    const el = box.current;
    if (!near || !v || !el || !preview) return;

    const host = el.closest<HTMLElement>("[data-preview-host]") ?? el;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const start = preview.startMs / 1000;
    const end = preview.endMs / 1000;

    const play = () => {
      if (still.matches) return;
      if (v.currentTime < start || v.currentTime >= end) v.currentTime = start;
      // A play() interrupted by a quick pointer-out rejects; that is fine.
      v.play().catch(() => {});
    };
    const rest = () => {
      v.pause();
      v.currentTime = start;
    };
    const loop = () => {
      if (v.currentTime >= end) v.currentTime = start;
    };

    host.addEventListener("pointerenter", play);
    host.addEventListener("pointerleave", rest);
    host.addEventListener("focusin", play);
    host.addEventListener("focusout", rest);
    v.addEventListener("timeupdate", loop);
    return () => {
      host.removeEventListener("pointerenter", play);
      host.removeEventListener("pointerleave", rest);
      host.removeEventListener("focusin", play);
      host.removeEventListener("focusout", rest);
      v.removeEventListener("timeupdate", loop);
    };
  }, [near, preview]);

  if (!preview || failed) {
    if (fallback) return <>{fallback}</>;
    // On the cover, an empty slot is a line of text, not a dashed box the
    // size of a picture: the biggest thing on the page should be something.
    // A fixture row keeps its box so the list stays aligned.
    if (size === "lead") {
      return <p className="caption">{preview ? "This footage will not play in this browser." : empty}</p>;
    }
    return (
      <div
        className={`${frame} flex items-center justify-center border-[1.5px] border-dashed px-2 text-center`}
        style={{ borderColor: "var(--color-line-strong)", borderRadius: 2 }}
      >
        <span className="caption">{preview ? "Will not play here" : empty}</span>
      </div>
    );
  }

  const start = preview.startMs / 1000;

  return (
    <Link
      ref={box}
      href={preview.clipId ? `/review/${preview.videoId}?clip=${preview.clipId}` : `/review/${preview.videoId}`}
      aria-label={
        preview.clipId
          ? `Watch ${preview.title || "the opening clip"}, at ${formatClock(preview.startMs)}`
          : "Watch the match"
      }
      className={`${frame} relative block overflow-hidden`}
      // Black while the first frame loads, whatever the page around it, so the
      // thumbnail never flashes a colour the footage is not. Literal rather
      // than a token: a video frame is not part of the palette.
      style={{ background: "#000", borderRadius: 2 }}
    >
      {near && (
        <video
          ref={video}
          // The media fragment has the browser fetch and paint the clip's
          // first frame on its own, before any script runs.
          src={`${preview.src}#t=${start}`}
          muted
          playsInline
          preload="metadata"
          disablePictureInPicture
          disableRemotePlayback
          tabIndex={-1}
          aria-hidden
          onLoadedMetadata={(e) => {
            if (e.currentTarget.currentTime < start) e.currentTarget.currentTime = start;
          }}
          onLoadedData={() => setReady(true)}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition-opacity duration-300"
          style={{ opacity: ready ? 1 : 0 }}
        />
      )}

      {size === "lead" ? (
        <span
          className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 py-2 text-[12px]"
          style={{ background: "rgb(0 0 0 / 0.72)", color: "#eceef2" }}
        >
          <PlayIcon size={10} />
          <span className="min-w-0 flex-1 truncate font-semibold">
            {preview.title || (preview.clipId ? "Opening clip" : "From the match")}
          </span>
          <span className="tabular shrink-0 opacity-75">{formatClock(preview.startMs)}</span>
        </span>
      ) : (
        <span
          aria-hidden
          className="absolute bottom-1 left-1 flex h-5 w-5 items-center justify-center"
          style={{
            background: "rgb(0 0 0 / 0.72)",
            color: "#eceef2",
            borderRadius: 2,
          }}
        >
          <PlayIcon size={9} />
        </span>
      )}
    </Link>
  );
}
