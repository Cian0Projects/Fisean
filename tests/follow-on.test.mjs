import { test } from "node:test";
import assert from "node:assert/strict";
import { followOn, followOnDetail } from "../src/lib/hurling/follow-on.ts";

test("after our shot the restart is theirs, and after theirs it is ours", () => {
  assert.deepEqual(followOn("shot", "us"), { statType: "puckout", takenBy: "opposition" });
  assert.deepEqual(followOn("shot", "opposition"), { statType: "puckout", takenBy: "us" });
});

test("a free won is followed by our shot from it, a free conceded by theirs", () => {
  assert.deepEqual(followOn("free_won", "opposition"), { statType: "shot", side: "us", shotKind: "free" });
  assert.deepEqual(followOn("free_conceded", "us"), {
    statType: "shot",
    side: "opposition",
    shotKind: "free",
  });
});

test("the form fields a follow-on fills in", () => {
  assert.deepEqual(followOnDetail({ statType: "puckout", takenBy: "us" }), { puckoutTakenBy: "us" });
  assert.deepEqual(followOnDetail({ statType: "shot", side: "opposition", shotKind: "free" }), {
    side: "opposition",
    shotKind: "free",
  });
});

test("nothing follows the other stats", () => {
  for (const t of ["tackle", "delivery", "turnover", "puckout", "mark"]) {
    assert.equal(followOn(t, "us"), null);
  }
});
