/**
 * The Ardawn mark: a GAA goalpost with the green of the pitch held below its bar.
 *
 * The two posts and crossbar make the sport immediately legible. The green
 * block is the field and the moments held inside it are the work Ardawn keeps.
 *
 * Kept as plain rectangles so it survives everything it is asked
 * to do — a 16 px tab icon, a home-screen tile, an embroidered crest. The bar
 * is a hair thinner than the posts because a horizontal stroke of equal
 * weight looks heavier to the eye, and the drawing would sag. The strokes are
 * as heavy as the wordmark's stems, so the two sit side by side as one word.
 *
 * Warm white for the posts and Ardawn green for the field keep the mark
 * consistent with the supplied identity artwork.
 */

/** Width and height of the drawing, in its own units. */
export const MARK_W = 80;
export const MARK_H = 100;

const POST = 12;
const BAR = 9;
const BAR_TOP = 60;
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
      <rect
        x={POST}
        y={BAR_TOP + BAR}
        width={MARK_W - POST * 2}
        height={MARK_H - BAR_TOP - BAR}
        fill={ball}
      />
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
        <rect
          x={POST}
          y={BAR_TOP + BAR}
          width={MARK_W - POST * 2}
          height={MARK_H - BAR_TOP - BAR}
          fill="#35c46b"
        />
      </svg>
    </div>
  );
}
