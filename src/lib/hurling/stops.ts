/**
 * Comment stops: the moments in a clip where playback halts to show what was
 * said about it, with whatever was drawn on that frame.
 *
 * A coach watching a clip back pauses where something happens, writes the
 * point, and perhaps circles a player. Whoever watches it after them should
 * get the same thing in the same place: the clip plays, stops on that frame,
 * the comment and the drawing come up, and play carries on when they choose.
 * The drawing belongs to the frame, not to a span of seconds, which is why it
 * is shown only while the clip is parked there.
 *
 * Everything here works in offsets from the clip's in point, so a clip whose
 * edges are nudged later keeps its comments on the same moments. Pure, so
 * the tests can pin the awkward cases: a comment on the very first frame, two
 * comments on one frame, and a scrub that must not count as playing through.
 */

/** The fields of a comment the stops need; replies never stop playback. */
export type StopComment = { atMs: number | null; parentId: string | null };

export type Stop<C> = { atMs: number; comments: C[] };

/** Comments this close together are on the same frame, as far as anyone watching can tell. */
export const SAME_FRAME_MS = 120;

/**
 * Playback moving further than this between two frames was a seek, a scrub or
 * a new clip loading, not play, so nothing in between was watched.
 */
export const MAX_PLAY_STEP_MS = 750;

/**
 * Stops sit at least this far before the out point. The engine ends a clip at
 * its out point, and a stop placed there would be skipped by the ending.
 */
export const END_GUARD_MS = 200;

/**
 * The stops in a clip, in playing order. A comment without a moment (older
 * ones could be posted unpinned) stops on the first frame; one left beyond a
 * since-shortened clip stops just before the end, so neither is lost.
 */
export function stopsOf<C extends StopComment>(comments: C[], clipLengthMs: number): Stop<C>[] {
  const latest = Math.max(0, clipLengthMs - END_GUARD_MS);
  const placed = comments
    .filter((c) => c.parentId == null)
    .map((c) => ({ c, atMs: Math.min(latest, Math.max(0, c.atMs ?? 0)) }))
    .sort((a, b) => a.atMs - b.atMs);

  const stops: Stop<C>[] = [];
  for (const { c, atMs } of placed) {
    const last = stops[stops.length - 1];
    if (last && atMs - last.atMs <= SAME_FRAME_MS) last.comments.push(c);
    else stops.push({ atMs, comments: [c] });
  }
  return stops;
}

/**
 * Where playback was coming from when it reached `nowMs`, given the frame
 * before. After a jump nothing was played through, except that landing on
 * the clip's first frame counts as arriving at it: a clip that has just
 * started has "reached" a comment on frame one.
 */
export function playedFrom(lastMs: number | null, nowMs: number): number {
  const jumped = lastMs == null || nowMs < lastMs || nowMs - lastMs > MAX_PLAY_STEP_MS;
  if (!jumped) return lastMs;
  return nowMs <= SAME_FRAME_MS ? -1 : nowMs;
}

/** The first stop playback reached in moving from `fromMs` to `toMs`, if any. */
export function crossedStop<C>(stops: Stop<C>[], fromMs: number, toMs: number): Stop<C> | null {
  if (toMs <= fromMs || toMs - fromMs > MAX_PLAY_STEP_MS) return null;
  return stops.find((s) => s.atMs > fromMs && s.atMs <= toMs) ?? null;
}

/**
 * Comments listed the way playback reaches them, each reply straight after
 * the comment it answers, so the list beside the video reads in step with it.
 */
export function inPlayingOrder<C extends StopComment & { id: string; createdAt: number }>(
  comments: C[],
): C[] {
  const byTime = (a: C, b: C) => (a.atMs ?? 0) - (b.atMs ?? 0) || a.createdAt - b.createdAt;
  const replies = comments.filter((c) => c.parentId != null);
  return comments
    .filter((c) => c.parentId == null)
    .sort(byTime)
    .flatMap((c) => [
      c,
      ...replies.filter((r) => r.parentId === c.id).sort((a, b) => a.createdAt - b.createdAt),
    ]);
}

/** The stop the playhead is parked on, if any. */
export function stopAt<C>(stops: Stop<C>[], atMs: number): Stop<C> | null {
  return stops.find((s) => Math.abs(s.atMs - atMs) <= SAME_FRAME_MS) ?? null;
}
