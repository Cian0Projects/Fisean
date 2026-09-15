import { createReadStream } from "node:fs";
import { appendFile, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import {
  assertSafeKey,
  contentTypeFor,
  type ByteRange,
  type MediaStat,
  type MediaStore,
} from "./index";

const ROOT = resolve(process.env.MEDIA_DIR ?? "./data/media");

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

  readUrl(key: string): string {
    return `/api/media/${assertSafeKey(key)}`;
  }

  async stat(key: string): Promise<MediaStat | null> {
    try {
      const s = await stat(this.path(key));
      return { sizeBytes: s.size, contentType: contentTypeFor(key) };
    } catch {
      return null;
    }
  }

  async append(key: string, chunk: Uint8Array): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await appendFile(p, chunk);
  }

  async write(key: string, data: Uint8Array): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
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
}
