/**
 * A minimal MP4 box reader.
 *
 * We only need four facts about a match file, and all four live in the `moov`
 * atom, so parsing a few boxes by hand is far lighter than pulling in ffmpeg
 * or a demuxing library:
 *
 *   - duration, so the timeline has a length before anything is played
 *   - frame rate, so `,` and `.` step by real frames
 *   - dimensions, for the annotation overlay's aspect ratio
 *   - the video codec, which matters more than it sounds — see below
 *
 * The codec check is the one that will save somebody a ruined Sunday.
 * iPhones record HEVC (H.265) by default, and while Safari plays it happily,
 * Chrome on Windows will only decode it when the machine has a hardware
 * decoder. A coach can upload a match that plays perfectly on their own
 * laptop and is a black screen for half the panel. Better to say so at
 * ingest than to find out on Tuesday.
 */

export type Probe = {
  durationMs: number;
  width: number | null;
  height: number | null;
  fps: number | null;
  /** Four-character code from the sample description, e.g. "avc1", "hvc1". */
  codec: string | null;
  /**
   * True when `moov` precedes `mdat`. When it does not, the browser has to
   * fetch the tail of the file before it can play anything — a one-off cost
   * per load, not per seek, but worth warning about on a 4 GB file.
   */
  moovAtStart: boolean;
};

const HEVC_CODECS = new Set(["hvc1", "hev1", "hvcC"]);

export function isRiskyCodec(codec: string | null): boolean {
  return codec !== null && HEVC_CODECS.has(codec);
}

export function codecWarning(codec: string | null): string | null {
  if (!isRiskyCodec(codec)) return null;
  return (
    "This file is HEVC (H.265), which iPhones record by default. Safari plays it, " +
    "but Chrome on Windows needs hardware support and may show a black screen for " +
    "some of the panel. Re-exporting as H.264 MP4 is the safe option."
  );
}

type Box = { type: string; start: number; size: number; contentStart: number };

function readBoxes(buf: Uint8Array, start: number, end: number): Box[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const boxes: Box[] = [];
  let offset = start;

  while (offset + 8 <= end) {
    let size = view.getUint32(offset);
    const type = String.fromCharCode(
      buf[offset + 4],
      buf[offset + 5],
      buf[offset + 6],
      buf[offset + 7],
    );
    let contentStart = offset + 8;

    if (size === 1) {
      // 64-bit extended size.
      if (offset + 16 > end) break;
      const hi = view.getUint32(offset + 8);
      const lo = view.getUint32(offset + 12);
      size = hi * 2 ** 32 + lo;
      contentStart = offset + 16;
    } else if (size === 0) {
      size = end - offset;
    }

    if (size < 8 || offset + size > end) break;
    boxes.push({ type, start: offset, size, contentStart });
    offset += size;
  }
  return boxes;
}

function find(boxes: Box[], type: string): Box | undefined {
  return boxes.find((b) => b.type === type);
}

/**
 * Probe a buffer holding the whole file. For very large files, read the head
 * and the tail and concatenate — `moov` is always at one end or the other.
 */
