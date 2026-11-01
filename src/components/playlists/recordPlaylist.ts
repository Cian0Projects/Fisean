/**
 * Export a playlist, or one clip of it, as a video, in the browser.
 *
 * The same approach as the drill export (src/components/drills/recordDrill.ts)
 * and for the same reasons: no ffmpeg and no video dependency. Each clip plays
 * in a hidden <video> element, is drawn onto a canvas frame by frame under a
 * title band, and the browser's own MediaRecorder encodes what it sees. MP4
 * where the browser can make one, which is what plays in WhatsApp and on an
 * iPhone; WebM otherwise.
 *
 * Comments come the way they do in the player (src/lib/hurling/stops.ts): the
 * clip plays up to the frame a comment was made on, halts there with the
 * words in a card in the corner the user chose and the drawing laid over the
 * picture, holds long enough to read (clip-export.ts), then plays on. A video
 * has nobody to press "Play on".
 *
 * The footage keeps its own sound: each clip's audio is routed into the
 * recording through the Web Audio API, and never to the speakers. If the
 * browser will not allow that, the video is made silent rather than not made.
 * The clips are read through our own /api/media route, never the bucket, so
 * the canvas stays readable by the recorder (see playlistFootage).
 *
 * Recording runs in real time, so a two minute playlist takes two minutes, and
 * the tab has to stay in front: browsers stop animation frames in a
 * background tab.
 */
import type { Shape } from "@/lib/db/schema";
import type { CommentRow } from "@/components/review/types";
import { formatClock } from "@/lib/hurling/notation";
import {
  cardOrigin,
  exportLengthMs,
  exportStops,
  isSidePlace,
  type CommentsOnVideo,
  type ExportStop,
} from "@/lib/hurling/clip-export";
import { fit } from "@/components/drills/recordDrill";

const W = 1920;
const HEIGHT = 1080;
const FPS = 30;
const TITLE_BAND = 116;
const CAPTION_BAND = 72;

/** MP4 first, for phones and WhatsApp; the audio codec named so the sound is kept. */
const TYPES_WITH_AUDIO = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
];
const TYPES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

export type ExportClip = {
  title: string;
  /** Our own /api/media address for the file; see the header. */
  src: string;
  startMs: number;
  endMs: number;
  comments: CommentRow[];
};

export type RecordedVideo = { blob: Blob; ext: "mp4" | "webm" };

type Sound = { context: AudioContext; into: MediaStreamAudioDestinationNode };

