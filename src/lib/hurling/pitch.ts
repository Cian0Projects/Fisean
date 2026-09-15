/**
 * Hurling pitch geometry.
 *
 * Event positions are stored as normalised reals in 0–1 rather than metres,
 * because a GAA pitch is not a fixed size: the rules allow 130–145 m long by
 * 80–90 m wide, so two clubs' pitches genuinely differ. Normalised
 * coordinates stay meaningful whatever the ground, and convert to metres
 * through the dimensions recorded for that match.
 *
 * Orientation is canonical, always from the perspective of the team under
 * review:
 *   x: 0 = own end line   → 1 = opposition end line
 *   y: 0 = left sideline  → 1 = right sideline
 *
 * Normalising on the way in means a shot map does not need to know which way
 * the team was playing in a given half.
 */

export type PitchSize = {
  lengthM: number;
  widthM: number;
};

/** The typical senior club pitch, and what we assume unless told otherwise. */
export const DEFAULT_PITCH: PitchSize = { lengthM: 145, widthM: 90 };

export const PITCH_LIMITS = {
  lengthM: { min: 130, max: 145 },
  widthM: { min: 80, max: 90 },
} as const;

/**
 * Distances from an end line, in metres, of every line a hurling pitch is
 * marked with. The 65 is hurling's own — football marks a 45 instead.
 */
export const LINE_DISTANCES_M = [13, 20, 45, 65] as const;
export type LineDistance = (typeof LINE_DISTANCES_M)[number];

/** Goal dimensions, for drawing the posts on the pitch map. */
export const GOAL = { widthM: 6.4, crossbarHeightM: 2.5 } as const;
export const SMALL_RECTANGLE = { widthM: 14, depthM: 4.5 } as const;
export const LARGE_RECTANGLE = { widthM: 19, depthM: 13 } as const;

/**
 * Where each marked line sits as a fraction of pitch length, at both ends.
 * `own` measures from the defending end line, `opp` from the attacking one.
 */
export function lineFractions(size: PitchSize = DEFAULT_PITCH) {
  const own = {} as Record<LineDistance, number>;
  const opp = {} as Record<LineDistance, number>;
  for (const d of LINE_DISTANCES_M) {
    own[d] = d / size.lengthM;
    opp[d] = 1 - d / size.lengthM;
  }
  return { own, opp, halfway: 0.5 };
}

/* -------------------------------------------------------------- zoning */

export type Zone =
  | "own_scoring_zone"
  | "own_20_to_45"
  | "own_45_to_65"
  | "middle_third"
  | "opp_65_to_45"
  | "opp_45_to_20"
  | "opp_scoring_zone";

export const ZONE_LABELS: Record<Zone, string> = {
  own_scoring_zone: "Inside our 20",
  own_20_to_45: "Our 20 to 45",
  own_45_to_65: "Our 45 to 65",
  middle_third: "Middle third",
  opp_65_to_45: "Their 65 to 45",
  opp_45_to_20: "Their 45 to 20",
  opp_scoring_zone: "Inside their 20",
};

/**
 * Which third-of-the-pitch band a normalised x falls in. Used to answer the
 * questions a selector actually asks — "where were we shooting from?",
 * "where did we lose the poc amach?".
 */
export function zoneForX(x: number, size: PitchSize = DEFAULT_PITCH): Zone {
  const { own, opp } = lineFractions(size);
  if (x < own[20]) return "own_scoring_zone";
  if (x < own[45]) return "own_20_to_45";
  if (x < own[65]) return "own_45_to_65";
  if (x <= opp[65]) return "middle_third";
  if (x <= opp[45]) return "opp_65_to_45";
  if (x <= opp[20]) return "opp_45_to_20";
  return "opp_scoring_zone";
}

/** Distance from the centre of the opposition goal, in metres. */
export function distanceToGoalM(
  x: number,
  y: number,
  size: PitchSize = DEFAULT_PITCH,
): number {
  const dx = (1 - x) * size.lengthM;
  const dy = (y - 0.5) * size.widthM;
  return Math.hypot(dx, dy);
}

/**
 * Shooting angle to the goal in degrees: 90 is straight in front, smaller
 * values are tighter angles from the wing. Pairs with distance to explain why
 * a wide was a wide.
 */
export function shotAngleDeg(
  x: number,
  y: number,
  size: PitchSize = DEFAULT_PITCH,
): number {
  const dx = (1 - x) * size.lengthM;
  const dy = Math.abs(y - 0.5) * size.widthM;
  if (dx === 0 && dy === 0) return 90;
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

/**
 * Flip a coordinate captured while the team was playing the other direction,
 * so every event ends up "attacking to the right".
 */
export function normaliseDirection(
  x: number,
  y: number,
  attacking: "lr" | "rl",
): { x: number; y: number } {
  return attacking === "lr" ? { x, y } : { x: 1 - x, y: 1 - y };
}

export function toMetres(x: number, y: number, size: PitchSize = DEFAULT_PITCH) {
  return { xM: x * size.lengthM, yM: y * size.widthM };
}

/** Keep a click inside the pitch, which matters when dragging on a touch screen. */
export function clampToPitch(x: number, y: number) {
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
}
