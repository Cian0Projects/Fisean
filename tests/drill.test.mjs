import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DRILL_LIMITS,
  addBall,
  addCone,
  addGoal,
  clearCones,
  KIT_LIMITS,
  markOutSmallPitch,
  moveKit,
  removeKit,
  setGoalWidth,
  turnGoal,
  addStep,
  captionStep,
  VIDEO_TIMING,
  videoLengthMs,
  videoTimeAt,
  applyPreset,
  matchingPreset,
  ballsOf,
  drillSummary,
  emptyDrill,
  movePiece,
  parseDrill,
  playersOf,
  positionsAt,
  removePiece,
  removeStep,
  runningMs,
  setSideCount,
  starterDrill,
  STEP_MS,
} from "../src/lib/hurling/drill.ts";

/** Every step has a spot for every piece, and nothing else. */
function assertComplete(d) {
  const ids = d.pieces.map((p) => p.id).sort();
  for (const s of d.steps) assert.deepEqual(Object.keys(s.at).sort(), ids);
}

const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

test("a starter drill is four on three with a sliotar, on one step", () => {
  const d = starterDrill();
  assert.equal(playersOf(d, "a").length, 4);
  assert.equal(playersOf(d, "b").length, 3);
  assert.equal(ballsOf(d)[0].ball, "sliotar");
  assert.equal(d.steps.length, 1);
  assertComplete(d);
  assert.equal(drillSummary(d), "4 v 3, 1 sliotar, 1 step");
  // The sliotar starts with the first attacker, not out on its own.
  assert.ok(dist(d.steps[0].at.ball1, d.steps[0].at.a1) < 0.04);
});

test("in a small-sided game each side starts in its own half", () => {
  const d = applyPreset(emptyDrill(), "7v7");
  for (const p of playersOf(d, "a")) assert.ok(d.steps[0].at[p.id].x < 0.5);
  for (const p of playersOf(d, "b")) assert.ok(d.steps[0].at[p.id].x > 0.5);
});

test("an overload lines up as an attack on the right-hand goal", () => {
  const d = applyPreset(emptyDrill(), "3v2");
  assert.equal(drillSummary(d), "3 v 2, 1 step");
  const ax = Math.max(...playersOf(d, "a").map((p) => d.steps[0].at[p.id].x));
  // Defenders goal-side of every attacker.
  for (const p of playersOf(d, "b")) assert.ok(d.steps[0].at[p.id].x > ax);
});

test("fifteen a side lines up in match positions, each beside their marker", () => {
  const d = applyPreset(emptyDrill(), "15v15");
  assert.equal(playersOf(d, "a").length, 15);
  assert.equal(playersOf(d, "b").length, 15);
  const at = d.steps[0].at;
  const a = playersOf(d, "a");
  const b = playersOf(d, "b");
  // The keepers in their own goals.
  assert.ok(at[a[0].id].x < 0.05 && at[b[0].id].x > 0.95);
  // Every outfield player has an opponent within a few metres; keepers don't.
  for (const p of [...a.slice(1), ...b.slice(1)]) {
    const others = p.side === "a" ? b : a;
    const nearest = Math.min(...others.map((o) => dist(at[p.id], at[o.id])));
    assert.ok(nearest < 0.07, `${p.side}${p.label} is unmarked`);
  }
  // Their 15 picks up our 2, as on the day.
  assert.ok(dist(at[b[14].id], at[a[1].id]) < 0.07);
});

test("a preset keeps the balls, the steps and their notes", () => {
  let d = addStep(starterDrill(), 0);
  d = { ...d, steps: d.steps.map((s, i) => ({ ...s, note: `n${i}` })) };
  d = movePiece(d, 1, "a1", { x: 0.95, y: 0.05 });
  const next = applyPreset(d, "15v15");
  assertComplete(next);
  assert.equal(next.steps.length, 2);
  assert.deepEqual(next.steps.map((s) => s.note), ["n0", "n1"]);
  assert.equal(ballsOf(next).length, 1);
  // Players are back on their spots on every step.
  assert.deepEqual(next.steps[1].at.a1, next.steps[0].at.a1);
  assert.equal(matchingPreset(next)?.id, "15v15");
  assert.equal(applyPreset(d, "nonsense"), d);
});

test("players added after a full line-up land on open grass", () => {
  let d = applyPreset(emptyDrill(), "15v15");
  d = setSideCount(d, "a", 17);
  const at = d.steps[0].at;
  const others = d.pieces.filter((p) => p.id !== "a16" && p.id !== "a17");
  for (const id of ["a16", "a17"]) {
    for (const o of others) assert.ok(dist(at[id], at[o.id]) > 0.04, `${id} is on top of ${o.id}`);
  }
  assert.deepEqual(playersOf(d, "a").slice(-2).map((p) => p.label), ["16", "17"]);
});