export function probeMp4(buf: Uint8Array): Probe {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const top = readBoxes(buf, 0, buf.length);

  const moov = find(top, "moov");
  const mdat = find(top, "mdat");
  const moovAtStart = !!moov && (!mdat || moov.start < mdat.start);

  const result: Probe = {
    durationMs: 0,
    width: null,
    height: null,
    fps: null,
    codec: null,
    moovAtStart,
  };
  if (!moov) return result;

  const moovChildren = readBoxes(buf, moov.contentStart, moov.start + moov.size);

  // mvhd carries the movie timescale and duration.
  const mvhd = find(moovChildren, "mvhd");
  if (mvhd) {
    const version = buf[mvhd.contentStart];
    const o = mvhd.contentStart + 4;
    if (version === 1) {
      const timescale = view.getUint32(o + 16);
      const durHi = view.getUint32(o + 20);
      const durLo = view.getUint32(o + 24);
      const duration = durHi * 2 ** 32 + durLo;
      if (timescale > 0) result.durationMs = Math.round((duration / timescale) * 1000);
    } else {
      const timescale = view.getUint32(o + 8);
      const duration = view.getUint32(o + 12);
      if (timescale > 0) result.durationMs = Math.round((duration / timescale) * 1000);
    }
  }

  // Walk the tracks looking for the video one.
  for (const trak of moovChildren.filter((b) => b.type === "trak")) {
    const trakChildren = readBoxes(buf, trak.contentStart, trak.start + trak.size);

    const mdia = find(trakChildren, "mdia");
    if (!mdia) continue;
    const mdiaChildren = readBoxes(buf, mdia.contentStart, mdia.start + mdia.size);

    const hdlr = find(mdiaChildren, "hdlr");
    if (!hdlr) continue;
    const handler = String.fromCharCode(
      buf[hdlr.contentStart + 8],
      buf[hdlr.contentStart + 9],
      buf[hdlr.contentStart + 10],
      buf[hdlr.contentStart + 11],
    );
    if (handler !== "vide") continue;

    // tkhd holds the display dimensions, as 16.16 fixed point.
    const tkhd = find(trakChildren, "tkhd");
    if (tkhd) {
      const version = buf[tkhd.contentStart];
      const base = tkhd.contentStart + 4 + (version === 1 ? 32 : 20) + 60;
      if (base + 8 <= buf.length) {
        result.width = Math.round(view.getUint32(base) / 65536);
        result.height = Math.round(view.getUint32(base + 4) / 65536);
      }
    }

    const mdhd = find(mdiaChildren, "mdhd");
    let mediaTimescale = 0;
    let mediaDuration = 0;
    if (mdhd) {
      const version = buf[mdhd.contentStart];
      const o = mdhd.contentStart + 4;
      if (version === 1) {
        mediaTimescale = view.getUint32(o + 16);
        mediaDuration = view.getUint32(o + 20) * 2 ** 32 + view.getUint32(o + 24);
      } else {
        mediaTimescale = view.getUint32(o + 8);
        mediaDuration = view.getUint32(o + 12);
      }
    }

    const minf = find(mdiaChildren, "minf");
    if (!minf) continue;
    const stbl = find(readBoxes(buf, minf.contentStart, minf.start + minf.size), "stbl");
    if (!stbl) continue;
    const stblChildren = readBoxes(buf, stbl.contentStart, stbl.start + stbl.size);

    // The codec fourcc is the first sample entry inside stsd.
    const stsd = find(stblChildren, "stsd");
    if (stsd) {
      const entryStart = stsd.contentStart + 8;
      if (entryStart + 8 <= buf.length) {
        result.codec = String.fromCharCode(
          buf[entryStart + 4],
          buf[entryStart + 5],
          buf[entryStart + 6],
          buf[entryStart + 7],
        );
      }
    }

    // stts gives sample deltas; for constant frame rate one entry covers all.
    const stts = find(stblChildren, "stts");
    if (stts && mediaTimescale > 0) {
      const count = view.getUint32(stts.contentStart + 4);
      if (count >= 1) {
        const sampleCount = view.getUint32(stts.contentStart + 8);
        const sampleDelta = view.getUint32(stts.contentStart + 12);
        if (count === 1 && sampleDelta > 0) {
          result.fps = round2(mediaTimescale / sampleDelta);
        } else if (mediaDuration > 0 && sampleCount > 0) {
          // Variable frame rate: fall back to an average over the track.
          result.fps = round2(sampleCount / (mediaDuration / mediaTimescale));
        }
      }
    }
    break;
  }

  return result;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Read only what is needed to probe a large file: the first and last chunk.
 * `moov` sits at one end or the other, so this avoids loading gigabytes.
 */
export async function probeFile(path: string, chunkBytes = 2 * 1024 * 1024): Promise<Probe> {
  const { open, stat } = await import("node:fs/promises");
  const { size } = await stat(path);
  const handle = await open(path, "r");
  try {
    if (size <= chunkBytes * 2) {
      const whole = new Uint8Array(size);
      await handle.read(whole, 0, size, 0);
      return probeMp4(whole);
    }

    const head = new Uint8Array(chunkBytes);
    await handle.read(head, 0, chunkBytes, 0);
    const headProbe = probeMp4(head);
    if (headProbe.durationMs > 0) return headProbe;

    // moov is at the end. Read the tail and parse it on its own — box offsets
    // are relative, so a tail-only buffer still parses.
    const tail = new Uint8Array(chunkBytes);
    await handle.read(tail, 0, chunkBytes, size - chunkBytes);
    const tailProbe = probeTail(tail);
    return { ...tailProbe, moovAtStart: false };
  } finally {
    await handle.close();
  }
}

/** Scan a tail buffer for the `moov` signature and parse from there. */
function probeTail(tail: Uint8Array): Probe {
  for (let i = 0; i + 8 <= tail.length; i++) {
    if (
      tail[i + 4] === 0x6d && // m
      tail[i + 5] === 0x6f && // o
      tail[i + 6] === 0x6f && // o
      tail[i + 7] === 0x76 // v
    ) {
      const slice = tail.subarray(i);
      const probe = probeMp4(slice);
      if (probe.durationMs > 0) return probe;
    }
  }
  return { durationMs: 0, width: null, height: null, fps: null, codec: null, moovAtStart: false };
}
