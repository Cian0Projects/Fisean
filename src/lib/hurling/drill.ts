/**
 * Training drills, drawn on a pitch and played back as an animation.
 *
 * A drill is a set of pieces (players from two sides, and one or more balls)
 * and a run of steps. Each step is a snapshot of where every piece stands;
 * playback slides each piece from one step's spot to the next. That is how a
 * coach already draws a drill on a whiteboard — "they start here, then he
 * goes there, then the ball goes across" — so the model asks for nothing a
 * coach does not already think in. A curved run is two steps, not a spline
 * editor.
 *
 * Every step holds a position for every piece, always. Adding a player puts
 * them on every step at once, and removing one takes them off every step, so
 * playback never has to ask what a piece was doing in a step it was missing
 * from.
 *
 * Positions are normalised 0–1 on the full pitch, like everything else in
 * src/lib/hurling/pitch.ts: x runs end line to end line, y sideline to
 * sideline. The whole drill is stored as one JSON column — it is only ever
 * loaded and saved whole, and nothing queries inside it — and `parseDrill`
 * is what stands between that column, or a client's save, and the editor.
 */
import { GOAL, clampToPitch } from "./pitch";

export const DRILL_SIDES = ["a", "b"] as const;
export type DrillSide = (typeof DRILL_SIDES)[number];

/** A sliotar for hurling and camogie, a football for the footballers. */
export const BALL_KINDS = ["sliotar", "football"] as const;
export type BallKind = (typeof BALL_KINDS)[number];

export const BALL_LABELS: Record<BallKind, string> = {
  sliotar: "Sliotar",
  football: "Football",
};

export type DrillPlayer = { id: string; kind: "player"; side: DrillSide; label: string };
export type DrillBall = { id: string; kind: "ball"; ball: BallKind };
export type DrillPiece = DrillPlayer | DrillBall;

export type Point = { x: number; y: number };

export type DrillStep = {
  /** Every piece's id maps to a spot. See the file header for why always. */
  at: Record<string, Point>;
  /** What happens in this step, shown under the pitch while it plays. */
  note: string;
};

export type DrillData = {
  version: 1;
  sides: Record<DrillSide, { name: string }>;
  pieces: DrillPiece[];
  steps: DrillStep[];
  /** Cones and goals: one spot for the whole drill. See "Kit" below. */
  kit: DrillKit[];
};

/**
 * Caps. Twenty a side covers a full-panel game of backs and forwards with
 * room to spare; forty steps is a long drill. These are here to stop a
 * runaway save filling the database, not to shape how anyone coaches.
 */
export const DRILL_LIMITS = {
  playersPerSide: 20,
  balls: 8,
  steps: 40,
  sideName: 24,
  note: 200,
  title: 80,
} as const;

/** Each step plays over this long at normal speed. */
export const STEP_MS = 1400;

export function emptyDrill(): DrillData {
  return {
    version: 1,
    sides: { a: { name: "Attack" }, b: { name: "Defence" } },
    pieces: [],
    steps: [{ at: {}, note: "" }],
    kit: [],
  };
}

/**
 * A starter: four on three attacking the goal, the sliotar with the first
 * attacker, so a new drill opens on something to move rather than an empty
 * field.
 */
export function starterDrill(): DrillData {
  let d = applyPreset(emptyDrill(), "4v3");
  d = addBall(d, "sliotar");
  const carrier = d.steps[0].at.a1;
  return movePiece(d, 0, "ball1", { x: carrier.x + 0.018, y: carrier.y + 0.012 });
}

/* -------------------------------------------------------------- presets */

/**
 * The line-ups a coach reaches for. An overload is laid out as an attack on
 * the right-hand goal, which is what an overload drill is for; a small-sided
 * game puts each side in its own half; fifteen a side lines up as a match.
 */
export type PresetLayout = "attack" | "game" | "match";
export type DrillPreset = { id: string; label: string; a: number; b: number; layout: PresetLayout };

export const DRILL_PRESETS: readonly DrillPreset[] = [
  { id: "1v1", label: "1 v 1", a: 1, b: 1, layout: "attack" },
  { id: "2v1", label: "2 v 1", a: 2, b: 1, layout: "attack" },
  { id: "3v2", label: "3 v 2", a: 3, b: 2, layout: "attack" },
  { id: "4v3", label: "4 v 3", a: 4, b: 3, layout: "attack" },
  { id: "5v5", label: "5 v 5", a: 5, b: 5, layout: "game" },
  { id: "7v7", label: "7 v 7", a: 7, b: 7, layout: "game" },
  { id: "15v15", label: "15 v 15", a: 15, b: 15, layout: "match" },
];

