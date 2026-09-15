import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatClock,
  formatScore,
  formatScoreWithTotal,
  markersFromRows,
  parseScore,
  scoreMargin,
  scoreTotal,
  tallyScore,
  toGameTime,
} from "../src/lib/hurling/notation.ts";

test("a goal is worth three points", () => {
  assert.equal(scoreTotal({ cul: 1, cuilin: 12 }), 15);
  assert.equal(scoreTotal({ cul: 0, cuilin: 14 }), 14);
  assert.equal(scoreTotal({ cul: 3, cuilin: 0 }), 9);
});

test("1-12 beats 0-14, which is the whole point of the notation", () => {
  const a = { cul: 1, cuilin: 12 };
  const b = { cul: 0, cuilin: 14 };
  assert.equal(scoreMargin(a, b), 1);
  // Naive column comparison would get this backwards.
  assert.ok(b.cuilin > a.cuilin);
});

test("scores format in GAA notation", () => {
  assert.equal(formatScore({ cul: 1, cuilin: 12 }), "1-12");
  assert.equal(formatScore({ cul: 0, cuilin: 4 }), "0-4");
  assert.equal(formatScoreWithTotal({ cul: 2, cuilin: 7 }), "2-7 (13)");
});

test("scores parse back, and rubbish is rejected", () => {
  assert.deepEqual(parseScore("1-12"), { cul: 1, cuilin: 12 });
  assert.deepEqual(parseScore("  2 - 7 "), { cul: 2, cuilin: 7 });
  assert.equal(parseScore("1–12"), null); // en dash, not a hyphen
  assert.equal(parseScore("twelve"), null);
  assert.equal(parseScore(""), null);
});

test("a scoreline rolls up from tagged events", () => {
  const tagged = [
    { scoreValue: 3 },
    { scoreValue: 1 },
    { scoreValue: 1 },
    { scoreValue: 0 }, // a wide contributes nothing
    { scoreValue: 1 },
  ];
  assert.deepEqual(tallyScore(tagged), { cul: 1, cuilin: 3 });
});

test("a two-point score counts as two in the points column", () => {
  // The 2026 hurling trials include a direct sideline cut over the bar worth
  // two points. Because scoreValue is a column, adopting it needs no code change.
  assert.deepEqual(tallyScore([{ scoreValue: 2 }, { scoreValue: 1 }]), {
    cul: 0,
    cuilin: 3,
  });
});

test("clock formatting pads seconds and grows an hour field", () => {
  assert.equal(formatClock(0), "0:00");
  assert.equal(formatClock(9_000), "0:09");
  assert.equal(formatClock(75_000), "1:15");
  assert.equal(formatClock(3_600_000), "1:00:00");
  assert.equal(formatClock(5_415_000), "1:30:15");
  // Negative positions can arrive from a nudge below zero.
  assert.equal(formatClock(-500), "0:00");
});

test("markers convert file position to game clock", () => {
  const markers = markersFromRows([
    { kind: "throw_in", atMs: 90_000 },
    { kind: "half_time", atMs: 31 * 60_000 },
    { kind: "second_half", atMs: 33 * 60_000 },
  ]);

  // 90s in is the throw-in itself.
  assert.equal(toGameTime(90_000, markers, 30).phase, "first_half");

  // Ten minutes of footage after throw-in is the 8:30 mark of the first half.
  const firstHalf = toGameTime(90_000 + 8 * 60_000 + 30_000, markers, 30);
  assert.equal(firstHalf.half, 1);
  assert.equal(firstHalf.label, "1st 8:30");

  // The interval.
  assert.equal(toGameTime(32 * 60_000, markers, 30).phase, "half_time");

  // Five minutes after the restart reads as the 35th minute, because the
  // game clock runs on through the second half. That is the minute a coach
  // would actually name.
  const secondHalf = toGameTime(33 * 60_000 + 5 * 60_000, markers, 30);
  assert.equal(secondHalf.half, 2);
  assert.equal(secondHalf.label, "2nd 35:00");
  assert.equal(secondHalf.gameMs, 35 * 60_000);
});

test("without a throw-in marker the clock falls back to file position", () => {
  const t = toGameTime(125_000, {}, 30);
  assert.equal(t.label, "2:05");
  assert.equal(t.half, null);
});

test("anything before throw-in is pre-match, not negative time", () => {
  const markers = { throwIn: 90_000 };
  assert.equal(toGameTime(10_000, markers, 30).phase, "pre_match");
  assert.equal(toGameTime(10_000, markers, 30).gameMs, 0);
});

test("35-minute halves shift the second-half clock accordingly", () => {
  const markers = { throwIn: 0, halfTime: 35 * 60_000, secondHalf: 50 * 60_000 };
  const t = toGameTime(50 * 60_000 + 60_000, markers, 35);
  assert.equal(t.label, "2nd 36:00");
});
