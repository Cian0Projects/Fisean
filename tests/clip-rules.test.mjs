import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ROOM_MS,
  MIN_ROOM_MS,
  ROOM_STEP_MS,
  clampRoom,
  trimWindow,
} from "../src/lib/hurling/clip-rules.ts";

const HOUR = 60 * 60_000;

test("the dial steps in ten seconds and stops at both ends", () => {
  assert.equal(ROOM_STEP_MS, 10_000);
  assert.equal(clampRoom(MIN_ROOM_MS + ROOM_STEP_MS), 20_000);
  // Clicking minus at the bottom of the range holds rather than inverting.
  assert.equal(clampRoom(MIN_ROOM_MS - ROOM_STEP_MS), MIN_ROOM_MS);
  assert.equal(clampRoom(MAX_ROOM_MS + ROOM_STEP_MS), MAX_ROOM_MS);
});

test("the strip shows the clip plus the room asked for, either side", () => {
  const clip = { startMs: 10 * 60_000, endMs: 10 * 60_000 + 11_000 };
  const win = trimWindow(clip, 10_000, HOUR);

  assert.equal(win.startMs, clip.startMs - 10_000);
  assert.equal(win.endMs, clip.endMs + 10_000);
  // The room is what a handle can be dragged out into: ten seconds of it at
  // each end, on top of the eleven the clip already covers.
  assert.equal(win.endMs - win.startMs, 11_000 + 20_000);
});

test("more room means more to drag into, and the clip stays put", () => {
  const clip = { startMs: 5 * 60_000, endMs: 5 * 60_000 + 8000 };
  const tight = trimWindow(clip, MIN_ROOM_MS, HOUR);
  const roomier = trimWindow(clip, MIN_ROOM_MS + 3 * ROOM_STEP_MS, HOUR);

  assert.equal(roomier.endMs - roomier.startMs, tight.endMs - tight.startMs + 6 * ROOM_STEP_MS);
  // Widening the view is not a trim: it never moves the clip itself.
  assert.ok(roomier.startMs < clip.startMs && roomier.endMs > clip.endMs);
});

test("a clip against the start of the file loses the room it cannot have", () => {
  // There is no footage before zero, so the window is lopsided rather than
  // sliding off the front — which would put the clip somewhere it is not.
  const win = trimWindow({ startMs: 4000, endMs: 15_000 }, 10_000, HOUR);
  assert.equal(win.startMs, 0);
  assert.equal(win.endMs, 25_000);
});

test("a clip running to the end of the file still gets room to grow into", () => {
  // Capped at the duration when there is footage to spare...
  const midFile = trimWindow({ startMs: 100_000, endMs: 110_000 }, 10_000, HOUR);
  assert.equal(midFile.endMs, 120_000);

  // ...but a clip that already runs to the last frame keeps a window at least
  // as long as itself, so the strip never collapses to nothing.
  const atEnd = trimWindow({ startMs: HOUR - 5000, endMs: HOUR }, 10_000, HOUR);
  assert.equal(atEnd.endMs, HOUR);
  assert.ok(atEnd.endMs > atEnd.startMs);
});

test("the window always contains the clip, whatever the room", () => {
  const clip = { startMs: 30_000, endMs: 42_000 };
  for (const room of [MIN_ROOM_MS, 60_000, MAX_ROOM_MS]) {
    const win = trimWindow(clip, room, HOUR);
    assert.ok(win.startMs <= clip.startMs, `start at ${room}`);
    assert.ok(win.endMs >= clip.endMs, `end at ${room}`);
  }
});
