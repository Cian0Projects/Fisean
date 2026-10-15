import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INSTALL_HINT_SNOOZE_DAYS,
  isAppleTouchDevice,
  isInstalledApp,
  snoozeExpired,
} from "../src/lib/device.ts";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

test("an iPhone is recognised by its user agent", () => {
  assert.equal(isAppleTouchDevice({ userAgent: IPHONE, platform: "iPhone", maxTouchPoints: 5 }), true);
});

test("a modern iPad, which says it is a Mac, is told apart by its touch screen", () => {
  assert.equal(isAppleTouchDevice({ userAgent: MAC, platform: "MacIntel", maxTouchPoints: 5 }), true);
});

test("a real Mac, an Android phone and Windows are not", () => {
  assert.equal(isAppleTouchDevice({ userAgent: MAC, platform: "MacIntel", maxTouchPoints: 0 }), false);
  assert.equal(isAppleTouchDevice({ userAgent: ANDROID, platform: "Linux armv81", maxTouchPoints: 5 }), false);
  assert.equal(isAppleTouchDevice({ userAgent: "Windows NT 10.0", platform: "Win32", maxTouchPoints: 10 }), false);
});

test("opened from the home screen counts as installed, either way the browser says it", () => {
  assert.equal(isInstalledApp(true, false), true);
  assert.equal(isInstalledApp(undefined, true), true);
  assert.equal(isInstalledApp(false, false), false);
  assert.equal(isInstalledApp(undefined, false), false);
});

test("'Not now' holds for a month, and a missing or broken record never blocks the prompt", () => {
  const day = 24 * 3600 * 1000;
  const now = 100 * day;
  assert.equal(snoozeExpired(now - 5 * day, now), false);
  assert.equal(snoozeExpired(now - (INSTALL_HINT_SNOOZE_DAYS + 1) * day, now), true);
  assert.equal(snoozeExpired(null, now), true);
  assert.equal(snoozeExpired(Number.NaN, now), true);
});
