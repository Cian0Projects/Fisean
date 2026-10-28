import { test } from "node:test";
import assert from "node:assert/strict";
import {
  barShare,
  formatSpeed,
  groupThousands,
  parseCsv,
  parseGpsCsv,
  parseNumber,
  rankBy,
  summarise,
} from "../src/lib/hurling/gps.ts";

const SHEET = [
  "NAME,Total Distance,HMLD,HSR,MAX SPEED,PERCENTAGE SPEED,ACCELS,DECELS",
  "Una Reilly,7861,1788,935,6.86,70%,18,15",
  "Mary Walsh,6358,1087,370,8.1,90%,42,54",
  "Nora Byrne,6882,1361,693,8,88%,39,42",
].join("\r\n");

test("a provider sheet is read by column name", () => {
  const { players, ignored, skipped, error } = parseGpsCsv(SHEET);
  assert.equal(error, undefined);
  assert.equal(players.length, 3);
  assert.equal(skipped, 0);
  assert.deepEqual(ignored, []);
  assert.deepEqual(players[0], {
    name: "Una Reilly",
    totalDistance: 7861,
    hmld: 1788,
    hsr: 935,
    maxSpeed: 6.86,
    percentSpeed: 70,
    accels: 18,
    decels: 15,
  });
});

test("column order does not matter and unknown columns are reported, not fatal", () => {
  const { players, ignored } = parseGpsCsv("HSR,Player,Heart rate,Total Distance (m)\n500,Una Reilly,160,6000");
  assert.equal(players[0].hsr, 500);
  assert.equal(players[0].totalDistance, 6000);
  assert.equal(players[0].hmld, null);
  assert.deepEqual(ignored, ["Heart rate"]);
});

test("a file without a name or total distance column says so", () => {
  assert.match(parseGpsCsv("Player,HSR\nUna,500").error, /Total Distance/);
  assert.match(parseGpsCsv("Distance,HSR\n6000,500").error, /Name/);
  assert.match(parseGpsCsv("Name,Total Distance").error, /no player rows/);
});

test("rows with no name or no distance are skipped and counted", () => {
  const { players, skipped } = parseGpsCsv("Name,Total Distance\nUna,6000\n,5000\nMary,\nNora,5500");
  assert.equal(players.length, 2);
  assert.equal(skipped, 2);
});

test("quotes, thousands separators, semicolons and a byte order mark", () => {
  const quoted = parseGpsCsv('﻿Name,Total Distance\n"Reilly, Una","7,861"');
  assert.equal(quoted.players[0].name, "Reilly, Una");
  assert.equal(quoted.players[0].totalDistance, 7861);
  const semi = parseGpsCsv("Name;Total Distance;Max Speed\nUna;6000;8,5");
  assert.equal(semi.players[0].maxSpeed, 8.5);
  assert.deepEqual(parseCsv('a,"b ""c"""\n1,2'), [["a", 'b "c"'], ["1", "2"]]);
});

test("numbers", () => {
  assert.equal(parseNumber("70%"), 70);
  assert.equal(parseNumber(" 8.1 "), 8.1);
  assert.equal(parseNumber("n/a"), null);
  assert.equal(parseNumber(""), null);
});

test("km/h top speeds become metres per second", () => {
  const { players } = parseGpsCsv("Name,Total Distance,Max Speed\nUna,6000,32.4\nMary,6000,28.8");
  assert.equal(players[0].maxSpeed, 9);
  assert.equal(players[1].maxSpeed, 8);
});

test("a percentage sheet exported as fractions is scaled to whole percent", () => {
  const { players } = parseGpsCsv("Name,Total Distance,Percentage Speed\nUna,6000,0.94\nMary,6000,1.04");
  assert.deepEqual(players.map((p) => p.percentSpeed), [94, 104]);
});

test("ranking is highest first, missing figures last, ties by name", () => {
  const { players } = parseGpsCsv("Name,Total Distance,HSR\nB,6000,300\nA,5000,300\nC,7000,\nD,6500,900");
  assert.deepEqual(rankBy(players, "hsr").map((p) => p.name), ["D", "A", "B", "C"]);
  assert.deepEqual(rankBy(players, "totalDistance").map((p) => p.name), ["C", "D", "B", "A"]);
});

test("summary names the leader and averages only players with a figure", () => {
  const { players } = parseGpsCsv("Name,Total Distance,HSR\nA,5000,300\nB,6000,\nC,7000,500");
  assert.deepEqual(summarise(players, "hsr"), { leader: { name: "C", value: 500 }, average: 400, count: 2 });
  assert.deepEqual(summarise([], "hsr"), { leader: null, average: null, count: 0 });
});

test("bar share and formatting", () => {
  assert.equal(barShare(50, 100), 0.5);
  assert.equal(barShare(null, 100), 0);
  assert.equal(barShare(120, 100), 1);
  assert.equal(barShare(5, 0), 0);
  assert.equal(groupThousands(7861), "7,861");
  assert.equal(groupThousands(1234567.456), "1,234,567.46");
  assert.equal(groupThousands(480), "480");
  assert.deepEqual(formatSpeed(8.9), { ms: "8.9", kmh: "32" });
});
