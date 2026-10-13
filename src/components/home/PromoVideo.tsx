"use client";

import { useRef, useState } from "react";

/**
 * The promo on the public home page. It plays on arrival, muted and on a loop,
 * because browsers only allow autoplay without sound, and a banner that stops
 * on its last frame looks broken. No controls or scrub bar: it is a picture,
 * not a player. A click (or Enter/Space, since it is a button) pauses it, and a
 * play mark shows only while paused, so nothing sits over the footage as it runs.
 */
export function PromoVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);

  function toggle() {
    const video = ref.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="relative block w-full cursor-pointer"
      aria-label={paused ? "Play the promo video" : "Pause the promo video"}
    >
      <video
        ref={ref}
        className="block aspect-[16/10] h-full w-full object-cover"
        src={src}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
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
  );
}
