import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OUTCOME_COLOURS,
  STAT_LEAD_IN_MS,
  chronological,
  countShots,
  deliveryTally,
  describeStat,
  effectiveOutcome,
  gameMinute,
  matchResult,
  jerseyNumber,
  normaliseEntry,
  oppositionRuns,
  percentOf,
  playerStatLines,
  possessionTally,
  puckoutBreakdown,
  puckoutOutcome,
  puckoutWinner,
  shootingEfficiency,
  statColour,
  statShape,
  statTiming,
  stepToStat,
  summariseShooting,
  summariseStats,
} from "../src/lib/hurling/stats.ts";

const shot = (shotResult, playerNumber = null) => ({
  statType: "shot",
  outcome: null,
  shotResult,
  playerNumber,
});

const puckout = (puckoutTakenBy, outcome, playerNumber = null) => ({
  statType: "puckout",
  outcome,
  puckoutTakenBy,
  playerNumber,
});

test("shooting efficiency is scored over shots taken, both ways round", () => {
  // 2-7 from 14 shots: nine scored, five wide.
  const e = shootingEfficiency({ goals: 2, points: 7, missed: 5 });
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
  const e = shootingEfficiency({ goals: 0, points: 0, missed: 0 });
  assert.equal(e.percent, 0);
  assert.equal(e.label, "0/0 · 0%");
  assert.equal(e.notation, "0-0 from 0 shots");
  assert.ok(Number.isFinite(e.percent));
});

test("a single shot is not pluralised", () => {
  assert.equal(shootingEfficiency({ goals: 0, points: 1, missed: 0 }).notation, "0-1 from 1 shot");
});

test("percentages round to whole numbers", () => {
  assert.equal(percentOf(1, 3), 33);
  assert.equal(percentOf(2, 3), 67);
  assert.equal(percentOf(0, 0), 0);
});

test("shots are counted by result", () => {
  const rows = [shot("goal"), shot("point"), shot("point"), shot("wide"), { statType: "tackle", outcome: null }];
  assert.deepEqual(countShots(rows), { goals: 1, points: 2, missed: 1 });
});

