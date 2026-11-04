import { test } from "node:test";
import assert from "node:assert/strict";
import { DRILL_LIMITS, ballsOf, parseDrill } from "../src/lib/hurling/drill.ts";
import { READY_CATEGORIES, READY_DRILLS, readyDrill } from "../src/lib/hurling/drill-library.ts";
import { cleanGroupName, GROUP_NAME_MAX } from "../src/lib/hurling/drill-groups.ts";

test("ready-made drills have unique ids and titles, and every category is used", () => {
  assert.equal(new Set(READY_DRILLS.map((d) => d.id)).size, READY_DRILLS.length);
  assert.equal(new Set(READY_DRILLS.map((d) => d.title)).size, READY_DRILLS.length);
  for (const c of READY_CATEGORIES) assert.ok(READY_DRILLS.some((d) => d.category === c), c);
});

test("each ready-made drill survives parseDrill unchanged, for both balls", () => {
  for (const ball of ["sliotar", "football"]) {
    for (const r of READY_DRILLS) {
      const built = r.build(ball);
      assert.deepEqual(parseDrill(JSON.parse(JSON.stringify(built))), built, r.id);
      assert.ok(built.steps.length >= 2, `${r.id} has something to play`);
      assert.ok(ballsOf(built).every((b) => b.ball === ball), `${r.id} uses the team's ball`);
    }
  }
});

test("titles and notes fit the limits and carry no dashes", () => {
  for (const r of READY_DRILLS) {
    assert.ok(r.title.length <= DRILL_LIMITS.title, r.id);
    assert.ok(r.notes.length <= 2000, r.id);
    const words = [r.title, r.notes, ...r.build("sliotar").steps.map((s) => s.note)];
    for (const w of words) assert.ok(!/[–—]| - /.test(w), `${r.id}: ${w}`);
  }
});

test("every step of a ready-made drill says what is happening", () => {
  for (const r of READY_DRILLS) {
    for (const [i, s] of r.build("sliotar").steps.entries()) assert.ok(s.note.length > 0, `${r.id} step ${i + 1}`);
  }
});

test("readyDrill looks up by id and returns null for a stranger", () => {
  assert.equal(readyDrill("attack-2v1")?.category, "Attacking");
  assert.equal(readyDrill("nope"), null);
});

test("cleanGroupName trims, collapses spaces and cuts to the limit", () => {
  assert.equal(cleanGroupName("  Set   plays  "), "Set plays");
  assert.equal(cleanGroupName("   "), "");
  assert.equal(cleanGroupName("x".repeat(100)).length, GROUP_NAME_MAX);
});
