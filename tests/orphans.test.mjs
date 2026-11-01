import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_REMOVALS,
  ORPHAN_GRACE_DAYS,
  findOrphanObjects,
  findStaleUploads,
  isManagedKey,
  planReconcile,
  reconcileDeleteEnabled,
} from "../src/lib/media/orphans.ts";
import { parseObjects, parseUploads } from "../src/lib/storage/r2.ts";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-01T03:00:00Z");
const TODAY = "2026-11-01";
const YESTERDAY = "2026-10-31";
const TEAM = "team-1";

/** A key of the shape the app writes: <teamId>/<uuid>.mp4. */
const key = (n, team = TEAM) => `${team}/00000000-0000-4000-8000-${String(n).padStart(12, "0")}.mp4`;
const obj = (k, ageDays = 30, sizeBytes = 100) => ({ key: k, sizeBytes, lastModified: NOW - ageDays * DAY });
const up = (uploadId, ageDays = 30, k = key(9000)) => ({ key: k, uploadId, initiated: NOW - ageDays * DAY });
const keys = (list) => list.map((o) => o.key);

/**
 * A plan input with a healthy database and a big bucket of files that are in
 * use, so the percentage rule stays out of the way unless a test is about it.
 */
function input(over = {}) {
  const { objects = [], filler: fillerCount = 2000, ...rest } = over;
  const filler = Array.from({ length: fillerCount }, (_, i) => obj(key(100_000 + i), 400));
  const used = new Set(filler.map((o) => o.key));
  return {
    databaseExists: true,
    videoRows: 5,
    objects: [...filler, ...objects],
    uploads: [],
    usedKeys: used,
    usedUploadIds: new Set(),
    teamIds: new Set([TEAM]),
    ledger: [],
    now: NOW,
    today: TODAY,
    deleteEnabled: true,
    ...rest,
  };
}

/** n orphans that have been unused for three earlier nights, so they are due. */
function due(n, from = 1) {
  const objects = Array.from({ length: n }, (_, i) => obj(key(from + i)));
  const ledger = objects.map((o) => ({ key: o.key, nights: 3, lastSeenDay: YESTERDAY }));
  return { objects, ledger };
}

/* ------------------------------------------------------- the basic rules */

test("an old file no row uses is an orphan; one a row uses is not", () => {
  assert.deepEqual(keys(findOrphanObjects([obj("a/x.mp4", 30)], new Set(), NOW)), ["a/x.mp4"]);
  assert.deepEqual(findOrphanObjects([obj("a/x.mp4", 400)], new Set(["a/x.mp4"]), NOW), []);
});

test("only an exact key match counts as use", () => {
  const found = findOrphanObjects([obj("a/x.mp4"), obj("a/x.mp4.bak")], new Set(["a/x.mp4"]), NOW);
  assert.deepEqual(keys(found), ["a/x.mp4.bak"]);
});

test("the grace period is more than seven days, not at least", () => {
  assert.deepEqual(findOrphanObjects([obj("a", ORPHAN_GRACE_DAYS)], new Set(), NOW), []);
  assert.deepEqual(keys(findOrphanObjects([obj("a", ORPHAN_GRACE_DAYS + 0.01)], new Set(), NOW)), ["a"]);
});

test("a file whose time could not be read is kept", () => {
  const unreadable = [
    { key: "z", sizeBytes: 1, lastModified: 0 },
    { key: "n", sizeBytes: 1, lastModified: Number.NaN },
    { key: "f", sizeBytes: 1, lastModified: NOW + DAY },
  ];
  assert.deepEqual(findOrphanObjects(unreadable, new Set(), NOW), []);
});

test("an upload is stale only when old and unreferenced, matched by id", () => {
  assert.deepEqual(findStaleUploads([up("u1", 10)], new Set(), NOW).map((u) => u.uploadId), ["u1"]);
  assert.deepEqual(findStaleUploads([up("u1", 90)], new Set(["u1"]), NOW), []);
  assert.deepEqual(findStaleUploads([up("u1", 2)], new Set(), NOW), []);
  assert.deepEqual(findStaleUploads([up("u1", 10), up("u2", 10)], new Set(["u2"]), NOW).map((u) => u.uploadId), ["u1"]);
});

