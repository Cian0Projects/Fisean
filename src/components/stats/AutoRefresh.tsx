"use client";

/**
 * Keeps a live page current: the summary held up in the dressing room picks
 * up the last stats logged in the stand without anyone touching it.
 *
 * A plain re-render of the server page every so often, only while the page
 * is on screen, so a laptop left in a bag fetches nothing. No socket and no
 * new dependency: a stat sheet changes a few times a minute at most.
 *
 * It says when it last checked, in the viewer's own time, because dressing
 * room signal is poor and a page that stopped updating has to say so rather
 * than look current.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ everySeconds = 20 }: { everySeconds?: number }) {
  const router = useRouter();
  const [checked, setChecked] = useState(() => new Date());
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (!navigator.onLine) {
        setStale(true);
        return;
      }
      router.refresh();
      setStale(false);
      setChecked(new Date());
    };
    const timer = setInterval(tick, everySeconds * 1000);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, everySeconds]);

  const time = checked.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (
    <span suppressHydrationWarning className="text-[13px]" style={{ color: stale ? "var(--color-danger-ink)" : "var(--color-ink-faint)" }}>
      {stale ? `No signal. Showing what was in at ${time}.` : `Updates itself. Last checked ${time}.`}
    </span>
  );
}
