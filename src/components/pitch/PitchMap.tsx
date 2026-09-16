"use client";

/**
 * The pitch, drawn from the geometry in src/lib/hurling/pitch.ts.
 *
 * SVG in normalised 0–1 coordinates, exactly as AnnotationLayer draws over
 * the video: a mark is a fraction of the pitch, never pixels or metres, so
 * the same dot lands in the same place on a laptop, on a phone and on a
 * printed page — and on a 130 m pitch as on a 145 m one.
 *
 * The one difference from the annotation layer is that a pitch has a fixed
 * shape, so the drawing happens inside a viewBox scaled to the match's own
 * dimensions rather than against a measured box. Nothing has to be remeasured
 * on resize, which is what makes this cheap to render eight times on a report.
 *
 * Marks carry their outcome twice: in colour, and in shape. Green against red
 * is the one pair a colour-blind reader cannot separate by hue, so a filled
 * dot, a ring and a dashed ring say the same thing the colours do — and the
 * map survives being photocopied.
 */
import { useId } from "react";
import {
  DEFAULT_PITCH,
  GOAL,
  LARGE_RECTANGLE,
  LINE_DISTANCES_M,
  SMALL_RECTANGLE,
  clampToPitch,
  lineFractions,
  type PitchSize,
} from "@/lib/hurling/pitch";

/** Filled is for us, a ring is against us, a dashed ring is unclear. */
export type MarkShape = "filled" | "ring" | "dashed";

export type PitchMark = {
  id: string;
  x: number;
  y: number;
  /** A delivery also carries where it landed: one arrow, not two dots. */
  toX?: number | null;
  toY?: number | null;
  colour: string;
  shape: MarkShape;
  /** Jersey number. Numbers keep the map readable; names live in the table. */
  label?: string | null;
  /** Tooltip, e.g. "Cúilín — TJ Reid". */
  title?: string;
  /** The entry being edited, or the one just placed. */
  selected?: boolean;
  /** Already-logged marks, shown faintly for context while logging. */
  muted?: boolean;
};

/** The drawing happens in these units; the browser scales them to the box. */
const VIEW_W = 1000;
const DOT_R = 14;
/** The sod the marks sit on; a hollow mark is filled with it, not with black.
 *  A token rather than a literal so the print stylesheet can put it on paper. */
const PITCH_FILL = "var(--color-pitch)";