/* ------------------------------------------- safety: the database looks wrong */

test("zero video rows aborts, and removes and records nothing", () => {
  const { objects, ledger } = due(3);
  const plan = planReconcile(input({ objects, ledger, videoRows: 0 }));
  assert.match(plan.abort, /no video rows/);
  assert.deepEqual(plan.remove, []);
  assert.deepEqual(plan.abortUploads, []);
  assert.deepEqual(plan.ledger, { upsert: [], drop: [] });
});

test("a missing database file aborts, and removes and records nothing", () => {
  const { objects, ledger } = due(3);
  const plan = planReconcile(input({ objects, ledger, databaseExists: false }));
  assert.match(plan.abort, /does not exist/);
  assert.deepEqual(plan.remove, []);
  assert.deepEqual(plan.ledger, { upsert: [], drop: [] });
});

/* ------------------------------------------- safety: too much at once */

test("more than 20 removals aborts the whole run", () => {
  const { objects, ledger } = due(MAX_REMOVALS + 1);
  const plan = planReconcile(input({ objects, ledger }));
  assert.match(plan.abort, /more than the limit of 20/);
  assert.deepEqual(plan.remove, []);
  assert.deepEqual(plan.ledger, { upsert: [], drop: [] });
});

test("exactly 20 removals, in a big bucket, goes ahead", () => {
  const { objects, ledger } = due(MAX_REMOVALS);
  const plan = planReconcile(input({ objects, ledger }));
  assert.equal(plan.abort, null);
  assert.equal(plan.remove.length, MAX_REMOVALS);
});

test("more than 2% of the bucket aborts, even under 20", () => {
  // 11 removals in 500 objects is 2.2%.
  const { objects, ledger } = due(11);
  const plan = planReconcile(input({ objects, ledger, filler: 489 }));
  assert.match(plan.abort, /more than 2%/);
  assert.deepEqual(plan.remove, []);
});

test("exactly 2% of the bucket goes ahead", () => {
  // 10 removals in 500 objects is exactly 2%.
  const { objects, ledger } = due(10);
  const plan = planReconcile(input({ objects, ledger, filler: 490 }));
  assert.equal(plan.abort, null);
  assert.equal(plan.remove.length, 10);
});

test("the limits apply with deletion off, as a warning of what it would do", () => {
  const { objects, ledger } = due(MAX_REMOVALS + 1);
  const plan = planReconcile(input({ objects, ledger, deleteEnabled: false }));
  assert.match(plan.abort, /limit/);
});

test("abandoned uploads count toward the limit", () => {
  const { objects, ledger } = due(MAX_REMOVALS);
  const plan = planReconcile(input({ objects, ledger, uploads: [up("u1")] }));
  assert.match(plan.abort, /limit/);
});

/* ------------------------------------------- safety: which keys are looked at */

test("only <teamId>/<uuid>.<ext> under an existing team is managed", () => {
  const teams = new Set([TEAM]);
  assert.equal(isManagedKey(key(1), teams), true);
  assert.equal(isManagedKey(key(1, "ghost"), teams), false, "unknown team");
  assert.equal(isManagedKey("backups/fisean-2026-10-01.db", teams), false);
  assert.equal(isManagedKey("backups/00000000-0000-4000-8000-000000000001.mp4", teams), false);
  assert.equal(isManagedKey(`${TEAM}/not-a-uuid.mp4`, teams), false);
  assert.equal(isManagedKey(`${TEAM}/00000000-0000-4000-8000-000000000001`, teams), false, "no extension");
  assert.equal(isManagedKey(`${TEAM}/sub/00000000-0000-4000-8000-000000000001.mp4`, teams), false, "nested");
  assert.equal(isManagedKey(`00000000-0000-4000-8000-000000000001.mp4`, teams), false, "no team");
  assert.equal(isManagedKey(`${TEAM}/00000000-0000-4000-8000-000000000001.mp4.bak`, teams), false);
});

