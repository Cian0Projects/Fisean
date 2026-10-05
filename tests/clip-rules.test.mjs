import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ROOM_MS,
  MIN_ROOM_MS,
  ROOM_STEP_MS,
  MAX_CLIP_MS,
  MIN_CLIP_MS,
  PREVIEW_MAX_MS,
  clampRoom,
  nudgeEdge,
  previewClip,
  previewWindow,
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

test("a nudge moves only the end it was asked to", () => {
  const clip = { startMs: 60_000, endMs: 70_000 };
  assert.deepEqual(nudgeEdge(clip, "start", -1000, HOUR), { startMs: 59_000, endMs: 70_000 });
  assert.deepEqual(nudgeEdge(clip, "end", 1000, HOUR), { startMs: 60_000, endMs: 71_000 });
});

test("a nudge stops at the edges of the file", () => {
  assert.equal(nudgeEdge({ startMs: 400, endMs: 5000 }, "start", -1000, HOUR).startMs, 0);
  assert.equal(nudgeEdge({ startMs: HOUR - 5000, endMs: HOUR - 400 }, "end", 1000, 2 * HOUR).endMs, HOUR + 600);
  assert.equal(nudgeEdge({ startMs: HOUR - 5000, endMs: HOUR - 400 }, "end", 1000, HOUR).endMs, HOUR);
});

test("a nudge never makes a clip the server would refuse", () => {
  const short = { startMs: 10_000, endMs: 10_000 + MIN_CLIP_MS };
  // Pulling either end inwards past the minimum holds at the minimum.
  assert.equal(nudgeEdge(short, "start", 1000, HOUR).startMs, 10_000);
  assert.equal(nudgeEdge(short, "end", -1000, HOUR).endMs, 10_000 + MIN_CLIP_MS);

  const long = { startMs: 60_000, endMs: 60_000 + MAX_CLIP_MS };
  assert.equal(nudgeEdge(long, "start", -1000, HOUR).startMs, 60_000);
  assert.equal(nudgeEdge(long, "end", 1000, HOUR).endMs, 60_000 + MAX_CLIP_MS);
});

test("an unknown duration does not pin the end at zero", () => {
  assert.equal(nudgeEdge({ startMs: 0, endMs: 5000 }, "end", 1000, 0).endMs, 6000);
});

const clipAt = (startMs, lengthMs, title = "") => ({ startMs, endMs: startMs + lengthMs, title });

test("a preview comes from the start of the match, not the latest tag", () => {
  const late = clipAt(3_000_000, 10_000, "Winning point");
  const early = clipAt(60_000, 10_000, "Throw-in");
  assert.equal(previewClip([late, early]), early);
});

test("a preview prefers a named clip among the first few", () => {
  const untitled = clipAt(10_000, 10_000);
  const named = clipAt(20_000, 10_000, "Point off the left");
  assert.equal(previewClip([named, untitled]), named);
  // …but only from the first few: a named clip later on does not jump the queue.
  const fourth = clipAt(90_000, 10_000, "Goal");
  const three = [clipAt(1_000, 5_000), clipAt(2_000, 5_000), clipAt(3_000, 5_000)];
  assert.equal(previewClip([...three, fourth]), three[0]);
});

test("a flicker only stands in when nothing longer will", () => {
  const flicker = clipAt(1_000, 800, "Blink");
  const real = clipAt(5_000, 6_000);
  assert.equal(previewClip([flicker, real]), real);
  assert.equal(previewClip([flicker]), flicker);
  assert.equal(previewClip([]), null);
});

test("a preview loops a glimpse, not the whole clip", () => {
  assert.deepEqual(previewWindow({ startMs: 1_000, endMs: 60_000 }), {
    startMs: 1_000,
    endMs: 1_000 + PREVIEW_MAX_MS,
  });
  assert.deepEqual(previewWindow({ startMs: 1_000, endMs: 4_000 }), { startMs: 1_000, endMs: 4_000 });
});
