/**
 * GAA scoring notation and the game clock.
 *
 * Two conversions live here, both easy to get subtly wrong, so both are unit
 * tested in tests/notation.test.mjs:
 *
 *  1. Scores are written goals-points, e.g. "1-12", and a goal is worth three
 *     points — so 1-12 is fifteen points, and beats 0-14.
 *  2. A coach thinks in game clock ("in the 58th minute"), not file position
 *     ("01:54:03"). Marking throw-in and half-time once on a video converts
 *     every timestamp in the interface.
 */

export const GOAL_VALUE = 3;

export type Score = {
  /** Goals — cúil. */
  cul: number;
  /** Points — cúilíní. */
  cuilin: number;
};

/** Total points. A goal counts three. */
export function scoreTotal(s: Score): number {
  return s.cul * GOAL_VALUE + s.cuilin;
}

/** "1-12" */
export function formatScore(s: Score): string {
  return `${s.cul}-${s.cuilin}`;
}

/** "1-12 (15)" — the parenthesised total is how margins are read at a glance. */
export function formatScoreWithTotal(s: Score): string {
  return `${formatScore(s)} (${scoreTotal(s)})`;
}

/** Parse "1-12". Returns null on anything malformed. */
export function parseScore(input: string): Score | null {
  const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(input);
  if (!m) return null;
  return { cul: Number(m[1]), cuilin: Number(m[2]) };
}

/** Positive when `a` is ahead. Compares on total points, not notation. */
export function scoreMargin(a: Score, b: Score): number {
  return scoreTotal(a) - scoreTotal(b);
}

/**
 * Roll a set of tagged scoring events up into a scoreline.
 *
 * Anything worth 3 is a cúl. Anything else scoring counts toward the points
 * column at its face value — so a 2-point score contributes 2. That matters:
 * the 2026 hurling rule trials include a direct sideline cut over the bar
 * worth two points, and because `scoreValue` is a plain column on
 * `event_types`, a club can adopt it without a code change.
 */
export function tallyScore(events: { scoreValue: number }[]): Score {
  let cul = 0;
  let cuilin = 0;
  for (const e of events) {
    if (e.scoreValue === GOAL_VALUE) cul += 1;
    else if (e.scoreValue > 0) cuilin += e.scoreValue;
  }
  return { cul, cuilin };
}

/* ------------------------------------------------------------ game clock */

export type Markers = {
  throwIn?: number | null;
  halfTime?: number | null;
  secondHalf?: number | null;
  fullTime?: number | null;
};

export type GamePhase = "pre_match" | "first_half" | "half_time" | "second_half" | "post_match";

export type GameTime = {
  phase: GamePhase;
  /** 1 or 2 while play is on, otherwise null. */
  half: 1 | 2 | null;
  /** Elapsed within the current half. */
  halfMs: number;
  /**
   * Continuous game time from throw-in, with the second half offset by the
   * half length — so the 5th minute after the restart reads as 35:00 in a
   * 30-minute-half game, which is the minute a coach would name.
   */
  gameMs: number;
  label: string;
};

/** mm:ss, or h:mm:ss past an hour. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return h > 0
    ? `${h}:${mm}:${String(s).padStart(2, "0")}`
    : `${mm}:${String(s).padStart(2, "0")}`;
}

/** mm:ss.cc — for frame-level work on the in/out points. */
export function formatClockPrecise(ms: number): string {
  const cs = Math.floor((Math.max(0, ms) % 1000) / 10);
  return `${formatClock(ms)}.${String(cs).padStart(2, "0")}`;
}

/**
 * Convert a position in the video file to hurling game time.
 *
 * With no markers set we cannot know where throw-in is, so this degrades to
 * reporting the raw file position rather than guessing.
 */
export function toGameTime(
  fileMs: number,
  markers: Markers,
  halfLengthMin = 30,
): GameTime {
  const halfLengthMs = halfLengthMin * 60_000;
  const { throwIn, halfTime, secondHalf, fullTime } = markers;

  if (throwIn == null) {
    return {
      phase: "first_half",
      half: null,
      halfMs: fileMs,
      gameMs: fileMs,
      label: formatClock(fileMs),
    };
  }

  if (fileMs < throwIn) {
    return { phase: "pre_match", half: null, halfMs: 0, gameMs: 0, label: "Pre-match" };
  }

  // Second half, if the restart has been marked and we are past it.
  if (secondHalf != null && fileMs >= secondHalf) {
    if (fullTime != null && fileMs > fullTime) {
      return {
        phase: "post_match",
        half: null,
        halfMs: 0,
        gameMs: halfLengthMs * 2,
        label: "Full time",
      };
    }
    const halfMs = fileMs - secondHalf;
    const gameMs = halfLengthMs + halfMs;
    return { phase: "second_half", half: 2, halfMs, gameMs, label: `2nd ${formatClock(gameMs)}` };
  }

  // The interval.
  if (halfTime != null && fileMs >= halfTime) {
    return {
      phase: "half_time",
      half: null,
      halfMs: halfLengthMs,
      gameMs: halfLengthMs,
      label: "Half time",
    };
  }

  const halfMs = fileMs - throwIn;
  return { phase: "first_half", half: 1, halfMs, gameMs: halfMs, label: `1st ${formatClock(halfMs)}` };
}

/** Turn the marker rows for a video into the shape `toGameTime` wants. */
export function markersFromRows(rows: { kind: string; atMs: number }[]): Markers {
  const at = (kind: string) => rows.find((r) => r.kind === kind)?.atMs ?? null;
  return {
    throwIn: at("throw_in"),
    halfTime: at("half_time"),
    secondHalf: at("second_half"),
    fullTime: at("full_time"),
  };
}
