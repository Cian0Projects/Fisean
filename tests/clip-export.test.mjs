import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMMENT_PLACES,
  MAX_HOLD_MS,
  MIN_HOLD_MS,
  cardOrigin,
  exportFileName,
  exportLengthMs,
  exportStops,
  holdMs,
} from "../src/lib/hurling/clip-export.ts";

const say = (atMs, body, parentId = null) => ({ atMs, body, parentId });
const box = { x: 100, y: 200, w: 1000, h: 600 };
const card = { w: 300, h: 100 };

test("a short comment is held long enough to take in the frame", () => {
  assert.equal(holdMs({ atMs: 0, comments: [say(0, "Marking")] }), MIN_HOLD_MS);
  assert.equal(holdMs({ atMs: 0, comments: [say(0, "")] }), MIN_HOLD_MS);
});

test("a longer comment is held longer, up to a cap", () => {
  const some = holdMs({ atMs: 0, comments: [say(0, "x".repeat(60))] });
  assert.ok(some > MIN_HOLD_MS && some < MAX_HOLD_MS);
  assert.equal(holdMs({ atMs: 0, comments: [say(0, "x".repeat(5000))] }), MAX_HOLD_MS);
});

test("comments on one frame are read together", () => {
  const one = holdMs({ atMs: 0, comments: [say(0, "x".repeat(60))] });
  const two = holdMs({ atMs: 0, comments: [say(0, "x".repeat(60)), say(50, "x".repeat(60))] });
  assert.ok(two > one);
});

test("stops come in playing order with a hold each, and replies are not stops", () => {
  const stops = exportStops([say(4000, "later"), say(1000, "first"), say(1000, "reply", "p")], 10_000);
  assert.deepEqual(stops.map((s) => s.atMs), [1000, 4000]);
  assert.ok(stops.every((s) => s.holdMs >= MIN_HOLD_MS));
});

test("the video runs the clip plus every wait, or just the clip with comments off", () => {
  const comments = [say(1000, "a"), say(5000, "b")];
  assert.equal(exportLengthMs(comments, 10_000, false), 10_000);
  assert.equal(exportLengthMs(comments, 10_000, true), 10_000 + 2 * MIN_HOLD_MS);
  assert.equal(exportLengthMs([], 10_000, true), 10_000);
});

test("a card sits in each of the nine places, kept clear of the edge", () => {
  const at = (p) => cardOrigin(p, box, card, 20);
  assert.deepEqual(at("top-left"), { x: 120, y: 220 });
  assert.deepEqual(at("top-right"), { x: 100 + 1000 - 20 - 300, y: 220 });
  assert.deepEqual(at("bottom-left"), { x: 120, y: 200 + 600 - 20 - 100 });
  assert.deepEqual(at("bottom-right"), { x: 780, y: 680 });
  assert.deepEqual(at("middle"), { x: 450, y: 450 });
  assert.deepEqual(at("top"), { x: 450, y: 220 });
  assert.deepEqual(at("left"), { x: 120, y: 450 });
  assert.equal(COMMENT_PLACES.length, 9);
});

test("a card larger than the picture is pinned inside it, not hung off", () => {
  const { x, y } = cardOrigin("bottom-right", box, { w: 2000, h: 900 }, 20);
  assert.equal(x, box.x);
  assert.equal(y, box.y);
});

test("file names are safe on a phone and a laptop", () => {
  assert.equal(exportFileName("Puck-outs: 2nd half / Cuala"), "puck-outs-2nd-half-cuala");
  assert.equal(exportFileName("   "), "playlist");
  assert.equal(exportFileName("???", "clip"), "clip");
});
