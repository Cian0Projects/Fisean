import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INSTALL_HINT_SNOOZE_DAYS,
  isAppleTouchDevice,
  isInstalledApp,
  isPhoneRequest,
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

test("phones are told from tablets and computers, by the client hint first", () => {
  assert.equal(isPhoneRequest(IPHONE, null), true);
  assert.equal(isPhoneRequest(ANDROID, "?1"), true);
  assert.equal(isPhoneRequest(ANDROID, null), true);
  // A modern iPad says it is a Mac; an Android tablet leaves out "Mobile".
  assert.equal(isPhoneRequest(MAC, null), false);
  assert.equal(
    isPhoneRequest("Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "?0"),
    false,
  );
  assert.equal(isPhoneRequest("Mozilla/5.0 (Android 14; Tablet; rv:131.0) Gecko/131.0 Firefox/131.0", null), false);
  assert.equal(isPhoneRequest("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Mobile/15E148", null), false);
  // The hint beats the user agent when the two disagree.
  assert.equal(isPhoneRequest(ANDROID, "?0"), false);
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
