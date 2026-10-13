import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TEAM_STORAGE_GB,
  MAX_PARTS,
  MIN_PART_BYTES,
  isAcceptedVideo,
  missingParts,
  partBytes,
  parsePartList,
  planParts,
  localDay,
  quotaProblem,
  readNewMatch,
  teamQuotaBytes,
  uploadKey,
} from "../src/lib/media/upload.ts";
import { probeRanges } from "../src/lib/media/probe.ts";

const MiB = 1024 * 1024;

test("a match file is cut into 8 MiB parts, the last one short", () => {
  const size = 3 * 1024 * MiB + 123;
  const plan = planParts(size);
  assert.equal(plan.partSize, MIN_PART_BYTES);
  assert.equal(plan.count, 385);
  assert.equal(partBytes(1, plan, size), MIN_PART_BYTES);
  assert.equal(partBytes(plan.count, plan, size), 123);
});

test("a small file is one part", () => {
  assert.deepEqual(planParts(1000), { partSize: MIN_PART_BYTES, count: 1 });
  assert.equal(partBytes(1, planParts(1000), 1000), 1000);
});

test("a huge file gets bigger parts rather than more than S3 allows", () => {
  const size = 200 * 1024 * 1024 * MiB;
  const plan = planParts(size);
  assert.ok(plan.count <= MAX_PARTS, String(plan.count));
  assert.equal(plan.partSize % MiB, 0);
  // S3's floor for every part but the last.
  assert.ok(plan.partSize >= 5 * MiB);
});

test("the parts of a plan add up to the file", () => {
  for (const size of [1, MIN_PART_BYTES, MIN_PART_BYTES + 1, 4_000_000_000]) {
    const plan = planParts(size);
    let total = 0;
    for (let n = 1; n <= plan.count; n++) total += partBytes(n, plan, size);
    assert.equal(total, size, String(size));
  }
});

test("missing parts are those absent or held at the wrong size", () => {
  const size = 3 * MIN_PART_BYTES + 10;
  const plan = planParts(size);
  assert.deepEqual(missingParts(plan, size, []), [1, 2, 3, 4]);
  const held = [
    { partNumber: 1, sizeBytes: MIN_PART_BYTES },
    { partNumber: 2, sizeBytes: 100 }, // cut off mid-way
    { partNumber: 4, sizeBytes: 10 },
  ];
  assert.deepEqual(missingParts(plan, size, held), [2, 3]);
  held[1].sizeBytes = MIN_PART_BYTES;
  held.push({ partNumber: 3, sizeBytes: MIN_PART_BYTES });
  assert.deepEqual(missingParts(plan, size, held), []);
});

test("part lists from the browser are checked against the plan", () => {
  const plan = { partSize: MIN_PART_BYTES, count: 10 };
  assert.deepEqual(parsePartList("1,2,10", plan), [1, 2, 10]);
  assert.equal(parsePartList("0", plan), null);
  assert.equal(parsePartList("11", plan), null);
  assert.equal(parsePartList("1.5", plan), null);
  assert.equal(parsePartList("", plan), null);
  assert.equal(parsePartList(null, plan), null);
  const many = Array.from({ length: 51 }, () => 1).join(",");
  assert.equal(parsePartList(many, { partSize: MIN_PART_BYTES, count: 100 }), null);
});

test("only formats the player can open are accepted", () => {
  for (const name of ["match.mp4", "MATCH.MOV", "a.m4v", "b.webm"]) assert.ok(isAcceptedVideo(name), name);
  for (const name of ["match.mkv", "notes.pdf", "mp4", ""]) assert.ok(!isAcceptedVideo(name), name);
});

test("storage keys start with the team and never carry the uploaded name", () => {
  assert.equal(uploadKey("team-1", "../../etc/Ballygunner Final.MOV", "abc"), "team-1/abc.mov");
  assert.equal(uploadKey("team-1", "weird.exe", "abc"), "team-1/abc.mp4");
});

test("the quota falls back to the default when unset or nonsense", () => {
  const def = DEFAULT_TEAM_STORAGE_GB * 1024 ** 3;
  assert.equal(teamQuotaBytes(undefined), def);
  assert.equal(teamQuotaBytes("lots"), def);
  assert.equal(teamQuotaBytes("0"), def);
  assert.equal(teamQuotaBytes("250"), 250 * 1024 ** 3);
});

test("a file that fits passes; one that does not says how much room is left", () => {
  const gb = 1024 ** 3;
  assert.equal(quotaProblem(10 * gb, 3 * gb, 100 * gb), null);
  assert.equal(quotaProblem(97 * gb, 3 * gb, 100 * gb), null);
  const message = quotaProblem(98 * gb, 3 * gb, 100 * gb);
  assert.match(message, /3\.0 GB/);
  assert.match(message, /2\.0 GB/);
});

test("the probe reads only the two ends of a large file", async () => {
  const reads = [];
  const size = 50 * 1024 * 1024;
  await probeRanges(size, async (start, length) => {
    reads.push([start, length]);
    return new Uint8Array(length);
  });
  const chunk = 2 * 1024 * 1024;
  assert.deepEqual(reads, [
    [0, chunk],
    [size - chunk, chunk],
  ]);
});

test("a typed match title becomes the opponent, without the 'v'", () => {
  for (const title of ["Sarsfields", "  v Sarsfields ", "vs. Sarsfields", "Versus  Sarsfields"]) {
    assert.deepEqual(readNewMatch({ title, playedOn: "2026-10-04" }), { opponent: "Sarsfields", playedOn: "2026-10-04" }, title);
  }
  // A club whose name starts with the letters is left alone.
  assert.equal(readNewMatch({ title: "Valley Rovers", playedOn: "2026-10-04" }).opponent, "Valley Rovers");
});

test("a match needs a title and a real date", () => {
  assert.ok("error" in readNewMatch({ title: "", playedOn: "2026-10-04" }));
  assert.ok("error" in readNewMatch({ title: "v ", playedOn: "2026-10-04" }));
  assert.ok("error" in readNewMatch({ title: "x".repeat(81), playedOn: "2026-10-04" }));
  assert.ok("error" in readNewMatch({ title: "Sarsfields", playedOn: "" }));
  assert.ok("error" in readNewMatch({ title: "Sarsfields", playedOn: "2026-02-30" }));
  assert.ok("error" in readNewMatch({ title: "Sarsfields", playedOn: "04/10/2026" }));
  assert.ok("error" in readNewMatch({ title: 42, playedOn: "2026-10-04" }));
});

test("the default date is the file's day in local time", () => {
  assert.equal(localDay(new Date(2026, 9, 4, 23, 59)), "2026-10-04");
  assert.equal(localDay(new Date(2026, 0, 1, 0, 0)), "2026-01-01");
});
