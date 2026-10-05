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
import { DEFAULT_PITCH, clampToPitch, type PitchSize } from "@/lib/hurling/pitch";
import { PITCH_FILL, PitchMarkings, VIEW_W, pitchViewHeight } from "./PitchMarkings";

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
  /** Set small under the mark — the game minute, on the report's maps. */
  note?: string | null;
  /** Tooltip, e.g. "Cúilín — TJ Reid". */
  title?: string;
  /** The entry being edited, or the one just placed. */
  selected?: boolean;
  /** Already-logged marks, shown faintly for context while logging. */
  muted?: boolean;
};

const DOT_R = 14;

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
  const H = pitchViewHeight(size);

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

      <PitchMarkings size={size} decorative={decorative} />

      <g
        fill="var(--color-ink-faint)"
        fontSize={14}
        fontFamily="var(--font-sans)"
        pointerEvents="none"
        display={decorative ? "none" : undefined}
      >
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
      {mark.note && (
        <text
          x={cx}
          y={cy + r + 14}
          textAnchor="middle"
          fontSize={12}
          fontFamily="var(--font-sans)"
          fill="var(--color-ink-dim)"
          pointerEvents="none"
        >
          {mark.note}
        </text>
      )}
    </>
  );
}