test("a result needs their shots before it claims a margin", () => {
  assert.equal(matchResult([{ statType: "tackle", outcome: null }]), null);

  const oursOnly = matchResult([shot("goal"), shot("point"), shot("wide")]);
  assert.deepEqual(oursOnly, { us: { cul: 1, cuilin: 1 }, them: null, margin: null });

  const both = matchResult([
    shot("goal"),
    shot("point"),
    { ...shot("point"), side: "opposition" },
    { ...shot("point"), side: "opposition" },
  ]);
  assert.deepEqual(both.them, { cul: 0, cuilin: 2 });
  assert.equal(both.margin, 2);
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
    { statType: "tackle", outcome: null, playerNumber: 11 },
    { statType: "tackle", outcome: null, playerNumber: null },
    shot("goal", 11),
    shot("wide", 11),
    { statType: "turnover", outcome: "positive", ledToScore: true, playerNumber: 11 },
    { statType: "free_conceded", outcome: null, playerNumber: 7 },
    puckout("us", "positive", 7),
    // A lost one reaches the server without a player at all (see the action).
    puckout("us", "negative", null),
  ];

  const lines = playerStatLines(rows);
  const eleven = lines.get(11);
  assert.equal(eleven.tackles, 1);
  assert.equal(eleven.goals, 1);
  assert.equal(eleven.missed, 1);
  assert.equal(eleven.turnoversWon, 1);
  assert.equal(eleven.turnoversLedToScore, 1);
  assert.equal(eleven.entries, 4);

  const seven = lines.get(7);
  assert.equal(seven.freesConceded, 1);
  assert.equal(seven.puckoutsWon, 1);

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
    playerNumber: 11,
  });
  assert.equal(won.playerNumber, 11);

  // The receiver is the only player a poc amach can credit, so a lost or
  // unclear one drops the name rather than pinning it on somebody.
  for (const outcome of ["negative", "unclear"]) {
    const row = normaliseEntry({
      statType: "puckout",
      puckoutTakenBy: "opposition",
      outcome,
      playerNumber: 11,
    });
    assert.equal(row.playerNumber, null);
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
  // A tackle keeps where it was made — the analyst's maps plot them.
  assert.equal(tackle.originX, 0.4);

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

/* ------------------------------------------- the analyst's summary sheet */

const theirs = (shotResult, extra = {}) => ({ ...shot(shotResult), side: "opposition", ...extra });
const many = (n, row) => Array.from({ length: n }, () => ({ ...row }));

test("their shots are coloured from our side: their score is against us", () => {
  assert.equal(effectiveOutcome(theirs("point")), "negative");
  assert.equal(effectiveOutcome(theirs("wide")), "positive");
  assert.equal(effectiveOutcome(theirs("saved")), "positive");
  // A 65 or a ball kept after dropping short is still live, for either side.
  assert.equal(effectiveOutcome(theirs("sixty_five")), "unclear");
  assert.equal(effectiveOutcome(shot("retained")), "unclear");
  assert.equal(statShape(theirs("goal")), "ring");
  // A row from before sides existed was ours.
  assert.equal(effectiveOutcome(shot("saved")), "negative");
});

test("their shot names nobody, and a shot defaults to ours from play", () => {
  const row = normaliseEntry({ statType: "shot", shotResult: "point", side: "opposition", playerNumber: 11 });
  assert.equal(row.playerNumber, null);
  assert.equal(row.outcome, "negative");

  const legacy = normaliseEntry({ statType: "shot", shotResult: "point", playerNumber: 11 });
  assert.equal(legacy.side, "us");
  assert.equal(legacy.shotKind, "play");
  assert.equal(legacy.playerNumber, 11);
});

test("score opportunities split by from play and placed ball, and by what they came from", () => {
  // Our side of the example sheet: 4-17 from 35 attempts.
  const rows = [
    ...many(4, { ...shot("goal"), attemptSource: "turnover" }),
    ...many(11, { ...shot("point"), attemptSource: "other" }),
    ...many(8, shot("wide")),
    ...many(3, shot("saved")),
    ...many(2, shot("lost")),
    ...many(6, { ...shot("point"), shotKind: "free" }),
    ...many(1, { ...shot("wide"), shotKind: "free" }),
    // Theirs must not leak into ours.
    ...many(5, theirs("point")),
  ];
  const s = summariseShooting(rows, "us");
  assert.equal(s.overall.fraction, "21/35");
  assert.equal(s.overall.percent, 60);
  assert.deepEqual(s.overall.score, { cul: 4, cuilin: 17 });
  assert.equal(s.fromPlay.fraction, "15/28");
  assert.equal(s.placed.fraction, "6/7");
  assert.equal(s.playResults.saved, 3);
  assert.equal(s.placedResults.point, 6);
  assert.deepEqual(s.sources.turnover, { attempts: 4, scored: 4 });
  assert.deepEqual(s.sources.other, { attempts: 11, scored: 11 });
  assert.equal(s.sources.unrecorded.attempts, 20);

  assert.equal(summariseShooting(rows, "opposition").overall.fraction, "5/5");
  // The team summary's shooting is ours alone.
  assert.equal(summariseStats(rows).shooting.total, 35);
});

test("a short poc amach only counts as retained once it gets past our 65", () => {
  // The example sheet: 60% (15/25).
  const ours = (outcome, puckoutLength, pastSixtyFive) => ({
    ...puckout("us", outcome),
    puckoutLength,
    pastSixtyFive,
  });
  const rows = [
    ...many(8, ours("positive", "short", true)),
    ...many(5, ours("positive", "short", false)),
    ...many(2, ours("positive", "medium", null)),
    ...many(2, ours("negative", "medium", null)),
    ...many(5, ours("positive", "long", null)),
    ...many(3, ours("negative", "long", null)),
  ];
  const b = puckoutBreakdown(rows, "us");
  assert.equal(b.taken, 25);
  assert.equal(b.byLength.short.kept, 13);
  assert.equal(b.shortPastSixtyFive, 8);
  assert.equal(b.shortHeldInside, 5);
  assert.equal(b.retained, 15);
  assert.equal(b.retainedPercent, 60);
});

test("their poc amach is read from their side: kept is theirs", () => {
  const rows = [
    { ...puckout("opposition", "negative"), puckoutLength: "short" },
    { ...puckout("opposition", "negative"), puckoutLength: "short" },
    { ...puckout("opposition", "positive"), puckoutLength: "long" },
  ];
  const b = puckoutBreakdown(rows, "opposition");
  assert.equal(b.byLength.short.kept, 2);
  assert.equal(b.byLength.long.lost, 1);
});

test("worked past our 65 only survives on our short poc amach that we won", () => {
  const base = { statType: "puckout", puckoutTakenBy: "us", puckoutLength: "short", pastSixtyFive: true };
  assert.equal(normaliseEntry({ ...base, outcome: "positive" }).pastSixtyFive, true);
  assert.equal(normaliseEntry({ ...base, outcome: "negative" }).pastSixtyFive, null);
  assert.equal(normaliseEntry({ ...base, puckoutLength: "long", outcome: "positive" }).pastSixtyFive, null);
  assert.equal(
    normaliseEntry({ ...base, puckoutTakenBy: "opposition", outcome: "positive" }).pastSixtyFive,
    null,
  );
});

test("an unforced loss is only ever a loss", () => {
  assert.throws(
    () => normaliseEntry({ statType: "turnover", outcome: "positive", possession: "unforced" }),
    /only ever a loss/,
  );
  const lost = normaliseEntry({ statType: "turnover", outcome: "negative", possession: "unforced" });
  assert.equal(lost.possession, "unforced");
  // A turnover logged before the kinds existed was a plain turnover.
  assert.equal(normaliseEntry({ statType: "turnover", outcome: "positive" }).possession, "turnover");
  assert.equal(describeStat(lost), "Unforced loss");
  assert.equal(describeStat({ statType: "turnover", outcome: "negative", possession: "sixty_forty" }), "60/40 ball lost");
});

test("the possession pivot counts tackles and each way the ball changed hands", () => {
  const rows = [
    { statType: "tackle", outcome: null, frontEight: true, playerNumber: 11 },
    { statType: "tackle", outcome: null, playerNumber: 11 },
    { statType: "turnover", outcome: "positive", possession: "sixty_forty", playerNumber: 7 },
    { statType: "turnover", outcome: "negative", possession: "unforced", playerNumber: null },
    { statType: "turnover", outcome: "negative" },
  ];
  const t = possessionTally(rows);
  assert.equal(t.totals.front_eight_tackle, 1);
  assert.equal(t.totals.tackle, 1);
  assert.equal(t.totals.sixty_forty_won, 1);
  assert.equal(t.totals.unforced_lost, 1);
  assert.equal(t.totals.turnover_lost, 1);
  const eleven = t.lines.find((l) => l.playerNumber === 11);
  assert.equal(eleven.total, 2);
  // Unnamed entries still count, on a line of their own.
  assert.equal(t.lines.find((l) => l.playerNumber === null).total, 2);
});

test("a delivery credits the striker and whoever it was aimed at", () => {
  const rows = [
    { statType: "delivery", outcome: "positive", playerNumber: 7, targetNumber: 11 },
    { statType: "delivery", outcome: "negative", playerNumber: 7, targetNumber: 11 },
    { statType: "delivery", outcome: "negative", playerNumber: null, targetNumber: null },
  ];
  const t = deliveryTally(rows);
  assert.deepEqual(t.totals, { struck: 3, received: 1, lost: 2 });
  assert.equal(t.lines.find((l) => l.playerNumber === 7).counts.struck, 2);
  assert.equal(t.lines.find((l) => l.playerNumber === 11).counts.lost, 1);
  // The target only survives on a delivery.
  assert.equal(normaliseEntry({ statType: "tackle", targetNumber: 11 }).targetNumber, null);
});

test("frees: one conceded against us, one won for us, and scorable is a flag", () => {
  assert.equal(effectiveOutcome({ statType: "free_won", outcome: null }), "positive");
  const rows = [
    { statType: "free_conceded", outcome: null, scorable: true },
    { statType: "free_conceded", outcome: null, scorable: false },
    { statType: "free_won", outcome: null },
  ];
  const s = summariseStats(rows);
  assert.equal(s.freesConceded, 2);
  assert.equal(s.scorableFreesConceded, 1);
  assert.equal(s.freesWon, 1);
  assert.equal(describeStat(rows[0]), "Scorable free conceded");
});

test("their shots describe themselves as theirs", () => {
  assert.equal(describeStat(theirs("point")), "Their cúilín");
  assert.equal(describeStat(theirs("wide", { shotKind: "free" })), "Their free wide");
  assert.equal(describeStat({ ...shot("point"), shotKind: "free" }), "Cúilín from a free");
});

test("the half comes from the footage's markers when they are set, else from the coach", () => {
  const markers = { throwIn: 60_000, halfTime: 60_000 + 30 * 60_000, secondHalf: 60_000 + 45 * 60_000 };
  // Ten minutes into the second half of a 30-minute-half game is the 40th minute.
  const late = statTiming({ half: 1, atMs: markers.secondHalf + 10 * 60_000 }, markers, 30);
  assert.equal(late.half, 2);
  assert.equal(late.gameMs, 40 * 60_000);
  assert.equal(gameMinute(late.gameMs), 41);

  // No markers: the coach's word stands, and there is no clock to give.
  assert.deepEqual(statTiming({ half: 2, atMs: 5_000 }, undefined), { half: 2, gameMs: null });
  assert.deepEqual(statTiming({ half: 1, atMs: 5_000 }, { throwIn: null }), { half: 1, gameMs: null });
  assert.equal(normaliseEntry({ statType: "free_won", half: 3 }).half, null);
});

test("chronological orders by half, then by clock only when the whole half has one", () => {
  const rows = [
    { id: "a", half: 2, gameMs: 40, createdAt: 1 },
    { id: "b", half: 1, gameMs: null, createdAt: 3 },
    { id: "c", half: 1, gameMs: 10, createdAt: 2 },
    { id: "d", half: 2, gameMs: 35, createdAt: 4 },
    { id: "e", half: null, gameMs: null, createdAt: 0 },
  ];
  // Half one has an entry with no clock, so it goes by logging order.
  assert.deepEqual(chronological(rows).map((r) => r.id), ["c", "b", "d", "a", "e"]);
});

test("a spell of four or more of their attempts without a reply is found, across half-time", () => {
  let t = 0;
  const at = (row, half) => ({ ...row, half, createdAt: t++ });
  const rows = [
    at(theirs("point"), 1),
    at(theirs("wide"), 1),
    at(shot("point"), 1), // our reply breaks the first spell at two
    at(theirs("wide"), 1),
    at(theirs("point"), 1),
    at(theirs("lost"), 2),
    at(theirs("point", { shotKind: "free" }), 2),
    at({ statType: "tackle", outcome: null }, 2), // not a shot, so not a reply
    at(theirs("goal"), 2),
    at(shot("wide"), 2),
    at(theirs("point"), 2),
  ];
  const runs = oppositionRuns(rows);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].length, 5);
  assert.equal(oppositionRuns(rows, 6).length, 0);
});

test("a stat is credited to a jersey number, and only one somebody could wear", () => {
  assert.equal(jerseyNumber(null), null);
  assert.equal(jerseyNumber(""), null);
  assert.equal(jerseyNumber("22"), 22);
  assert.equal(jerseyNumber(9), 9);
  for (const bad of [0, 100, 2.5, "x", -3]) {
    assert.throws(() => jerseyNumber(bad), /1 to 99/);
  }

  // A delivery carries two numbers: who struck it, and who it was aimed at.
  const row = normaliseEntry({ statType: "delivery", outcome: "positive", playerNumber: 6, targetNumber: "14" });
  assert.equal(row.playerNumber, 6);
  assert.equal(row.targetNumber, 14);
  assert.throws(() => normaliseEntry({ statType: "tackle", playerNumber: 0 }), /1 to 99/);
});