export async function recordPlaylist({
  title,
  teamName,
  clips,
  comments: place,
  onProgress,
}: {
  /** On the video's title band: the playlist's name, or the clip's own for one clip. */
  title: string;
  teamName: string;
  clips: ExportClip[];
  /** Where the comments sit, or off for the footage alone. */
  comments: CommentsOnVideo;
  onProgress: (fraction: number) => void;
}): Promise<RecordedVideo> {
  if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement.prototype.captureStream !== "function") {
    throw new Error("This browser cannot record video. Try Chrome, Edge or Safari.");
  }
  if (clips.length === 0) throw new Error("There are no clips to export.");

  // Made before anything is awaited: a browser only lets sound start from
  // inside the tap or click that asked for it.
  const sound = openSound();
  const type =
    (sound && TYPES_WITH_AUDIO.find((t) => MediaRecorder.isTypeSupported(t))) ||
    TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  if (!type) {
    void sound?.context.close();
    throw new Error("This browser cannot record video. Try Chrome, Edge or Safari.");
  }
  // Only a type that names an audio codec is known to take a sound track.
  const withSound = !!sound && TYPES_WITH_AUDIO.includes(type);

  await document.fonts.ready;
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim() || "#000";
  const ink = {
    stage: token("--color-stage"),
    ink: token("--color-ink"),
    dim: token("--color-ink-dim"),
    faint: token("--color-ink-faint"),
    line: token("--color-line"),
    lineStrong: token("--color-line-strong"),
    ash: token("--color-ash"),
    rule: token("--color-rule"),
  };
  const font = getComputedStyle(document.body).fontFamily;

  const frame = { x: 0, y: TITLE_BAND, w: W, h: HEIGHT - TITLE_BAND - CAPTION_BAND };
  const margin = 96;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = HEIGHT;
  // Kept in the document, out of sight: some browsers only capture a canvas
  // that is attached.
  Object.assign(canvas.style, { position: "fixed", left: "-10000px", top: "0", pointerEvents: "none" });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;

  const showComments = place !== "off";
  const stopsFor = clips.map((c) =>
    showComments ? exportStops(c.comments, c.endMs - c.startMs) : ([] as ExportStop<CommentRow>[]),
  );
  const length = clips.reduce(
    (sum, c) => sum + exportLengthMs(c.comments, c.endMs - c.startMs, showComments),
    0,
  );

  /** The video's picture, fitted into the frame, as the box the comments are set against. */
  const fitted = (video: HTMLVideoElement): { x: number; y: number; w: number; h: number } => {
    if (!video.videoWidth || !video.videoHeight) return frame;
    const f = Math.min(frame.w / video.videoWidth, frame.h / video.videoHeight);
    const w = video.videoWidth * f;
    const h = video.videoHeight * f;
    return { x: frame.x + (frame.w - w) / 2, y: frame.y + (frame.h - h) / 2, w, h };
  };

  /** One frame: the title band, the picture, and while held on a comment, its card and drawing. */
  const paint = (video: HTMLVideoElement, index: number, stop: ExportStop<CommentRow> | null) => {
    ctx.fillStyle = ink.stage;
    ctx.fillRect(0, 0, W, HEIGHT);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = ink.ink;
    ctx.font = `900 52px ${font}`;
    ctx.fillText(fit(ctx, title || "Untitled playlist", W - 2 * margin - (clips.length > 1 ? 280 : 0)), margin, 84);
    if (clips.length > 1) {
      ctx.textAlign = "right";
      ctx.fillStyle = ink.dim;
      ctx.font = `700 30px ${font}`;
      ctx.fillText(`Clip ${index + 1} of ${clips.length}`, W - margin, 82);
    }

    ctx.fillStyle = "#000";
    ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
    const box = fitted(video);
    if (video.videoWidth && video.videoHeight) ctx.drawImage(video, box.x, box.y, box.w, box.h);

    if (stop && showComments) {
      drawShapes(ctx, stop.comments.flatMap((c) => c.shapes ?? []), box, font);
      drawCard(ctx, stop, place as Exclude<CommentsOnVideo, "off">, box, ink, font);
    }

    const captionY = frame.y + frame.h + 46;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = ink.ink;
    ctx.font = `500 30px ${font}`;
    // One clip says its name above; a playlist names the clip being shown.
    if (clips.length > 1) ctx.fillText(fit(ctx, clips[index].title || "Untitled clip", W * 0.6), margin, captionY);
    ctx.textAlign = "right";
    ctx.fillStyle = ink.faint;
    ctx.font = `600 24px ${font}`;
    ctx.fillText(teamName, W - margin, captionY);
  };

  // Clips load a little ahead of being needed, so one starts the moment the
  // last ends. Kept in the document, out of sight, as the canvas is.
  const loaded: Promise<HTMLVideoElement>[] = [];
  const videos: HTMLVideoElement[] = [];
  const prepare = (i: number): Promise<HTMLVideoElement> => {
    if (!loaded[i]) {
      loaded[i] = loadClip(clips[i], sound).then((v) => {
        videos.push(v);
        return v;
      });
      // Reported where it is awaited; this only stops an early failure of a
      // clip not yet reached from being flagged as unhandled.
      loaded[i].catch(() => {});
    }
    return loaded[i];
  };
  const cleanUp = () => {
    canvas.remove();
    for (const v of videos) {
      v.pause();
      v.removeAttribute("src");
      v.load();
      v.remove();
    }
    void sound?.context.close();
  };

  try {
    paint(await prepare(0), 0, null);
  } catch (e) {
    cleanUp();
    throw e;
  }

  const stream = canvas.captureStream(FPS);
  if (withSound) sound!.into.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error("The recording failed."));
  });

  try {
    recorder.start(250);
    const start = performance.now();
    const progress = () => onProgress(Math.min(0.99, (performance.now() - start) / length));

    for (let i = 0; i < clips.length; i++) {
      const video = await prepare(i);
      if (i + 1 < clips.length) void prepare(i + 1);
      const clip = clips[i];
      const draw = (stop: ExportStop<CommentRow> | null) => {
        paint(video, i, stop);
        progress();
      };

      for (const stop of stopsFor[i]) {
        const at = clip.startMs + stop.atMs;
        await playUntil(video, at, () => draw(null));
        // Back onto the exact frame the comment was made on: the drawing was
        // made against that picture, not the one a frame later.
        await seekTo(video, at);
        await holdFor(stop.holdMs, () => draw(stop));
      }
      await playUntil(video, clip.endMs, () => draw(null));
    }

    onProgress(1);
    recorder.stop();
    await stopped;
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    cleanUp();
  }

  const base = type.split(";")[0];
  return { blob: new Blob(chunks, { type: base }), ext: base === "video/mp4" ? "mp4" : "webm" };
}

