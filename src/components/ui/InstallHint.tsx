"use client";

import { useState, useSyncExternalStore } from "react";
import { isAppleTouchDevice, isInstalledApp, snoozeExpired } from "@/lib/device";
import { ShareIcon } from "@/components/ui/Icon";

const SNOOZE_KEY = "ardawn:install-hint";

/** Whether this device should be shown the hint right now. Browser only. */
function worthShowing(): boolean {
  const device = {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  };
  if (!isAppleTouchDevice(device)) return false;

  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone;
  if (isInstalledApp(standalone, window.matchMedia("(display-mode: standalone)").matches)) return false;

  let snoozedAt: number | null = null;
  try {
    const saved = localStorage.getItem(SNOOZE_KEY);
    snoozedAt = saved ? Number(saved) : null;
  } catch {
    // Private browsing can refuse storage; showing the hint is the safe default.
  }
  return snoozeExpired(snoozedAt, Date.now());
}

// Nothing here changes while the page is open, so there is nothing to subscribe to.
const never = () => () => {};

/**
 * A nudge for iPhone and iPad users to put Ardawn on their home screen.
 *
 * Android and desktop browsers offer to install a web app on their own.
 * Safari on iOS does not, and the Share menu is easy to never open, so
 * without this most players would keep opening Ardawn as a browser tab and
 * never find out it can sit on the home screen like any other app.
 *
 * It stays out of the way: nothing for anyone who is not on an iPhone or
 * iPad, nothing once it has been opened from the home screen, and "Not now"
 * holds it off for a month. The server renders nothing, and the browser only
 * fills it in once it knows the device, so it cannot flash up and vanish.
 */
export function InstallHint() {
  const eligible = useSyncExternalStore(never, worthShowing, () => false);
  const [dismissed, setDismissed] = useState(false);

  if (!eligible || dismissed) return null;

  function notNow() {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    } catch {
      // Without storage it simply comes back next visit.
    }
    setDismissed(true);
  }

  return (
    <aside
      role="region"
      aria-label="Add Ardawn to your home screen"
      className="no-print fixed inset-x-0 bottom-0 z-40 px-3"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div
        className="mx-auto flex max-w-md items-start gap-3 p-4"
        style={{
          background: "var(--color-stage)",
          border: "1px solid var(--color-line-strong)",
          borderRadius: 2,
          boxShadow: "0 6px 24px rgb(0 0 0 / 0.18)",
        }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">Keep Ardawn on your home screen</p>
          <p className="mt-1 text-[14px] leading-snug" style={{ color: "var(--color-ink-dim)" }}>
            Tap{" "}
            <span className="inline-flex translate-y-[2px] items-center gap-1 font-semibold" style={{ color: "var(--color-ink)" }}>
              <ShareIcon size={15} /> Share
            </span>
            , then <span className="font-semibold" style={{ color: "var(--color-ink)" }}>Add to Home Screen</span>. It
            opens full screen, like any other app, with no browser bar in the way.
          </p>
        </div>
        <button type="button" onClick={notNow} className="btn-ghost shrink-0 text-[13px]">
          Not now
        </button>
      </div>
    </aside>
  );
}
