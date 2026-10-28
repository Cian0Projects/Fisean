import { test } from "node:test";
import assert from "node:assert/strict";
import { canSee, canShare, describeAudience, normaliseAudience, reachOf } from "../src/lib/auth/visibility.ts";

const maker = { id: "maker", role: "player" };
const player = { id: "p2", role: "player" };
const coach = { id: "c1", role: "coach" };
const admin = { id: "a1", role: "admin" };

const item = (visibility, shareRoles = null) => ({ visibility, createdBy: "maker", shareRoles });

test("private is its maker's alone, coaches and admins included", () => {
  assert.equal(canSee(maker, item("private"), false), true);
  assert.equal(canSee(coach, item("private"), false), false);
  assert.equal(canSee(admin, item("private"), false), false);
  assert.equal(canSee(player, item("private"), false), false);
});

test("team is everyone's", () => {
  for (const v of [player, coach, admin]) assert.equal(canSee(v, item("team"), false), true);
});

test("shared with the coaches reaches the coaches and nobody else", () => {
  const toCoaches = item("assigned", ["coach"]);
  assert.equal(canSee(coach, toCoaches, false), true);
  assert.equal(canSee(admin, toCoaches, false), false);
  assert.equal(canSee(player, toCoaches, false), false);
  assert.equal(canSee(maker, toCoaches, false), true);
});

test("a named person sees it whatever their role", () => {
  assert.equal(canSee(player, item("assigned", ["coach"]), true), true);
  assert.equal(canSee(player, item("assigned", []), true), true);
});

test("every group ticked is everyone, nothing ticked is private", () => {
  assert.deepEqual(
    normaliseAudience({ visibility: "assigned", roles: ["admin", "coach", "player"], userIds: ["x"] }, "maker"),
    { visibility: "team", roles: [], userIds: [] },
  );
  assert.deepEqual(normaliseAudience({ visibility: "assigned", roles: [], userIds: ["maker"] }, "maker"), {
    visibility: "private",
    roles: [],
    userIds: [],
  });
});

test("the audience is cleaned of repeats, unknown roles and the maker", () => {
  assert.deepEqual(
    normaliseAudience({ visibility: "assigned", roles: ["coach", "boss", "coach"], userIds: ["p2", "p2", "maker"] }, "maker"),
    { visibility: "assigned", roles: ["coach"], userIds: ["p2"] },
  );
});

test("reach says who can see it, for emailing only those newly reached", () => {
  const people = [maker, player, coach, admin];
  assert.deepEqual(reachOf(people, item("private"), []), ["maker"]);
  assert.deepEqual(reachOf(people, item("assigned", ["coach"]), ["p2"]), ["maker", "p2", "c1"]);
});

test("only the maker says who sees it, coaches included", () => {
  assert.equal(canShare(maker, { createdBy: "maker" }), true);
  assert.equal(canShare(coach, { createdBy: "maker" }), false);
  // Its maker has left: the coaches look after it.
  assert.equal(canShare(coach, { createdBy: null }), true);
  assert.equal(canShare(player, { createdBy: null }), false);
});

test("the summary names groups first, then people", () => {
  const names = { p2: "Seán", p3: "Aoife" };
  const said = (a) => describeAudience(a, (id) => names[id], "you");
  assert.equal(said({ visibility: "private", roles: [], userIds: [] }), "Only you can see it.");
  assert.equal(said({ visibility: "assigned", roles: ["coach"], userIds: [] }), "Shared with all coaches.");
  assert.equal(
    said({ visibility: "assigned", roles: ["coach"], userIds: ["p2", "p3"] }),
    "Shared with all coaches, Seán and Aoife.",
  );
});
