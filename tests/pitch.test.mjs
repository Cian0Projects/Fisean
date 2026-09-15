import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PITCH,
  clampToPitch,
  distanceToGoalM,
  lineFractions,
  normaliseDirection,
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

test("clicks outside the pitch are pulled back onto it", () => {
  assert.deepEqual(clampToPitch(1.4, -0.2), { x: 1, y: 0 });
  assert.deepEqual(clampToPitch(0.5, 0.5), { x: 0.5, y: 0.5 });
});
