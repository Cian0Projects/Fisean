import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRange } from "../src/lib/media/range.ts";

const SIZE = 1_000;

test("no header means serve the whole thing", () => {
  assert.equal(parseRange(null, SIZE), null);
  assert.equal(parseRange("", SIZE), null);
});

test("an explicit range is inclusive at both ends", () => {
  assert.deepEqual(parseRange("bytes=0-499", SIZE), { start: 0, end: 499 });
  assert.deepEqual(parseRange("bytes=500-999", SIZE), { start: 500, end: 999 });
});

test("an open-ended range runs to the last byte", () => {
  // This is the form a browser sends when it starts playing.
  assert.deepEqual(parseRange("bytes=200-", SIZE), { start: 200, end: 999 });
});

test("a suffix range asks for the last N bytes", () => {
  // Safari uses this to find a moov atom stored at the end of the file.
  assert.deepEqual(parseRange("bytes=-300", SIZE), { start: 700, end: 999 });
  // A suffix longer than the file is the whole file, not a negative start.
  assert.deepEqual(parseRange("bytes=-5000", SIZE), { start: 0, end: 999 });
});

test("an end past the file is clamped rather than refused", () => {
  assert.deepEqual(parseRange("bytes=900-99999", SIZE), { start: 900, end: 999 });
});

test("ranges outside the file are unsatisfiable", () => {
  assert.equal(parseRange("bytes=1000-1100", SIZE), "unsatisfiable");
  assert.equal(parseRange("bytes=1500-", SIZE), "unsatisfiable");
  assert.equal(parseRange("bytes=500-100", SIZE), "unsatisfiable");
  assert.equal(parseRange("bytes=-0", SIZE), "unsatisfiable");
  assert.equal(parseRange("bytes=-", SIZE), "unsatisfiable");
});

test("malformed headers are ignored, not treated as a range", () => {
  assert.equal(parseRange("items=0-100", SIZE), null);
  assert.equal(parseRange("bytes=abc-def", SIZE), null);
  assert.equal(parseRange("bytes 0-100", SIZE), null);
});

test("only the first range of a multi-range request is honoured", () => {
  // Legal HTTP, but no browser does it for video, so we answer the first
  // range rather than build a multipart body.
  assert.deepEqual(parseRange("bytes=0-99,200-299", SIZE), { start: 0, end: 99 });
});

test("whitespace around the header is tolerated", () => {
  assert.deepEqual(parseRange("  bytes=10-20  ", SIZE), { start: 10, end: 20 });
});
