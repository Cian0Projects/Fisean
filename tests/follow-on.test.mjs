import { test } from "node:test";
import assert from "node:assert/strict";
import { restartAfter } from "../src/lib/hurling/follow-on.ts";

test("after our shot the restart is theirs, and after theirs it is ours", () => {
  assert.deepEqual(restartAfter("shot", "us"), { statType: "puckout", takenBy: "opposition" });
  assert.deepEqual(restartAfter("shot", "opposition"), { statType: "puckout", takenBy: "us" });
});

test("a free won is our restart and a free conceded is theirs", () => {
  assert.deepEqual(restartAfter("free_won", "opposition"), { statType: "puckout", takenBy: "us" });
  assert.deepEqual(restartAfter("free_conceded", "us"), { statType: "puckout", takenBy: "opposition" });
});

test("nothing follows the other stats", () => {
  for (const t of ["tackle", "delivery", "turnover", "puckout", "mark"]) {
    assert.equal(restartAfter(t, "us"), null);
  }
});
