/**
 * Telling an iPhone or iPad from everything else, for the one prompt that
 * only they need.
 *
 * Android's browser offers its own "install app" pop-up, and a computer's
 * browser has an install icon in the address bar. Safari on iOS has neither:
 * the only way onto the home screen is Share, then Add to Home Screen, and
 * nothing tells anyone that. So we do.
 *
 * Kept free of `window` so the tests can feed it made-up values.
 */

export type DeviceHints = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
};

/**
 * An iPhone, or an iPad. Since iPadOS 13 an iPad asks for the desktop site
 * and calls itself a Mac, so its user agent no longer says iPad. A real Mac
 * has no touch screen, which is what gives an iPad away.
 */
export function isAppleTouchDevice({ userAgent, platform, maxTouchPoints }: DeviceHints): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return platform === "MacIntel" && maxTouchPoints > 1;
}

/**
 * Whether it was opened from the home screen already. iOS says so with its
 * own `navigator.standalone`; everything else uses the display-mode query.
 */
export function isInstalledApp(standaloneFlag: boolean | undefined, displayModeStandalone: boolean): boolean {
  return standaloneFlag === true || displayModeStandalone;
}

/** How long "Not now" keeps the prompt away. A month: long enough not to nag. */
export const INSTALL_HINT_SNOOZE_DAYS = 30;

export function snoozeExpired(snoozedAt: number | null, now: number): boolean {
  if (snoozedAt == null || !Number.isFinite(snoozedAt)) return true;
  return now - snoozedAt > INSTALL_HINT_SNOOZE_DAYS * 24 * 3600 * 1000;
}
