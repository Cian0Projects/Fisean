import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PINS,
  ZERO_TARGET_MISS,
  buildTiles,
  cleanPicks,
  customKey,
  defaultStage,
  defaultTarget,
  goalFor,
  measuresFor,
  relativeGap,
  resolvePins,
  scoreTimeline,
  stageScore,
  suggestTiles,
  summaryMenu,
  targetFor,
  targetValue,
  verdictOf,
} from "../src/lib/hurling/summary.ts";

let n = 0;
const row = (statType, extra = {}) => ({ statType, outcome: null, half: 1, createdAt: ++n, ...extra });
const shot = (result, extra = {}) => row("shot", { shotResult: result, side: "us", ...extra });
const theirShot = (result, extra = {}) => row("shot", { shotResult: result, side: "opposition", ...extra });

const menuOf = (code = "hurling", hidden = [], custom = []) => summaryMenu(code, hidden, custom);

/* ---------------------------------------------------------------- targets */

test("count targets are halved at half time, rounded the way they must be met", () => {
  assert.equal(goalFor({ measure: "count", direction: "at_least", value: 9 }, "half"), 5);
  assert.equal(goalFor({ measure: "count", direction: "at_most", value: 9 }, "half"), 4);
  assert.equal(goalFor({ measure: "count", direction: "at_least", value: 9 }, "match"), 9);
  // A rate reads the same at any point in the match.
  assert.equal(goalFor({ measure: "rate", direction: "at_least", value: 55 }, "half"), 55);
  assert.equal(goalFor({ measure: "rate", direction: "at_least", value: null }, "half"), null);
});

test("the gap is relative, so different stats rank on one scale", () => {
  // Two tackles short of ten and 44% against 55% are both a fifth short.
  assert.equal(relativeGap(8, 10, "at_least"), -0.2);
  assert.ok(Math.abs(relativeGap(44, 55, "at_least") - -0.2) < 1e-9);
  // At most: fewer is better.
  assert.equal(relativeGap(6, 8, "at_most"), 0.25);
  assert.equal(relativeGap(10, 8, "at_most"), -0.25);
});

test("missing a target of nought is as far off as anything can be", () => {
  assert.equal(relativeGap(1, 0, "at_most"), ZERO_TARGET_MISS);
  assert.equal(relativeGap(0, 0, "at_most"), 0);
  assert.equal(relativeGap(3, 0, "at_least"), 0);
});

test("close is within a tenth of the target", () => {
  assert.equal(verdictOf(0), "met");
  assert.equal(verdictOf(-0.1), "close");
  assert.equal(verdictOf(-0.11), "missed");
});

test("a target number is kept in range", () => {
  assert.equal(targetValue("rate", "55"), 55);
  assert.equal(targetValue("count", ""), null);
  assert.equal(targetValue("count", null), null);
  assert.throws(() => targetValue("rate", 120));
  assert.throws(() => targetValue("count", -1));
  assert.throws(() => targetValue("count", "lots"));
});

test("tackles are only ever counted; shooting can be either; a custom stat is a rate only if it asks how it went", () => {
  assert.deepEqual(measuresFor("tackle", []), ["count"]);
  assert.deepEqual(measuresFor("shot", []), ["rate", "count"]);
  assert.deepEqual(measuresFor(customKey("a"), [{ id: "a", askOutcome: false }]), ["count"]);
  assert.deepEqual(measuresFor(customKey("a"), [{ id: "a", askOutcome: true }]), ["count", "rate"]);
});

test("defaults: shooting a rate, tackles a count, frees conceded at most, own stats untargeted", () => {
  assert.deepEqual(defaultTarget("shot", "hurling"), { measure: "rate", direction: "at_least", value: 55 });
  assert.equal(defaultTarget("tackle", "football").measure, "count");
  assert.equal(defaultTarget("free_conceded", "hurling").direction, "at_most");
  assert.equal(defaultTarget(customKey("x"), "hurling").value, null);
});

test("a saved rate on a stat that can no longer be a rate falls back to a count with no target", () => {
  const saved = new Map([[customKey("a"), { measure: "rate", direction: "at_least", value: 60 }]]);
  const t = targetFor(customKey("a"), saved, "hurling", [{ id: "a", askOutcome: false }]);
  assert.deepEqual(t, { measure: "count", direction: "at_least", value: null });
});

/* ------------------------------------------------------------------ menu */

