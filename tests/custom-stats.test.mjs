import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SPEC,
  canRemoveStandard,
  shownStatTypes,
  withoutStats,
  customColour,
  customReady,
  customSentence,
  customShape,
  customStatName,
  describeCustom,
  normaliseCustomEntry,
  normaliseSpec,
  sameName,
  scoreChoices,
  specQuestions,
  summariseCustom,
} from "../src/lib/hurling/custom-stats.ts";
import { statVocabulary } from "../src/lib/hurling/stats.ts";

const spec = (over = {}) => normaliseSpec({ ...DEFAULT_SPEC, name: "Breakdown won", ...over });

test("a name is trimmed and tidied, and must exist", () => {
  assert.equal(customStatName("  Breakdown   won "), "Breakdown won");
  assert.throws(() => customStatName("   "), /name/);
  assert.throws(() => customStatName(undefined), /name/);
  assert.throws(() => customStatName("x".repeat(31)), /30/);
});

test("names that differ only in case or spacing are the same stat", () => {
  assert.ok(sameName("Breakdown won", "  breakdown   WON"));
  assert.ok(!sameName("Breakdown won", "Breakdown lost"));
});

test("a spec falls back to safe values for anything unknown", () => {
  const s = normaliseSpec({ name: "X", sideMode: "everyone", scoreMode: "lots", points: 9, askPlayer: "yes" });
  assert.equal(s.sideMode, "us");
  assert.equal(s.scoreMode, "none");
  assert.equal(s.points, 0);
  assert.equal(s.askPlayer, false);
});

test("the form a coach is making is put into words in order", () => {
  const s = spec({ sideMode: "ask", askPlayer: true, askOpposition: true, askOutcome: true, scoreMode: "led_to", points: 2 });
  assert.deepEqual(specQuestions(s), [
    "Whose it was, ours or theirs",
    "Our player's number",
    "Their player's number",
    "Good for us, against us or unclear",
    "Whether it led to a score",
    "Where it started and where it went",
  ]);
  assert.deepEqual(specQuestions(spec({ askPlayer: false, points: 0 })), []);
});

test("the two-pointer is offered only where the game has the arc", () => {
  assert.deepEqual(scoreChoices("hurling"), ["goal", "point"]);
  assert.deepEqual(scoreChoices("football"), ["goal", "point", "two_pointer"]);
  assert.match(specQuestions(spec({ scoreMode: "which" }), "ladies_football").join(), /Two-pointer/);
  assert.doesNotMatch(specQuestions(spec({ scoreMode: "which" }), "camogie").join(), /Two-pointer/);
});

test("an entry keeps only what its stat asks", () => {
  const bare = spec({ askPlayer: false, points: 0 });
  const v = normaliseCustomEntry(
    bare,
    { playerNumber: 7, oppositionNumber: 4, outcome: "positive", ledToScore: true, originX: 0.3, originY: 0.4 },
    "hurling",
  );
  assert.equal(v.playerNumber, null);
  assert.equal(v.oppositionNumber, null);
  assert.equal(v.outcome, null);
  assert.equal(v.ledToScore, null);
  assert.equal(v.originX, null);
  assert.equal(v.side, "us");
});

test("numbers are kept when asked, and an impossible one is refused", () => {
  const s = spec({ askPlayer: true, askOpposition: true });
  const v = normaliseCustomEntry(s, { playerNumber: "11", oppositionNumber: 9 }, "hurling");
  assert.equal(v.playerNumber, 11);
  assert.equal(v.oppositionNumber, 9);
  assert.equal(normaliseCustomEntry(s, {}, "hurling").playerNumber, null);
  assert.throws(() => normaliseCustomEntry(s, { playerNumber: 120 }, "hurling"), /1 to 99/);
});

test("a stat that asks whose it is will not log without an answer", () => {
  const s = spec({ sideMode: "ask" });
  assert.throws(() => normaliseCustomEntry(s, {}, "hurling"), /whose/);
  assert.equal(normaliseCustomEntry(s, { side: "opposition" }, "hurling").side, "opposition");
  assert.equal(normaliseCustomEntry(spec({ sideMode: "opposition" }), { side: "us" }, "hurling").side, "opposition");
});

