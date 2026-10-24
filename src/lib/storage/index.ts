/**
 * Media storage.
 *
 * Two drivers behind one interface, and the interface is S3's, because S3 is
 * where footage lives in production (Cloudflare R2, `STORAGE_DRIVER=r2`). The
 * local driver is a small stand-in for R2 run by the app itself: it hands out
 * signed URLs, accepts upload parts at them, and assembles the file when
 * told — so a laptop with no bucket goes through exactly the same upload, in
 * the same order, with the same screens, as the hosted app does. Swapping
 * one for the other is configuration; nothing that calls this changes.
 *
 * Uploads are S3 multipart: start one, PUT numbered parts straight from the
 * browser to presigned URLs, then complete it. The app server never carries
 * the bytes on R2, which matters when a match is four gigabytes.
 */

export type MediaStat = {
  sizeBytes: number;
  contentType: string;
};

export type ByteRange = {
  /** Inclusive. */
  start: number;
  /** Inclusive. */
  end: number;
};

/** A part the store holds for an unfinished multipart upload. */
export type StoredPart = {
  partNumber: number;
  sizeBytes: number;
  /** Opaque; handed back unchanged when the upload is completed. */
  etag: string;
};

export interface MediaStore {
  /**
   * A URL a <video> element can load with range requests. Signed, and stable
   * for hours at a time, so a page re-rendering does not reload the video.
   */
  readUrl(key: string): string;
  stat(key: string): Promise<MediaStat | null>;
  /** Read a byte range — for HTTP 206 responses and for probing. */
  readRange(key: string, range: ByteRange): Promise<ReadableStream<Uint8Array>>;
  remove(key: string): Promise<void>;

  /** Begin a multipart upload; returns its upload id. */
  createMultipart(key: string, contentType: string): Promise<string>;
  /** A URL the browser can PUT one part's bytes to, without a session. */
  presignPart(key: string, uploadId: string, partNumber: number): string;
  /**
   * Store one part from the server itself, for footage the server fetches
   * from another app rather than the browser sending it (src/lib/media/importer.ts).
   */
  putPart(key: string, uploadId: string, partNumber: number, bytes: Uint8Array<ArrayBuffer>): Promise<void>;
  /** Parts received so far. Throws if the upload no longer exists. */
  listParts(key: string, uploadId: string): Promise<StoredPart[]>;
  /** Stitch the parts, in order, into the object at `key`. */
  completeMultipart(key: string, uploadId: string, parts: StoredPart[]): Promise<void>;
  abortMultipart(key: string, uploadId: string): Promise<void>;
}

export type StorageDriver = "local" | "r2";

export function storageDriver(): StorageDriver {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver !== "local" && driver !== "r2") {
    throw new Error(`STORAGE_DRIVER must be "local" or "r2", not "${driver}".`);
  }
  return driver;
}

let cached: MediaStore | null = null;

export async function store(): Promise<MediaStore> {
  if (cached) return cached;
  if (storageDriver() === "r2") {
    const { R2Store } = await import("./r2");
    cached = R2Store.fromEnv();
  } else {
    const { LocalDiskStore } = await import("./local");
    cached = new LocalDiskStore();
  }
  return cached;
}

/**
 * Take footage out of storage once its rows are gone. The rows go first so
 * that, if storage fails, the app stays coherent and the orphan can be
 * cleaned up separately: the database is the source of truth. Each file is
 * tried on its own, so one failure does not leave the rest of a season behind.
 */
export async function removeFootage(
  footage: { storageKey: string; uploadId: string | null }[],
): Promise<void> {
  if (footage.length === 0) return;
  const media = await store().catch(() => null);
  if (!media) return;
  for (const video of footage) {
    try {
      // A file stopped part-way is a set of parts, not yet an object.
      if (video.uploadId) await media.abortMultipart(video.storageKey, video.uploadId);
      else await media.remove(video.storageKey);
    } catch {
      // Leave the file; see above.
    }
  }
}

/** Media keys are app-controlled, but never trust one that reached us from a URL. */
export function assertSafeKey(key: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(key) || key.includes("..")) {
    throw new Error(`Unsafe media key: ${key}`);
  }
  return key;
}

export function contentTypeFor(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    mkv: "video/x-matroska",
    webp: "image/webp",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
  };
  return map[ext] ?? "application/octet-stream";
}
