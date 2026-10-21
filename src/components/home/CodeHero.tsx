"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Mark } from "@/components/ui/Mark";
import { PromoVideo } from "@/components/home/PromoVideo";

/**
 * The public home page's opening screen: the pitch to the club on the left, the
 * promo film on the right, and a photograph per code held dim behind both.
 *
 * The film is the thing to look at, so the photographs only set the scene. They
 * sit under a flat dark wash, dissolve slowly into each other, and never carry
 * text or a control, which keeps three moving things (film, dissolve, push-in)
 * from competing. A visitor who prefers reduced motion gets none of the
 * dissolve or push-in, and the film does not start until they press it.
 *
 * Each code has its own photograph, never one borrowed from another code,
 * which would tell a club the wrong thing about whose game this is.
 */
/*
 * `focus` overrides the shared crop point (center 35%) for a photo whose
 * subject sits higher: the camogie and ladies football ones are nearly
 * square, so a wide hero cuts most of their height and would take the heads
 * (and the ball overhead) with it.
 */
const PHOTOS: { code: string; photo: string; focus?: string }[] = [
  { code: "Hurling", photo: "/home/codes/hurling-2026.webp" },
  { code: "Camogie", photo: "/home/codes/camogie-2026.webp", focus: "center 18%" },
  { code: "Gaelic football", photo: "/home/codes/football-2026.webp" },
  { code: "Ladies football", photo: "/home/codes/ladies-football-2026.webp", focus: "center 12%" },
];

/** How long each photograph is held before the next dissolves in. */
const HOLD_MS = 7000;

// Read through useSyncExternalStore rather than an effect, so the first paint
// already has the right answer and a change of setting is picked up live.
const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReduced(onChange: () => void) {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

export function CodeHero() {
  // `prev` is kept as well as `current` so the photo being faded out keeps
  // its slow push-in for the length of the fade, instead of snapping back.
  const [{ current, prev }, setShow] = useState({ current: 0, prev: -1 });
  const still = useReducedMotion();

  useEffect(() => {
    if (still) return;
    const timer = setInterval(
      () => setShow((s) => ({ current: (s.current + 1) % PHOTOS.length, prev: s.current })),
      HOLD_MS,
    );
    return () => clearInterval(timer);
  }, [still]);

  return (
    <section className="code-hero">
      {PHOTOS.map((slide, i) => (
        <div
          key={slide.code}
          className="code-slide"
          aria-hidden
          data-state={i === current ? "showing" : i === prev ? "leaving" : "idle"}
        >
          <Image
            src={slide.photo}
            alt=""
            fill
            sizes="100vw"
            priority={i === 0}
            className="code-slide-photo"
            style={slide.focus ? { objectPosition: slide.focus } : undefined}
          />
        </div>
      ))}
      <span className="code-shade" aria-hidden />

      <header className="code-hero-top">
        <div className="sheet flex items-center justify-between py-4">
          <Link href="/" className="flex items-center gap-3" aria-label="Ardawn home">
            <Mark className="h-7" />
            <span className="wordmark text-[25px] leading-none">Ardawn</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-5" aria-label="Main navigation">
            <a href="#how-it-works" className="hidden text-[13px] font-semibold text-ink-dim hover:text-ink sm:inline">
              How it works
            </a>
            <a href="#questions" className="hidden text-[13px] font-semibold text-ink-dim hover:text-ink sm:inline">
              Questions
            </a>
            <a href="/login" className="btn-outline">
              Sign in
            </a>
          </nav>
        </div>
      </header>

      <div className="sheet code-hero-body">
        <div>
          <h1 className="headline text-[clamp(2.9rem,5.4vw,5.6rem)]">
            Every match, ready to watch back.
          </h1>
          <p className="measure mt-6 text-[17px] leading-relaxed text-ink sm:text-[19px]">
            Video review for hurling, camogie, Gaelic football and ladies football.
            Upload the match and the whole panel can watch it on their phones, then
            clip it, keep the stats and plan training, all in one app.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <a href="/start" className="btn-brand px-6 py-3.5 text-[15px]">
              Set up your club
            </a>
            <a href="#how-it-works" className="btn-outline px-6 py-3.5 text-[15px]">
              See how it works
            </a>
          </div>
        </div>

        <div className="promo-frame">
          <PromoVideo src="/Ardawn_Promo_v3.mp4" />
        </div>
      </div>
    </section>
  );
}