/** `n` values centred on the middle of the pitch, `gap` apart at most. */
function spread(n: number, gap: number): number[] {
  const g = n > 1 ? Math.min(gap, 0.7 / (n - 1)) : 0;
  return Array.from({ length: n }, (_, i) => 0.5 + (i - (n - 1) / 2) * g);
}

/**
 * Fifteen in match positions for the side attacking to the right, numbered
 * as a team sheet numbers them: 1 in goal, the full-back line, half-backs,
 * midfield, half-forwards, full-forwards. Depths are fractions of a 145 m
 * pitch. Mirrored for the other side, each line stands a few metres off the
 * line it marks — their 15 beside our 2, as on the day.
 */
const MATCH_SPOTS: Point[] = [
  { x: 0.02, y: 0.5 },
  { x: 0.1, y: 0.25 }, { x: 0.1, y: 0.5 }, { x: 0.1, y: 0.75 },
  { x: 0.27, y: 0.22 }, { x: 0.27, y: 0.5 }, { x: 0.27, y: 0.78 },
  { x: 0.475, y: 0.4 }, { x: 0.475, y: 0.6 },
  { x: 0.7, y: 0.22 }, { x: 0.7, y: 0.5 }, { x: 0.7, y: 0.78 },
  { x: 0.87, y: 0.25 }, { x: 0.87, y: 0.5 }, { x: 0.87, y: 0.75 },
];

/** Where each player of a side stands when a preset lines them up. */
export function presetSpots(preset: DrillPreset, side: DrillSide): Point[] {
  const n = preset[side];
  if (preset.layout === "match") {
    return MATCH_SPOTS.slice(0, n).map((p) => (side === "a" ? p : { x: 1 - p.x, y: 1 - p.y }));
  }
  if (preset.layout === "attack") {
    // Attackers around their 45, defenders goal-side of them near the 20.
    return side === "a"
      ? spread(n, 0.14).map((y) => ({ x: 0.66, y }))
      : spread(n, 0.12).map((y) => ({ x: 0.84, y }));
  }
  return Array.from({ length: n }, (_, i) => startingSpot(side, i));
}

/**
 * Line both sides up for a preset, on every step. Balls, notes and the
 * number of steps are left alone; any players already drawn are replaced,
 * since a preset is a fresh line-up — the editor asks before doing it to a
 * drill that already has movement in it.
 */
export function applyPreset(d: DrillData, presetId: string): DrillData {
  const preset = DRILL_PRESETS.find((p) => p.id === presetId);
  if (!preset) return d;
  let next = d;
  for (const p of d.pieces) if (p.kind === "player") next = removePiece(next, p.id);
  for (const side of DRILL_SIDES) {
    presetSpots(preset, side).forEach((spot, i) => {
      next = withPiece(next, { id: freeId(next, side), kind: "player", side, label: String(i + 1) }, spot);
    });
  }
  return next;
}

/** The preset a drill's line-up currently matches by numbers, if any. */
export function matchingPreset(d: DrillData): DrillPreset | null {
  const a = playersOf(d, "a").length;
  const b = playersOf(d, "b").length;
  return DRILL_PRESETS.find((p) => p.a === a && p.b === b) ?? null;
}

/* ------------------------------------------------------------ placement */

/**
 * Where a newly added player stands: in columns of five either side of
 * halfway, each side in its own half facing the other. Close enough to the
 * middle that the coach drags them a short way, never across the pitch.
 */
export function startingSpot(side: DrillSide, index: number): Point {
  const col = Math.floor(index / 5) % 4;
  const row = index % 5;
  const x = 0.44 - col * 0.07;
  const y = 0.2 + row * 0.15;
  return side === "a" ? { x, y } : { x: 1 - x, y: 1 - y };
}

/** Balls start on the halfway line, fanned out so two never stack. */
export function ballSpot(index: number): Point {
  const offsets = [0, -0.08, 0.08, -0.16, 0.16, -0.24, 0.24, -0.32];
  return { x: 0.5, y: 0.5 + offsets[index % offsets.length] };
}

/* --------------------------------------------------------------- pieces */

export function playersOf(d: DrillData, side: DrillSide): DrillPlayer[] {
  return d.pieces.filter((p): p is DrillPlayer => p.kind === "player" && p.side === side);
}