test("the menu is the squad's own logging setup", () => {
  const custom = [
    { id: "b", name: "Breaks won", archivedAt: null },
    { id: "r", name: "Retired", archivedAt: 1 },
  ];
  const keys = menuOf("hurling", ["delivery"], custom).map((t) => t.key);
  assert.ok(!keys.includes("delivery"), "hidden stat dropped");
  assert.ok(!keys.includes("mark"), "no mark in hurling");
  assert.ok(keys.includes(customKey("b")));
  assert.ok(!keys.includes(customKey("r")), "retired stat dropped");
  assert.ok(menuOf("football").some((t) => t.key === "mark"));
  // A hidden stat with entries in this match keeps its tile.
  const kept = summaryMenu("hurling", ["delivery"], [], { types: new Set(["delivery"]), customIds: new Set() });
  assert.ok(kept.some((t) => t.key === "delivery"));
});

test("pins default to tackles and shooting, and fill in when one is no longer logged", () => {
  const menu = menuOf();
  assert.deepEqual(resolvePins(null, menu), [...DEFAULT_PINS]);
  const noTackles = menuOf("hurling", ["tackle"]);
  const pins = resolvePins(null, noTackles);
  assert.equal(pins.length, 2);
  assert.ok(pins.includes("shot"));
  assert.ok(!pins.includes("tackle"));
});

test("saved picks are cleaned against the menu and the pins", () => {
  const menu = menuOf();
  assert.deepEqual(cleanPicks(["shot", "turnover", "turnover", "gone", "delivery", "puckout"], menu, ["tackle", "shot"]), [
    "turnover",
    "delivery",
  ]);
});

/* ------------------------------------------------------------------ tiles */

const input = (rows, custom = []) => ({ code: "hurling", rows, custom });

test("half time judges the first half against half the count target", () => {
  const rows = [
    ...Array.from({ length: 12 }, () => row("tackle", { half: 1 })),
    ...Array.from({ length: 30 }, () => row("tackle", { half: 2 })),
  ];
  const targets = new Map([["tackle", { measure: "count", direction: "at_least", value: 40 }]]);
  const [half] = buildTiles(input(rows), [{ key: "tackle", title: "Tackles" }], targets, "half_time");
  assert.equal(half.headline.figure.value, 12);
  assert.equal(half.headline.goal, 20);
  assert.equal(half.headline.verdict, "missed");
  assert.equal(half.halves, null);

  const [full] = buildTiles(input(rows), [{ key: "tackle", title: "Tackles" }], targets, "full_time");
  assert.equal(full.headline.figure.value, 42);
  assert.equal(full.headline.verdict, "met");
  // The whole match met it, the first half did not.
  assert.equal(full.halves[0].judged.verdict, "missed");
  assert.equal(full.halves[1].judged.verdict, "met");
});

test("shooting is our conversion; their shots only show underneath", () => {
  const rows = [shot("point"), shot("point"), shot("wide"), shot("goal"), theirShot("point"), theirShot("wide")];
  const [tile] = buildTiles(input(rows), [{ key: "shot", title: "Shooting" }], new Map(), "full_time");
  assert.equal(tile.headline.figure.value, 75);
  assert.equal(tile.headline.figure.part, 3);
  assert.equal(tile.headline.figure.whole, 4);
  assert.ok(tile.supporting.some((l) => l.startsWith("Theirs")));
});

test("a stat nobody logged is not judged as a nought", () => {
  const [tile] = buildTiles(input([]), [{ key: "free_won", title: "Frees won" }], new Map(), "full_time");
  assert.equal(tile.headline.verdict, "no_data");
});

test("a tile with someone's unsent entries waits on them by name", () => {
  const rows = [row("tackle")];
  const waiting = new Map([["tackle", ["Seán"]]]);
  const [tile] = buildTiles(input(rows), [{ key: "tackle", title: "Tackles" }], new Map(), "half_time", waiting);
  assert.equal(tile.headline.verdict, "waiting");
  assert.deepEqual(tile.waitingOn, ["Seán"]);
});

test("a custom stat counts its own side, and is a rate of good outcomes", () => {
  const def = {
    id: "b",
    name: "Breaks",
    sideMode: "ask",
    askPlayer: false,
    askOpposition: false,
    askOutcome: true,
    scoreMode: "none",
    points: 0,
    archivedAt: null,
  };
  const e = (side, outcome) => ({ side, outcome, half: 1, playerNumber: null, oppositionNumber: null, ledToScore: null, score: null, originX: null, originY: null, destX: null, destY: null });
  const entries = [e("us", "positive"), e("us", "positive"), e("us", "negative"), e("opposition", "positive")];
  const targets = new Map([[customKey("b"), { measure: "rate", direction: "at_least", value: 50 }]]);
  const [tile] = buildTiles(input([], [{ def, entries }]), [{ key: customKey("b"), title: "Breaks" }], targets, "half_time");
  assert.equal(tile.headline.figure.value, 67);
  assert.equal(tile.headline.verdict, "met");
});

