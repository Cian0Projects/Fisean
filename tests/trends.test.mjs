import { test } from "node:test";
import assert from "node:assert/strict";
import {
  competitionsOf,
  creditedRows,
  loggedOn,
  matchLines,
  perMatch,
  playerMatches,
  readScope,
  scoped,
  scoresPerMatch,
  seasonLineOf,
  seasonRecord,
  seasonsOf,
  squadSeason,
  teamSeason,
  unnamed,
} from "../src/lib/hurling/trends.ts";

const match = (id, playedOn, competition = "League", opponent = id) => ({ id, playedOn, competition, opponent });
const sheet = (m, rows, lineup = {}) => ({
  match: m,
  rows,
  lineup: new Map(Object.entries(lineup).map(([n, u]) => [Number(n), u])),
});
const shot = (playerNumber, shotResult, extra = {}) => ({
  statType: "shot",
  outcome: ["goal", "point", "two_pointer"].includes(shotResult) ? "positive" : "negative",
  side: "us",
  playerNumber,
  shotResult,
  ...extra,
});
const theirShot = (shotResult) => ({ ...shot(null, shotResult), side: "opposition", outcome: "negative" });
const turnover = (playerNumber, outcome) => ({ statType: "turnover", outcome, playerNumber });
const tackle = (playerNumber) => ({ statType: "tackle", outcome: null, playerNumber });

/* ------------------------------------------------------------------ scope */

test("seasons are calendar years, newest first", () => {
  const ms = [match("a", "2025-05-01"), match("b", "2026-03-01"), match("c", "2026-08-01")];
  assert.deepEqual(seasonsOf(ms), ["2026", "2025"]);
});

test("competitions are trimmed but never merged by case", () => {
  const ms = [match("a", "2026-01-01", " League "), match("b", "2026-02-01", "league"), match("c", "2025-01-01", "Cup")];
  assert.deepEqual(competitionsOf(ms, "2026").sort(), ["League", "league"].sort());
  assert.equal(competitionsOf(ms, null).length, 3);
  assert.equal(competitionsOf(ms, null)[0], "Cup");
});

test("a scope falls back to the latest season, and drops a competition not played in it", () => {
  const ms = [match("a", "2025-05-01", "Cup"), match("b", "2026-03-01", "League")];
  assert.deepEqual(readScope(ms, {}), { season: "2026", competition: null });
  assert.deepEqual(readScope(ms, { season: "1999" }), { season: "2026", competition: null });
  assert.deepEqual(readScope(ms, { season: "all" }), { season: null, competition: null });
  assert.deepEqual(readScope(ms, { season: "2026", competition: "Cup" }), { season: "2026", competition: null });
  assert.deepEqual(readScope(ms, { season: "2025", competition: "Cup" }), { season: "2025", competition: "Cup" });
});

test("scoped sheets come back oldest first", () => {
  const sheets = [sheet(match("b", "2026-06-01"), []), sheet(match("a", "2026-03-01"), []), sheet(match("z", "2025-01-01"), [])];
  assert.deepEqual(
    scoped(sheets, { season: "2026", competition: null }).map((s) => s.match.id),
    ["a", "b"],
  );
});

/* --------------------------------------------------------------- coverage */

test("their shots are a kind of their own when saying what a sheet logged", () => {
  assert.deepEqual([...loggedOn([shot(1, "point")])], ["shot"]);
  assert.deepEqual([...loggedOn([theirShot("wide")])].sort(), ["their_shot"]);
});

test("a figure per match divides by the matches that logged it, and is null for none", () => {
  assert.equal(perMatch(7, 2), 3.5);
  assert.equal(perMatch(1, 3), 0.3);
  assert.equal(perMatch(5, 0), null);
});

test("a sheet that never logged turnovers does not drag the season's average down", () => {
  const sheets = [
    sheet(match("a", "2026-01-01"), [turnover(1, "positive"), turnover(2, "positive"), turnover(3, "negative")]),
    sheet(match("b", "2026-02-01"), [shot(1, "point")]),
  ];
  const season = teamSeason(sheets);
  assert.equal(season.matches, 2);
  assert.equal(season.logged.turnover, 1);
  assert.equal(perMatch(season.summary.turnovers.won, season.logged.turnover), 2);
});

/* ------------------------------------------------------------------- team */

test("season efficiency is one pile of shots, not an average of percentages", () => {
  const sheets = [
    sheet(match("a", "2026-01-01"), [shot(1, "point"), shot(1, "wide"), shot(1, "wide"), shot(1, "wide")]),
    sheet(match("b", "2026-02-01"), [shot(1, "point")]),
  ];
  // 2 of 5 is 40%; averaging 25% and 100% would say 63%.
  assert.equal(teamSeason(sheets).shooting.overall.percent, 40);
});

