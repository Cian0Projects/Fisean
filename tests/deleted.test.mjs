import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KEEP_DAYS,
  daysLeft,
  daysLeftLabel,
  deletedWithMatch,
  isDueForPurge,
  purgeCutoff,
} from "../src/lib/media/deleted.ts";

const DAY = 86_400_000;
const t0 = Date.UTC(2026, 10, 1, 12);

test("deleted things are kept for twenty days", () => {
  assert.equal(KEEP_DAYS, 20);
  assert.equal(purgeCutoff(t0), t0 - 20 * DAY);
});

test("nothing is due for the purge before its twenty days are up", () => {
  assert.equal(isDueForPurge(t0, t0), false);
  assert.equal(isDueForPurge(t0, t0 + 19 * DAY), false);
  assert.equal(isDueForPurge(t0, t0 + 20 * DAY - 1), false);
});

test("it is due once twenty days have passed", () => {
  assert.equal(isDueForPurge(t0, t0 + 20 * DAY), true);
  assert.equal(isDueForPurge(t0, t0 + 400 * DAY), true);
});

test("days left counts whole days up and never goes below nought", () => {
  assert.equal(daysLeft(t0, t0), 20);
  assert.equal(daysLeft(t0, t0 + 1), 20);
  assert.equal(daysLeft(t0, t0 + 19 * DAY), 1);
  assert.equal(daysLeft(t0, t0 + 20 * DAY), 0);
  assert.equal(daysLeft(t0, t0 + 30 * DAY), 0);
});

test("the label reads naturally and carries no dashes", () => {
  assert.equal(daysLeftLabel(t0, t0), "20 days left to put it back");
  assert.equal(daysLeftLabel(t0, t0 + 19 * DAY), "1 day left to put it back");
  assert.equal(daysLeftLabel(t0, t0 + 21 * DAY), "Goes for good tonight");
  for (const n of [0, 5, 19, 25]) assert.doesNotMatch(daysLeftLabel(t0, t0 + n * DAY), /[–—]| - /);
});

test("putting a match back brings only the videos deleted with it", () => {
  const footage = [
    { id: "a", deletedAt: t0 },
    { id: "b", deletedAt: t0 - DAY },
    { id: "c", deletedAt: t0 },
  ];
  assert.deepEqual(
    deletedWithMatch(t0, footage).map((v) => v.id),
    ["a", "c"],
  );
});
