import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OUTCOME_COLOURS,
  STAT_LEAD_IN_MS,
  countShots,
  describeStat,
  effectiveOutcome,
  normaliseEntry,
  percentOf,
  playerStatLines,
  puckoutOutcome,
  puckoutWinner,
  shootingEfficiency,
  statColour,
  statShape,
  stepToStat,
  summariseStats,
} from "../src/lib/hurling/stats.ts";

const shot = (shotResult, playerId = null) => ({
  statType: "shot",
  outcome: null,
  shotResult,
  playerId,
});

const puckout = (puckoutTakenBy, outcome, playerId = null) => ({
  statType: "puckout",
  outcome,
  puckoutTakenBy,
  playerId,
});

test("shooting efficiency is scored over shots taken, both ways round", () => {
  // 2-7 from 14 shots: nine scored, five wide.
  const e = shootingEfficiency({ goals: 2, points: 7, wides: 5 });
  assert.equal(e.scored, 9);
  assert.equal(e.total, 14);
  assert.equal(e.fraction, "9/14");
  assert.equal(e.percent, 64);
  assert.equal(e.label, "9/14 · 64%");
  // The scoreline is in GAA notation, and a cúl is still worth three.
  assert.deepEqual(e.score, { cul: 2, cuilin: 7 });
  assert.equal(e.notation, "2-7 from 14 shots");
});

test("no shots is 0%, not a division by zero", () => {
  const e = shootingEfficiency({ goals: 0, points: 0, wides: 0 });
  assert.equal(e.percent, 0);
  assert.equal(e.label, "0/0 · 0%");
  assert.equal(e.notation, "0-0 from 0 shots");
  assert.ok(Number.isFinite(e.percent));
});

test("a single shot is not pluralised", () => {
  assert.equal(shootingEfficiency({ goals: 0, points: 1, wides: 0 }).notation, "0-1 from 1 shot");
});

test("percentages round to whole numbers", () => {
  assert.equal(percentOf(1, 3), 33);
  assert.equal(percentOf(2, 3), 67);
  assert.equal(percentOf(0, 0), 0);
});

test("shots are counted by result", () => {
  const rows = [shot("goal"), shot("point"), shot("point"), shot("wide"), { statType: "tackle", outcome: null }];
  assert.deepEqual(countShots(rows), { goals: 1, points: 2, wides: 1 });
});

test("a poc amach is coloured by who won it, not by whose puck it was", () => {
  // Winning either team's restart is green for us; losing either is red.
  assert.equal(statColour(puckout("us", puckoutOutcome("us"))), OUTCOME_COLOURS.positive);
  assert.equal(statColour(puckout("opposition", puckoutOutcome("us"))), OUTCOME_COLOURS.positive);
  assert.equal(statColour(puckout("us", puckoutOutcome("opposition"))), OUTCOME_COLOURS.negative);
  assert.equal(
    statColour(puckout("opposition", puckoutOutcome("opposition"))),
    OUTCOME_COLOURS.negative,
  );
  // A genuinely contested break is orange whoever struck it.
  assert.equal(statColour(puckout("us", puckoutOutcome("unclear"))), OUTCOME_COLOURS.unclear);
});

test("the puckout winner round-trips through the stored outcome", () => {
  for (const wonBy of ["us", "opposition", "unclear"]) {
    assert.equal(puckoutWinner(puckoutOutcome(wonBy)), wonBy);
  }
  // Nothing stored reads as unclear rather than as a win for anybody.
  assert.equal(puckoutWinner(null), "unclear");
});

test("a shot's outcome follows its result, and a free conceded is always against us", () => {
  assert.equal(effectiveOutcome(shot("goal")), "positive");
  assert.equal(effectiveOutcome(shot("point")), "positive");
  assert.equal(effectiveOutcome(shot("wide")), "negative");
  assert.equal(effectiveOutcome({ statType: "free_conceded", outcome: null }), "negative");
  assert.equal(statColour({ statType: "free_conceded", outcome: null }), OUTCOME_COLOURS.negative);
  // A tackle has no outcome axis at all.
  assert.equal(effectiveOutcome({ statType: "tackle", outcome: null }), null);
});

test("turnovers leading to a score are a flag, counted and given as a share", () => {
  const rows = [
    { statType: "turnover", outcome: "positive", ledToScore: true },
    { statType: "turnover", outcome: "positive", ledToScore: true },
    { statType: "turnover", outcome: "positive", ledToScore: false },
    { statType: "turnover", outcome: "positive", ledToScore: false },
    { statType: "turnover", outcome: "negative" },
  ];
  const { turnovers } = summariseStats(rows);
  assert.equal(turnovers.won, 4);
  assert.equal(turnovers.conceded, 1);
  assert.equal(turnovers.ledToScore, 2);
  // The share is of the turnovers we won, not of every turnover in the game.
  assert.equal(turnovers.ledToScorePercent, 50);
});

