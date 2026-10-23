import { test } from "node:test";
import assert from "node:assert/strict";
import { DOUBLE_TAP_MS, RUN_TAP_MS, nextTap, sideOf } from "../src/components/player/taps.ts";

test("the left half of the picture goes back, the right half forward", () => {
  assert.equal(sideOf(10, 400), "back");
  assert.equal(sideOf(199, 400), "back");
  assert.equal(sideOf(200, 400), "forward");
  assert.equal(sideOf(390, 400), "forward");
});

test("one tap is a play or pause, and a quick second on the same side skips and undoes it", () => {
  const first = nextTap(null, 1000, "forward");
  assert.equal(first.skip, false);
  const second = nextTap(first.run, 1000 + DOUBLE_TAP_MS - 50, "forward");
  assert.deepEqual([second.skip, second.undoToggle], [true, true]);
});

test("each quick tap after a double skips again, with nothing more to undo", () => {
  let { run } = nextTap(null, 0, "back");
  ({ run } = nextTap(run, 200, "back"));
  const third = nextTap(run, 200 + RUN_TAP_MS - 50, "back");
  assert.deepEqual([third.skip, third.undoToggle, third.run.skips], [true, false, 2]);
});

test("too slow, or on the other half, starts again as a single tap", () => {
  const first = nextTap(null, 0, "forward");
  assert.equal(nextTap(first.run, DOUBLE_TAP_MS + 1, "forward").skip, false);
  assert.equal(nextTap(first.run, 100, "back").skip, false);
});