/* ------------------------------------------------------------ suggestions */

function tilesFor(spec) {
  // spec: key -> [actual, target, direction]
  const rows = [];
  const targets = new Map();
  for (const [key, [actual, value, direction]] of Object.entries(spec)) {
    for (let i = 0; i < actual; i++) rows.push(row(key, { half: 1, outcome: "positive" }));
    targets.set(key, { measure: "count", direction, value });
  }
  const menu = Object.keys(spec).map((key) => ({ key, title: key }));
  return (stage) => buildTiles(input(rows), menu, targets, stage);
}

test("half time suggests only what is off target, worst first", () => {
  const tiles = tilesFor({
    tackle: [30, 40, "at_least"], // pinned anyway
    free_conceded: [8, 10, "at_most"], // 8 against at most 5: 60% over
    free_won: [3, 10, "at_least"], // 3 against at least 5: 40% short
    turnover: [12, 20, "at_least"], // 12 against at least 10: fine
  })("half_time");
  assert.deepEqual(suggestTiles(tiles, ["tackle", "shot"], "half_time"), ["free_conceded", "free_won"]);
});

test("full time suggests the worst miss and the best success", () => {
  const tiles = tilesFor({
    free_conceded: [16, 10, "at_most"], // 60% over
    free_won: [8, 10, "at_least"], // 20% short
    turnover: [30, 20, "at_least"], // 50% over target
  })("full_time");
  assert.deepEqual(suggestTiles(tiles, [], "full_time"), ["free_conceded", "turnover"]);
});

test("a rate on too few attempts is not suggested", () => {
  const rows = [shot("wide"), shot("wide"), shot("point")];
  const tiles = buildTiles(input(rows), [{ key: "shot", title: "Shooting" }], new Map(), "half_time");
  assert.equal(tiles[0].headline.verdict, "missed");
  assert.deepEqual(suggestTiles(tiles, [], "half_time"), []);
});

/* --------------------------------------------------------------- timeline */

test("the timeline runs both totals, counts a goal as three, and finds unanswered runs", () => {
  const at = (min) => min * 60_000;
  const rows = [
    shot("point", { gameMs: at(2) }),
    theirShot("point", { gameMs: at(4) }),
    theirShot("goal", { gameMs: at(6) }),
    theirShot("point", { gameMs: at(9) }),
    shot("wide", { gameMs: at(10) }),
    shot("goal", { gameMs: at(12) }),
    shot("point", { half: 2, gameMs: at(33) }),
    shot("point"), // no time
  ];
  const t = scoreTimeline(rows, 30, "full_time");
  assert.deepEqual(
    t.ours.map((s) => s.total),
    [1, 4, 5],
  );
  assert.deepEqual(
    t.theirs.map((s) => s.total),
    [1, 4, 5],
  );
  assert.equal(t.runs.length, 1);
  assert.equal(t.runs[0].side, "opposition");
  assert.equal(t.runs[0].scores, 3);
  assert.equal(t.untimed, 1);
  assert.equal(t.halfTimeAt, at(30));

  const ht = scoreTimeline(rows, 30, "half_time");
  assert.equal(ht.ours.length, 2);
  assert.equal(ht.endAt, at(30));
});

test("first-half stoppage time pushes the second half along the chart", () => {
  const at = (min) => min * 60_000;
  const rows = [shot("point", { gameMs: at(33) }), shot("point", { half: 2, gameMs: at(31) })];
  const t = scoreTimeline(rows, 30, "full_time");
  assert.equal(t.halfTimeAt, at(33));
  assert.ok(t.ours[1].atMs > t.ours[0].atMs);
  assert.equal(t.ours[1].clockMs, at(31));
});

test("no runs and no line for them when their shots were not logged", () => {
  const rows = [shot("point", { gameMs: 1 }), shot("point", { gameMs: 2 }), shot("point", { gameMs: 3 })];
  const t = scoreTimeline(rows, 30, "half_time");
  assert.equal(t.theirs, null);
  assert.deepEqual(t.runs, []);
});

test("the score at the end of the stage", () => {
  const rows = [shot("goal"), shot("point", { half: 2 }), theirShot("point")];
  assert.deepEqual(stageScore(rows, "half_time", "hurling"), { us: "1-0", them: "0-1" });
  assert.deepEqual(stageScore(rows, "full_time", "hurling"), { us: "1-1", them: "0-1" });
});

test("the page opens on full time once the second half is on", () => {
  assert.equal(defaultStage([{ half: 1 }], false), "half_time");
  assert.equal(defaultStage([{ half: 1 }], true), "full_time");
  assert.equal(defaultStage([{ half: 2 }], false), "full_time");
});