test("puckouts summarise as two categories, each read from our side", () => {
  const rows = [
    puckout("us", "positive"),
    puckout("us", "positive"),
    puckout("us", "negative"),
    puckout("us", "unclear"),
    puckout("opposition", "positive"),
    puckout("opposition", "negative"),
  ];
  const { ourPuckouts, theirPuckouts } = summariseStats(rows);
  assert.deepEqual(ourPuckouts, { taken: 4, won: 2, lost: 1, unclear: 1, percent: 50 });
  assert.deepEqual(theirPuckouts, { taken: 2, won: 1, lost: 1, unclear: 0, percent: 50 });
});

test("the summary counts every stat type from the same rows", () => {
  const rows = [
    { statType: "tackle", outcome: null },
    { statType: "tackle", outcome: null },
    { statType: "free_conceded", outcome: null },
    { statType: "delivery", outcome: "positive" },
    { statType: "delivery", outcome: "negative" },
    { statType: "delivery", outcome: "positive" },
    shot("goal"),
    shot("wide"),
  ];
  const s = summariseStats(rows);
  assert.equal(s.entries, 8);
  assert.equal(s.tackles, 2);
  assert.equal(s.freesConceded, 1);
  assert.equal(s.deliveries.won, 2);
  assert.equal(s.deliveries.lost, 1);
  assert.equal(s.deliveries.percent, 67);
  assert.equal(s.shooting.label, "1/2 · 50%");
});

test("player lines credit only what is attributed, and a lost poc amach names nobody", () => {
  const rows = [
    { statType: "tackle", outcome: null, playerId: "reid" },
    { statType: "tackle", outcome: null, playerId: null },
    shot("goal", "reid"),
    shot("wide", "reid"),
    { statType: "turnover", outcome: "positive", ledToScore: true, playerId: "reid" },
    { statType: "free_conceded", outcome: null, playerId: "walsh" },
    puckout("us", "positive", "walsh"),
    // A lost one reaches the server without a player at all (see the action).
    puckout("us", "negative", null),
  ];

  const lines = playerStatLines(rows);
  const reid = lines.get("reid");
  assert.equal(reid.tackles, 1);
  assert.equal(reid.goals, 1);
  assert.equal(reid.wides, 1);
  assert.equal(reid.turnoversWon, 1);
  assert.equal(reid.turnoversLedToScore, 1);
  assert.equal(reid.entries, 4);

  const walsh = lines.get("walsh");
  assert.equal(walsh.freesConceded, 1);
  assert.equal(walsh.puckoutsWon, 1);

  // The unattributed tackle still counts for the team, just not for a player.
  assert.equal(summariseStats(rows).tackles, 2);
  assert.equal(lines.size, 2);
});

test("a shot is logged once: the outcome comes from the result", () => {
  assert.equal(normaliseEntry({ statType: "shot", shotResult: "goal" }).outcome, "positive");
  assert.equal(normaliseEntry({ statType: "shot", shotResult: "wide" }).outcome, "negative");
  // Claiming a shot without saying what happened to it is refused.
  assert.throws(() => normaliseEntry({ statType: "shot" }), /cúl, a cúilín or a wide/);
});

test("a poc amach we did not win names nobody", () => {
  const won = normaliseEntry({
    statType: "puckout",
    puckoutTakenBy: "us",
    outcome: "positive",
    playerId: "reid",
  });
  assert.equal(won.playerId, "reid");

  // The receiver is the only player a poc amach can credit, so a lost or
  // unclear one drops the name rather than pinning it on somebody.
  for (const outcome of ["negative", "unclear"]) {
    const row = normaliseEntry({
      statType: "puckout",
      puckoutTakenBy: "opposition",
      outcome,
      playerId: "reid",
    });
    assert.equal(row.playerId, null);
    assert.equal(row.puckoutTakenBy, "opposition");
  }

  assert.throws(() => normaliseEntry({ statType: "puckout", outcome: "positive" }), /Whose poc amach/);
});

test("led-to-a-score only survives on a turnover we won", () => {
  const won = normaliseEntry({ statType: "turnover", outcome: "positive", ledToScore: true });
  assert.equal(won.ledToScore, true);
  const conceded = normaliseEntry({ statType: "turnover", outcome: "negative", ledToScore: true });
  assert.equal(conceded.ledToScore, null);
});

