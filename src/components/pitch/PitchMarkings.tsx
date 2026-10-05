/**
 * The lines on a hurling pitch, drawn from src/lib/hurling/pitch.ts.
 *
 * Kept out of PitchMap's client module, with no hooks, so a server component
 * can draw a pitch too: a constant imported from a "use client" file arrives
 * on the server as a reference, not a number.
 */
import {
  DEFAULT_PITCH,
  GOAL,
  LARGE_RECTANGLE,
  LINE_DISTANCES_M,
  SMALL_RECTANGLE,
  lineFractions,
  type PitchSize,
} from "@/lib/hurling/pitch";

/** The drawing happens in these units; the browser scales them to the box. */
export const VIEW_W = 1000;
/** The sod the marks sit on; a hollow mark is filled with it, not with black.
 *  A token rather than a literal so the print stylesheet can put it on paper. */
export const PITCH_FILL = "var(--color-pitch)";

/** The drawing's height for a pitch of this shape, in the same units as VIEW_W. */
export function pitchViewHeight(size: PitchSize = DEFAULT_PITCH): number {
  return Math.round((VIEW_W * size.widthM) / size.lengthM);
}

/**
 * The lines on the grass and nothing else: mowing bands, the 13, 20, 45 and
 * 65 at both ends, the rectangles, the goals and the distance figures. Shared
 * by the stat maps here and the drill board, so there is one drawing of a
 * pitch in the app. Draw it inside an SVG whose viewBox is
 * `0 0 VIEW_W pitchViewHeight(size)`.
 */
export function PitchMarkings({
  size = DEFAULT_PITCH,
  decorative = false,
}: {
  size?: PitchSize;
  decorative?: boolean;
}) {
  const H = pitchViewHeight(size);
  const { own, opp } = lineFractions(size);

  // Metre-denominated furniture, as fractions of the drawing.
  const goalH = (GOAL.widthM / size.widthM) * H;
  const smallH = (SMALL_RECTANGLE.widthM / size.widthM) * H;
  const smallW = (SMALL_RECTANGLE.depthM / size.lengthM) * VIEW_W;
  const largeH = (LARGE_RECTANGLE.widthM / size.widthM) * H;
  const largeW = (LARGE_RECTANGLE.depthM / size.lengthM) * VIEW_W;

  return (
    <g pointerEvents="none">
      {/* Mowing bands. Every pitch has them, and they help place a dot along
          the length without reading the numbers. */}
      {!decorative &&
        Array.from({ length: 10 }, (_, i) => (
          <rect
            key={i}
            x={(i * VIEW_W) / 10}
            y={0}
            width={VIEW_W / 10}
            height={H}
            fill="#ffffff"
            opacity={i % 2 ? 0.022 : 0}
          />
        ))}

      <g fill="none" stroke="var(--color-ink)" strokeWidth={1.5} opacity={0.32}>
        <rect x={1} y={1} width={VIEW_W - 2} height={H - 2} strokeWidth={2.5} />
        <line x1={VIEW_W / 2} y1={0} x2={VIEW_W / 2} y2={H} />

        {/* 13, 20, 45 and 65 at both ends. The 65 is hurling's own line. */}
        {LINE_DISTANCES_M.map((d) => (
          <g key={d}>
            <line x1={own[d] * VIEW_W} y1={0} x2={own[d] * VIEW_W} y2={H} />
            <line x1={opp[d] * VIEW_W} y1={0} x2={opp[d] * VIEW_W} y2={H} />
          </g>
        ))}

        {/* Small and large rectangles, mirrored at each end. */}
        <rect x={0} y={(H - smallH) / 2} width={smallW} height={smallH} />
        <rect x={VIEW_W - smallW} y={(H - smallH) / 2} width={smallW} height={smallH} />
        <rect x={0} y={(H - largeH) / 2} width={largeW} height={largeH} />
        <rect x={VIEW_W - largeW} y={(H - largeH) / 2} width={largeW} height={largeH} />
      </g>

      {/* The goals: the one piece of the marking drawn at full strength. */}
      <g stroke="var(--color-ink)" strokeWidth={5} strokeLinecap="round">
        <line x1={3} y1={(H - goalH) / 2} x2={3} y2={(H + goalH) / 2} />
        <line x1={VIEW_W - 3} y1={(H - goalH) / 2} x2={VIEW_W - 3} y2={(H + goalH) / 2} />
      </g>

      {!decorative && (
        <g fill="var(--color-ink-faint)" fontSize={14} fontFamily="var(--font-sans)">
          {LINE_DISTANCES_M.map((d) => (
            <g key={d}>
              <text x={own[d] * VIEW_W + 5} y={H - 7}>
                {d}
              </text>
              <text x={opp[d] * VIEW_W - 5} y={H - 7} textAnchor="end">
                {d}
              </text>
            </g>
          ))}
        </g>
      )}
    </g>
  );
}
