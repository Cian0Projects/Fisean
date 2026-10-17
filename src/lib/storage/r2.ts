/**
 * The R2 driver: footage in a Cloudflare R2 bucket.
 *
 * R2 because it charges nothing for egress, and egress is this app's whole
 * cost: a 3 GB match watched by forty players is 120 GB a round. Storage is
 * $0.015 per GB a month, so a club's full season costs cents.
 *
 * Every call is a fetch of a presigned URL (see sigv4.ts), which keeps this
 * free of an SDK. The browser uploads parts straight to the bucket and plays
 * straight from it, so the app server only ever moves a few kilobytes of XML.
 * The bucket needs a CORS rule allowing PUT from the app's origin, or the
 * browser will refuse to send the parts — see docs/DEPLOYMENT.md.
 */
import { presign, stableWindow } from "./sigv4";
import {
  assertSafeKey,
  contentTypeFor,
  type ByteRange,
  type MediaStat,
  type MediaStore,
  type StoredPart,
} from "./index";

type R2Config = {
  host: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/** Server-side calls are used at once; a short life is plenty. */
const CALL_SECONDS = 300;
/** Long enough for one part on bad clubhouse WiFi, with room for retries. */
const PART_URL_SECONDS = 2 * 3600;

const XML_ENTITIES: Record<string, string> = {
  "&quot;": '"',
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&apos;": "'",
};

function unescapeXml(s: string): string {
  return s.replace(/&(quot|amp|lt|gt|apos);/g, (m) => XML_ENTITIES[m]);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The text of the first `<tag>` in an S3 XML response, or null. */
export function xmlValue(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return m ? unescapeXml(m[1]) : null;
}

/** The `<Part>` entries of a ListParts response. */
export function parseParts(xml: string): StoredPart[] {
  const parts: StoredPart[] = [];
  for (const m of xml.matchAll(/<Part>([\s\S]*?)<\/Part>/g)) {
    parts.push({
      partNumber: Number(xmlValue(m[1], "PartNumber")),
      sizeBytes: Number(xmlValue(m[1], "Size")),
      etag: xmlValue(m[1], "ETag") ?? "",
    });
  }
  return parts;
}

export function completeBody(parts: StoredPart[]): string {
  const entries = [...parts]
    .sort((a, b) => a.partNumber - b.partNumber)
    .map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${escapeXml(p.etag)}</ETag></Part>`)
    .join("");
  return `<CompleteMultipartUpload>${entries}</CompleteMultipartUpload>`;
}

export class R2Store implements MediaStore {
  constructor(private cfg: R2Config) {}

  static fromEnv(): R2Store {
    const need = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;
    const missing = need.filter((k) => !process.env[k]);
    if (missing.length) {
      throw new Error(`STORAGE_DRIVER=r2 needs ${missing.join(", ")}. See docs/DEPLOYMENT.md.`);
    }
    // A bucket created under the EU jurisdiction answers only on its own
    // hostname; the plain one says the bucket does not exist. The footage is
    // of players, some of them minors, so the EU bucket is the expected case.
    const jurisdiction = process.env.R2_JURISDICTION?.trim().toLowerCase();
    return new R2Store({
      host: jurisdiction
        ? `${process.env.R2_ACCOUNT_ID}.${jurisdiction}.r2.cloudflarestorage.com`
        : `${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      bucket: process.env.R2_BUCKET!,
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    });
  }

  private url(
    method: string,
    key: string,
    query: Record<string, string> = {},
    timing: { date: Date; expiresSec: number } = { date: new Date(), expiresSec: CALL_SECONDS },
  ): string {
    return presign({
      method,
      host: this.cfg.host,
      path: `/${this.cfg.bucket}/${assertSafeKey(key)}`,
      query,
      accessKeyId: this.cfg.accessKeyId,
      secretAccessKey: this.cfg.secretAccessKey,
      region: "auto",
      ...timing,
    });
  }

  /** Fetch and fail loudly, with R2's own message, on anything but success. */
  private async call(url: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(url, init);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`R2 ${init.method ?? "GET"} failed: ${res.status} ${xmlValue(body, "Message") ?? body.slice(0, 200)}`);
    }
    return res;
  }

  readUrl(key: string): string {
    return this.url("GET", key, {}, stableWindow());
  }

  async stat(key: string): Promise<MediaStat | null> {
    const res = await fetch(this.url("HEAD", key), { method: "HEAD" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`R2 HEAD failed: ${res.status}`);
    return {
      sizeBytes: Number(res.headers.get("content-length") ?? 0),
      contentType: res.headers.get("content-type") ?? contentTypeFor(key),
    };
  }

  async readRange(key: string, range: ByteRange): Promise<ReadableStream<Uint8Array>> {
    const res = await this.call(this.url("GET", key), {
      headers: { Range: `bytes=${range.start}-${range.end}` },
    });
    return res.body!;
  }

  async remove(key: string): Promise<void> {
    await this.call(this.url("DELETE", key), { method: "DELETE" });
  }

  async createMultipart(key: string, contentType: string): Promise<string> {
    // Content-Type set here is what R2 serves the finished file with, and
    // Safari will not play a video served as application/octet-stream.
    const res = await this.call(this.url("POST", key, { uploads: "" }), {
      method: "POST",
      headers: { "Content-Type": contentType },
    });
    const uploadId = xmlValue(await res.text(), "UploadId");
    if (!uploadId) throw new Error("R2 did not return an upload id.");
    return uploadId;
  }

  presignPart(key: string, uploadId: string, partNumber: number): string {
    return this.url(
      "PUT",
      key,
      { partNumber: String(partNumber), uploadId },
      { date: new Date(), expiresSec: PART_URL_SECONDS },
    );
  }

  async putPart(key: string, uploadId: string, partNumber: number, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
    await this.call(this.presignPart(key, uploadId, partNumber), { method: "PUT", body: bytes });
  }

  async listParts(key: string, uploadId: string): Promise<StoredPart[]> {
    const parts: StoredPart[] = [];
    let marker = "0";
    // A thousand parts a page; a 100 GB file at the smallest part size is ten.
    for (let page = 0; page < 20; page++) {
      const res = await this.call(this.url("GET", key, { uploadId, "part-number-marker": marker }));
      const xml = await res.text();
      parts.push(...parseParts(xml));
      if (xmlValue(xml, "IsTruncated") !== "true") break;
      marker = xmlValue(xml, "NextPartNumberMarker") ?? "";
      if (!marker) break;
    }
    return parts;
  }

  async completeMultipart(key: string, uploadId: string, parts: StoredPart[]): Promise<void> {
    const res = await this.call(this.url("POST", key, { uploadId }), {
      method: "POST",
      headers: { "Content-Type": "application/xml" },
      body: completeBody(parts),
    });
    // S3 can answer 200 and still report a failure in the body.
    const xml = await res.text();
    if (xml.includes("<Error>")) throw new Error(`R2 could not finish the upload: ${xmlValue(xml, "Message")}`);
  }

  async abortMultipart(key: string, uploadId: string): Promise<void> {
    await this.call(this.url("DELETE", key, { uploadId }), { method: "DELETE" });
  }
}
