import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LAST_WHISTLE,
  NEXT_WHISTLE,
  canLog,
  clockFromReading,
  clockOf,
  clockShift,
  halfForReading,
  liveMoment,
  livePhase,
  shiftedHalfMs,
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

test("moving a half's start moves that half's entries, and only that half's", () => {
  // Throw-in was tapped 20 seconds late: set back 20 seconds, every 1st half entry is 20 seconds further in.
  const shift = clockShift({ throwIn: t0, secondHalf: t0 + 45 * min }, { throwIn: t0 - 20_000, secondHalf: t0 + 45 * min });
  assert.deepEqual(shift, { 1: -20_000, 2: 0 });
  assert.equal(shiftedHalfMs(60_000, shift[1]), 80_000);
  // Started late in the second half, no first-half start before: nothing in the 1st half moves.
  assert.deepEqual(clockShift({}, { throwIn: t0, secondHalf: t0 + 40 * min }), { 1: 0, 2: 0 });
  // Never before the half started.
  assert.equal(shiftedHalfMs(5_000, 20_000), 0);
});
