import { test } from "node:test";
import assert from "node:assert/strict";
import {
  END_GUARD_MS,
  MAX_PLAY_STEP_MS,
  SAME_FRAME_MS,
  crossedStop,
  inPlayingOrder,
  playedFrom,
  stopAt,
  stopsOf,
} from "../src/lib/hurling/stops.ts";

const top = (id, atMs) => ({ id, atMs, parentId: null });

test("stops come in playing order, and replies never stop playback", () => {
  const stops = stopsOf(
    [top("b", 10_000), top("a", 2_000), { id: "r", atMs: 5_000, parentId: "a" }],
    20_000,
  );
  assert.deepEqual(
    stops.map((s) => [s.atMs, s.comments.map((c) => c.id)]),
    [
      [2_000, ["a"]],
      [10_000, ["b"]],
    ],
  );
});

test("two comments on one frame are one stop", () => {
  const stops = stopsOf([top("a", 4_000), top("b", 4_000 + SAME_FRAME_MS)], 20_000);
  assert.equal(stops.length, 1);
  assert.deepEqual(stops[0].comments.map((c) => c.id), ["a", "b"]);
});

test("an unpinned comment stops on the first frame", () => {
  assert.equal(stopsOf([top("a", null)], 20_000)[0].atMs, 0);
});

test("a comment past a shortened clip's end stops just before it", () => {
  assert.equal(stopsOf([top("a", 30_000)], 20_000)[0].atMs, 20_000 - END_GUARD_MS);
});

test("playing through a comment's moment reaches it", () => {
  const stops = stopsOf([top("a", 10_000)], 20_000);
  assert.equal(crossedStop(stops, 9_960, 10_000)?.atMs, 10_000);
  assert.equal(crossedStop(stops, 9_980, 10_020)?.atMs, 10_000);
  // Already past it: resuming after the stop does not stop again.
  assert.equal(crossedStop(stops, 10_000, 10_040), null);
});

test("a scrub across a comment does not count as watching it", () => {
  const stops = stopsOf([top("a", 10_000)], 20_000);
  assert.equal(crossedStop(stops, 2_000, 12_000), null);
  assert.equal(crossedStop(stops, 12_000, 9_000), null);
});

test("starting a clip reaches a comment on its first frame", () => {
  const stops = stopsOf([top("a", 0)], 20_000);
  // The first frame seen after a new clip loads, or a jump back to the start.
  assert.equal(crossedStop(stops, playedFrom(null, 40), 40)?.atMs, 0);
  assert.equal(crossedStop(stops, playedFrom(15_000, 0), 0)?.atMs, 0);
  // Pressing play while parked on it moves on.
  assert.equal(crossedStop(stops, playedFrom(0, 40), 40), null);
});

test("a jump to the middle starts from where it landed", () => {
  assert.equal(playedFrom(1_000, 1_000 + MAX_PLAY_STEP_MS + 1), 1_000 + MAX_PLAY_STEP_MS + 1);
  assert.equal(playedFrom(1_000, 1_040), 1_000);
});

test("the list reads in playing order, replies under what they answer", () => {
  const list = inPlayingOrder([
    { id: "late", atMs: 9_000, parentId: null, createdAt: 1 },
    { id: "reply", atMs: null, parentId: "early", createdAt: 5 },
    { id: "early", atMs: 1_000, parentId: null, createdAt: 2 },
    { id: "start", atMs: null, parentId: null, createdAt: 3 },
  ]);
  assert.deepEqual(list.map((c) => c.id), ["start", "early", "reply", "late"]);
});

test("the drawing shows only while parked on its frame", () => {
  const stops = stopsOf([top("a", 10_000)], 20_000);
  assert.equal(stopAt(stops, 10_000)?.atMs, 10_000);
  assert.equal(stopAt(stops, 10_000 + SAME_FRAME_MS)?.atMs, 10_000);
  assert.equal(stopAt(stops, 10_500), null);
});
