/**
 * The local driver: a stand-in for R2, kept on this machine's disk.
 *
 * It behaves like the bucket it stands in for, so that testing on a laptop
 * exercises the same upload the hosted app runs. URLs are signed and expire,
 * and carry no session — exactly like R2's presigned URLs — and they are
 * served by /api/media, which plays the part of the bucket's endpoint. Upload
 * parts land in a scratch folder per upload and are stitched into the final
 * file when the upload is completed, as S3 does.
 *
 * The signature is an HMAC under the session secret rather than SigV4: it
 * needs to be unforgeable, not compatible with anything.
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { stableWindow } from "./sigv4";
import {
  assertSafeKey,
  contentTypeFor,
  type ByteRange,
  type MediaStat,
  type MediaStore,
  type StoredPart,
} from "./index";

const ROOT = resolve(process.env.MEDIA_DIR ?? "./data/media");
/** Keys must start with a letter or digit, so nothing can be stored over this. */
const MULTIPART = join(ROOT, ".multipart");
const UPLOAD_ID = /^[0-9a-f-]{36}$/;
/** Part URLs live as long as R2's do here. */
const PART_URL_SECONDS = 2 * 3600;

function secret(): string {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 32) throw new Error("SESSION_SECRET must be set to sign media URLs.");
  return `media:${raw}`;
}

function signature(method: "GET" | "PUT", key: string, params: Record<string, string>): string {
  const fields = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`);
  return createHmac("sha256", secret())
    .update([method, key, ...fields].join("\n"))
    .digest("hex");
}

function signedUrl(method: "GET" | "PUT", key: string, params: Record<string, string>): string {
  const query = new URLSearchParams({ ...params, sig: signature(method, key, params) });
  return `/api/media/${key}?${query}`;
}

/**
 * Check a URL this driver signed. GET and HEAD share a signature, as they do
 * on S3, because Safari probes with HEAD before it will play.
 */
export function verifyLocalUrl(
  method: "GET" | "PUT",
  key: string,
  search: URLSearchParams,
): "ok" | "expired" | "invalid" {
  const sig = search.get("sig") ?? "";
  const params: Record<string, string> = {};
  for (const [k, v] of search) if (k !== "sig") params[k] = v;

  const expected = Buffer.from(signature(method, key, params), "hex");
  const given = Buffer.from(sig, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return "invalid";
  if (!(Number(params.expires) > Date.now())) return "expired";
  return "ok";
}

export class LocalDiskStore implements MediaStore {
  private path(key: string): string {
    const safe = assertSafeKey(key);
    const full = resolve(join(ROOT, safe));
    // Defence in depth: even with a safe-looking key, refuse anything that
    // resolves outside the media root.
    if (full !== ROOT && !full.startsWith(ROOT + sep)) {
      throw new Error(`Media key escapes the media root: ${key}`);
    }
    return full;
  }

  private uploadDir(uploadId: string): string {
    if (!UPLOAD_ID.test(uploadId)) throw new Error(`Bad upload id: ${uploadId}`);
    return join(MULTIPART, uploadId);
  }

  /** The upload must exist and belong to this key, or nothing happens. */
  private async ownedUpload(key: string, uploadId: string): Promise<string> {
    const dir = this.uploadDir(uploadId);
    const owner = await readFile(join(dir, "key"), "utf8").catch(() => null);
    if (owner !== key) throw new Error("No such upload.");
    return dir;
  }

  readUrl(key: string): string {
    const { date, expiresSec } = stableWindow();
    return signedUrl("GET", assertSafeKey(key), {
      expires: String(date.getTime() + expiresSec * 1000),
    });
  }

  async stat(key: string): Promise<MediaStat | null> {
    try {
      const s = await stat(this.path(key));
      return { sizeBytes: s.size, contentType: contentTypeFor(key) };
    } catch {
      return null;
    }
  }

  async readRange(key: string, range: ByteRange): Promise<ReadableStream<Uint8Array>> {
    const nodeStream = createReadStream(this.path(key), {
      start: range.start,
      end: range.end,
    });
    return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  }

  async remove(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  async createMultipart(key: string): Promise<string> {
    const uploadId = randomUUID();
    const dir = this.uploadDir(uploadId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "key"), assertSafeKey(key));
    return uploadId;
  }

  presignPart(key: string, uploadId: string, partNumber: number): string {
    return signedUrl("PUT", assertSafeKey(key), {
      uploadId,
      partNumber: String(partNumber),
      expires: String(Date.now() + PART_URL_SECONDS * 1000),
    });
  }

  /** Called by /api/media when the browser PUTs to a part URL. */
  async putPart(key: string, uploadId: string, partNumber: number, bytes: Uint8Array): Promise<void> {
    const dir = await this.ownedUpload(key, uploadId);
    // Write then rename, so a part cut off mid-write is never listed as done.
    const target = join(dir, `part-${partNumber}`);
    await writeFile(`${target}.tmp`, bytes);
    await rename(`${target}.tmp`, target);
  }

  async listParts(key: string, uploadId: string): Promise<StoredPart[]> {
    const dir = await this.ownedUpload(key, uploadId);
    const parts: StoredPart[] = [];
    for (const name of await readdir(dir)) {
      const m = /^part-(\d+)$/.exec(name);
      if (!m) continue;
      const { size } = await stat(join(dir, name));
      parts.push({ partNumber: Number(m[1]), sizeBytes: size, etag: `"${m[1]}-${size}"` });
    }
    return parts.sort((a, b) => a.partNumber - b.partNumber);
  }

  async completeMultipart(key: string, uploadId: string, parts: StoredPart[]): Promise<void> {
    const dir = await this.ownedUpload(key, uploadId);
    const assembling = join(dir, "assembled");
    const out = createWriteStream(assembling);
    for (const part of [...parts].sort((a, b) => a.partNumber - b.partNumber)) {
      await pipeline(createReadStream(join(dir, `part-${part.partNumber}`)), out, { end: false });
    }
    await new Promise<void>((done, fail) => out.end((err?: Error | null) => (err ? fail(err) : done())));

    const final = this.path(key);
    await mkdir(dirname(final), { recursive: true });
    await rename(assembling, final);
    await rm(dir, { recursive: true, force: true });
  }

  async abortMultipart(key: string, uploadId: string): Promise<void> {
    const dir = await this.ownedUpload(key, uploadId).catch(() => null);
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}
