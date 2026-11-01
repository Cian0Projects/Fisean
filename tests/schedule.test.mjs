import { test } from "node:test";
import assert from "node:assert/strict";
import { nextImport } from "../src/lib/media/schedule.ts";

const w = (id, teamId) => ({ id, teamId });

test("the oldest waiting import starts when nothing is running", () => {
  assert.equal(nextImport([w("a", "t1"), w("b", "t2")], [], 6), "a");
});

test("nothing waiting means nothing starts", () => {
  assert.equal(nextImport([], ["t1"], 6), null);
});

test("a club with an import running is passed over for the next club in line", () => {
  const waiting = [w("a2", "t1"), w("b1", "t2"), w("a3", "t1")];
  assert.equal(nextImport(waiting, ["t1"], 6), "b1");
});

test("when every waiting club is already running, nothing starts", () => {
  assert.equal(nextImport([w("a2", "t1"), w("b2", "t2")], ["t1", "t2"], 6), null);
});

test("nothing starts once the overall limit is reached", () => {
  const running = ["t1", "t2", "t3"];
  assert.equal(nextImport([w("d", "t4")], running, 3), null);
  assert.equal(nextImport([w("d", "t4")], running, 4), "d");
});

test("a club's own imports keep their order once it is free again", () => {
  const waiting = [w("a2", "t1"), w("a3", "t1")];
  assert.equal(nextImport(waiting, [], 6), "a2");
});

test("one busy club cannot hold the rest up", () => {
  // Six waiting from one club, one from another: the other club starts at once.
  const waiting = ["a1", "a2", "a3", "a4", "a5", "a6"].map((id) => w(id, "t1")).concat(w("b1", "t2"));
  assert.equal(nextImport(waiting, ["t1"], 6), "b1");
});

test("draining the queue never runs a club twice or passes the limit", () => {
  const waiting = [
    w("a1", "t1"),
    w("a2", "t1"),
    w("b1", "t2"),
    w("c1", "t3"),
    w("b2", "t2"),
    w("d1", "t4"),
  ];
  const running = new Map();
  for (;;) {
    const id = nextImport(waiting, [...running.values()], 3);
    if (id === null) break;
    const at = waiting.findIndex((x) => x.id === id);
    const [taken] = waiting.splice(at, 1);
    running.set(id, taken.teamId);
  }
  assert.deepEqual([...running.keys()], ["a1", "b1", "c1"]);
  assert.equal(new Set(running.values()).size, running.size);
});
