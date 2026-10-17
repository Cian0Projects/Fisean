/**
 * Moving a match file from another app into Ardawn's storage, on the server.
 *
 * The coach pastes a link and can close the laptop: from then on this runs
 * in the app's own process. It is the browser upload with the roles swapped.
 * The same multipart upload, the same part plan, the same check that every
 * part is held at the right size, the same finish. Only the bytes come from
 * the other app's link instead of the coach's disk, and they never touch
 * the clubhouse broadband at all.
 *
 * Where the other app answers byte ranges, which file hosts generally do,
 * each part is fetched on its own, a few at a time, and a dropped connection
 * costs one part. Where it does not, the file is read from the start and cut
 * into parts on the way through.
 *
 * Nothing is lost to a restart. The store keeps the parts it has, the row in
 * `footage_imports` keeps the link, and `resumeImports` (called at start-up,
 * from src/instrumentation.ts) picks every unfinished import back up, sending
 * only the parts still missing.
 *
 * One process runs the app (docs/DEPLOYMENT.md), so the queue is a set in
 * memory. It hangs off globalThis because Next.js can load this module more
 * than once, from the start-up hook and from the actions, and two queues
 * would fetch the same file twice.
 */
import { eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { footageImports, videos } from "@/lib/db/schema";
import { contentTypeFor, store, type MediaStore } from "@/lib/storage";
import { SOURCE_LABELS, type SourceKind } from "./import";
import { finishUpload } from "./finish";
import { openSource, SourceError } from "./source";
import { missingParts, partBytes, planParts, type PartPlan } from "./upload";

/** Imports fetched at once across every club; the rest wait their turn. */
const AT_ONCE = 2;
/** Parts of one import fetched at once. */
const PARTS_AT_ONCE = 3;
/** Tries for one part before the import stops and asks the coach. */
const RETRIES = 6;

type Queue = { running: Set<string>; waiting: string[] };
const queue: Queue = ((globalThis as { __ardawnImports?: Queue }).__ardawnImports ??= {
  running: new Set(),
  waiting: [],
});

/** The import was removed while it ran: stop quietly. */
class Cancelled extends Error {}

/** The source sent the whole file when asked for a range; switch to reading it through. */
class NoRanges extends Error {}

export function queueImport(id: string): void {
  if (queue.running.has(id) || queue.waiting.includes(id)) return;
  queue.waiting.push(id);
  pump();
}

/** Pick up every import that was going when the server last stopped. */
export async function resumeImports(): Promise<void> {
  const rows = await db
    .select({ id: footageImports.id })
    .from(footageImports)
    .where(isNull(footageImports.error));
  for (const r of rows) queueImport(r.id);
}

function pump(): void {
  while (queue.running.size < AT_ONCE && queue.waiting.length) {
    const id = queue.waiting.shift()!;
    queue.running.add(id);
    void run(id).finally(() => {
      queue.running.delete(id);
      pump();
    });
  }
}

async function run(id: string): Promise<void> {
  try {
    await transfer(id);
  } catch (err) {
    if (err instanceof Cancelled) return;
    const message =
      err instanceof SourceError
        ? err.message
        : "The transfer stopped part-way. Press Try again and it carries on from where it stopped.";
    if (!(err instanceof SourceError)) console.error(`Footage import ${id} stopped:`, err);
    await db.update(footageImports).set({ error: message }).where(eq(footageImports.id, id)).catch(() => {});
  }
}

async function load(id: string) {
  const [row] = await db
    .select({ job: footageImports, video: videos })
    .from(footageImports)
    .innerJoin(videos, eq(videos.id, footageImports.videoId))
    .where(eq(footageImports.id, id))
    .limit(1);
  return row ?? null;
}

async function transfer(id: string): Promise<void> {
  const row = await load(id);
  if (!row) return;
  const { job, video } = row;
  if (video.status !== "uploading") {
    await db.delete(footageImports).where(eq(footageImports.id, id));
    return;
  }

  const media = await store();
  const plan = planParts(video.sizeBytes);

  // The store forgets unfinished uploads after a few days. If it has, start
  // a fresh one under the same key; the link is all that is needed.
  let uploadId = video.uploadId;
  let held = uploadId ? await media.listParts(video.storageKey, uploadId).catch(() => null) : null;
  if (!uploadId || !held) {
    uploadId = await media.createMultipart(video.storageKey, contentTypeFor(video.storageKey));
    await db.update(videos).set({ uploadId }).where(eq(videos.id, video.id));
    held = [];
  }

  const target = { key: video.storageKey, uploadId, size: video.sizeBytes, videoId: video.id };
  const progress = new Progress(id, plan, video.sizeBytes, missingParts(plan, video.sizeBytes, held));
  await progress.save();

  const url = new URL(job.sourceUrl);
  const source = job.source as SourceKind;
  if (job.ranges) {
    try {
      await byRanges(media, url, source, plan, target, progress);
    } catch (err) {
      if (!(err instanceof NoRanges)) throw err;
      await db.update(footageImports).set({ ranges: false }).where(eq(footageImports.id, id));
      await throughStream(media, url, source, plan, target, progress);
    }
  } else {
    await throughStream(media, url, source, plan, target, progress);
  }

  const parts = await media.listParts(target.key, uploadId);
  if (missingParts(plan, video.sizeBytes, parts).length) {
    throw new Error("Parts went missing between sending and finishing.");
  }
  await stillWanted(video.id);
  await finishUpload(media, { id: video.id, storageKey: video.storageKey, uploadId, sizeBytes: video.sizeBytes }, parts);
  // The link goes with the row: it carries its own access to the club's
  // footage on the other app, and there is no reason to keep it.
  await db.delete(footageImports).where(eq(footageImports.id, id));
}

type Target = { key: string; uploadId: string; size: number; videoId: string };

/** How much has arrived, written back as parts land so the page can show it. */
class Progress {
  readonly missing: Set<number>;
  private received: number;

  constructor(
    private id: string,
    private plan: PartPlan,
    private size: number,
    missing: number[],
  ) {
    this.missing = new Set(missing);
    this.received = size - missing.reduce((t, n) => t + partBytes(n, plan, size), 0);
  }

  async landed(n: number): Promise<void> {
    this.missing.delete(n);
    this.received += partBytes(n, this.plan, this.size);
    await this.save();
  }

  save(): Promise<unknown> {
    return db.update(footageImports).set({ receivedBytes: this.received }).where(eq(footageImports.id, this.id));
  }
}

/** Throws `Cancelled` if a coach removed the import while it ran. */
async function stillWanted(videoId: string): Promise<void> {
  const [v] = await db.select({ id: videos.id }).from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!v) throw new Cancelled();
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** A refusal partway through means the link has run out; the parts held are kept for a fresh one. */
function expired(source: SourceKind): SourceError {
  return new SourceError(
    `The link stopped working before the whole file was in. Get a fresh download link from ${SOURCE_LABELS[source]} and paste it with Try again; the part already here is kept.`,
  );
}

/** Read exactly `size` bytes from a response, or fail. */
async function readExactly(body: AsyncIterable<Buffer>, size: number): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Uint8Array(size);
  let at = 0;
  for await (const chunk of body) {
    if (at + chunk.length > size) throw new Error("The other site sent more than was asked for.");
    out.set(chunk, at);
    at += chunk.length;
  }
  if (at !== size) throw new Error("The connection dropped part-way through a part.");
  return out;
}

