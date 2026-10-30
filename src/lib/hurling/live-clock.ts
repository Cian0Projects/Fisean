/**
 * One logger's own match clock, for logging on the line or off a stream.
 *
 * Every coach logging a game keeps their own clock (`stat_clocks`). Tapping
 * throw-in starts it; half time, the second half and full time follow in
 * that order, one button at a time. Nothing here is shared with any other
 * phone, so nobody's tap can move anybody else's entries. A logger watching a
 * stream taps each whistle as the stream shows it, so the stream's delay is
 * already in their clock and never has to be set.
 *
 * Where the game is comes from which whistles have been tapped, not from how
 * long ago: a first half that runs into ten minutes of stoppage time is still
 * the first half until half time is tapped. Stats can only be logged while a
 * half is on, so every entry has a half and a time within it.
 *
 * Each entry stores its half and how far into it (`halfMs`), read off this
 * clock when the entry was started.
 *
 * Someone watching it back on the television drives the clock like the
 * footage: pause it, skip 15 seconds either way, or type what the screen's
 * clock shows. All three move only the clock, by moving the start of the half
 * that is on. Entries already logged keep their times, because the footage
 * they were seen in has not changed; only where the viewer is in it has.
 */
import { STOPPAGE_ALLOWANCE_MS, whistlesForClock, type Half } from "./stats";
import type { Markers } from "./notation";

export type Whistle = "throwIn" | "halfTime" | "secondHalf" | "fullTime";

export type LivePhase = "not_started" | "first_half" | "half_time" | "second_half" | "full_time";

export const WHISTLE_LABELS: Record<Whistle, string> = {
  throwIn: "Throw-in",
  halfTime: "Half time",
  secondHalf: "Second half",
  fullTime: "Full time",
};

/** Where the game is, by the whistles tapped so far. */
export function livePhase(w: Markers): LivePhase {
  if (w.fullTime != null && w.secondHalf != null) return "full_time";
  if (w.secondHalf != null) return "second_half";
  if (w.throwIn == null) return "not_started";
  if (w.halfTime != null) return "half_time";
  return "first_half";
}

/** The one whistle that can be tapped next. Null once full time has gone. */
export const NEXT_WHISTLE: Record<LivePhase, Whistle | null> = {
  not_started: "throwIn",
  first_half: "halfTime",
  half_time: "secondHalf",
  second_half: "fullTime",
  full_time: null,
};

/** The whistle that put the game where it is, which is the one an undo takes back. */
export const LAST_WHISTLE: Record<LivePhase, Whistle | null> = {
  not_started: null,
  first_half: "throwIn",
  half_time: "halfTime",
  second_half: "secondHalf",
  full_time: "fullTime",
};

/** Stats are only logged while a half is being played. */
export function canLog(phase: LivePhase): boolean {
  return phase === "first_half" || phase === "second_half";
}

/** Which half a moment falls in and how far into it, or null when no half is on. */
export function liveMoment(at: number, w: Markers): { half: Half; halfMs: number } | null {
  const phase = livePhase(w);
  if (phase === "first_half") return { half: 1, halfMs: Math.max(0, at - w.throwIn!) };
  if (phase === "second_half") return { half: 2, halfMs: Math.max(0, at - w.secondHalf!) };
  return null;
}

/** The game clock for a time within a half: the second half counts on from the half length. */
export function clockOf(half: Half, halfMs: number, halfLengthMin: number): number {
  return (half === 2 ? halfLengthMin * 60_000 : 0) + halfMs;
}

/**
 * Which half a clock typed in by hand means, without asking. Once a half is
 * on, it is that half, unless a first half is given a time it could never
 * reach even with stoppage time. Before throw-in or over the interval, the
 * time says it: 30:00 or more, in 30-minute halves, is the second half.
 */
export function halfForReading(gameMs: number, phase: LivePhase, halfLengthMin: number): Half {
  const halfLengthMs = halfLengthMin * 60_000;
  if (phase === "second_half" || phase === "full_time") return 2;
  if (phase === "first_half") return gameMs > halfLengthMs + STOPPAGE_ALLOWANCE_MS ? 2 : 1;
  return gameMs >= halfLengthMs ? 2 : 1;
}

/**
 * The whistles that make the clock read `gameMs` in `half` right now, for a
 * logger who joined late or tapped throw-in late. Setting the first half
 * takes back any later whistle, since the game is plainly still in it;
 * setting the second keeps a half time tapped before it.
 */
export function clockFromReading(
  gameMs: number,
  half: Half,
  now: number,
  w: Markers,
  halfLengthMin: number,
): { whistles: Markers } | { error: string } {
  const plan = whistlesForClock(gameMs, half, now, w, halfLengthMin);
  if ("error" in plan) return plan;
  if (half === 1) {
    return { whistles: { throwIn: plan.set.throwIn!, halfTime: null, secondHalf: null, fullTime: null } };
  }
  const secondHalf = plan.set.secondHalf!;
  const throwIn = plan.set.throwIn ?? w.throwIn!;
  const halfTime = w.halfTime != null && w.halfTime > throwIn && w.halfTime <= secondHalf ? w.halfTime : null;
  return { whistles: { throwIn, halfTime, secondHalf, fullTime: null } };
}

/** How far a skip button moves the clock. */
export const SKIP_MS = 15_000;

/**
 * The clock moved `byMs` on (back, when negative) as read at `at`, by moving
 * the start of the half that is on. It never goes back past the start of the
 * half. With no half on there is nothing running to move.
 */
export function skipClock(w: Markers, byMs: number, at: number): Markers {
  const start = livePhase(w) === "first_half" ? "throwIn" : livePhase(w) === "second_half" ? "secondHalf" : null;
  if (!start) return w;
  return { ...w, [start]: Math.min(at, w[start]! - byMs) };
}

/**
 * Carry on a clock paused at `pausedAt`: it reads now what it read then, so
 * the half's start moves on by however long it sat paused.
 */
export function resumeClock(w: Markers, pausedAt: number, now: number): Markers {
  return skipClock(w, pausedAt - now, now);
}