/** A place for the footage's sound to go that is not the speakers; null where the browser has none. */
function openSound(): Sound | null {
  try {
    const context = new AudioContext();
    void context.resume();
    return { context, into: context.createMediaStreamDestination() };
  } catch {
    return null;
  }
}

/**
 * A clip's video, loaded and parked on its in point. A clip that will not
 * load fails the export with a plain sentence rather than leaving a silent
 * gap: a video that skipped footage would say the opposite of what was set up.
 */
async function loadClip(clip: { src: string; startMs: number }, sound: Sound | null): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.playsInline = true;
  video.preload = "auto";
  // Not muted when its sound is going into the recording; it is routed to the
  // recorder below and never to the speakers.
  video.muted = !sound;
  Object.assign(video.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "2px",
    height: "2px",
    pointerEvents: "none",
  });
  document.body.appendChild(video);

  const failed = new Error("A clip could not be loaded into the video. Try again.");
  const once = (event: string) =>
    new Promise<void>((resolve, reject) => {
      video.addEventListener(event, () => resolve(), { once: true });
      video.addEventListener(
        "error",
        () => {
          // For whoever opens the console: a media error code of 4 is a file
          // the browser cannot play, or a request that was refused.
          console.error("Export footage would not load", video.error?.code, video.error?.message, video.currentSrc);
          reject(failed);
        },
        { once: true },
      );
    });
  try {
    if (sound) {
      try {
        sound.context.createMediaElementSource(video).connect(sound.into);
      } catch {
        video.muted = true;
      }
    }
    video.src = clip.src;
    if (video.readyState < 1) await once("loadedmetadata");
    video.currentTime = clip.startMs / 1000;
    await once("seeked");
    return video;
  } catch (e) {
    video.remove();
    throw e;
  }
}

/**
 * Play on to `untilMs` in the file, calling `paint` on every frame so the
 * canvas shows it. Stops at that point, or when the file ends, or a few
 * seconds late if the picture stalls, so a clip that will not play cannot hold
 * the export forever.
 */
async function playUntil(video: HTMLVideoElement, untilMs: number, paint: () => void): Promise<void> {
  paint();
  if (video.currentTime * 1000 >= untilMs - 20) return;
  try {
    await video.play();
  } catch {
    // A browser that will not start it with sound will start it without.
    video.muted = true;
    await video.play();
  }
  const give = performance.now() + (untilMs - video.currentTime * 1000) + 6000;
  await new Promise<void>((resolve) => {
    const frame = () => {
      paint();
      if (video.ended || video.currentTime * 1000 >= untilMs - 20 || performance.now() > give) {
        video.pause();
        resolve();
      } else {
        requestAnimationFrame(frame);
      }
    };
    requestAnimationFrame(frame);
  });
}

