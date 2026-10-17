"use client";

import { useEffect } from "react";

/**
 * Plays each `[data-reveal]` element on the home page into place the first
 * time it is scrolled to: the words rise, the screenshot slides in from its
 * own side. The styles are `[data-reveal]` in globals.css.
 *
 * The page is rendered with everything visible, and only this script hides
 * what is still below the fold, so a page whose script never runs is simply a
 * page standing still rather than one with holes in it. Anything already on
 * screen when the page opens is left alone, so nothing blinks out and back.
 * A visitor who has asked for less motion gets no animation at all.
 *
 * A one-off animation rather than one tied to the scroll position: tied to
 * the scroll, a quick flick of the wheel ran it in a few frames and it went
 * unseen.
 */
export function RevealOnScroll() {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.reveal = "shown";
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.2 },
    );

    for (const el of document.querySelectorAll<HTMLElement>("[data-reveal]")) {
      if (el.getBoundingClientRect().top < window.innerHeight) continue;
      el.dataset.reveal = "waiting";
      observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return null;
}