export function PitchMap({
  marks,
  size = DEFAULT_PITCH,
  onPlace,
  onSelect,
  caption,
  className,
  decorative = false,
}: {
  marks: PitchMark[];
  size?: PitchSize;
  /** Click-to-place, for logging. The map is read-only when this is absent. */
  onPlace?: (point: { x: number; y: number }) => void;
  onSelect?: (id: string) => void;
  caption?: string;
  className?: string;
  /** Markings only — no sod, no frame, no labels. For the sign-in screen. */
  decorative?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const H = Math.round((VIEW_W * size.widthM) / size.lengthM);
  const { own, opp } = lineFractions(size);

  // Metre-denominated furniture, as fractions of the drawing.
  const goalH = (GOAL.widthM / size.widthM) * H;
  const smallH = (SMALL_RECTANGLE.widthM / size.widthM) * H;
  const smallW = (SMALL_RECTANGLE.depthM / size.lengthM) * VIEW_W;
  const largeH = (LARGE_RECTANGLE.widthM / size.widthM) * H;
  const largeW = (LARGE_RECTANGLE.depthM / size.lengthM) * VIEW_W;

  const arrows = marks.filter((m) => m.toX != null && m.toY != null);
  const dots = marks.filter((m) => m.toX == null || m.toY == null);
  // One marker per colour in use — an SVG marker cannot inherit a stroke.
  const arrowColours = [...new Set(arrows.map((m) => m.colour))];
  const markerId = (colour: string) => `${uid}-arrow-${arrowColours.indexOf(colour)}`;

  const place = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onPlace) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onPlace(
      clampToPitch((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height),
    );
  };

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${H}`}
      className={`block h-auto w-full ${onPlace ? "cursor-crosshair" : ""} ${className ?? ""}`}
      style={{
        background: decorative ? "transparent" : PITCH_FILL,
        border: decorative ? "none" : "1px solid var(--color-line)",
        borderRadius: decorative ? 0 : 4,
        // Browsers drop background colours when printing unless told not to,
        // and a shot map without its colours says nothing at all.
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
      onPointerDown={place}
      role="img"
      aria-label={caption ? `${caption}, drawn on a pitch map` : "Pitch map"}
    >
      {/* Mowing bands. Every pitch has them, and they help place a dot along
          the length without reading the numbers. */}
      <g pointerEvents="none">
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
      </g>

      <defs>
        {arrowColours.map((colour) => (
          <marker
            key={colour}
            id={markerId(colour)}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={colour} />
          </marker>
        ))}
      </defs>

      <g
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth={1.5}
        opacity={0.32}
        pointerEvents="none"
      >
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
      <g stroke="var(--color-ink)" strokeWidth={5} strokeLinecap="round" pointerEvents="none">
        <line x1={3} y1={(H - goalH) / 2} x2={3} y2={(H + goalH) / 2} />
        <line x1={VIEW_W - 3} y1={(H - goalH) / 2} x2={VIEW_W - 3} y2={(H + goalH) / 2} />
      </g>

      <g
        fill="var(--color-ink-faint)"
        fontSize={14}
        fontFamily="var(--font-sans)"
        pointerEvents="none"
        display={decorative ? "none" : undefined}
      >
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
        <text x={10} y={19}>
          Our end
        </text>
        <text x={VIEW_W - 10} y={19} textAnchor="end">
          Their end
        </text>
        {caption && (
          <text x={VIEW_W / 2} y={19} textAnchor="middle" fill="var(--color-ink-dim)">
            {caption}
          </text>
        )}
      </g>

      {/* Deliveries: struck from, landed. A lost one is dashed, so the map
          reads the same in black and white. */}
      {arrows.map((m) => (
        <g key={m.id} opacity={m.muted ? 0.35 : 1}>
          {m.title && <title>{m.title}</title>}
          <line
            x1={m.x * VIEW_W}
            y1={m.y * H}
            x2={m.toX! * VIEW_W}
            y2={m.toY! * H}
            stroke={m.colour}
            strokeWidth={m.selected ? 5 : 3}
            strokeLinecap="round"
            strokeDasharray={m.shape === "filled" ? undefined : "14 9"}
            markerEnd={`url(#${markerId(m.colour)})`}
          />
          <Dot mark={m} r={m.label ? 13 : 6} h={H} />
        </g>
      ))}

      {dots.map((m) => (
        <g
          key={m.id}
          opacity={m.muted ? 0.35 : 1}
          onPointerDown={
            onSelect
              ? (e) => {
                  e.stopPropagation();
                  onSelect(m.id);
                }
              : undefined
          }
          style={{ cursor: onSelect ? "pointer" : undefined }}
        >
          {m.title && <title>{m.title}</title>}
          <Dot mark={m} r={DOT_R} h={H} />
        </g>
      ))}
    </svg>
  );
}

/**
 * One mark. Shape carries the outcome alongside colour: a filled dot went our
 * way, a ring went against us, a dashed ring was never settled.
 */
function Dot({ mark, r, h }: { mark: PitchMark; r: number; h: number }) {
  const filled = mark.shape === "filled";
  const cx = mark.x * VIEW_W;
  const cy = mark.y * h;

  return (
    <>
      {mark.selected && (
        <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke="var(--color-ash)" strokeWidth={2} />
      )}
      {/* A ring of the sod behind each mark, so two shots from the same corner
          stay two marks rather than one blob. */}
      <circle cx={cx} cy={cy} r={r + 1.5} fill={PITCH_FILL} stroke={PITCH_FILL} strokeWidth={2} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={filled ? mark.colour : PITCH_FILL}
        stroke={mark.colour}
        strokeWidth={filled ? 0 : 3}
        strokeDasharray={mark.shape === "dashed" ? "5 4" : undefined}
      />
      {mark.label && (
        <text
          x={cx}
          y={cy + 5}
          textAnchor="middle"
          fontSize={15}
          fontWeight="700"
          fontFamily="var(--font-sans)"
          fill={filled ? "#0a0f0d" : "var(--color-ink)"}
          pointerEvents="none"
        >
          {mark.label}
        </text>
      )}
    </>
  );
}