test("backups and every other prefix are never touched, however old and unused", () => {
  const strangers = [
    obj("backups/fisean-2026-01-01.db", 300),
    obj("backups/", 300),
    obj("thumbs/a.jpg", 300),
    obj(key(1, "ghost"), 300),
    obj(`${TEAM}/readme.txt`, 300),
    obj(`${TEAM}/sub/00000000-0000-4000-8000-000000000001.mp4`, 300),
  ];
  // Even a ledger that says they have been unused for ever changes nothing.
  const ledger = strangers.map((o) => ({ key: o.key, nights: 99, lastSeenDay: YESTERDAY }));
  const plan = planReconcile(input({ objects: strangers, ledger }));
  assert.equal(plan.abort, null);
  assert.deepEqual(plan.orphans, []);
  assert.deepEqual(plan.remove, []);
  // They are forgotten by the ledger, not removed from the bucket.
  assert.deepEqual(new Set(plan.ledger.drop), new Set(strangers.map((o) => o.key)));
});

test("an abandoned upload outside the managed keys is never aborted", () => {
  const plan = planReconcile(
    input({
      uploads: [up("u1", 30, "backups/fisean-2026-01-01.db"), up("u2", 30, key(1, "ghost")), up("u3", 30, "other/x.mp4")],
    }),
  );
  assert.deepEqual(plan.staleUploads, []);
  assert.deepEqual(plan.abortUploads, []);
});

/* ------------------------------------------- the ledger: three nights */

test("a file first seen tonight is recorded as night 1 and not removed", () => {
  const plan = planReconcile(input({ objects: [obj(key(1))] }));
  assert.deepEqual(plan.ledger.upsert, [{ key: key(1), nights: 1, lastSeenDay: TODAY }]);
  assert.deepEqual(plan.ready, []);
  assert.deepEqual(plan.remove, []);
});

test("it is removed only after three earlier nights, and on the fourth sighting", () => {
  const o = obj(key(1));
  const at = (nights) =>
    planReconcile(input({ objects: [o], ledger: [{ key: o.key, nights, lastSeenDay: YESTERDAY }] }));

  assert.deepEqual(at(1).remove, [], "second night");
  assert.deepEqual(at(2).remove, [], "third night: only two earlier");
  assert.deepEqual(keys(at(3).remove), [o.key], "fourth: three earlier, unreferenced now");
  assert.equal(at(2).ledger.upsert[0].nights, 3);
});

test("a second run on the same day is the same night", () => {
  const o = obj(key(1));
  // Third night was recorded earlier today: only two nights came before it.
  const third = planReconcile(input({ objects: [o], ledger: [{ key: o.key, nights: 3, lastSeenDay: TODAY }] }));
  assert.deepEqual(third.remove, []);
  assert.equal(third.ledger.upsert[0].nights, 3, "not counted twice");
  // Fourth night recorded earlier today: three came before it, so a rerun may remove it.
  const fourth = planReconcile(input({ objects: [o], ledger: [{ key: o.key, nights: 4, lastSeenDay: TODAY }] }));
  assert.deepEqual(keys(fourth.remove), [o.key]);
  assert.equal(fourth.ledger.upsert[0].nights, 4);
});

test("a file that is referenced again starts over", () => {
  const o = obj(key(1));
  const ledger = [{ key: o.key, nights: 50, lastSeenDay: YESTERDAY }];
  const base = input({ objects: [o], ledger });
  const plan = planReconcile({ ...base, usedKeys: new Set([...base.usedKeys, o.key]) });
  assert.deepEqual(plan.remove, []);
  assert.deepEqual(plan.ledger.drop, [o.key]);
  assert.deepEqual(plan.ledger.upsert, []);
});

test("a file gone from the bucket leaves the ledger", () => {
  const plan = planReconcile(input({ ledger: [{ key: key(1), nights: 2, lastSeenDay: YESTERDAY }] }));
  assert.deepEqual(plan.ledger.drop, [key(1)]);
});

test("a file inside the grace period is not removed however long the ledger says", () => {
  const o = obj(key(1), 3);
  const plan = planReconcile(input({ objects: [o], ledger: [{ key: o.key, nights: 30, lastSeenDay: YESTERDAY }] }));
  assert.deepEqual(plan.remove, []);
  assert.deepEqual(plan.orphans, []);
});

/* ------------------------------------------- deletion is off by default */

test("RECONCILE_DELETE is on only for the exact value 1", () => {
  assert.equal(reconcileDeleteEnabled("1"), true);
  for (const v of [undefined, "", "0", "true", "yes", "on", " 1", "1 "]) {
    assert.equal(reconcileDeleteEnabled(v), false, JSON.stringify(v));
  }
});