test("columns that do not apply to a stat are cleared, not carried over", () => {
  // Editing a shot into a tackle must not leave the shot result behind.
  const tackle = normaliseEntry({
    statType: "tackle",
    shotResult: "goal",
    outcome: "positive",
    destX: 0.5,
    destY: 0.5,
    originX: 0.4,
    originY: 0.6,
  });
  assert.equal(tackle.shotResult, null);
  assert.equal(tackle.outcome, null);
  assert.equal(tackle.destX, null);
  // A tackle is a tally: it takes no place on the pitch either.
  assert.equal(tackle.originX, null);

  // Only a delivery keeps a destination.
  const shot = normaliseEntry({
    statType: "shot",
    shotResult: "point",
    originX: 0.8,
    originY: 0.5,
    destX: 0.9,
    destY: 0.5,
  });
  assert.equal(shot.destX, null);
  assert.equal(shot.originX, 0.8);
});

test("half a point is no point, and a click outside the pitch is pulled back on", () => {
  const missingY = normaliseEntry({ statType: "shot", shotResult: "wide", originX: 0.5 });
  assert.equal(missingY.originX, null);

  const outside = normaliseEntry({
    statType: "delivery",
    outcome: "positive",
    originX: -0.4,
    originY: 0.5,
    destX: 1.8,
    destY: 0.5,
  });
  assert.equal(outside.originX, 0);
  assert.equal(outside.destX, 1);
});

test("a delivery has to be won or lost, and rubbish is refused outright", () => {
  assert.throws(() => normaliseEntry({ statType: "delivery" }), /delivery/);
  assert.throws(() => normaliseEntry({ statType: "delivery", outcome: "unclear" }), /delivery/);
  assert.throws(() => normaliseEntry({ statType: "hooks_and_blocks" }), /not a stat we log/);
});

test("an entry describes itself the way a coach would say it", () => {
  assert.equal(describeStat(shot("point")), "Cúilín");
  assert.equal(describeStat(shot("wide")), "Shot wide");
  assert.equal(describeStat({ statType: "delivery", outcome: "negative" }), "Delivery lost");
  assert.equal(
    describeStat({ statType: "turnover", outcome: "positive", ledToScore: true }),
    "Turnover won, we scored from it",
  );
  // Whose puck it was and who won it are separate facts, and both are said.
  assert.equal(describeStat(puckout("opposition", "positive")), "Their poc amach, we won it");
  assert.equal(describeStat(puckout("us", "negative")), "Our poc amach, lost");
  assert.equal(describeStat(puckout("us", "unclear")), "Our poc amach, broke unclear");
});

test("a mark says its outcome in shape as well as colour", () => {
  // Green against red is the pair colour-blind readers cannot separate, so
  // the shape is not decoration — it is the fallback channel.
  assert.equal(statShape(shot("goal")), "filled");
  assert.equal(statShape(shot("wide")), "ring");
  assert.equal(statShape(puckout("us", "unclear")), "dashed");
  assert.equal(statShape({ statType: "free_conceded", outcome: null }), "ring");
  // Shape and colour never disagree.
  assert.equal(statColour(shot("goal")), OUTCOME_COLOURS.positive);
  assert.equal(statColour(shot("wide")), OUTCOME_COLOURS.negative);
});

test("stepping walks through one kind of stat, in both directions", () => {
  // A delivery every half minute, so "watch the deliveries" is a walk.
  const entries = [{ atMs: 30_000 }, { atMs: 60_000 }, { atMs: 90_000 }];

  // From the top of the file, the first one is next.
  assert.equal(stepToStat(entries, 0, 1).atMs, 30_000);
  assert.equal(stepToStat(entries, 0, -1), null);

  // A jump lands a lead-in early, so stepping on from there must not find
  // the entry it just took you to — it finds the one after it.
  const watching = 60_000 - STAT_LEAD_IN_MS;
  assert.equal(stepToStat(entries, watching, 1).atMs, 90_000);
  assert.equal(stepToStat(entries, watching, -1).atMs, 30_000);

  // Past the last one there is nowhere forward to go.
  assert.equal(stepToStat(entries, 120_000, 1), null);
  assert.equal(stepToStat(entries, 120_000, -1).atMs, 90_000);
});

test("entries typed up without footage are not on the timeline", () => {
  // A sheet filled in after the whistle has no timestamps, so those entries
  // cannot be stepped to — and must not break the ones that can.
  const mixed = [{ atMs: null }, { atMs: 40_000 }, {}];
  assert.equal(stepToStat(mixed, 0, 1).atMs, 40_000);
  assert.equal(stepToStat([{ atMs: null }], 0, 1), null);
});

test("stepping does not care what order the sheet arrives in", () => {
  // Rows come back ordered by when they were logged, which is not the order
  // they happened in once a coach goes back and fills in a gap.
  const outOfOrder = [{ atMs: 90_000 }, { atMs: 30_000 }, { atMs: 60_000 }];
  assert.equal(stepToStat(outOfOrder, 0, 1).atMs, 30_000);
  assert.equal(stepToStat(outOfOrder, 200_000, -1).atMs, 90_000);
});
