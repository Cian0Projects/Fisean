import { test } from "node:test";
import assert from "node:assert/strict";
import {
  asksHowItEnded,
  awaitingEnd,
  comesAfter,
  defaultRestartLine,
  endChoices,
  landedShort,
  lineReach,
  openRestart,
  pastLine,
  restartLadder,
  restartStage,
  settleFrom,
  stageLabel,
  stageOutcome,
} from "../src/lib/hurling/restart-line.ts";

// The 45 is about 0.31 of the way up the default pitch, the 65 about 0.45.
const restart = (takenBy, outcome, x, extra = {}) => ({
  statType: "puckout",
  puckoutTakenBy: takenBy,
  outcome,
  originX: x,
  originY: 0.5,
  restartLine: "45",
  restartEnd: null,
  createdAt: 1,
  ...extra,
});

test("the line starts where each code plays its short game", () => {
  assert.equal(defaultRestartLine("hurling"), "45");
  assert.equal(defaultRestartLine("camogie"), "45");
  assert.equal(defaultRestartLine("football"), "halfway");
  assert.equal(defaultRestartLine("ladies_football"), "halfway");
});

test("past the line is counted from the end of the side taking it", () => {
  assert.ok(lineReach("45") < lineReach("65") && lineReach("65") < lineReach("halfway"));
  assert.equal(pastLine(0.2, "us", "45"), false);
  assert.equal(pastLine(0.4, "us", "45"), true);
  // Theirs start at the far end, so it is mirrored.
  assert.equal(pastLine(0.8, "opposition", "45"), false);
  assert.equal(pastLine(0.6, "opposition", "45"), true);
});

test("short of the line is read from the mark, or the length where it can say", () => {
  assert.equal(landedShort(restart("us", "positive", 0.2), "45"), true);
  assert.equal(landedShort(restart("us", "positive", 0.4), "45"), false);
  assert.equal(landedShort(restart("us", "positive", 0.4), "65"), true);
  const unplaced = (puckoutLength) => ({ ...restart("us", "positive", null), originY: null, puckoutLength });
  assert.equal(landedShort(unplaced("short"), "45"), true);
  assert.equal(landedShort(unplaced("medium"), "halfway"), true);
  assert.equal(landedShort(unplaced("medium"), "45"), false);
  // A mid one judged at the 65 could be either side of it: left out, not guessed.
  assert.equal(landedShort(unplaced("medium"), "65"), null);
  assert.equal(landedShort(unplaced(null), "45"), null);
});

test("only a short one its taker won asks how it ended", () => {
  assert.equal(asksHowItEnded(restart("us", "positive", 0.2)), true);
  assert.equal(asksHowItEnded(restart("us", "negative", 0.2)), false);
  assert.equal(asksHowItEnded(restart("us", "positive", 0.6)), false);
  assert.equal(asksHowItEnded(restart("us", "positive", 0.2, { restartLine: null })), false);
  // Theirs is won by them when the outcome is against us.
  assert.equal(asksHowItEnded(restart("opposition", "negative", 0.8)), true);
  assert.equal(asksHowItEnded(restart("opposition", "positive", 0.8)), false);
  assert.equal(awaitingEnd(restart("us", "positive", 0.2, { restartEnd: "worked_through" })), false);
});

test("each judged restart has one stage", () => {
  assert.equal(restartStage(restart("us", "negative", 0.2)), "lost_first");
  assert.equal(restartStage(restart("us", "unclear", 0.2)), "unclear");
  assert.equal(restartStage(restart("us", "positive", 0.2)), "not_settled");
  assert.equal(restartStage(restart("us", "positive", 0.2, { restartEnd: "lost_past" })), "lost_past");
  // Won beyond the line was never a short one.
  assert.equal(restartStage(restart("us", "positive", 0.6)), null);
  assert.equal(restartStage({ statType: "shot", outcome: "positive" }), null);
});

test("colour is ours: their restart worked through is red", () => {
  assert.equal(stageOutcome("worked_through", "us"), "positive");
  assert.equal(stageOutcome("lost_before", "us"), "negative");
  assert.equal(stageOutcome("worked_through", "opposition"), "negative");
  assert.equal(stageOutcome("lost_first", "opposition"), "positive");
});

test("the stages are said from our side, naming the line", () => {
  assert.equal(stageLabel("lost_before", "us", "45"), "Lost before our 45");
  assert.equal(stageLabel("lost_past", "opposition", "65"), "Won past their 65");
  assert.equal(stageLabel("lost_first", "opposition", "halfway"), "Won on the first ball");
  assert.deepEqual(
    endChoices("us", "halfway").map((c) => c.label),
    ["Worked through", "Lost before halfway", "Lost past halfway"],
  );
});

