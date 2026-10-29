import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PITCH,
  clampToPitch,
  distanceToGoalM,
  lineFractions,
  normaliseDirection,
  ourEndIn,
  outsideTwoPointArc,
  shotAngleDeg,
  zoneForX,
} from "../src/lib/hurling/pitch.ts";

test("marked lines sit where the rules put them", () => {
  const { own, opp, halfway } = lineFractions({ lengthM: 145, widthM: 90 });
  assert.equal(halfway, 0.5);
  // 20m from a 145m end line.
  assert.ok(Math.abs(own[20] - 20 / 145) < 1e-9);
  // The 65 is hurling's own line; football marks a 45 instead.
  assert.ok(Math.abs(own[65] - 65 / 145) < 1e-9);
  // Mirrored at the far end.
  assert.ok(Math.abs(opp[20] - (1 - 20 / 145)) < 1e-9);
});

test("a shorter pitch moves the lines proportionally", () => {
  const short = lineFractions({ lengthM: 130, widthM: 80 });
  const long = lineFractions({ lengthM: 145, widthM: 90 });
  // The 65 is a larger fraction of a shorter pitch.
  assert.ok(short.own[65] > long.own[65]);
});

test("zones name the part of the field a coach would say", () => {
  assert.equal(zoneForX(0.05), "own_scoring_zone");
  assert.equal(zoneForX(0.5), "middle_third");
  assert.equal(zoneForX(0.97), "opp_scoring_zone");
  // Just inside the opposition 20.
  const { opp } = lineFractions(DEFAULT_PITCH);
  assert.equal(zoneForX(opp[20] + 0.01), "opp_scoring_zone");
  assert.equal(zoneForX(opp[20] - 0.01), "opp_45_to_20");
});

test("distance to goal is measured from the centre of the opposition goal", () => {
  // Dead centre, 45m out on a 145m pitch.
  const x = 1 - 45 / 145;
  assert.ok(Math.abs(distanceToGoalM(x, 0.5) - 45) < 0.001);

  // Same distance from the end line but out on the wing is further away.
  assert.ok(distanceToGoalM(x, 0.05) > distanceToGoalM(x, 0.5));
});

test("shot angle is widest straight in front of the posts", () => {
  const x = 0.85;
  const centre = shotAngleDeg(x, 0.5);
  const wing = shotAngleDeg(x, 0.02);
  assert.equal(Math.round(centre), 90);
  assert.ok(wing < centre);
});

test("events flip so every shot map faces the same way", () => {
  // Playing right to left, a shot near your own end line was actually an
  // attacking one at the far end.
  assert.deepEqual(normaliseDirection(0.1, 0.3, "rl"), { x: 0.9, y: 0.7 });
  assert.deepEqual(normaliseDirection(0.1, 0.3, "lr"), { x: 0.1, y: 0.3 });
});

test("the two-point arc is 40 m from the centre of the nearer goal", () => {
  // Straight in front, on the default 145 m pitch: 36.25 m in, 43.5 m out.
  assert.equal(outsideTwoPointArc(0.75, 0.5), false);
  assert.equal(outsideTwoPointArc(0.7, 0.5), true);
  // Close in along the end line but out on the wing, 40.5 m across.
  assert.equal(outsideTwoPointArc(0.99, 0.05), true);
  // The same at our own end, where their shots come from.
  assert.equal(outsideTwoPointArc(0.25, 0.5), false);
  assert.equal(outsideTwoPointArc(0.3, 0.5), true);
  // Midfield is outside both.
  assert.equal(outsideTwoPointArc(0.5, 0.5), true);
});

test("clicks outside the pitch are pulled back onto it", () => {
  assert.deepEqual(clampToPitch(1.4, -0.2), { x: 1, y: 0 });
  assert.deepEqual(clampToPitch(0.5, 0.5), { x: 0.5, y: 0.5 });
});

test("our end swaps sides for the second half", () => {
  assert.equal(ourEndIn(1, "left"), "left");
  assert.equal(ourEndIn(2, "left"), "right");
  assert.equal(ourEndIn(2, "right"), "left");
  // Before throw-in or at the interval, the first half's way round.
  assert.equal(ourEndIn(null, "right"), "right");
});
