/**
 * Export a drill as a video, in the browser.
 *
 * Físeán has no ffmpeg and no video dependency, and this keeps it that way:
 * the drill is drawn onto a canvas frame by frame and the browser's own
 * MediaRecorder encodes what it sees. MP4 where the browser can make one
 * (current Chrome, Edge and Safari), because that is what plays in WhatsApp
 * and on an iPhone; WebM otherwise (Firefox).
 *
 * The pitch and the kit never move, so they are drawn once: the editor's own
 * board is cloned, stripped to its static layer, its colour tokens resolved
 * to real colours (an SVG drawn as an image cannot see the page's CSS), and
 * rasterised. Only the players and balls are drawn per frame, with the
 * canvas API, mirroring DrillArt's discs and note card — if either changes
 * shape there, change it here too.
 *
 * Recording runs in real time, so a ten-second drill takes ten seconds, and
 * the tab has to stay in front: browsers stop animation frames in a
 * background tab.
 */
import { VIEW_W } from "@/components/pitch/PitchMarkings";
import {
  NOTE_CARD,
  captionStep,
  noteCardLayouts,
  positionsAt,
  videoLengthMs,
  videoTimeAt,
  type DrillData,
  type DrillPiece,
  type NoteCardLayout,
  type Point,
} from "@/lib/hurling/drill";
import { BADGE_MARK, pieceRadius } from "./DrillArt";

const W = 1920;
const HEIGHT = 1080;
const FPS = 30;
const TITLE_BAND = 116;
const CAPTION_BAND = 72;

/** MP4 first, for phones and WhatsApp; WebM where that is all there is. */
const TYPES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

export function canRecordVideo(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function" &&
    TYPES.some((t) => MediaRecorder.isTypeSupported(t))
  );
}

export type RecordedDrill = { blob: Blob; ext: "mp4" | "webm" };

