import { test } from "node:test";
import assert from "node:assert/strict";
import { presign, stableWindow } from "../src/lib/storage/sigv4.ts";
import { completeBody, parseParts, xmlValue } from "../src/lib/storage/r2.ts";

test("presigned URLs match AWS's own worked example", () => {
  // "Authenticating Requests: Using Query Parameters (AWS Signature Version 4)".
  const url = presign({
    method: "GET",
    host: "examplebucket.s3.amazonaws.com",
    path: "/test.txt",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    region: "us-east-1",
    date: new Date("2013-05-24T00:00:00Z"),
    expiresSec: 86400,
  });
  assert.ok(
    url.endsWith("X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404"),
    url,
  );
});

test("query parameters are signed in sorted, encoded form", () => {
  const url = presign({
    method: "PUT",
    host: "acct.r2.cloudflarestorage.com",
    path: "/footage/team/a b.mp4",
    query: { uploadId: "x/y+z", partNumber: "3" },
    accessKeyId: "AK",
    secretAccessKey: "SK",
    region: "auto",
    date: new Date("2026-10-09T00:00:00Z"),
    expiresSec: 600,
  });
  assert.match(url, /^https:\/\/acct\.r2\.cloudflarestorage\.com\/footage\/team\/a%20b\.mp4\?/);
  assert.match(url, /\?X-Amz-Algorithm=.*&partNumber=3&uploadId=x%2Fy%2Bz&X-Amz-Signature=/);
});

test("playback URLs hold still for hours, so a re-render does not reload the video", () => {
  const t = Date.UTC(2026, 9, 9, 13, 0, 0);
  const a = stableWindow(t);
  const b = stableWindow(t + 4 * 3_600_000);
  assert.equal(a.date.getTime(), b.date.getTime());
  // And still valid well beyond the end of its window.
  assert.ok(a.date.getTime() + a.expiresSec * 1000 - (t + 4 * 3_600_000) >= 18 * 3_600_000);
});

test("S3 XML is read, including the escaped quotes around an ETag", () => {
  const xml = `<?xml version="1.0"?><ListPartsResult><IsTruncated>false</IsTruncated>
    <Part><PartNumber>2</PartNumber><ETag>&quot;bbb&quot;</ETag><Size>10</Size></Part>
    <Part><PartNumber>1</PartNumber><ETag>&quot;aaa&quot;</ETag><Size>8388608</Size></Part>
  </ListPartsResult>`;
  assert.equal(xmlValue(xml, "IsTruncated"), "false");
  assert.deepEqual(parseParts(xml), [
    { partNumber: 2, sizeBytes: 10, etag: '"bbb"' },
    { partNumber: 1, sizeBytes: 8388608, etag: '"aaa"' },
  ]);
  assert.equal(xmlValue("<InitiateMultipartUploadResult><UploadId>abc</UploadId></InitiateMultipartUploadResult>", "UploadId"), "abc");
});

test("completing lists the parts in order", () => {
  const body = completeBody([
    { partNumber: 2, sizeBytes: 1, etag: '"b"' },
    { partNumber: 1, sizeBytes: 1, etag: '"a"' },
  ]);
  assert.equal(
    body,
    '<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>"a"</ETag></Part>' +
      '<Part><PartNumber>2</PartNumber><ETag>"b"</ETag></Part></CompleteMultipartUpload>',
  );
});

test("the local stand-in signs URLs that verify, and refuses tampered ones", async () => {
  process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-1234";
  const { LocalDiskStore, verifyLocalUrl } = await import("../src/lib/storage/local.ts");
  const local = new LocalDiskStore();

  const read = new URL(local.readUrl("team/file.mp4"), "http://x");
  assert.equal(read.pathname, "/api/media/team/file.mp4");
  assert.equal(verifyLocalUrl("GET", "team/file.mp4", read.searchParams), "ok");
  assert.equal(verifyLocalUrl("GET", "other/file.mp4", read.searchParams), "invalid");
  assert.equal(verifyLocalUrl("PUT", "team/file.mp4", read.searchParams), "invalid");

  const part = new URL(local.presignPart("team/file.mp4", "upload-1", 4), "http://x");
  assert.equal(verifyLocalUrl("PUT", "team/file.mp4", part.searchParams), "ok");
  part.searchParams.set("partNumber", "5");
  assert.equal(verifyLocalUrl("PUT", "team/file.mp4", part.searchParams), "invalid");
});
