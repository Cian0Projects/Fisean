import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TEAM_STORAGE_GB,
  MAX_FILE_BYTES,
  MAX_PARTS,
  MIN_PART_BYTES,
  WARN_FILE_BYTES,
  clubQuotaBytes,
  defaultStorageGb,
  fileSizeProblem,
  fileSizeWarning,
  isAcceptedVideo,
  missingParts,
  partBytes,
  parsePartList,
  storageLevel,
  planParts,
  localDay,
  quotaProblem,
  readNewMatch,
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

test("a new club's tier comes from the env, falling back when unset or nonsense", () => {
  assert.equal(defaultStorageGb(undefined), DEFAULT_TEAM_STORAGE_GB);
  assert.equal(defaultStorageGb("lots"), DEFAULT_TEAM_STORAGE_GB);
  assert.equal(defaultStorageGb("0"), DEFAULT_TEAM_STORAGE_GB);
  assert.equal(defaultStorageGb("-5"), DEFAULT_TEAM_STORAGE_GB);
  assert.equal(defaultStorageGb("250"), 250);
  // The column is an integer.
  assert.equal(defaultStorageGb("50.9"), 50);
});

test("a club's quota is its own tier in bytes", () => {
  const gb = 1024 ** 3;
  assert.equal(clubQuotaBytes(50), 50 * gb);
  assert.equal(clubQuotaBytes(500), 500 * gb);
  // A bad value never means unlimited or zero.
  assert.equal(clubQuotaBytes(0), DEFAULT_TEAM_STORAGE_GB * gb);
  assert.equal(clubQuotaBytes(NaN), DEFAULT_TEAM_STORAGE_GB * gb);
});

test("the hard limit is 20 GiB a file and the soft warning starts at 8 GiB", () => {
  const gb = 1024 ** 3;
  assert.equal(MAX_FILE_BYTES, 20 * gb);
  assert.equal(WARN_FILE_BYTES, 8 * gb);
});

test("a file over 20 GiB is refused, at 20 GiB exactly it is not", () => {
  const gb = 1024 ** 3;
  assert.equal(fileSizeProblem(MAX_FILE_BYTES), null);
  assert.equal(fileSizeProblem(3 * gb), null);
  const message = fileSizeProblem(MAX_FILE_BYTES + 1);
  assert.match(message, /20\.0 GB/);
  assert.match(message, /1080p/);
  assert.doesNotMatch(message, /[–—]| - /);
});

test("a file between 8 and 20 GiB warns about phones, others do not", () => {
  const gb = 1024 ** 3;
  assert.equal(fileSizeWarning(WARN_FILE_BYTES), null);
  assert.equal(fileSizeWarning(4 * gb), null);
  const warning = fileSizeWarning(12 * gb);
  assert.match(warning, /12\.0 GB/);
  assert.match(warning, /phones/);
  assert.match(warning, /1080p/);
  assert.doesNotMatch(warning, /[–—]| - /);
  // Over the limit it is a refusal, not a warning.
  assert.equal(fileSizeWarning(MAX_FILE_BYTES + 1), null);
});

test("the storage bar is green under half, amber to three quarters, red from there", () => {
  const gb = 1024 ** 3;
  const level = (used) => storageLevel(used * gb, 100 * gb);
  assert.equal(level(0), "ok");
  assert.equal(level(49), "ok");
  assert.equal(level(50), "watch");
  assert.equal(level(74), "watch");
  assert.equal(level(75), "high");
  assert.equal(level(100), "high");
  assert.equal(level(130), "high");
  // A broken quota never reads as plenty of room.
  assert.equal(storageLevel(0, 0), "high");
});

test("a file under the limit can still be refused by a small tier", () => {
  const gb = 1024 ** 3;
  // 15 GB is a fine file, but not for a club with 10 GB left on a 50 GB tier.
  assert.equal(fileSizeProblem(15 * gb), null);
  assert.ok(quotaProblem(40 * gb, 15 * gb, clubQuotaBytes(50)));
  assert.equal(quotaProblem(40 * gb, 15 * gb, clubQuotaBytes(100)), null);
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
