/**
 * Minimum and maximum clip length.
 *
 * Shared between the server action that persists a clip
 * ([`src/lib/actions/clips.ts`](../actions/clips.ts)) and the client trim UI
 * that resizes one, so a drag can never propose a length the server would
 * then reject.
 */
export const MIN_CLIP_MS = 500;
export const MAX_CLIP_MS = 10 * 60_000;
