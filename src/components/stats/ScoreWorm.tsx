/**
 * The score timeline: both running totals over the game clock, half time
 * drawn across it, and the spells where one side scored three or more in a
 * row without reply shaded behind.
 *
 * Two lines rather than one margin line, because a room reads "both lines
 * climbing, ours flattening" without being taught it. Ours is solid and
 * theirs dashed, and goals are marked by shape as well as colour (filled
 * ours, a ring theirs), so the chart survives a projector with no green in
 * it and a photocopy. The pure work is `scoreTimeline` in
 * src/lib/hurling/summary.ts.
 */
import { formatGameClock } from "@/lib/hurling/notation";
import { gameMinute } from "@/lib/hurling/stats";
import type { ScoreStep, ScoreTimeline } from "@/lib/hurling/summary";

const W = 1000;
const PAD = { left: 34, right: 16, top: 14, bottom: 28 };

export function ScoreWorm({
  timeline,
  teamName,
  opponent,
  height = 240,
  twoPointers = false,
}: {
  timeline: ScoreTimeline;
  teamName: string;
  opponent: string;
  /** The chart's height in the viewBox; it scales with the width. */
  height?: number;
  /** A code with the arc, where a two-pointer counts two on the line. */
  twoPointers?: boolean;
}) {
  const H = height;
  const { ours, theirs, runs, halfTimeAt, endAt, untimed } = timeline;
  const top = Math.max(4, ...ours.map((s) => s.total), ...(theirs ?? []).map((s) => s.total));
  const yMax = Math.ceil(top / 4) * 4;
  const x = (ms: number) => PAD.left + (Math.min(ms, endAt) / Math.max(endAt, 1)) * (W - PAD.left - PAD.right);
  const y = (total: number) => H - PAD.bottom - (total / yMax) * (H - PAD.top - PAD.bottom);

  const path = (steps: ScoreStep[]) => {
    let d = `M ${x(0)} ${y(0)}`;
    let level = 0;
    for (const s of steps) {
      d += ` H ${x(s.atMs)} V ${y(s.total)}`;
      level = s.total;
    }
    return `${d} H ${x(endAt)} V ${y(level)}`;
  };

  const ticks = Array.from({ length: yMax / 4 + 1 }, (_, i) => i * 4);
  const nothing = ours.length === 0 && (theirs?.length ?? 0) === 0;

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`Score timeline. ${teamName} ${ours.at(-1)?.total ?? 0} points${
          theirs ? `, ${opponent} ${theirs.at(-1)?.total ?? 0}` : ""
        }.`}
      >
        {runs.map((r, i) => {
          const from = x(r.fromMs) - 6;
          const to = Math.max(x(r.toMs) + 6, from + 14);
          return (
            <g key={i}>
              <rect
                x={from}
                y={PAD.top}
                width={to - from}
                height={H - PAD.top - PAD.bottom}
                fill={r.side === "us" ? "var(--color-brand)" : "var(--color-danger)"}
                opacity={0.14}
              />
              <text
                x={(from + to) / 2}
                y={PAD.top + 14}
                textAnchor="middle"
                fontSize={13}
                fontWeight={700}
                fill={r.side === "us" ? "var(--color-brand)" : "var(--color-danger-ink)"}
              >
                {r.scores} in a row
              </text>
            </g>
          );
        })}

        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={12} fill="var(--color-ink-faint)">
              {t}
            </text>
          </g>
        ))}

        {halfTimeAt < endAt && (
          <g>
            <line
              x1={x(halfTimeAt)}
              x2={x(halfTimeAt)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--color-ink-dim)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
          </g>
        )}
        <text x={x(0)} y={H - 8} fontSize={12} fill="var(--color-ink-faint)">
          Throw-in
        </text>
        <text
          x={x(halfTimeAt)}
          y={H - 8}
          textAnchor={halfTimeAt >= endAt ? "end" : "middle"}
          fontSize={12}
          fill="var(--color-ink-dim)"
          fontWeight={700}
        >
          Half time
        </text>
        {halfTimeAt < endAt && (
          <text x={x(endAt)} y={H - 8} textAnchor="end" fontSize={12} fill="var(--color-ink-faint)">
            {formatGameClock(endAt)}
          </text>
        )}

        {theirs && (
          <path
            d={path(theirs)}
            fill="none"
            stroke="var(--color-danger)"
            strokeWidth={3}
            strokeDasharray="9 6"
            strokeLinejoin="round"
          />
        )}
        <path d={path(ours)} fill="none" stroke="var(--color-brand)" strokeWidth={3.5} strokeLinejoin="round" />

        {[...ours, ...(theirs ?? [])]
          .filter((s) => s.goal)
          .map((s, i) => (
            <circle
              key={i}
              cx={x(s.atMs)}
              cy={y(s.total)}
              r={8}
              fill={s.side === "us" ? "var(--color-brand)" : "var(--color-stage)"}
              stroke={s.side === "us" ? "var(--color-stage)" : "var(--color-danger)"}
              strokeWidth={3}
            >
              <title>{`${s.side === "us" ? teamName : opponent} goal, ${gameMinute(s.clockMs)} min`}</title>
            </circle>
          ))}

        {nothing && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={16} fill="var(--color-ink-faint)">
            No timed scores yet
          </text>
        )}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]" style={{ color: "var(--color-ink-dim)" }}>
        <span className="flex items-center gap-2">
          <svg width="26" height="8" aria-hidden>
            <line x1="0" x2="26" y1="4" y2="4" stroke="var(--color-brand)" strokeWidth="3.5" />
          </svg>
          {teamName}
        </span>
        {theirs ? (
          <span className="flex items-center gap-2">
            <svg width="26" height="8" aria-hidden>
              <line x1="0" x2="26" y1="4" y2="4" stroke="var(--color-danger)" strokeWidth="3" strokeDasharray="7 4" />
            </svg>
            {opponent}
          </span>
        ) : (
          <span>{opponent}: their scores were not logged</span>
        )}
        <span>Total points: a goal counts 3{twoPointers && ", a two-pointer 2"}. Circles are goals.</span>
        {untimed > 0 && <span>{untimed} {untimed === 1 ? "score has" : "scores have"} no time, so not on the line</span>}
      </figcaption>
    </figure>
  );
}
