"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The promo on the public home page. It plays on arrival, muted and on a loop,
 * because browsers only allow autoplay without sound, and a banner that stops
 * on its last frame looks broken. No controls or scrub bar: it is a picture,
 * not a player. A click (or Enter/Space, since it is a button) pauses it, and a
 * play mark shows only while paused, so nothing sits over the footage as it runs.
 *
 * The one exception is a small full screen button in the corner, shown on hover
 * or focus (and always on touch screens, which have no hover). Once full screen
 * the browser's own controls come on, because that is the point where someone
 * has chosen to watch it as a video rather than glance at it as a picture.
 */
export function PromoVideo({
  src,
  poster,
  ratio = "aspect-video",
}: {
  src: string;
  poster?: string;
  /** A Tailwind aspect class, for footage that is not 16:9 (a phone film is 9:16). */
  ratio?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [full, setFull] = useState(false);

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggle() {
    const video = ref.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }

  function enterFullScreen() {
    const video = ref.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;
    if (!video) return;
    // iPhone Safari has no Fullscreen API on elements, only its own video
    // player, which it opens with controls of its own.
    if (video.requestFullscreen) void video.requestFullscreen().catch(() => {});
    else video.webkitEnterFullscreen?.();
    void video.play();
  }

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={toggle}
        className="relative block w-full cursor-pointer"
        aria-label={paused ? "Play the promo video" : "Pause the promo video"}
      >
        <video
          ref={ref}
          className={`block ${ratio} h-auto w-full ${full ? "object-contain" : "object-cover"}`}
          src={src}
          poster={poster}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          controls={full}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
        >
          Your browser does not support the Ardawn promo video.
        </video>
        {paused && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/30" aria-hidden>
            <span className="grid h-16 w-16 place-items-center rounded-full bg-black/60">
              <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7 fill-[var(--ardawn-paper)]">
                <path d="M7 4.5v15l13-7.5z" />
              </svg>
            </span>
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={enterFullScreen}
        className="absolute right-3 bottom-3 inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-black/65 px-4 text-[13px] font-semibold text-[var(--ardawn-paper)] opacity-0 transition-opacity duration-300 group-hover:opacity-100 hover:bg-black/80 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        aria-label="Watch the promo video full screen"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 fill-none stroke-current"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
        Full screen
      </button>
    </div>
  );
}