async function byRanges(
  media: MediaStore,
  url: URL,
  source: SourceKind,
  plan: PartPlan,
  target: Target,
  progress: Progress,
): Promise<void> {
  const todo = [...progress.missing].sort((a, b) => a - b);
  let next = 0;
  let failure: unknown = null;

  async function fetchPart(n: number): Promise<void> {
    const start = (n - 1) * plan.partSize;
    const length = partBytes(n, plan, target.size);
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await openSource(url, { range: { start, end: start + length - 1 } });
        if (res.status === 200) {
          res.body.destroy();
          throw new NoRanges();
        }
        if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 410) {
          res.body.resume();
          throw expired(source);
        }
        if (res.status !== 206) {
          res.body.resume();
          throw new Error(`The other site answered ${res.status}.`);
        }
        const bytes = await readExactly(res.body, length);
        await media.putPart(target.key, target.uploadId, n, bytes);
        return;
      } catch (err) {
        if (err instanceof NoRanges || err instanceof SourceError || attempt >= RETRIES) throw err;
      }
      await wait(Math.min(30_000, 1000 * 2 ** attempt));
    }
  }

  async function worker(): Promise<void> {
    while (next < todo.length && failure === null) {
      const n = todo[next++];
      try {
        await stillWanted(target.videoId);
        await fetchPart(n);
        await progress.landed(n);
      } catch (err) {
        failure ??= err;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(PARTS_AT_ONCE, todo.length) }, worker));
  if (failure !== null) throw failure;
}

/**
 * For a source that will not send byte ranges: read the file from the start
 * and cut it into parts on the way, storing only the ones still missing. A
 * dropped connection means reading from the start again, which is why this
 * is the fallback and not the rule.
 */
async function throughStream(
  media: MediaStore,
  url: URL,
  source: SourceKind,
  plan: PartPlan,
  target: Target,
  progress: Progress,
): Promise<void> {
  for (let attempt = 0; progress.missing.size; attempt++) {
    try {
      const res = await openSource(url);
      if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 410) {
        res.body.resume();
        throw expired(source);
      }
      if (res.status !== 200) {
        res.body.resume();
        throw new Error(`The other site answered ${res.status}.`);
      }

      let n = 1;
      let buf: Uint8Array<ArrayBuffer> | null =progress.missing.has(1) ? new Uint8Array(partBytes(1, plan, target.size)) : null;
      let at = 0;
      let length = partBytes(1, plan, target.size);

      read: for await (const raw of res.body) {
        const chunk = raw as Buffer;
        let off = 0;
        while (off < chunk.length) {
          const take = Math.min(length - at, chunk.length - off);
          if (buf) buf.set(chunk.subarray(off, off + take), at);
          at += take;
          off += take;
          if (at < length) continue;

          if (buf) {
            await stillWanted(target.videoId);
            await media.putPart(target.key, target.uploadId, n, buf);
            await progress.landed(n);
          }
          if (++n > plan.count || !progress.missing.size) break read;
          length = partBytes(n, plan, target.size);
          buf = progress.missing.has(n) ? new Uint8Array(length) : null;
          at = 0;
        }
      }
      res.body.destroy();
      if (progress.missing.size) throw new Error("The connection dropped before the end of the file.");
    } catch (err) {
      if (err instanceof SourceError || err instanceof Cancelled || attempt >= RETRIES) throw err;
      await wait(Math.min(30_000, 1000 * 2 ** attempt));
    }
  }
}
