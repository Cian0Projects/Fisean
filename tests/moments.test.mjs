import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_MOMENTS,
  MOMENT_LEAD_IN_MS,
  MOMENT_TAIL_MS,
  inFilter,
  involves,
  momentWindow,
  placeStat,
  reelOf,
  statMoments,
} from "../src/lib/hurling/moments.ts";

const day = Date.UTC(2026, 9, 18, 14, 0);
const whistles = { throwIn: day, halfTime: day + 33 * 60_000, secondHalf: day + 45 * 60_000 };
// One file for the whole match, started 47 seconds early and stopped over the interval.
const whole = { id: "v1", durationMs: 70 * 60_000, markers: { throwIn: 47_000, secondHalf: 34 * 60_000 } };

test("a stat logged against the footage is placed where it was logged", () => {
  assert.deepEqual(placeStat({ videoId: "v1", atMs: 90_000 }, [whole], whistles), { videoId: "v1", atMs: 90_000 });
  // Never past the end of the file.
  assert.deepEqual(placeStat({ videoId: "v1", atMs: 99 * 60_000 }, [whole], whistles), {
    videoId: "v1",
    atMs: 70 * 60_000,
  });
});

test("a stat seen on the line is placed through the whistles and the file's markers", () => {
  assert.deepEqual(placeStat({ seenAt: day + 10 * 60_000 }, [whole], whistles), {
    videoId: "v1",
    atMs: 47_000 + 10 * 60_000,
  });
  // Nothing to go on: no file position, and the line time is in the interval.
  assert.equal(placeStat({ seenAt: day + 40 * 60_000 }, [whole], whistles), null);
  assert.equal(placeStat({}, [whole], whistles), null);
});

test("a match filmed a file per half finds each half in its own file", () => {
  const first = { id: "a", durationMs: 40 * 60_000, markers: { throwIn: 5_000 } };
  const second = { id: "b", durationMs: 40 * 60_000, markers: { secondHalf: 12_000 } };
  assert.equal(placeStat({ seenAt: day + 60_000 }, [first, second], whistles).videoId, "a");
  assert.deepEqual(placeStat({ seenAt: whistles.secondHalf + 60_000 }, [first, second], whistles), {
    videoId: "b",
    atMs: 72_000,
  });
  // Timed by its logger's own clock, the same: no shared whistles needed.
  assert.deepEqual(placeStat({ half: 2, halfMs: 60_000 }, [first, second], {}), { videoId: "b", atMs: 72_000 });
});

test("a stat logged against a file that is gone falls back to the line", () => {
  assert.equal(placeStat({ videoId: "deleted", atMs: 5_000, seenAt: day + 60_000 }, [whole], whistles).videoId, "v1");
  assert.equal(placeStat({ videoId: "deleted", atMs: 5_000 }, [whole], whistles), null);
});

test("a passage starts ten seconds back and stays inside the file", () => {
  assert.deepEqual(momentWindow(60_000, 0), { startMs: 60_000 - MOMENT_LEAD_IN_MS, endMs: 60_000 + MOMENT_TAIL_MS });
  assert.deepEqual(momentWindow(4_000, 0).startMs, 0);
  assert.deepEqual(momentWindow(59_000, 60_000).endMs, 60_000);
});

test("moments come back in playing order, with the ones that cannot be placed", () => {
  const rows = [
    { id: "late", videoId: "v1", atMs: 500_000 },
    { id: "lost", seenAt: day + 40 * 60_000 },
    { id: "early", videoId: "v1", atMs: 100_000 },
  ];
  const { placed, unplaced } = statMoments(rows, [whole], whistles);
  assert.deepEqual(placed.map((m) => m.row.id), ["early", "late"]);
  assert.deepEqual(unplaced.map((r) => r.id), ["lost"]);
  assert.equal(placed[0].startMs, 100_000 - MOMENT_LEAD_IN_MS);
});

test("a delivery is the moment of whoever it was aimed at as well as whoever struck it", () => {
  const delivery = { statType: "delivery", outcome: "negative", playerNumber: 6, targetNumber: 14 };
  assert.ok(involves(delivery, 6));
  assert.ok(involves(delivery, 14));
  assert.ok(!involves(delivery, 11));
});

test("the filters narrow by number, kind, outcome and half", () => {
  const point = { statType: "shot", outcome: null, shotResult: "point", side: "us", playerNumber: 11, half: 1 };
  const wide = { statType: "shot", outcome: null, shotResult: "wide", side: "us", playerNumber: 11, half: 2 };
  const tackle = { statType: "tackle", outcome: null, playerNumber: 5, half: 1 };

  assert.ok(inFilter(point, ALL_MOMENTS));
  assert.ok(!inFilter(tackle, { ...ALL_MOMENTS, number: 11 }));
  assert.ok(!inFilter(tackle, { ...ALL_MOMENTS, types: ["shot"] }));
  // Outcome is read as the report reads it: a shot's comes from its result.
  assert.ok(inFilter(point, { ...ALL_MOMENTS, outcome: "positive" }));
  assert.ok(!inFilter(wide, { ...ALL_MOMENTS, outcome: "positive" }));
  assert.ok(!inFilter(wide, { ...ALL_MOMENTS, half: 1 }));
});

test("overlapping passages in one file are played as one", () => {
  const m = (id, videoId, atMs) => ({ row: { id }, videoId, atMs, ...momentWindow(atMs, 0) });
  const reel = reelOf([m("a", "v1", 60_000), m("b", "v1", 66_000), m("c", "v1", 200_000), m("d", "v2", 201_000)]);
  assert.equal(reel.length, 3);
  assert.deepEqual(reel[0].moments.map((x) => x.row.id), ["a", "b"]);
  assert.equal(reel[0].startMs, 50_000);
  assert.equal(reel[0].endMs, 66_000 + MOMENT_TAIL_MS);
  // The same stretch of time in another file is a cut, not a join.
  assert.equal(reel[2].videoId, "v2");
});
