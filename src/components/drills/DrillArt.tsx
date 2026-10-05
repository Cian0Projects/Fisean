/**
 * How a drill's pieces are drawn: players as discs, balls as balls, runs as
 * solid arrows and passes as dashed ones — the convention every coaching
 * whiteboard already uses, so nobody has to be told which is which.
 *
 * No hooks in here, so the list page can render a drill's diagram on the
 * server and the editor can draw the same pieces while they move.
 *
 * Side A is a filled disc and side B a ring, for the same reason the stat
 * maps carry shape as well as colour: the board has to survive a
 * colour-blind reader and the dressing-room photocopier.
 */
import { PITCH_FILL, PitchMarkings, VIEW_W, pitchViewHeight } from "@/components/pitch/PitchMarkings";
import { DEFAULT_PITCH } from "@/lib/hurling/pitch";
import { GOAL_WIDTHS_M, type BallKind, type DrillData, type DrillKit, type DrillPiece, type DrillSide, type Point } from "@/lib/hurling/drill";

export const H = pitchViewHeight();
/**
 * A player is drawn to scale: about 1.5 m across the radius, the body plus
 * the swing of a hurley, which is the ground a player actually covers when
 * standing. That keeps a fifteen-a-side line-up from looking crowded and
 * shows honestly how much space there is between markers. Balls are not to
 * scale — a sliotar is 7 cm — or they could be neither seen nor grabbed.
 */
const PLAYER_REACH_M = 1.5;
export const PLAYER_R = (PLAYER_REACH_M / DEFAULT_PITCH.lengthM) * VIEW_W;
const BALL_R: Record<BallKind, number> = { sliotar: 5, football: 6.5 };

export const SIDE_COLOUR: Record<DrillSide, string> = {
  a: "var(--color-side-a)",
  b: "var(--color-side-b)",
};

export function pieceColour(p: DrillPiece): string {
  return p.kind === "player" ? SIDE_COLOUR[p.side] : "var(--color-ink)";
}

export function pieceRadius(p: DrillPiece): number {
  return p.kind === "player" ? PLAYER_R : BALL_R[p.ball];
}

/** Arrowheads, one per colour, since an SVG marker cannot inherit a stroke. */
export function DrillMarkers({ uid }: { uid: string }) {
  const heads: [string, string][] = [
    ["a", SIDE_COLOUR.a],
    ["b", SIDE_COLOUR.b],
    ["ball", "var(--color-ink)"],
  ];
  return (
    <defs>
      {heads.map(([key, colour]) => (
        <marker
          key={key}
          id={`${uid}-head-${key}`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="4.5"
          markerHeight="4.5"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={colour} />
        </marker>
      ))}
    </defs>
  );
}

export function headKey(p: DrillPiece): string {
  return p.kind === "player" ? p.side : "ball";
}

/**
 * A run or a pass from one spot to the next, stopped short of both pieces so
 * the arrowhead lands on the grass rather than under a disc.
 */
export function Movement({
  piece,
  from,
  to,
  uid,
  opacity = 1,
}: {
  piece: DrillPiece;
  from: Point;
  to: Point;
  uid: string;
  opacity?: number;
}) {
  const x1 = from.x * VIEW_W;
  const y1 = from.y * H;
  const x2 = to.x * VIEW_W;
  const y2 = to.y * H;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const r = pieceRadius(piece);
  // Too short to draw an arrow without it vanishing under the piece.
  if (len < r * 2 + 4) return null;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  return (
    <line
      x1={x1 + ux * (r * 0.6)}
      y1={y1 + uy * (r * 0.6)}
      x2={x2 - ux * (r + 3)}
      y2={y2 - uy * (r + 3)}
      stroke={pieceColour(piece)}
      strokeWidth={piece.kind === "player" ? 2.2 : 1.8}
      strokeLinecap="round"
      strokeDasharray={piece.kind === "ball" ? "9 7" : undefined}
      markerEnd={`url(#${uid}-head-${headKey(piece)})`}
      opacity={opacity}
      pointerEvents="none"
    />
  );
}

/** One piece at one spot. `ghost` is where it stood a step ago. */
export function Piece({
  piece,
  at,
  selected = false,
  ghost = false,
}: {
  piece: DrillPiece;
  at: Point;
  selected?: boolean;
  ghost?: boolean;
}) {
  const cx = at.x * VIEW_W;
  const cy = at.y * H;
  const colour = pieceColour(piece);
  const r = pieceRadius(piece);

  if (ghost) {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={colour}
        strokeWidth={1.5}
        strokeDasharray="3 3"
        opacity={0.45}
        pointerEvents="none"
      />
    );
  }

  return (
    <>
      {selected && (
        <circle cx={cx} cy={cy} r={r + 4.5} fill="none" stroke="var(--color-ash)" strokeWidth={2} />
      )}
      {/* A ring of sod behind each piece, so two players marking each other
          stay two discs rather than one blob. */}
      <circle cx={cx} cy={cy} r={r + 1.5} fill={PITCH_FILL} />
      {piece.kind === "player" ? (
        <>
          <circle
            cx={cx}
            cy={cy}
            r={piece.side === "a" ? r : r - 1.25}
            fill={piece.side === "a" ? colour : PITCH_FILL}
            stroke={colour}
            strokeWidth={piece.side === "a" ? 0 : 2.5}
          />
          <text
            x={cx}
            y={cy + 3.6}
            textAnchor="middle"
            fontSize={piece.label.length > 2 ? 7.5 : piece.label.length > 1 ? 9 : 10.5}
            fontWeight="700"
            fontFamily="var(--font-sans)"
            fill={piece.side === "a" ? "var(--color-stage)" : "var(--color-ink)"}
            pointerEvents="none"
          >
            {piece.label}
          </text>
        </>
      ) : (
        <Ball kind={piece.ball} cx={cx} cy={cy} r={r} />
      )}
    </>
  );
}

