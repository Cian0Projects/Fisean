/**
 * The screening room.
 *
 * Wraps a route that puts footage on screen — review, live stat logging, the
 * playlist player, the phone watch screen — so the palette flips to graphite
 * for it. A bright surround beside the video tires the eye and washes out the
 * picture; the list pages around it stay printed white.
 *
 * It is a scope, not a box: `.dark-room` is `display: contents`, so the page
 * inside lays out exactly as if the wrapper were not there.
 */
export function DarkRoom({ children }: { children: React.ReactNode }) {
  return <div className="dark-room">{children}</div>;
}
