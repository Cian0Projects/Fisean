/**
 * AWS Signature Version 4, query-string form — the presigned URL.
 *
 * Cloudflare R2 speaks the S3 API, and every call this app makes to it can be
 * a presigned URL: the browser PUTs upload parts to one, the <video> element
 * streams from one, and the server's own calls (start, list, finish an
 * upload) are made by fetching one. So this one function is the whole S3
 * client. Hand-written over node:crypto rather than pulled in as a package
 * because it is sixty lines, and because node:crypto signs synchronously —
 * `readUrl` can stay a plain function that a page calls while rendering.
 *
 * Checked against the worked example in AWS's documentation; see
 * tests/storage.test.mjs.
 */
import { createHash, createHmac } from "node:crypto";

export type PresignInput = {
  method: string;
  /** e.g. "<account>.r2.cloudflarestorage.com" */
  host: string;
  /** Path including the bucket, unencoded: "/bucket/team/file.mp4". */
  path: string;
  query?: Record<string, string>;
  accessKeyId: string;
  secretAccessKey: string;
  /** "auto" for R2. */
  region: string;
  /** The signing time. The URL is valid from here for `expiresSec`. */
  date: Date;
  /** At most a week (604 800 s) — S3's own ceiling. */
  expiresSec: number;
};

/** RFC 3986 encoding, which is stricter than encodeURIComponent about !'()*. */
function enc(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function amzDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function presign(input: PresignInput): string {
  const stamp = amzDate(input.date);
  const day = stamp.slice(0, 8);
  const scope = `${day}/${input.region}/s3/aws4_request`;

  const params: Record<string, string> = {
    ...input.query,
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${input.accessKeyId}/${scope}`,
    "X-Amz-Date": stamp,
    "X-Amz-Expires": String(input.expiresSec),
    "X-Amz-SignedHeaders": "host",
  };
  const query = Object.keys(params)
    .map((k) => [enc(k), enc(params[k])] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  // S3 encodes each path segment once and leaves the slashes alone.
  const uri = input.path.split("/").map(enc).join("/");

  const canonical = [
    input.method,
    uri,
    query,
    `host:${input.host}\n`,
    "host",
    // The body is not part of the signature, so one URL can carry any part.
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const toSign = [
    "AWS4-HMAC-SHA256",
    stamp,
    scope,
    createHash("sha256").update(canonical, "utf8").digest("hex"),
  ].join("\n");

  const key = hmac(
    hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), "s3"),
    "aws4_request",
  );
  const signature = createHmac("sha256", key).update(toSign, "utf8").digest("hex");

  return `https://${input.host}${uri}?${query}&X-Amz-Signature=${signature}`;
}

/**
 * A signing time that holds still for six hours, with a validity that always
 * reaches at least eighteen beyond it.
 *
 * A playback URL is signed while the page renders, and a page re-renders
 * whenever a coach saves a tag. If every render signed afresh, the <video>
 * would see a new `src`, reload, and jump back to the start mid-review. With
 * the time pinned to a window, every render in it produces the identical URL.
 */
export function stableWindow(now = Date.now()): { date: Date; expiresSec: number } {
  const SIX_HOURS = 6 * 3_600_000;
  const start = Math.floor(now / SIX_HOURS) * SIX_HOURS;
  return { date: new Date(start), expiresSec: 24 * 3600 };
}