test("with deletion off, nothing is removed or aborted, but the night is still recorded", () => {
  const { objects, ledger } = due(2);
  const plan = planReconcile(input({ objects, ledger, uploads: [up("u1")], deleteEnabled: false }));
  assert.equal(plan.abort, null);
  assert.equal(plan.ready.length, 2, "reported as due");
  assert.equal(plan.staleUploads.length, 1);
  assert.deepEqual(plan.remove, []);
  assert.deepEqual(plan.abortUploads, []);
  assert.equal(plan.ledger.upsert.length, 2);
});

test("with deletion on, due files and abandoned uploads are removed", () => {
  const { objects, ledger } = due(2);
  const plan = planReconcile(input({ objects, ledger, uploads: [up("u1"), up("u2", 3)] }));
  assert.equal(plan.remove.length, 2);
  assert.deepEqual(plan.abortUploads.map((u) => u.uploadId), ["u1"]);
});

test("an upload a row still holds is not aborted", () => {
  const plan = planReconcile(input({ uploads: [up("u1", 90)], usedUploadIds: new Set(["u1"]) }));
  assert.deepEqual(plan.abortUploads, []);
});

/* ------------------------------------------- reading R2's answers */

test("ListObjectsV2 entries are parsed, with escaped keys and times", () => {
  const xml = `<ListBucketResult><IsTruncated>false</IsTruncated>
    <Contents><Key>t1/a&amp;b.mp4</Key><LastModified>2026-10-01T12:00:00.000Z</LastModified><ETag>"x"</ETag><Size>1234</Size></Contents>
    <Contents><Key>backups/fisean-2026-10-31.db</Key><LastModified>2026-10-31T03:00:00.000Z</LastModified><Size>9</Size></Contents>
  </ListBucketResult>`;
  assert.deepEqual(parseObjects(xml), [
    { key: "t1/a&b.mp4", sizeBytes: 1234, lastModified: Date.parse("2026-10-01T12:00:00.000Z") },
    { key: "backups/fisean-2026-10-31.db", sizeBytes: 9, lastModified: Date.parse("2026-10-31T03:00:00.000Z") },
  ]);
});

test("ListMultipartUploads entries are parsed", () => {
  const xml = `<ListMultipartUploadsResult><IsTruncated>false</IsTruncated>
    <Upload><Key>t1/a.mp4</Key><UploadId>abc123</UploadId><Initiator><ID>i</ID></Initiator><Initiated>2026-10-01T12:00:00.000Z</Initiated></Upload>
  </ListMultipartUploadsResult>`;
  assert.deepEqual(parseUploads(xml), [
    { key: "t1/a.mp4", uploadId: "abc123", initiated: Date.parse("2026-10-01T12:00:00.000Z") },
  ]);
});

test("an empty listing parses to nothing", () => {
  assert.deepEqual(parseObjects("<ListBucketResult><KeyCount>0</KeyCount></ListBucketResult>"), []);
  assert.deepEqual(parseUploads("<ListMultipartUploadsResult></ListMultipartUploadsResult>"), []);
});

/* ------------------------------------------- the host's email */

test("the sweep email states what happened, and uses no dashes", async () => {
  const { storageSweepMail } = await import("../src/lib/mail/templates.ts");
  const base = { deleteEnabled: false, bucketObjects: 40, due: 1, removed: 0, abortedUploads: 0, failures: [], at: "2026-11-01T03:00:00Z" };
  const ran = storageSweepMail({ ...base, aborted: null, orphans: [{ key: key(1), nights: 2 }] });
  assert.match(ran.subject, /0 removed, 1 unused/);
  assert.match(ran.text, /Deletion is off/);
  assert.ok(ran.text.includes(key(1)) && ran.html.includes(key(1)));

  const stopped = storageSweepMail({ ...base, aborted: "The database has no video rows.", orphans: [] });
  assert.match(stopped.subject, /stopped/);
  assert.match(stopped.text, /Reason: The database has no video rows/);

  for (const mail of [ran, stopped]) assert.doesNotMatch(mail.subject + mail.text, /[–—]| - /);
});