export function ballsOf(d: DrillData): DrillBall[] {
  return d.pieces.filter((p): p is DrillBall => p.kind === "ball");
}

/** Put a new piece on every step at the same spot. */
function withPiece(d: DrillData, piece: DrillPiece, spot: Point): DrillData {
  return {
    ...d,
    pieces: [...d.pieces, piece],
    steps: d.steps.map((s) => ({ ...s, at: { ...s.at, [piece.id]: spot } })),
  };
}

export function removePiece(d: DrillData, id: string): DrillData {
  return {
    ...d,
    pieces: d.pieces.filter((p) => p.id !== id),
    steps: d.steps.map((s) => {
      const at = { ...s.at };
      delete at[id];
      return { ...s, at };
    }),
  };
}

/**
 * Set how many players a side has. Players are numbered 1 upwards and taken
 * away from the top, so number 3 is still number 3 after a change — the
 * coach has probably been calling them that.
 */
export function setSideCount(d: DrillData, side: DrillSide, count: number): DrillData {
  const n = Math.max(0, Math.min(DRILL_LIMITS.playersPerSide, Math.round(count)));
  const current = playersOf(d, side);
  let next = d;
  for (const p of current.slice(n)) next = removePiece(next, p.id);
  for (let i = current.length; i < n; i++) {
    next = withPiece(
      next,
      { id: freeId(next, side), kind: "player", side, label: String(i + 1) },
      freeSpot(next, side, i),
    );
  }
  return next;
}

/**
 * The first starting spot nobody is standing on in step 1, so a sixteenth
 * player added after a fifteen-a-side line-up lands on open grass rather
 * than on top of the full-back.
 */
function freeSpot(d: DrillData, side: DrillSide, index: number): Point {
  const taken = Object.values(d.steps[0]?.at ?? {});
  const clear = (s: Point) => taken.every((t) => Math.hypot(t.x - s.x, t.y - s.y) > 0.04);
  for (let k = 0; k < DRILL_LIMITS.playersPerSide; k++) {
    const s = startingSpot(side, (index + k) % DRILL_LIMITS.playersPerSide);
    if (clear(s)) return s;
  }
  return startingSpot(side, index);
}

