import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LAST_WHISTLE,
  NEXT_WHISTLE,
  SKIP_MS,
  canLog,
  clockFromReading,
  clockOf,
  halfForReading,
  liveMoment,
  livePhase,
  resumeClock,
  skipClock,
} from "../src/lib/hurling/live-clock.ts";

const t0 = 1_800_000_000_000;
const min = 60_000;

test("the game moves on one whistle at a time, and stats wait for a half to be on", () => {
  const steps = [
    [{}, "not_started", "throwIn", null],
    [{ throwIn: t0 }, "first_half", "halfTime", "throwIn"],
    [{ throwIn: t0, halfTime: t0 + 32 * min }, "half_time", "secondHalf", "halfTime"],
    [{ throwIn: t0, halfTime: t0 + 32 * min, secondHalf: t0 + 45 * min }, "second_half", "fullTime", "secondHalf"],
    [{ throwIn: t0, halfTime: 1, secondHalf: t0 + 45 * min, fullTime: t0 + 80 * min }, "full_time", null, "fullTime"],
  ];
  for (const [w, phase, next, last] of steps) {
    assert.equal(livePhase(w), phase);
    assert.equal(NEXT_WHISTLE[phase], next);
    assert.equal(LAST_WHISTLE[phase], last);
  }
  assert.deepEqual(
    ["not_started", "first_half", "half_time", "second_half", "full_time"].map(canLog),
    [false, true, false, true, false],
  );
  // Joined late in the second half: no half time was ever tapped, and none is needed.
  assert.equal(livePhase({ throwIn: t0, secondHalf: t0 + 40 * min }), "second_half");
});

test("an entry takes its half and its time into it from the logger's own clock", () => {
  const w = { throwIn: t0 };
  assert.deepEqual(liveMoment(t0 + 14 * min, w), { half: 1, halfMs: 14 * min });
  // A first half deep in stoppage time is still the first half until half time is tapped.
  assert.deepEqual(liveMoment(t0 + 41 * min, w), { half: 1, halfMs: 41 * min });
  assert.equal(liveMoment(t0 + 33 * min, { ...w, halfTime: t0 + 32 * min }), null);
  assert.deepEqual(liveMoment(t0 + 50 * min, { ...w, halfTime: 1, secondHalf: t0 + 45 * min }), {
    half: 2,
    halfMs: 5 * min,
  });
  assert.equal(liveMoment(t0, {}), null);

  // The second half's clock counts on from the half length.
  assert.equal(clockOf(2, 5 * min, 30), 35 * min);
  assert.equal(clockOf(1, 5 * min, 30), 5 * min);
});

test("a clock typed in by hand picks its half without being asked", () => {
  assert.equal(halfForReading(15 * min, "not_started", 30), 1);
  assert.equal(halfForReading(45 * min, "not_started", 30), 2);
  assert.equal(halfForReading(30 * min, "half_time", 30), 2);
  // 31:30 in the first half is stoppage time, not the second half.
  assert.equal(halfForReading(31.5 * min, "first_half", 30), 1);
  assert.equal(halfForReading(55 * min, "first_half", 30), 2);
  assert.equal(halfForReading(10 * min, "second_half", 30), 2);
});

test("setting the clock by hand gives whole whistles, in an order the game could be in", () => {
  const now = t0 + 50 * min;
  // Joined late at 15:30: throw-in went 15 and a half minutes ago, and nothing after it.
  assert.deepEqual(clockFromReading(15.5 * min, 1, now, { throwIn: t0, halfTime: t0 + 1 }, 30), {
    whistles: { throwIn: now - 15.5 * min, halfTime: null, secondHalf: null, fullTime: null },
  });
  // 40:00 in the second half, with throw-in and half time already tapped: both kept.
  const tapped = { throwIn: t0, halfTime: t0 + 31 * min, secondHalf: null };
  assert.deepEqual(clockFromReading(40 * min, 2, now, tapped, 30), {
    whistles: { throwIn: t0, halfTime: t0 + 31 * min, secondHalf: now - 10 * min, fullTime: null },
  });
  assert.match(clockFromReading(20 * min, 2, now, {}, 30).error, /starts at 30:00/);
});

test("skipping moves the half that is on, and never back past its start", () => {
  const at = t0 + 10 * min;
  const reads = (w) => liveMoment(at, w).halfMs;
  assert.equal(reads(skipClock({ throwIn: t0 }, SKIP_MS, at)), 10 * min + 15_000);
  assert.equal(reads(skipClock({ throwIn: t0 }, -SKIP_MS, at)), 10 * min - 15_000);
  // Back 15s at 0:08 stops at 0:00.
  assert.equal(liveMoment(t0 + 8_000, skipClock({ throwIn: t0 }, -SKIP_MS, t0 + 8_000)).halfMs, 0);
  // The second half moves its own start; the first half's is left alone.
  const second = skipClock({ throwIn: t0, halfTime: t0 + 31 * min, secondHalf: t0 + 45 * min }, SKIP_MS, t0 + 50 * min);
  assert.equal(second.throwIn, t0);
  assert.equal(second.secondHalf, t0 + 45 * min - 15_000);
  // Over half time nothing is running.
  const interval = { throwIn: t0, halfTime: t0 + 31 * min };
  assert.deepEqual(skipClock(interval, SKIP_MS, at), interval);
});

test("a paused clock carries on from where it stopped", () => {
  // Paused at 12:00, resumed five minutes later: still 12:00.
  const pausedAt = t0 + 12 * min;
  const now = pausedAt + 5 * min;
  assert.equal(liveMoment(now, resumeClock({ throwIn: t0 }, pausedAt, now)).halfMs, 12 * min);
});
