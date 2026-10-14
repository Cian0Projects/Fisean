import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BADGE_MAX_BYTES,
  BADGE_PX,
  badgeProblem,
  fitWithin,
  pngDimensions,
} from "../src/lib/media/badge.ts";

/** The first 24 bytes of a PNG: signature, then the IHDR chunk's width and height. */
function pngHeader(width, height) {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

test("a large crest is scaled to fit the badge square, keeping its shape", () => {
  assert.deepEqual(fitWithin(1024, 512), { width: BADGE_PX, height: 128 });
  assert.deepEqual(fitWithin(600, 1200), { width: 128, height: BADGE_PX });
});

test("a small crest is never scaled up", () => {
  assert.deepEqual(fitWithin(100, 80), { width: 100, height: 80 });
});

test("a PNG's size is read from its header", () => {
  assert.deepEqual(pngDimensions(pngHeader(256, 200)), { width: 256, height: 200 });
});

test("anything that is not a PNG has no size", () => {
  const jpeg = new Uint8Array(40).fill(0);
  jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
  assert.equal(pngDimensions(jpeg), null);
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.equal(pngDimensions(svg), null);
});

test("a small PNG is accepted as a badge", () => {
  assert.equal(badgeProblem(pngHeader(256, 256)), null);
});

test("an SVG, an empty file, an oversized file and a huge image are refused", () => {
  const svg = new TextEncoder().encode("<svg></svg>".padEnd(64, " "));
  assert.match(badgeProblem(svg), /not an image/);
  assert.match(badgeProblem(new Uint8Array(0)), /Choose an image/);
  const heavy = new Uint8Array(BADGE_MAX_BYTES + 1);
  heavy.set(pngHeader(256, 256));
  assert.match(badgeProblem(heavy), /too large/);
  assert.match(badgeProblem(pngHeader(4000, 4000)), /too large/);
});
