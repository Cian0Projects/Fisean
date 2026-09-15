/**
 * Media storage.
 *
 * This is the one adapter worth keeping. Local disk and object storage really
 * do differ — one streams from the filesystem, the other hands out presigned
 * URLs — so the interface is deliberately small and both sides implement it
 * honestly. Local disk is what the prototype uses; S3/R2 slots in later
 * without touching any caller.
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

export interface MediaStore {
  /** Absolute or app-relative URL a <video> element can load. */
  readUrl(key: string): string;
  stat(key: string): Promise<MediaStat | null>;
  /** Append bytes to a key, creating it if absent. Used by chunked upload. */
  append(key: string, chunk: Uint8Array): Promise<void>;
  /** Read a byte range, for HTTP 206 responses. */
  readRange(key: string, range: ByteRange): Promise<ReadableStream<Uint8Array>>;
  write(key: string, data: Uint8Array): Promise<void>;
  remove(key: string): Promise<void>;
}

let cached: MediaStore | null = null;

export async function store(): Promise<MediaStore> {
  if (cached) return cached;
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver !== "local") {
    throw new Error(
      `STORAGE_DRIVER="${driver}" is not implemented yet. The prototype runs on "local"; ` +
        `see docs/DEPLOYMENT.md for the S3/R2 path.`,
    );
  }
  const { LocalDiskStore } = await import("./local");
  cached = new LocalDiskStore();
  return cached;
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
