import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_PLAYER_NAME, playerNameProblem, sameName, tidyName } from "../src/lib/hurling/squad.ts";

test("a name is tidied but never respelled", () => {
  assert.equal(tidyName("  Seán   Ó  Cathasaigh "), "Seán Ó Cathasaigh");
  assert.equal(tidyName("Mary-Kate\tBrennan"), "Mary-Kate Brennan");
});

test("a blank or over-long name is refused, anything else passes", () => {
  assert.ok(playerNameProblem(""));
  assert.ok(playerNameProblem("   "));
  assert.ok(playerNameProblem("x".repeat(MAX_PLAYER_NAME + 1)));
  assert.equal(playerNameProblem("x".repeat(MAX_PLAYER_NAME)), null);
  assert.equal(playerNameProblem("Conor Walsh"), null);
});

test("names match on case and spacing, not on accents", () => {
  assert.ok(sameName("Conor Walsh", " conor  WALSH "));
  assert.ok(!sameName("Seán Ryan", "Sean Ryan"));
  assert.ok(!sameName("Conor Walsh", "Conor Walsh B"));
});
