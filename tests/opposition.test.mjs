import { test } from "node:test";
import assert from "node:assert/strict";
import { matchName, oppositionKey, oppositionNameProblem } from "../src/lib/hurling/opposition.ts";

test("spellings of the one club share a key", () => {
  const key = oppositionKey("St Finbarr's");
  assert.equal(oppositionKey("St. Finbarrs"), key);
  assert.equal(oppositionKey("  st  finbarrs "), key);
  assert.equal(oppositionKey("Saint Finbarr's"), key);
  assert.equal(oppositionKey("Éire Óg"), oppositionKey("Eire Og"));
  assert.equal(oppositionKey("Na Piarsaigh"), oppositionKey("Na-Piarsaigh"));
});

test("different clubs keep different keys", () => {
  assert.notEqual(oppositionKey("Glen Rovers"), oppositionKey("Glen Rovers B"));
  assert.notEqual(oppositionKey("Sars"), oppositionKey("Barrs"));
  // Only a leading Saint is shortened: it is part of the name elsewhere.
  assert.notEqual(oppositionKey("Saint Finbarr's"), oppositionKey("Finbarr's Saint"));
});

test("a name needs something to key on", () => {
  assert.equal(oppositionNameProblem("Glen Rovers"), null);
  assert.ok(oppositionNameProblem("   "));
  assert.ok(oppositionNameProblem("'.'"));
  assert.ok(oppositionNameProblem("x".repeat(61)));
});

test("an opposition game names both sides, the studied one first", () => {
  assert.equal(matchName({ kind: "ours", opponent: "Sars" }, null), "Sars");
  assert.equal(matchName({ kind: "opposition", opponent: "Glen Rovers" }, "Sars"), "Glen Rovers v Sars");
  assert.equal(matchName({ kind: "opposition", opponent: "Glen Rovers" }, null), "Glen Rovers");
});