test("their shooting is null when no sheet logged it", () => {
  assert.equal(teamSeason([sheet(match("a", "2026-01-01"), [shot(1, "point")])]).theirShooting, null);
});

test("halves split our shots, and count the ones with no half apart", () => {
  const s = teamSeason([
    sheet(match("a", "2026-01-01"), [
      shot(1, "point", { half: 1 }),
      shot(1, "wide", { half: 2 }),
      shot(1, "point", { half: 2 }),
      shot(1, "point"),
    ]),
  ]);
  assert.equal(s.halves.first.overall.label, "1 of 1, 100%");
  assert.equal(s.halves.second.overall.label, "1 of 2, 50%");
  assert.equal(s.halves.unhalved, 1);
});

test("the record counts a sheet with only our score as no result", () => {
  const lines = matchLines([
    sheet(match("a", "2026-01-01"), [shot(1, "goal"), theirShot("point")]),
    sheet(match("b", "2026-02-01"), [shot(1, "point"), theirShot("goal")]),
    sheet(match("c", "2026-03-01"), [shot(1, "point"), theirShot("point")]),
    sheet(match("d", "2026-04-01"), [shot(1, "point")]),
  ]);
  assert.deepEqual(seasonRecord(lines), { played: 4, won: 1, drawn: 1, lost: 1, noResult: 1 });
  assert.equal(lines[3].theirShooting, null);
  assert.equal(lines[3].shooting.overall.scored, 1);
});

test("entries on numbers nobody was put to are counted, with the matches they are in", () => {
  const a = match("a", "2026-01-01");
  const gaps = unnamed([
    sheet(a, [tackle(4), tackle(9), { statType: "delivery", outcome: "positive", playerNumber: 4, targetNumber: 14 }], {
      4: "u4",
    }),
    sheet(match("b", "2026-02-01"), [tackle(4)], { 4: "u4" }),
  ]);
  assert.equal(gaps.entries, 2);
  assert.deepEqual(gaps.matches, [a]);
});

/* ---------------------------------------------------------------- players */

test("a player is followed through whichever number they wore each match", () => {
  const sheets = [
    sheet(match("a", "2026-01-01"), [shot(11, "goal"), shot(14, "point")], { 11: "ann", 14: "bea" }),
    // Numbers swapped the next week.
    sheet(match("b", "2026-02-01"), [shot(11, "point"), shot(14, "point", { shotKind: "free" })], { 11: "bea", 14: "ann" }),
  ];
  const ann = seasonLineOf("ann", playerMatches(sheets, "ann"));
  assert.equal(ann.appearances, 2);
  assert.deepEqual(ann.score, { cul: 1, cuilin: 1 });
  assert.deepEqual(ann.fromFrees, { cul: 0, cuilin: 1 });
  assert.deepEqual(
    playerMatches(sheets, "ann").map((m) => m.number),
    [11, 14],
  );
  assert.deepEqual(
    creditedRows(sheets, "bea").map((r) => r.shotResult),
    ["point", "point"],
  );
});

test("a sub with nothing logged did not appear; one with something did", () => {
  const sheets = [sheet(match("a", "2026-01-01"), [tackle(18)], { 3: "full", 17: "bench", 18: "on" })];
  const squad = squadSeason(sheets);
  assert.ok(squad.has("full"));
  assert.ok(squad.has("on"));
  assert.ok(!squad.has("bench"));
});

test("a delivery is credited to the player it was aimed at, won or lost", () => {
  const rows = [
    { statType: "delivery", outcome: "positive", playerNumber: 8, targetNumber: 14 },
    { statType: "delivery", outcome: "negative", playerNumber: 8, targetNumber: 14 },
    { statType: "delivery", outcome: "unclear", playerNumber: 8, targetNumber: 14 },
  ];
  const line = squadSeason([sheet(match("a", "2026-01-01"), rows, { 8: "mid", 14: "full" })]).get("full");
  assert.equal(line.received, 1);
  assert.equal(line.lostAsTarget, 1);
});

test("scores per match divide by appearances on sheets that logged shots", () => {
  const sheets = [
    sheet(match("a", "2026-01-01"), [shot(11, "goal"), shot(11, "point")], { 11: "ann" }),
    sheet(match("b", "2026-02-01"), [tackle(11)], { 11: "ann" }),
    sheet(match("c", "2026-03-01"), [shot(2, "wide")], { 11: "ann" }),
  ];
  const ann = squadSeason(sheets).get("ann");
  assert.equal(ann.appearances, 3);
  assert.equal(ann.logged.shot, 2);
  // 1-1 is four points' worth, over the two matches that logged shots.
  assert.equal(scoresPerMatch(ann), 2);
  assert.equal(perMatch(ann.totals.tackles, ann.logged.tackle), 1);
});
