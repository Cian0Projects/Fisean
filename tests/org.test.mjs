import { test } from "node:test";
import assert from "node:assert/strict";
import { ORG_KINDS, isOrgKind, orgKindOf, orgTerms } from "../src/lib/hurling/org.ts";

test("a club and a county are the only two kinds", () => {
  assert.deepEqual([...ORG_KINDS], ["club", "county"]);
  assert.equal(isOrgKind("county"), true);
  assert.equal(isOrgKind("province"), false);
  assert.equal(isOrgKind(null), false);
});

test("anything unrecognised is a club, as every account before the question was", () => {
  assert.equal(orgKindOf(undefined), "club");
  assert.equal(orgKindOf("parish"), "club");
  assert.equal(orgKindOf("county"), "county");
});

test("each kind has its own word, in both cases", () => {
  assert.equal(orgTerms("club").noun, "club");
  assert.equal(orgTerms("club").Noun, "Club");
  assert.equal(orgTerms("county").noun, "county");
  assert.equal(orgTerms("county").Noun, "County");
  assert.equal(orgTerms(null).noun, "club");
});