test("an outcome is required when asked, and ignored otherwise", () => {
  const s = spec({ askOutcome: true });
  assert.throws(() => normaliseCustomEntry(s, {}, "hurling"), /how it went/);
  assert.equal(normaliseCustomEntry(s, { outcome: "negative" }, "hurling").outcome, "negative");
});

test("led to a score is a yes or no, defaulting to no", () => {
  const s = spec({ scoreMode: "led_to" });
  assert.equal(normaliseCustomEntry(s, {}, "hurling").ledToScore, false);
  assert.equal(normaliseCustomEntry(s, { ledToScore: true }, "hurling").ledToScore, true);
});

test("which score is optional, and a two-pointer is refused where there is no arc", () => {
  const s = spec({ scoreMode: "which" });
  assert.equal(normaliseCustomEntry(s, {}, "hurling").score, null);
  assert.equal(normaliseCustomEntry(s, { score: "goal" }, "hurling").score, "goal");
  assert.throws(() => normaliseCustomEntry(s, { score: "two_pointer" }, "camogie"), /not played/);
  assert.equal(normaliseCustomEntry(s, { score: "two_pointer" }, "football").score, "two_pointer");
});

test("points are clamped to the pitch, and a second needs the first", () => {
  const two = spec({ points: 2 });
  const v = normaliseCustomEntry(two, { originX: 1.4, originY: -2, destX: 0.5, destY: 0.5 }, "hurling");
  assert.deepEqual([v.originX, v.originY], [1, 0]);
  assert.deepEqual([v.destX, v.destY], [0.5, 0.5]);
  const lone = normaliseCustomEntry(two, { destX: 0.5, destY: 0.5 }, "hurling");
  assert.equal(lone.destX, null);
  const one = normaliseCustomEntry(spec({ points: 1 }), { originX: 0.2, originY: 0.2, destX: 0.5, destY: 0.5 }, "hurling");
  assert.equal(one.destX, null);
  assert.equal(normaliseCustomEntry(spec({ points: 1 }), { originX: 0.2 }, "hurling").originX, null);
});

test("a half is 1 or 2, or none", () => {
  assert.equal(normaliseCustomEntry(spec(), { half: 2 }, "hurling").half, 2);
  assert.equal(normaliseCustomEntry(spec(), { half: 3 }, "hurling").half, null);
});

test("the log button waits for what the stat insists on", () => {
  const s = spec({ sideMode: "ask", askOutcome: true });
  const form = { side: null, outcome: null, playerNumber: "", oppositionNumber: "" };
  assert.equal(customReady(s, form), false);
  assert.equal(customReady(s, { ...form, side: "us" }), false);
  assert.equal(customReady(s, { ...form, side: "us", outcome: "positive" }), true);
  assert.equal(customReady(spec(), { ...form, playerNumber: "200" }), false);
  assert.equal(customReady(spec(), { ...form, playerNumber: "12" }), true);
});

test("colour means an outcome, and a stat with none is chalk and filled", () => {
  assert.equal(customColour({ outcome: "positive" }), "var(--color-brand)");
  assert.equal(customColour({ outcome: null }), "var(--color-ink-dim)");
  assert.equal(customShape({ outcome: "negative" }), "ring");
  assert.equal(customShape({ outcome: "unclear" }), "dashed");
  assert.equal(customShape({ outcome: null }), "filled");
});

test("an entry reads back in the words of what was asked", () => {
  const s = spec({ sideMode: "ask", askOutcome: true, scoreMode: "led_to" });
  const v = normaliseCustomEntry(s, { side: "opposition", outcome: "negative", ledToScore: true }, "hurling");
  assert.equal(describeCustom(s, v), "Breakdown won, theirs, against us, led to a score");
  const plain = normaliseCustomEntry(spec(), {}, "hurling");
  assert.equal(describeCustom(spec(), plain), "Breakdown won");
  const which = spec({ scoreMode: "which" });
  assert.equal(describeCustom(which, normaliseCustomEntry(which, { score: "point" }, "hurling")), "Breakdown won, cúilín");
});