export async function recordDrill({
  board,
  data,
  title,
  teamName,
  badge,
  speed,
  onProgress,
}: {
  /** The editor's live board, for its pitch and kit. */
  board: SVGSVGElement;
  data: DrillData;
  title: string;
  teamName: string;
  /** The club badge's URL, drawn faint in the pitch's corner; null for none. */
  badge: string | null;
  speed: number;
  onProgress: (fraction: number) => void;
}): Promise<RecordedDrill> {
  const type = TYPES.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
  if (!type || typeof HTMLCanvasElement.prototype.captureStream !== "function") {
    throw new Error("This browser cannot record video. Try Chrome, Edge or Safari.");
  }

  await document.fonts.ready;
  const style = getComputedStyle(board);
  const token = (name: string) => style.getPropertyValue(name).trim() || "#000";
  const ink = {
    stage: token("--color-stage"),
    ink: token("--color-ink"),
    dim: token("--color-ink-dim"),
    faint: token("--color-ink-faint"),
    line: token("--color-line"),
    pitch: token("--color-pitch"),
    ash: token("--color-ash"),
    onSpot: token("--color-on-spot"),
    lineStrong: token("--color-line-strong"),
    ball: token("--color-ball"),
    a: token("--color-side-a"),
    b: token("--color-side-b"),
  };
  const font = getComputedStyle(document.body).fontFamily;

  // The pitch, as large as the bands above and below allow.
  const pitchH = HEIGHT - TITLE_BAND - CAPTION_BAND;
  const pitchW = Math.round((pitchH * VIEW_W) / (board.viewBox.baseVal.height || 621));
  const px = Math.round((W - pitchW) / 2);
  const py = TITLE_BAND;
  const k = pitchW / VIEW_W;

  const pitchImage = await rasterise(board, style, pitchW, pitchH);
  const badgeImage = badge ? await loadBadge(badge) : null;
  // Fitted into its square from the top-left, as the board's
  // preserveAspectRatio="xMinYMin meet" does.
  const badgeBox = badgeImage && (() => {
    const side = BADGE_MARK.size * k;
    const s = Math.min(side / badgeImage.naturalWidth, side / badgeImage.naturalHeight);
    return {
      x: px + BADGE_MARK.x * k,
      y: py + BADGE_MARK.y * k,
      w: badgeImage.naturalWidth * s,
      h: badgeImage.naturalHeight * s,
    };
  })();

  // Laid out on the board's own grid, in drawing units, and scaled by `k`.
  const cards = noteCardLayouts(data, VIEW_W, board.viewBox.baseVal.height || 621);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = HEIGHT;
  // Kept in the document, out of sight: some browsers only capture a canvas
  // that is attached.
  Object.assign(canvas.style, { position: "fixed", left: "-10000px", top: "0", pointerEvents: "none" });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;

  const draw = (t: number) => {
    const at = positionsAt(data, t);
    const step = captionStep(data, t);

    ctx.fillStyle = ink.stage;
    ctx.fillRect(0, 0, W, HEIGHT);

    // Title, and where we are in the drill.
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = ink.ink;
    ctx.font = `900 52px ${font}`;
    ctx.fillText(fit(ctx, title || "Untitled drill", pitchW * 0.72), px, 84);
    ctx.textAlign = "right";
    ctx.fillStyle = ink.dim;
    ctx.font = `700 30px ${font}`;
    ctx.fillText(`Step ${step + 1} of ${data.steps.length}`, px + pitchW, 82);

    ctx.fillStyle = ink.pitch;
    ctx.fillRect(px, py, pitchW, pitchH);
    ctx.drawImage(pitchImage, px, py, pitchW, pitchH);
    if (badgeImage && badgeBox) {
      ctx.globalAlpha = BADGE_MARK.opacity;
      ctx.drawImage(badgeImage, badgeBox.x, badgeBox.y, badgeBox.w, badgeBox.h);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = ink.line;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, pitchW - 2, pitchH - 2);

    // Players under the balls, as on the board.
    const order = [
      ...data.pieces.filter((p) => p.kind === "player"),
      ...data.pieces.filter((p) => p.kind === "ball"),
    ];
    for (const p of order) {
      const spot = at[p.id];
      if (spot) drawPiece(ctx, p, { x: px + spot.x * pitchW, y: py + spot.y * pitchH }, k, ink, font);
    }

    // The step's note, on the pitch; the club in the corner below it.
    const card = cards[step];
    if (card) drawNoteCard(ctx, card, px, py, k, ink, font);
    ctx.textAlign = "right";
    ctx.fillStyle = ink.faint;
    ctx.font = `600 24px ${font}`;
    ctx.fillText(teamName, px + pitchW, py + pitchH + 46);
  };

  const length = videoLengthMs(data, speed);
  draw(0);

  const stream = canvas.captureStream(FPS);
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
    await new Promise<void>((resolve) => {
      const frame = (now: number) => {
        const ms = now - start;
        draw(videoTimeAt(data, ms, speed));
        onProgress(Math.min(1, ms / length));
        if (ms >= length) resolve();
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    recorder.stop();
    await stopped;
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    canvas.remove();
  }

  const base = type.split(";")[0];
  return { blob: new Blob(chunks, { type: base }), ext: base === "video/mp4" ? "mp4" : "webm" };
}

/**
 * The board's pitch markings and kit as an image. Everything else — pieces,
 * ghosts, arrows, selection rings — is stripped, and every `var(--token)`
 * is swapped for its value, since an SVG drawn as an image sees no CSS.
 */
async function rasterise(
  board: SVGSVGElement,
  style: CSSStyleDeclaration,
  width: number,
  height: number,
): Promise<HTMLImageElement> {
  const clone = board.cloneNode(true) as SVGSVGElement;
  for (const child of [...clone.children]) {
    if (child.tagName.toLowerCase() !== "defs" && !child.hasAttribute("data-export")) child.remove();
  }
  clone.querySelectorAll("[data-selection], title").forEach((el) => el.remove());
  clone.removeAttribute("style");
  clone.removeAttribute("class");
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  // Escaped, because a value lands inside an attribute: the font token
  // resolves to a family list with double quotes in it, which would end the
  // attribute early and leave an SVG the browser refuses to decode.
  const markup = new XMLSerializer()
    .serializeToString(clone)
    .replace(/var\((--[\w-]+)\)/g, (_, name: string) =>
      (style.getPropertyValue(name).trim() || "#000")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;"),
    );

  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The badge from our own origin, so drawing it leaves the canvas readable by
 * the recorder. A badge that will not load costs the video its watermark,
 * not the whole export.
 */
async function loadBadge(url: string): Promise<HTMLImageElement | null> {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img.naturalWidth && img.naturalHeight ? img : null;
  } catch {
    return null;
  }
}

type Ink = Record<"stage" | "ink" | "pitch" | "ball" | "a" | "b" | "ash" | "onSpot" | "lineStrong", string>;

/** A step's note, the canvas twin of DrillArt's `NoteCard`. */
function drawNoteCard(
  ctx: CanvasRenderingContext2D,
  card: NoteCardLayout,
  px: number,
  py: number,
  k: number,
  ink: Ink,
  font: string,
) {
  const x = px + card.x * k;
  const y = py + card.y * k;
  const w = card.w * k;
  const h = card.h * k;
  const r = 10 * k;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.globalAlpha = 0.94;
  ctx.fillStyle = ink.stage;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = ink.lineStrong;
  ctx.lineWidth = 1.5 * k;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(px + card.badge.cx * k, py + card.badge.cy * k, card.badge.r * k, 0, Math.PI * 2);
  ctx.fillStyle = ink.ash;
  ctx.fill();

  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillStyle = ink.onSpot;
  ctx.font = `800 ${(card.step >= 99 ? 12 : card.step >= 9 ? 15 : 18) * k}px ${font}`;
  ctx.fillText(String(card.step + 1), px + card.badge.cx * k, py + card.badge.cy * k + 0.5 * k);

  ctx.textAlign = "left";
  ctx.fillStyle = ink.ink;
  ctx.font = `600 ${NOTE_CARD.fontSize * k}px ${font}`;
  card.lines.forEach((line, i) => ctx.fillText(line, px + card.textX * k, py + card.lineY[i] * k + 0.5 * k));
  ctx.textBaseline = "alphabetic";
}

/** One piece, the canvas twin of DrillArt's `Piece`. */
function drawPiece(ctx: CanvasRenderingContext2D, p: DrillPiece, c: Point, k: number, ink: Ink, font: string) {
  const r = pieceRadius(p) * k;
  const circle = (radius: number) => {
    ctx.beginPath();
    ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
  };

  // A ring of sod behind each piece, so markers stay two discs.
  circle(r + 1.5 * k);
  ctx.fillStyle = ink.pitch;
  ctx.fill();

  if (p.kind === "player") {
    if (p.side === "a") {
      circle(r);
      ctx.fillStyle = ink.a;
      ctx.fill();
    } else {
      circle(r - 1.25 * k);
      ctx.fillStyle = ink.pitch;
      ctx.fill();
      ctx.strokeStyle = ink.b;
      ctx.lineWidth = 2.5 * k;
      ctx.stroke();
    }
    const size = (p.label.length > 2 ? 7.5 : p.label.length > 1 ? 9 : 10.5) * k;
    ctx.font = `700 ${size}px ${font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = p.side === "a" ? ink.stage : ink.ink;
    ctx.fillText(p.label, c.x, c.y + 0.5 * k);
    ctx.textBaseline = "alphabetic";
    return;
  }

  circle(r);
  ctx.fillStyle = ink.ball;
  ctx.fill();
  ctx.strokeStyle = ink.ink;
  ctx.lineWidth = 1.5 * k;
  ctx.stroke();
  if (p.ball === "sliotar") {
    ctx.beginPath();
    ctx.moveTo(c.x - r * 0.75, c.y - r * 0.35);
    ctx.quadraticCurveTo(c.x, c.y + r * 0.55, c.x + r * 0.75, c.y - r * 0.35);
    ctx.lineWidth = 1 * k;
    ctx.stroke();
  } else {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const x = c.x + Math.cos(a) * r * 0.42;
      const y = c.y + Math.sin(a) * r * 0.42;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = ink.ink;
    ctx.fill();
  }
}

/** Cut a line to fit, with an ellipsis. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}
