/**
 * Double tap to skip, the way every phone video player does it: twice on
 * the right half of the picture goes forward ten seconds, twice on the left
 * goes back, and each quick tap after that goes another ten.
 *
 * A single tap on the picture already plays and pauses, and that has to
 * happen inside the tap itself: an iPhone only lets a video start playing
 * from a user's gesture, so waiting to see whether a second tap follows would
 * leave play dead on the phone. So the first tap toggles at once, and if a
 * second one turns it into a double, the caller toggles back before skipping.
 * The picture flickers for a third of a second; play keeps working.
 *
 * Kept free of the DOM so the tests can feed it made-up times.
 */

/** How quickly a second tap must follow the first to make a double. */
export const DOUBLE_TAP_MS = 300;
/** Once skipping, how long the next tap has to keep the run going. */
export const RUN_TAP_MS = 700;
export const TAP_SKIP_MS = 10_000;

export type TapSide = "back" | "forward";
export type TapRun = { at: number; side: TapSide; skips: number };

/** Which half of the picture a tap landed in. */
export function sideOf(x: number, width: number): TapSide {
  return x < width / 2 ? "back" : "forward";
}

/**
 * Feed in each tap with the run so far. `skip` says to skip ten seconds
 * that way; `undoToggle` says the tap before was the first of a double, so
 * the play/pause it did should be put back. Anything else is a single tap.
 * A tap on the other half starts afresh rather than skipping.
 */
export function nextTap(
  run: TapRun | null,
  at: number,
  side: TapSide,
): { run: TapRun; skip: boolean; undoToggle: boolean } {
  const window = run && run.skips > 0 ? RUN_TAP_MS : DOUBLE_TAP_MS;
  if (run && side === run.side && at - run.at <= window) {
    return { run: { at, side, skips: run.skips + 1 }, skip: true, undoToggle: run.skips === 0 };
  }
  return { run: { at, side, skips: 0 }, skip: false, undoToggle: false };
}