/** Park on a moment in the file and wait for the picture to be there. */
async function seekTo(video: HTMLVideoElement, ms: number): Promise<void> {
  video.pause();
  if (Math.abs(video.currentTime * 1000 - ms) < 5) return;
  await new Promise<void>((resolve) => {
    video.addEventListener("seeked", () => resolve(), { once: true });
    // A seek that never answers must not hold the export.
    setTimeout(resolve, 3000);
    video.currentTime = ms / 1000;
  });
}

/** Keep drawing the same picture for `ms`; a canvas that is not redrawn gives the recorder no frames. */
function holdFor(ms: number, paint: () => void): Promise<void> {
  return new Promise((resolve) => {
    const until = performance.now() + ms;
    const frame = (now: number) => {
      paint();
      if (now >= until) resolve();
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

type Ink = Record<"stage" | "ink" | "dim" | "faint" | "line" | "lineStrong" | "ash" | "rule", string>;

/** Split into lines no wider than `max`, cutting the last with an ellipsis if there are too many. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= max || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = fit(ctx, `${kept[maxLines - 1]}…`, max);
  return kept;
}

/**
 * The comments on a stop, as a card set in the user's corner. The canvas twin
 * of the player's StopCard: who said it, when in the clip, and what.
 */
function drawCard(
  ctx: CanvasRenderingContext2D,
  stop: ExportStop<CommentRow>,
  place: Exclude<CommentsOnVideo, "off">,
  box: { x: number; y: number; w: number; h: number },
  ink: Ink,
  font: string,
) {
  const padX = 24;
  const padY = 20;
  const bodySize = 27;
  const bodyLead = 36;
  const nameLead = 36;
  const gap = 16;
  const maxW = Math.min(isSidePlace(place) ? 520 : 780, box.w - 32);
  const textW = maxW - 2 * padX;
  const maxH = box.h * 0.6;

  type Row = { text: string; kind: "name" | "body"; clock?: string };
  const rows: Row[] = [];
  const said = stop.comments.filter((c) => c.body.trim());
  const drew = [...new Set(stop.comments.filter((c) => c.shapes?.length && !c.body.trim()).map((c) => c.authorName))];
  const clock = formatClock(stop.atMs);

  let height = 2 * padY;
  let shown = 0;
  for (const c of said) {
    ctx.font = `500 ${bodySize}px ${font}`;
    const lines = wrap(ctx, c.body.trim(), textW, 5);
    const need = nameLead + lines.length * bodyLead + (shown ? gap : 0);
    if (shown && height + need > maxH) break;
    rows.push({ text: c.authorName, kind: "name", clock }, ...lines.map((text) => ({ text, kind: "body" as const })));
    height += need;
    shown++;
  }
  if (shown < said.length) {
    const more = said.length - shown;
    rows.push({ text: `and ${more} more comment${more === 1 ? "" : "s"}`, kind: "body" });
    height += bodyLead;
  }
  if (!said.length) {
    ctx.font = `500 ${bodySize}px ${font}`;
    const lines = wrap(ctx, `${drew.join(" and ")} drew on this moment.`, textW, 3);
    rows.push(...lines.map((text) => ({ text, kind: "body" as const })));
    height += lines.length * bodyLead;
  }

  const { x, y } = cardOrigin(place, box, { w: maxW, h: height }, 24);

  // Card, with the accent rule across its top edge as the player's has.
  const r = 6;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + maxW, y, x + maxW, y + height, r);
  ctx.arcTo(x + maxW, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + maxW, y, r);
  ctx.closePath();
  ctx.globalAlpha = 0.94;
  ctx.fillStyle = ink.stage;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = ink.lineStrong;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = ink.rule;
  ctx.fillRect(x + r, y, maxW - 2 * r, 5);

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  let cursor = y + padY;
  let first = true;
  for (const row of rows) {
    if (row.kind === "name") {
      if (!first) cursor += gap;
      ctx.font = `700 ${bodySize - 2}px ${font}`;
      ctx.fillStyle = ink.ink;
      const name = fit(ctx, row.text, textW - 110);
      ctx.fillText(name, x + padX, cursor + nameLead / 2);
      if (row.clock) {
        ctx.font = `600 ${bodySize - 6}px ${font}`;
        ctx.fillStyle = ink.ash;
        ctx.fillText(row.clock, x + padX + ctx.measureText(name).width + 12, cursor + nameLead / 2);
      }
      cursor += nameLead;
    } else {
      ctx.font = `500 ${bodySize}px ${font}`;
      ctx.fillStyle = ink.dim;
      ctx.fillText(row.text, x + padX, cursor + bodyLead / 2);
      cursor += bodyLead;
    }
    first = false;
  }
  ctx.textBaseline = "alphabetic";
}

/**
 * Drawings over the picture, the canvas twin of AnnotationLayer: stored as
 * shares of the frame, laid over the video's own box, with stroke weights
 * taken off its smaller edge so they look as they did on screen.
 */
function drawShapes(
  ctx: CanvasRenderingContext2D,
  shapes: Shape[],
  box: { x: number; y: number; w: number; h: number },
  font: string,
) {
  if (shapes.length === 0) return;
  const unit = Math.min(box.w, box.h);
  const X = (v: number) => box.x + v * box.w;
  const Y = (v: number) => box.y + v * box.h;

  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // A spotlight is a dim sheet with a hole punched in it.
  const lights = shapes.filter((s): s is Extract<Shape, { type: "spotlight" }> => s.type === "spotlight");
  if (lights.length) {
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    for (const s of lights) {
      ctx.moveTo(X(s.cx) + s.r * unit, Y(s.cy));
      ctx.arc(X(s.cx), Y(s.cy), s.r * unit, 0, Math.PI * 2, true);
    }
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fill("evenodd");
  }

  for (const s of shapes) {
    switch (s.type) {
      case "arrow":
      case "line": {
        const sw = s.width * unit;
        const x1 = X(s.x1);
        const y1 = Y(s.y1);
        const x2 = X(s.x2);
        const y2 = Y(s.y2);
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const head = s.type === "arrow" ? sw * 4 : 0;
        ctx.strokeStyle = s.colour;
        ctx.lineWidth = sw;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2 - Math.cos(angle) * head * 0.6, y2 - Math.sin(angle) * head * 0.6);
        ctx.stroke();
        if (head) {
          ctx.fillStyle = s.colour;
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 - Math.cos(angle - 0.45) * head, y2 - Math.sin(angle - 0.45) * head);
          ctx.lineTo(x2 - Math.cos(angle + 0.45) * head, y2 - Math.sin(angle + 0.45) * head);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case "ellipse":
        ctx.strokeStyle = s.colour;
        ctx.lineWidth = s.width * unit;
        ctx.beginPath();
        ctx.ellipse(X(s.cx), Y(s.cy), Math.max(0, s.rx * box.w), Math.max(0, s.ry * box.h), 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case "rect":
        // Tinted, not filled: the players in the area still have to be seen.
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = s.colour;
        ctx.fillRect(X(s.x), Y(s.y), s.w * box.w, s.h * box.h);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = s.colour;
        ctx.lineWidth = s.width * unit;
        ctx.strokeRect(X(s.x), Y(s.y), s.w * box.w, s.h * box.h);
        break;
      case "freehand":
        if (s.points.length < 2) break;
        ctx.strokeStyle = s.colour;
        ctx.lineWidth = s.width * unit;
        ctx.beginPath();
        s.points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(X(px), Y(py)) : ctx.lineTo(X(px), Y(py))));
        ctx.stroke();
        break;
      case "spotlight":
        ctx.strokeStyle = s.colour;
        ctx.lineWidth = 0.003 * unit;
        ctx.beginPath();
        ctx.arc(X(s.cx), Y(s.cy), s.r * unit, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case "text":
        ctx.font = `600 ${s.size * unit}px ${font}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.lineWidth = 0.006 * unit;
        ctx.strokeStyle = "rgba(0,0,0,0.75)";
        ctx.strokeText(s.body, X(s.x), Y(s.y));
        ctx.fillStyle = s.colour;
        ctx.fillText(s.body, X(s.x), Y(s.y));
        break;
    }
  }
  ctx.restore();
}