test("changing a side's count reaches every step, and keeps the numbers", () => {
  let d = addStep(addStep(starterDrill(), 0), 1);
  d = setSideCount(d, "a", 7);
  assertComplete(d);
  assert.deepEqual(
    playersOf(d, "a").map((p) => p.label),
    ["1", "2", "3", "4", "5", "6", "7"],
  );
  d = setSideCount(d, "a", 3);
  assertComplete(d);
  assert.deepEqual(playersOf(d, "a").map((p) => p.label), ["1", "2", "3"]);
  // Capped, and never negative.
  assert.equal(playersOf(setSideCount(d, "b", 99), "b").length, DRILL_LIMITS.playersPerSide);
  assert.equal(playersOf(setSideCount(d, "b", -2), "b").length, 0);
});

test("ids are never doubled after a removal", () => {
  let d = addBall(addBall(emptyDrill(), "sliotar"), "football");
  d = removePiece(d, "ball1");
  d = addBall(d, "sliotar");
  const ids = ballsOf(d).map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
  assertComplete(d);
});

test("a new step starts as a copy, and moving in it leaves the others alone", () => {
  let d = addStep(starterDrill(), 0);
  assert.deepEqual(d.steps[1].at, d.steps[0].at);
  d = movePiece(d, 1, "a1", { x: 0.9, y: 0.1 });
  assert.deepEqual(d.steps[1].at.a1, { x: 0.9, y: 0.1 });
  assert.notDeepEqual(d.steps[0].at.a1, { x: 0.9, y: 0.1 });
});

test("a move off the pitch is kept on it", () => {
  const d = movePiece(starterDrill(), 0, "a1", { x: 1.4, y: -0.2 });
  assert.deepEqual(d.steps[0].at.a1, { x: 1, y: 0 });
});

test("the last step cannot be removed", () => {
  const d = starterDrill();
  assert.equal(removeStep(d, 0).steps.length, 1);
  assert.equal(removeStep(addStep(d, 0), 0).steps.length, 1);
});

test("playback eases between steps and clamps at both ends", () => {
  let d = addStep(starterDrill(), 0);
  d = movePiece(d, 0, "a1", { x: 0, y: 0 });
  d = movePiece(d, 1, "a1", { x: 1, y: 1 });
  assert.deepEqual(positionsAt(d, 0).a1, { x: 0, y: 0 });
  assert.deepEqual(positionsAt(d, 1).a1, { x: 1, y: 1 });
  assert.deepEqual(positionsAt(d, 0.5).a1, { x: 0.5, y: 0.5 });
  // Eased: a quarter of the way through time is less than a quarter of the way.
  assert.ok(positionsAt(d, 0.25).a1.x < 0.25);
  assert.deepEqual(positionsAt(d, -3).a1, { x: 0, y: 0 });
  assert.deepEqual(positionsAt(d, 9).a1, { x: 1, y: 1 });
  assert.equal(runningMs(d), STEP_MS);
  assert.equal(runningMs(d, 2), STEP_MS / 2);
});

test("parsing round-trips a drill unchanged", () => {
  const d = setSideCount(addStep(starterDrill(), 0), "b", 6);
  assert.deepEqual(parseDrill(JSON.parse(JSON.stringify(d))), d);
});

test("parsing repairs detail and refuses nonsense", () => {
  assert.throws(() => parseDrill(null));
  assert.throws(() => parseDrill({ pieces: "x", steps: [] }));

  const d = parseDrill({
    pieces: [
      { id: "a1", kind: "player", side: "a", label: "1" },
      { id: "a1", kind: "player", side: "a", label: "dup" },
      { id: "z", kind: "referee" },
      { id: "ball1", kind: "ball", ball: "basketball" },
      { id: "ball2", kind: "ball", ball: "football" },
    ],
    steps: [
      { at: { a1: { x: 2, y: 0.5 } }, note: "go" },
      { at: {} },
    ],
  });
  assert.deepEqual(d.pieces.map((p) => p.id), ["a1", "ball2"]);
  assertComplete(d);
  assert.deepEqual(d.steps[0].at.a1, { x: 1, y: 0.5 });
  // A spot missing from a step is carried over from the step before.
  assert.deepEqual(d.steps[1].at.a1, { x: 1, y: 0.5 });
  assert.equal(d.steps[1].note, "");
  assert.equal(d.sides.a.name, "Attack");
});

/* ------------------------------------------------------------------ kit */

test("cones and goals stay put through every step", () => {
  let d = addStep(addStep(starterDrill(), 0), 1);
  d = addGoal(addCone(d));
  d = moveKit(d, "cone1", { x: 0.2, y: 1.3 });
  // Kit is not in the steps, so playback cannot move it.
  for (const s of d.steps) assert.equal(s.at.cone1, undefined);
  assert.deepEqual({ x: d.kit[0].x, y: d.kit[0].y }, { x: 0.2, y: 1 });
  assert.equal(drillSummary(d), "4 v 3, 1 sliotar, 1 cone, 1 extra goal, 3 steps");
});