/**
 * A sliotar is small with a raised seam; a football is bigger with panels.
 * Drawn white with an ink edge, so either shows on the sod and on paper.
 */
function Ball({ kind, cx, cy, r }: { kind: BallKind; cx: number; cy: number; r: number }) {
  return (
    <g pointerEvents="none">
      <circle cx={cx} cy={cy} r={r} fill="var(--color-ball)" stroke="var(--color-ink)" strokeWidth={1.5} />
      {kind === "sliotar" ? (
        <path
          d={`M ${cx - r * 0.75} ${cy - r * 0.35} Q ${cx} ${cy + r * 0.55} ${cx + r * 0.75} ${cy - r * 0.35}`}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth={1}
        />
      ) : (
        <polygon
          points={Array.from({ length: 5 }, (_, i) => {
            const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
            return `${cx + Math.cos(a) * r * 0.42},${cy + Math.sin(a) * r * 0.42}`;
          }).join(" ")}
          fill="var(--color-ink)"
        />
      )}
    </g>
  );
}

/** Metres to drawing units; the pitch drawing is the same scale both ways. */
const M = VIEW_W / DEFAULT_PITCH.lengthM;
const NET_DEPTH_M = 1.5;

/**
 * A cone or an extra goal. Cones are ink triangles, the symbol every coaching
 * diagram uses, rather than orange: amber is reserved for "unclear". A goal
 * is drawn from above, with a heavy goal line where the posts stand and a
 * light net behind it, turned to face where its mouth points.
 */
export function KitMark({ item, selected = false }: { item: DrillKit; selected?: boolean }) {
  const cx = item.x * VIEW_W;
  const cy = item.y * H;

  if (item.kind === "cone") {
    const s = 5.5;
    return (
      <g pointerEvents="none">
        {selected && (
          <circle data-selection cx={cx} cy={cy} r={11} fill="none" stroke="var(--color-ash)" strokeWidth={2} />
        )}
        <polygon
          points={`${cx},${cy - s} ${cx + s * 0.95},${cy + s * 0.75} ${cx - s * 0.95},${cy + s * 0.75}`}
          fill="var(--color-ink)"
          stroke={PITCH_FILL}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      </g>
    );
  }

  const w = GOAL_WIDTHS_M[item.width] * M;
  const d = NET_DEPTH_M * M;
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${item.angle})`} pointerEvents="none">
      {selected && (
        <rect
          data-selection
          x={-d - 5}
          y={-w / 2 - 5}
          width={d + 10}
          height={w + 10}
          fill="none"
          stroke="var(--color-ash)"
          strokeWidth={2}
          strokeDasharray="4 3"
        />
      )}
      <path
        d={`M 0 ${-w / 2} L ${-d} ${-w * 0.4} L ${-d} ${w * 0.4} L 0 ${w / 2}`}
        fill="var(--color-ink)"
        fillOpacity={0.07}
        stroke="var(--color-ink)"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <line x1={0} y1={-w / 2} x2={0} y2={w / 2} stroke="var(--color-ink)" strokeWidth={4} strokeLinecap="round" />
    </g>
  );
}

/** How far a tap may land from a piece of kit and still pick it up. */
export function KitHitArea({ item }: { item: DrillKit }) {
  const cx = item.x * VIEW_W;
  const cy = item.y * H;
  if (item.kind === "cone") return <circle cx={cx} cy={cy} r={12} fill="transparent" />;
  const w = GOAL_WIDTHS_M[item.width] * M;
  const d = NET_DEPTH_M * M;
  return (
    <rect
      transform={`translate(${cx} ${cy}) rotate(${item.angle})`}
      x={-d - 7}
      y={-w / 2 - 7}
      width={d + 14}
      height={w + 14}
      fill="transparent"
    />
  );
}

/**
 * The whole drill as one still diagram: everyone where they start, with the
 * route each takes through every step drawn behind them. What a coach would
 * sketch on the back of a team sheet, and what the list page shows.
 */
export function DrillDiagram({ data, uid, className }: { data: DrillData; uid: string; className?: string }) {
  const first = data.steps[0].at;
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${H}`}
      className={`block h-auto w-full ${className ?? ""}`}
      style={{
        background: PITCH_FILL,
        border: "1px solid var(--color-line)",
        borderRadius: 4,
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
      role="img"
      aria-label="Drill diagram"
    >
      <DrillMarkers uid={uid} />
      <PitchMarkings />
      {data.kit.map((k) => (
        <KitMark key={k.id} item={k} />
      ))}
      {data.pieces.map((p) =>
        data.steps.slice(1).map((s, i) => (
          <Movement key={`${p.id}-${i}`} piece={p} from={data.steps[i].at[p.id]} to={s.at[p.id]} uid={uid} opacity={0.8} />
        )),
      )}
      {data.pieces.map((p) => (
        <Piece key={p.id} piece={p} at={first[p.id]} />
      ))}
    </svg>
  );
}
