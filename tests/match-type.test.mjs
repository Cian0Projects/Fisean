import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MATCH_TYPE, MATCH_TYPES, readMatchType, typesFor } from "../src/lib/hurling/match-type.ts";

test("a listed type is stored as the list spells it, whatever the case sent", () => {
  assert.deepEqual(readMatchType("championship"), { type: "Championship" });
  assert.deepEqual(readMatchType("  LEAGUE "), { type: "League" });
});

test("nothing chosen means no type, not an error", () => {
  assert.deepEqual(readMatchType(undefined), { type: null });
  assert.deepEqual(readMatchType(null), { type: null });
  assert.deepEqual(readMatchType("   "), { type: null });
});

test("something not on the list is refused, unless the match already holds it", () => {
  assert.ok("error" in readMatchType("Féile"));
  assert.ok("error" in readMatchType(42));
  assert.deepEqual(readMatchType("Féile", "Féile"), { type: "Féile" });
  assert.ok("error" in readMatchType("Féile", "Division 2"));
});

test("a typed-in competition is offered first, so editing never loses it", () => {
  assert.deepEqual(typesFor("Féile"), ["Féile", ...MATCH_TYPES]);
  assert.deepEqual(typesFor("friendly"), [...MATCH_TYPES]);
  assert.deepEqual(typesFor(null), [...MATCH_TYPES]);
});

test("a new match starts as a friendly, which is what an unset one already reads as", () => {
  assert.equal(DEFAULT_MATCH_TYPE, "Friendly");
});