test("goals arrive facing each other and turn a quarter at a time", () => {
  const d = addGoal(addGoal(emptyDrill()), "full");
  const [g1, g2] = d.kit;
  assert.ok(g1.x < 0.5 && g2.x > 0.5);
  assert.deepEqual([g1.angle, g2.angle], [0, 180]);
  assert.equal(g2.width, "full");
  let t = d;
  const seen = [];
  for (let i = 0; i < 4; i++) {
    t = turnGoal(t, "goal1");
    seen.push(t.kit[0].angle);
  }
  assert.deepEqual(seen, [90, 180, 270, 0]);
  assert.equal(setGoalWidth(d, "goal1", "full").kit[0].width, "full");
});

test("kit is capped and its ids never clash", () => {
  let d = starterDrill();
  for (let i = 0; i < KIT_LIMITS.cones + 5; i++) d = addCone(d);
  for (let i = 0; i < KIT_LIMITS.goals + 5; i++) d = addGoal(d);
  assert.equal(d.kit.length, KIT_LIMITS.cones + KIT_LIMITS.goals);
  d = addCone(removeKit(d, "cone3"));
  const ids = [...d.pieces, ...d.kit].map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(clearCones(d).kit.length, KIT_LIMITS.goals);
});

test("a small pitch is marked out with cones and two goals facing in", () => {
  const d = markOutSmallPitch(addCone(addCone(emptyDrill())));
  const cones = d.kit.filter((k) => k.kind === "cone");
  const goals = d.kit.filter((k) => k.kind === "goal");
  // Replaces what was out, rather than adding to it.
  assert.equal(cones.length, 6);
  assert.equal(goals.length, 2);
  const [left, right] = goals.sort((a, b) => a.x - b.x);
  assert.deepEqual([left.angle, right.angle], [0, 180]);
  // The goals sit on the end lines the cones mark.
  assert.ok(cones.some((c) => c.x === left.x) && cones.some((c) => c.x === right.x));
});

test("parsing kit: old drills have none, bad kit is dropped, good kit round-trips", () => {
  const old = JSON.parse(JSON.stringify(starterDrill()));
  delete old.kit;
  assert.deepEqual(parseDrill(old).kit, []);

  const d = markOutSmallPitch(starterDrill());
  assert.deepEqual(parseDrill(JSON.parse(JSON.stringify(d))), d);

  const messy = parseDrill({
    ...old,
    kit: [
      { id: "a1", kind: "cone", x: 0.1, y: 0.1 },
      { id: "c", kind: "cone", x: "left", y: 0.1 },
      { id: "t", kind: "trampoline", x: 0.1, y: 0.1 },
      { id: "g", kind: "goal", x: 2, y: 0.5, angle: 45, width: "huge" },
    ],
  });
  assert.deepEqual(messy.kit, [{ id: "g", kind: "goal", x: 1, y: 0.5, angle: 0, width: "small" }]);
});

/* ---------------------------------------------------------------- video */

test("a video holds the set-up, pauses on each step, and holds the end", () => {
  const d = addStep(addStep(starterDrill(), 0), 1); // three steps, two moves
  const { leadInMs, holdMs, tailMs } = VIDEO_TIMING;
  assert.equal(videoLengthMs(d), leadInMs + 2 * STEP_MS + holdMs + tailMs);
  assert.equal(videoLengthMs(d, 2), leadInMs + STEP_MS + holdMs + tailMs);

  // Still during the lead-in.
  assert.equal(videoTimeAt(d, 0), 0);
  assert.equal(videoTimeAt(d, leadInMs - 1), 0);
  // Halfway through the first move.
  assert.equal(videoTimeAt(d, leadInMs + STEP_MS / 2), 0.5);
  // Paused on step 2 for the hold, then moving again.
  assert.equal(videoTimeAt(d, leadInMs + STEP_MS + holdMs / 2), 1);
  assert.equal(videoTimeAt(d, leadInMs + STEP_MS + holdMs + STEP_MS / 2), 1.5);
  // On the last step through the tail, and past the end.
  assert.equal(videoTimeAt(d, videoLengthMs(d) - 1), 2);
  assert.equal(videoTimeAt(d, 1e9), 2);
  // At double speed the moves take half as long; the holds do not.
  assert.equal(videoTimeAt(d, leadInMs + STEP_MS / 4, 2), 0.5);
});

test("the caption is the step being moved into", () => {
  const d = addStep(addStep(starterDrill(), 0), 1);
  assert.equal(captionStep(d, 0), 0);
  assert.equal(captionStep(d, 0.01), 1);
  assert.equal(captionStep(d, 1), 1);
  assert.equal(captionStep(d, 1.5), 2);
  assert.equal(captionStep(d, 9), 2);
});