test("totals are derived from the entries", () => {
  const s = spec({ sideMode: "ask", askOutcome: true, askOpposition: true, scoreMode: "which" });
  const log = (d) => normaliseCustomEntry(s, d, "football");
  const summary = summariseCustom([
    log({ side: "us", playerNumber: 5, outcome: "positive", score: "point", half: 1 }),
    log({ side: "us", playerNumber: 5, outcome: "positive", score: "goal", half: 2 }),
    log({ side: "opposition", oppositionNumber: 14, outcome: "negative", half: 2 }),
    log({ side: "us", outcome: "unclear" }),
  ]);
  assert.equal(summary.total, 4);
  assert.equal(summary.ours, 3);
  assert.equal(summary.theirs, 1);
  assert.deepEqual(summary.outcomes, { positive: 2, negative: 1, unclear: 1 });
  assert.deepEqual(summary.scores, { goal: 1, point: 1, two_pointer: 0 });
  assert.deepEqual([summary.firstHalf, summary.secondHalf, summary.noHalf], [1, 2, 1]);
  assert.deepEqual(summary.opposition, [{ number: 14, count: 1 }]);
});

test("the report opens a stat with a sentence of only what it asked", () => {
  const s = spec({ sideMode: "ask", askOutcome: true, scoreMode: "led_to" });
  const log = (d) => normaliseCustomEntry(s, d, "hurling");
  const summary = summariseCustom([
    log({ side: "us", outcome: "positive", ledToScore: true }),
    log({ side: "opposition", outcome: "negative" }),
  ]);
  assert.equal(
    customSentence(s, summary),
    "2 entries, 1 ours and 1 theirs. 1 good for us, 1 against us and 0 unclear. 1 led to a score.",
  );
  const plain = spec({ askPlayer: false });
  assert.equal(customSentence(plain, summariseCustom([normaliseCustomEntry(plain, {}, "hurling")])), "1 entry.");
  const which = spec({ scoreMode: "which" });
  const w = summariseCustom([
    normaliseCustomEntry(which, { score: "point" }, "hurling"),
    normaliseCustomEntry(which, { score: "point" }, "hurling"),
    normaliseCustomEntry(which, { score: "goal" }, "hurling"),
  ]);
  assert.equal(customSentence(which, w), "3 entries. Scores: Cúl 1, Cúilín 2.");
});

test("removed standard stats leave the tab order and nothing else", () => {
  const all = statVocabulary("hurling").statTypes;
  assert.deepEqual(shownStatTypes(all, []), all);
  assert.ok(!shownStatTypes(all, ["tackle", "shot"]).includes("tackle"));
  assert.equal(shownStatTypes(all, ["tackle", "shot"]).length, all.length - 2);
  const v = statVocabulary("hurling");
  assert.equal(withoutStats(v, []), v);
  assert.deepEqual(withoutStats(v, ["delivery"]).statTypes, shownStatTypes(all, ["delivery"]));
  assert.equal(withoutStats(v, ["delivery"]).meta, v.meta);
});

test("at least one standard stat has to stay", () => {
  const all = ["tackle", "shot", "mark"];
  assert.ok(canRemoveStandard(all, [], "tackle"));
  assert.ok(canRemoveStandard(all, ["tackle"], "shot"));
  assert.ok(!canRemoveStandard(all, ["tackle", "shot"], "mark"));
  assert.ok(canRemoveStandard(all, ["tackle", "shot"], "tackle"), "one already removed can be brought back");
});

test("totals of nothing are zero, and players run most first", () => {
  const empty = summariseCustom([]);
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.players, []);
  const s = spec();
  const log = (n) => normaliseCustomEntry(s, { playerNumber: n }, "hurling");
  assert.deepEqual(
    summariseCustom([log(9), log(4), log(9), log(4), log(11), log(9)]).players,
    [
      { number: 9, count: 3 },
      { number: 4, count: 2 },
      { number: 11, count: 1 },
    ],
  );
});
