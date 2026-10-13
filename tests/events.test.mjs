import { test } from "node:test";
import assert from "node:assert/strict";
import { HURLING_EVENTS, clipTagTone, tagTone } from "../src/lib/hurling/events.ts";

test("scores and possession won are good for us; a miss is against us", () => {
  assert.equal(tagTone("cul"), "good");
  assert.equal(tagTone("cuilin"), "good");
  assert.equal(tagTone("turnover_won"), "good");
  assert.equal(tagTone("wide"), "against");
  assert.equal(tagTone("poc_amach_lost"), "against");
  assert.equal(tagTone("off_post"), "unclear");
});

test("a skill or a phase is not an outcome, and a team's own tag is unknown", () => {
  assert.equal(tagTone("hook"), "plain");
  assert.equal(tagTone("solo_run"), "plain");
  assert.equal(tagTone("throw_in"), "plain");
  assert.equal(tagTone("our_own_tag"), "plain");
});

test("cards keep their literal colour, apart from the outcomes", () => {
  assert.equal(tagTone("yellow_card"), "yellow_card");
  assert.equal(tagTone("red_card"), "red_card");
});

test("a clip reads as its first tag that says something", () => {
  assert.equal(clipTagTone(["hook", "turnover_won"]), "good");
  assert.equal(clipTagTone(["wide", "cuilin"]), "against");
  assert.equal(clipTagTone(["solo_run"]), "plain");
  assert.equal(clipTagTone([]), "plain");
});

test("every hotkey tag but the hook says how the play went", () => {
  // The tag bar is what a selector presses all match; if its keys were all
  // plain ink the timeline would say nothing at a glance.
  const plain = HURLING_EVENTS.filter((e) => e.hotkey && tagTone(e.slug) === "plain").map((e) => e.slug);
  assert.deepEqual(plain, ["hook"]);
});

test("no built-in label joins words with a spaced dash", () => {
  for (const e of HURLING_EVENTS) {
    assert.ok(!/ — /.test(e.labelGa ?? e.labelEn), e.slug);
  }
});
