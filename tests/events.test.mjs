import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_EVENTS, builtInEventsFor, clipTagTone, tagTone, tagsForCode } from "../src/lib/hurling/events.ts";
import { GAME_CODES } from "../src/lib/hurling/codes.ts";

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
  const plain = (code) =>
    builtInEventsFor(code)
      .filter((e) => e.hotkey && tagTone(e.slug) === "plain")
      .map((e) => e.slug);
  assert.deepEqual(plain("hurling"), ["hook"]);
  assert.deepEqual(plain("football"), []);
});

test("each code has ten hotkeys and no two tags share one", () => {
  for (const code of GAME_CODES) {
    const keys = builtInEventsFor(code)
      .filter((e) => e.hotkey)
      .map((e) => e.hotkey)
      .sort();
    assert.deepEqual(keys, ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"], code);
  }
});

test("football is offered kick-outs, a 45 and a two-pointer, and no hook", () => {
  const labels = builtInEventsFor("football").map((e) => e.labelGa ?? e.labelEn);
  for (const label of ["Kick-out won", "Kick-out lost", "45", "Sideline kick", "Two-pointer", "Mark"]) {
    assert.ok(labels.includes(label), label);
  }
  for (const label of ["Hook", "Jab lift", "65", "Poc amach won"]) assert.ok(!labels.includes(label), label);
});

test("hurling keeps the poc amach and the 65, and camogie gives a 45", () => {
  const hurling = builtInEventsFor("hurling").map((e) => e.labelGa ?? e.labelEn);
  assert.ok(hurling.includes("Poc amach won"));
  assert.ok(hurling.includes("65"));
  assert.ok(!hurling.includes("Two-pointer"));
  const camogie = builtInEventsFor("camogie").map((e) => e.labelGa ?? e.labelEn);
  assert.ok(camogie.includes("45"));
  assert.ok(camogie.includes("Hook"));
});

test("stored rows are fitted to the club's code, and a club's own tags are left alone", () => {
  const row = (slug, labelEn, labelGa = null, teamId = null) => ({ id: slug, teamId, slug, labelEn, labelGa });
  const rows = [
    row("poc_amach_won", "Puckout won", "Poc amach won"),
    row("hook", "Hook"),
    row("sixty_five", "65"),
    row("hook", "Hook", null, "team-1"),
  ];
  assert.deepEqual(
    tagsForCode(rows, "football").map((r) => [r.slug, r.teamId, r.labelGa ?? r.labelEn]),
    [
      ["poc_amach_won", null, "Kick-out won"],
      ["sixty_five", null, "45"],
      ["hook", "team-1", "Hook"],
    ],
  );
  // Naming tags already on clips drops none of them.
  assert.equal(tagsForCode(rows, "football", { keepUnoffered: true }).length, 4);
  assert.deepEqual(tagsForCode(rows, "hurling"), rows);
});

test("after a club changes its game, a tag already on a clip stays, without its hotkey", () => {
  const rows = [
    { id: "hook", teamId: null, slug: "hook", labelEn: "Hook", labelGa: null, hotkey: "8" },
    { id: "jab", teamId: null, slug: "jab_lift", labelEn: "Jab lift", labelGa: null, hotkey: null },
  ];
  assert.deepEqual(tagsForCode(rows, "football", { onClips: ["hook"] }), [{ ...rows[0], hotkey: null }]);
  assert.deepEqual(tagsForCode(rows, "football"), []);
});

test("no built-in label joins words with a spaced dash", () => {
  for (const e of BUILT_IN_EVENTS) {
    assert.ok(!/ — /.test(e.labelGa ?? e.labelEn), e.slug);
  }
});