/** The next unused `<prefix><n>`, so a removed piece's id is never doubled. */
function freeId(d: DrillData, prefix: string): string {
  const used = new Set([...d.pieces, ...d.kit].map((p) => p.id));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export function addBall(d: DrillData, ball: BallKind): DrillData {
  const balls = ballsOf(d);
  if (balls.length >= DRILL_LIMITS.balls) return d;
  return withPiece(d, { id: freeId(d, "ball"), kind: "ball", ball }, ballSpot(balls.length));
}

/** A player's label: their number by default, or a position like "FB". */
export function setLabel(d: DrillData, id: string, label: string): DrillData {
  return {
    ...d,
    pieces: d.pieces.map((p) =>
      p.id === id && p.kind === "player" ? { ...p, label: label.slice(0, 3) } : p,
    ),
  };
}

export function setSideName(d: DrillData, side: DrillSide, name: string): DrillData {
  return {
    ...d,
    sides: { ...d.sides, [side]: { name: name.slice(0, DRILL_LIMITS.sideName) } },
  };
}

/* ---------------------------------------------------------------- steps */

/**
 * Add a step after `after`, starting as a copy of it. The coach then drags
 * only what moves — the ones who stand still stay put without being touched.
 */
export function addStep(d: DrillData, after: number): DrillData {
  if (d.steps.length >= DRILL_LIMITS.steps) return d;
  const i = Math.max(0, Math.min(d.steps.length - 1, after));
  const copy: DrillStep = { at: { ...d.steps[i].at }, note: "" };
  return { ...d, steps: [...d.steps.slice(0, i + 1), copy, ...d.steps.slice(i + 1)] };
}

/** The last step cannot go: a drill always has somewhere for the pieces to stand. */
export function removeStep(d: DrillData, index: number): DrillData {
  if (d.steps.length <= 1) return d;
  return { ...d, steps: d.steps.filter((_, i) => i !== index) };
}

export function movePiece(d: DrillData, step: number, id: string, to: Point): DrillData {
  if (!d.steps[step] || !d.pieces.some((p) => p.id === id)) return d;
  const spot = clampToPitch(to.x, to.y);
  return {
    ...d,
    steps: d.steps.map((s, i) => (i === step ? { ...s, at: { ...s.at, [id]: spot } } : s)),
  };
}

export function setStepNote(d: DrillData, step: number, note: string): DrillData {
  return {
    ...d,
    steps: d.steps.map((s, i) =>
      i === step ? { ...s, note: note.slice(0, DRILL_LIMITS.note) } : s,
    ),
  };
}

/* ------------------------------------------------------------------ kit */

/**
 * Cones and extra goals: the pitch the drill is played on, not the people
 * playing it. So they are not in the steps. A cone has one spot for the
 * whole drill, and dragging it moves it on every step at once. Kit that slid
 * around during playback would be a drill nobody could set out.
 *
 * Goals face a direction in quarter turns: 0 means the mouth faces the far
 * end line, the way the goal at our end does. Two widths: a pop-up small goal,
 * and a full portable GAA goal for a game played across the pitch.
 */
export const GOAL_ANGLES = [0, 90, 180, 270] as const;
export type GoalAngle = (typeof GOAL_ANGLES)[number];
const ANGLES: readonly number[] = GOAL_ANGLES;
export type GoalWidth = "small" | "full";
export const GOAL_WIDTHS_M: Record<GoalWidth, number> = { small: 3, full: GOAL.widthM };

export type DrillCone = { id: string; kind: "cone"; x: number; y: number };
export type DrillGoal = {
  id: string;
  kind: "goal";
  x: number;
  y: number;
  angle: GoalAngle;
  width: GoalWidth;
};
export type DrillKit = DrillCone | DrillGoal;

export const KIT_LIMITS = { cones: 40, goals: 6 } as const;

const conesOf = (d: DrillData) => d.kit.filter((k) => k.kind === "cone");
const goalsOf = (d: DrillData) => d.kit.filter((k) => k.kind === "goal");

/**
 * New cones go in a row along the near sideline, about 4 m apart, the way
 * someone walks out with a stack of them, so the coach drags each a short
 * way to where it belongs.
 */
export function addCone(d: DrillData): DrillData {
  const n = conesOf(d).length;
  if (n >= KIT_LIMITS.cones) return d;
  const x = 0.35 + (n % 12) * 0.03;
  const y = 0.06 + Math.floor(n / 12) * 0.04;
  return { ...d, kit: [...d.kit, { id: freeId(d, "cone"), kind: "cone", x, y }] };
}

/** Goals arrive in facing pairs either side of halfway, ready for a game. */
export function addGoal(d: DrillData, width: GoalWidth = "small"): DrillData {
  const n = goalsOf(d).length;
  if (n >= KIT_LIMITS.goals) return d;
  const left = n % 2 === 0;
  const y = 0.5 + [0, 0.25, -0.25][Math.floor(n / 2) % 3];
  const goal: DrillGoal = {
    id: freeId(d, "goal"),
    kind: "goal",
    x: left ? 0.32 : 0.68,
    y,
    angle: left ? 0 : 180,
    width,
  };
  return { ...d, kit: [...d.kit, goal] };
}

export function moveKit(d: DrillData, id: string, to: Point): DrillData {
  const { x, y } = clampToPitch(to.x, to.y);
  return { ...d, kit: d.kit.map((k) => (k.id === id ? { ...k, x, y } : k)) };
}

/** A quarter turn clockwise. */
export function turnGoal(d: DrillData, id: string): DrillData {
  return {
    ...d,
    kit: d.kit.map((k) =>
      k.id === id && k.kind === "goal" ? { ...k, angle: ((k.angle + 90) % 360) as GoalAngle } : k,
    ),
  };
}

export function setGoalWidth(d: DrillData, id: string, width: GoalWidth): DrillData {
  return {
    ...d,
    kit: d.kit.map((k) => (k.id === id && k.kind === "goal" ? { ...k, width } : k)),
  };
}

export function removeKit(d: DrillData, id: string): DrillData {
  return { ...d, kit: d.kit.filter((k) => k.id !== id) };
}

export function clearCones(d: DrillData): DrillData {
  return { ...d, kit: d.kit.filter((k) => k.kind !== "cone") };
}

/**
 * Mark out a small-sided pitch about 60 m by 40 m in the middle of the
 * field: cones at the corners and either end of a halfway line, and a small
 * goal at each end facing in. Replaces any kit already out. A starting point
 * for a 5 v 5 or 7 v 7 game, meant to be dragged to whatever size the coach
 * wants.
 */
export function markOutSmallPitch(d: DrillData): DrillData {
  const [x0, x1, y0, y1] = [0.29, 0.71, 0.28, 0.72];
  const corners: Point[] = [
    { x: x0, y: y0 }, { x: 0.5, y: y0 }, { x: x1, y: y0 },
    { x: x0, y: y1 }, { x: 0.5, y: y1 }, { x: x1, y: y1 },
  ];
  let next: DrillData = { ...d, kit: [] };
  for (const c of corners) {
    next = { ...next, kit: [...next.kit, { id: freeId(next, "cone"), kind: "cone", ...c }] };
  }
  next = { ...next, kit: [...next.kit, { id: freeId(next, "goal"), kind: "goal", x: x0, y: 0.5, angle: 0, width: "small" }] };
  next = { ...next, kit: [...next.kit, { id: freeId(next, "goal"), kind: "goal", x: x1, y: 0.5, angle: 180, width: "small" }] };
  return next;
}

/* ------------------------------------------------------------- playback */

/**
 * Ease in and out, so a player sets off and pulls up rather than gliding at
 * one speed and stopping dead. Reads as running, which is the point.
 */
export function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * Where every piece is at playback time `t`, measured in steps: 0 is step 1,
 * 1.5 is halfway from step 2 to step 3. Clamped to the drill's length.
 */
export function positionsAt(d: DrillData, t: number): Record<string, Point> {
  const last = d.steps.length - 1;
  const clamped = Math.max(0, Math.min(last, t));
  const i = Math.min(last, Math.floor(clamped));
  const from = d.steps[i].at;
  if (i === last) return { ...from };
  const to = d.steps[i + 1].at;
  const f = ease(clamped - i);
  const out: Record<string, Point> = {};
  for (const p of d.pieces) {
    const a = from[p.id];
    const b = to[p.id] ?? a;
    if (!a) continue;
    out[p.id] = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }
  return out;
}

/** How long the whole drill plays for, in milliseconds, at a given speed. */
export function runningMs(d: DrillData, speed = 1): number {
  return ((d.steps.length - 1) * STEP_MS) / speed;
}

/**
 * Timing for an exported video. Unlike the editor's playback, the video
 * pauses on every step: whoever watches it on a phone in the dressing room
 * cannot pause it to read the caption, so the caption gets time of its own.
 * It also holds the set-up before anything moves and the end before it stops.
 */
export const VIDEO_TIMING = { leadInMs: 1200, holdMs: 700, tailMs: 1800 } as const;

export function videoLengthMs(d: DrillData, speed = 1): number {
  const moves = d.steps.length - 1;
  const { leadInMs, holdMs, tailMs } = VIDEO_TIMING;
  return leadInMs + moves * (STEP_MS / speed) + Math.max(0, moves - 1) * holdMs + tailMs;
}

/** Playback time in steps, for `positionsAt`, at `ms` into the video. */
export function videoTimeAt(d: DrillData, ms: number, speed = 1): number {
  const move = STEP_MS / speed;
  const moves = d.steps.length - 1;
  let rest = ms - VIDEO_TIMING.leadInMs;
  if (rest <= 0) return 0;
  for (let i = 0; i < moves; i++) {
    if (rest < move) return i + rest / move;
    rest -= move;
    if (i < moves - 1) {
      if (rest < VIDEO_TIMING.holdMs) return i + 1;
      rest -= VIDEO_TIMING.holdMs;
    }
  }
  return moves;
}

/** Which step's caption shows at playback time `t`: the one being moved into. */
export function captionStep(d: DrillData, t: number): number {
  return Math.max(0, Math.min(d.steps.length - 1, Math.ceil(t - 1e-6)));
}

/** "5 v 4, 1 sliotar, 3 steps" — for the list page. */
export function drillSummary(d: DrillData): string {
  const a = playersOf(d, "a").length;
  const b = playersOf(d, "b").length;
  const parts: string[] = [];
  if (a && b) parts.push(`${a} v ${b}`);
  else if (a || b) parts.push(`${a || b} player${(a || b) === 1 ? "" : "s"}`);
  for (const kind of BALL_KINDS) {
    const n = ballsOf(d).filter((x) => x.ball === kind).length;
    if (n) parts.push(`${n} ${kind}${n === 1 ? "" : "s"}`);
  }
  const cones = d.kit.filter((k) => k.kind === "cone").length;
  const goals = d.kit.length - cones;
  if (cones) parts.push(`${cones} cone${cones === 1 ? "" : "s"}`);
  if (goals) parts.push(`${goals} extra goal${goals === 1 ? "" : "s"}`);
  parts.push(`${d.steps.length} step${d.steps.length === 1 ? "" : "s"}`);
  return parts.join(", ");
}

/* ----------------------------------------------------------- validation */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Turn whatever came back from the database or a client's save into a drill
 * the editor can trust: known piece kinds only, ids unique, every step with
 * a clamped spot for every piece, and everything inside the limits.
 *
 * Forgiving about detail — a missing spot is filled from the step before, a
 * long note is cut — and strict about structure: something that is not a
 * drill at all throws, rather than being saved as an empty one over the top
 * of the coach's work.
 */
export function parseDrill(raw: unknown): DrillData {
  if (!isObj(raw) || !Array.isArray(raw.pieces) || !Array.isArray(raw.steps)) {
    throw new Error("That is not a drill.");
  }

  const sides = isObj(raw.sides) ? raw.sides : {};
  const sideName = (s: DrillSide, fallback: string) => {
    const v = isObj(sides[s]) ? sides[s].name : undefined;
    return typeof v === "string" ? v.slice(0, DRILL_LIMITS.sideName) : fallback;
  };

  const pieces: DrillPiece[] = [];
  const seen = new Set<string>();
  const perSide: Record<DrillSide, number> = { a: 0, b: 0 };
  let balls = 0;
  for (const p of raw.pieces) {
    if (!isObj(p) || typeof p.id !== "string" || !p.id || p.id.length > 16 || seen.has(p.id)) {
      continue;
    }
    if (p.kind === "player" && (p.side === "a" || p.side === "b")) {
      if (perSide[p.side] >= DRILL_LIMITS.playersPerSide) continue;
      perSide[p.side]++;
      const label = typeof p.label === "string" ? p.label.slice(0, 3) : String(perSide[p.side]);
      pieces.push({ id: p.id, kind: "player", side: p.side, label });
    } else if (p.kind === "ball" && BALL_KINDS.includes(p.ball as BallKind)) {
      if (balls >= DRILL_LIMITS.balls) continue;
      balls++;
      pieces.push({ id: p.id, kind: "ball", ball: p.ball as BallKind });
    } else {
      continue;
    }
    seen.add(p.id);
  }

  const steps: DrillStep[] = [];
  for (const s of raw.steps.slice(0, DRILL_LIMITS.steps)) {
    const at: Record<string, Point> = {};
    const given = isObj(s) && isObj(s.at) ? s.at : {};
    const prev = steps[steps.length - 1]?.at;
    for (const p of pieces) {
      const g = given[p.id];
      at[p.id] =
        isObj(g) && isNum(g.x) && isNum(g.y)
          ? clampToPitch(g.x, g.y)
          : (prev?.[p.id] ?? { x: 0.5, y: 0.5 });
    }
    const note = isObj(s) && typeof s.note === "string" ? s.note.slice(0, DRILL_LIMITS.note) : "";
    steps.push({ at, note });
  }
  if (steps.length === 0) {
    steps.push({ at: Object.fromEntries(pieces.map((p) => [p.id, { x: 0.5, y: 0.5 }])), note: "" });
  }

  return {
    version: 1,
    sides: { a: { name: sideName("a", "Attack") }, b: { name: sideName("b", "Defence") } },
    pieces,
    steps,
    kit: parseKit(raw.kit, new Set(pieces.map((p) => p.id))),
  };
}

/** Cones and goals from a save; a drill from before they existed has none. */
function parseKit(raw: unknown, taken: Set<string>): DrillKit[] {
  if (!Array.isArray(raw)) return [];
  const kit: DrillKit[] = [];
  let cones = 0;
  let goals = 0;
  for (const k of raw) {
    if (!isObj(k) || typeof k.id !== "string" || !k.id || k.id.length > 16 || taken.has(k.id)) continue;
    if (!isNum(k.x) || !isNum(k.y)) continue;
    const { x, y } = clampToPitch(k.x, k.y);
    if (k.kind === "cone" && cones < KIT_LIMITS.cones) {
      cones++;
      kit.push({ id: k.id, kind: "cone", x, y });
    } else if (k.kind === "goal" && goals < KIT_LIMITS.goals) {
      goals++;
      const angle = ANGLES.includes(k.angle as GoalAngle) ? (k.angle as GoalAngle) : 0;
      const width = k.width === "full" ? "full" : "small";
      kit.push({ id: k.id, kind: "goal", x, y, angle, width });
    } else {
      continue;
    }
    taken.add(k.id);
  }
  return kit;
}