test("our open restart is settled by what we log next", () => {
  const open = restart("us", "positive", 0.15);
  assert.equal(settleFrom(open, { statType: "shot", outcome: "positive", side: "us" }).restartEnd, "worked_through");
  assert.equal(settleFrom(open, { statType: "free_won", outcome: null }).restartEnd, "worked_through");
  assert.equal(settleFrom(open, { statType: "delivery", outcome: "positive" }).restartEnd, "worked_through");

  // A ball lost is before or past the line by where it was lost, and says who.
  const before = settleFrom(open, { statType: "turnover", outcome: "negative", originX: 0.2, originY: 0.3, playerNumber: 7 });
  assert.deepEqual(before, { restartEnd: "lost_before", lostByNumber: 7, lostAt: { x: 0.2, y: 0.3 } });
  const past = settleFrom(open, { statType: "turnover", outcome: "negative", originX: 0.35, originY: 0.3 });
  assert.equal(past.restartEnd, "lost_past");
  // A delivery lost went where it landed.
  assert.equal(
    settleFrom(open, { statType: "delivery", outcome: "negative", originX: 0.2, originY: 0.5, destX: 0.6, destY: 0.5 })
      .restartEnd,
    "lost_past",
  );

  // Unplaced, nobody can say which side of the line: it waits for the tap.
  assert.equal(settleFrom(open, { statType: "turnover", outcome: "negative" }), null);
  // Their shot, a tackle, the next restart: no answer.
  assert.equal(settleFrom(open, { statType: "shot", outcome: "negative", side: "opposition" }), null);
  assert.equal(settleFrom(open, { statType: "tackle", outcome: null }), null);
  assert.equal(settleFrom(open, restart("opposition", "negative", 0.9)), null);
  // Already settled, or never asked.
  assert.equal(settleFrom({ ...open, restartEnd: "lost_past" }, { statType: "free_won", outcome: null }), null);
});

test("their open restart is settled from our side", () => {
  const open = restart("opposition", "negative", 0.85);
  assert.equal(
    settleFrom(open, { statType: "shot", outcome: "negative", side: "opposition" }).restartEnd,
    "worked_through",
  );
  assert.equal(settleFrom(open, { statType: "free_conceded", outcome: null }).restartEnd, "worked_through");
  const pressed = settleFrom(open, {
    statType: "turnover",
    outcome: "positive",
    originX: 0.9,
    originY: 0.5,
    oppositionNumber: 4,
  });
  assert.deepEqual(pressed, { restartEnd: "lost_before", lostByNumber: 4, lostAt: { x: 0.9, y: 0.5 } });
  assert.equal(
    settleFrom(open, { statType: "free_won", outcome: null, originX: 0.5, originY: 0.5 }).restartEnd,
    "lost_past",
  );
  assert.equal(settleFrom(open, { statType: "shot", outcome: "positive", side: "us" }), null);
});

test("an entry from before the restart does not settle it", () => {
  const open = { ...restart("us", "positive", 0.15), videoId: "v", atMs: 60_000, half: 1, halfMs: 600_000 };
  const earlier = { statType: "free_won", outcome: null, videoId: "v", atMs: 30_000 };
  assert.equal(comesAfter(open, earlier), false);
  assert.equal(settleFrom(open, earlier), null);
  assert.equal(comesAfter(open, { statType: "free_won", videoId: "v", atMs: 90_000 }), true);
  // On the line, by the half and the time into it.
  assert.equal(comesAfter(open, { statType: "free_won", half: 1, halfMs: 500_000 }), false);
  assert.equal(comesAfter(open, { statType: "free_won", half: 2, halfMs: 10_000 }), true);
  // Nothing to compare: the order logged is the order played.
  assert.equal(comesAfter(open, { statType: "free_won" }), true);
});

test("the open restart is the last one logged, while it waits", () => {
  const first = restart("us", "positive", 0.15, { createdAt: 1 });
  const shot = { statType: "shot", outcome: "positive", side: "us", createdAt: 2 };
  assert.equal(openRestart([first, shot]), first);
  // A newer restart closes it, unsettled.
  const next = restart("opposition", "positive", 0.9, { createdAt: 3 });
  assert.equal(openRestart([first, shot, next]), null);
  assert.equal(openRestart([{ ...first, restartEnd: "worked_through" }]), null);
});

test("the ladder counts the four answers and keeps the rest apart", () => {
  const rows = [
    restart("us", "negative", 0.2),
    restart("us", "positive", 0.2, { restartEnd: "lost_before" }),
    restart("us", "positive", 0.2, { restartEnd: "lost_past" }),
    restart("us", "positive", 0.2, { restartEnd: "worked_through" }),
    restart("us", "positive", 0.2, { restartEnd: "worked_through" }),
    restart("us", "positive", 0.2, { restartEnd: "worked_through" }),
    restart("us", "unclear", 0.2),
    restart("us", "positive", 0.2),
    // Long, and theirs: not in our ladder.
    restart("us", "positive", 0.8),
    restart("opposition", "negative", 0.9),
  ];
  const l = restartLadder(rows, "us");
  assert.deepEqual(
    { ...l },
    {
      line: "45",
      counted: 6,
      lostFirst: 1,
      lostBefore: 1,
      lostPast: 1,
      workedThrough: 3,
      unclear: 1,
      notSettled: 1,
      percent: 50,
    },
  );
  // Theirs that they won and nobody settled: judged, but not counted.
  assert.equal(restartLadder(rows, "opposition").counted, 0);
  assert.equal(restartLadder(rows, "opposition").notSettled, 1);
  // A season that changed its line names no single line.
  assert.equal(restartLadder([...rows, restart("us", "negative", 0.2, { restartLine: "65" })], "us").line, null);
  assert.equal(restartLadder([restart("us", "positive", 0.8)], "us"), null);
});
