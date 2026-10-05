/**
 * The Físeán mark: a GAA goalpost with a sliotar sailing over the bar.
 *
 * Three things are being drawn at once, which is why it is worth having.
 * It is the goal end at Croke Park and every pitch in the parish — two tall
 * posts, a low crossbar, in the real proportions, where the bar sits about a
 * third of the way up. The ball above the bar and between the posts is a
 * point. And it is the trim strip: the posts are the in and out handles, the
 * bar is the clip between them, the ball is the moment you stopped to keep.
 *
 * Kept as plain rectangles and a circle so it survives everything it is asked
 * to do — a 16 px tab icon, a home-screen tile, an embroidered crest. The bar
 * is a hair thinner than the posts because a horizontal stroke of equal
 * weight looks heavier to the eye, and the drawing would sag. The strokes are
 * as heavy as the wordmark's stems, so the two sit side by side as one word.
 *
 * Chalk for the posts, ash for the ball, the same two inks as the rest of the
 * app: no green or red, which are reserved for what happened on the field.
 */

/** Width and height of the drawing, in its own units. */
export const MARK_W = 80;
export const MARK_H = 100;

const POST = 12;
const BAR = 9;
const BAR_TOP = 60;
const BALL = { cx: 49, cy: 28, r: 10 };

type Ink = { posts?: string; ball?: string };

export function Mark({
  posts = "var(--color-ink)",
  ball = "var(--color-ash)",
  className,
  title,
}: Ink & { className?: string; title?: string }) {
  return (
    <svg
      viewBox={`0 0 ${MARK_W} ${MARK_H}`}
      // Width follows height, so the mark is sized by the one number a
      // layout knows: how tall the line beside it is.
      className={className}
      style={{ aspectRatio: `${MARK_W} / ${MARK_H}` }}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <g fill={posts}>
        <rect x={0} y={0} width={POST} height={MARK_H} />
        <rect x={MARK_W - POST} y={0} width={POST} height={MARK_H} />
        <rect x={0} y={BAR_TOP} width={MARK_W} height={BAR} />
      </g>
      <circle cx={BALL.cx} cy={BALL.cy} r={BALL.r} fill={ball} />
    </svg>
  );
}

/**
 * The mark on a square tile of sod, for icons and splash screens.
 *
 * Rendered by `next/og`, which lays out with flexbox and understands inline
 * SVG but not CSS variables — so it takes literal colours. `fill` is how much
 * of the tile's height the mark takes: about 0.58 leaves a maskable icon's
 * safe zone clear, a browser tab wants it much larger to stay readable.
 */
export function MarkTile({ px, fill = 0.58 }: { px: number; fill?: number }) {
  const h = Math.round(px * fill);
  const w = Math.round((h * MARK_W) / MARK_H);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0f0d",
      }}
    >
      <svg width={w} height={h} viewBox={`0 0 ${MARK_W} ${MARK_H}`}>
        <g fill="#eceee7">
          <rect x={0} y={0} width={POST} height={MARK_H} />
          <rect x={MARK_W - POST} y={0} width={POST} height={MARK_H} />
          <rect x={0} y={BAR_TOP} width={MARK_W} height={BAR} />
        </g>
        <circle cx={BALL.cx} cy={BALL.cy} r={BALL.r} fill="#e3d2ae" />
      </svg>
    </div>
  );
}
