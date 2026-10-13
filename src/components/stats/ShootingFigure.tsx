/**
 * A side's scoring efficiency: the percentage, what it was made of, and the
 * bar. The number that settles the argument after a match.
 *
 * Shared by the stat sheet and the matches cover, so one match's shooting is
 * set one way wherever it appears — the cover is a glimpse of the sheet, not
 * a second opinion of it.
 */
import { formatScore } from "@/lib/hurling/notation";
import { OUTCOME_COLOURS, type SideShooting, type StatOutcome } from "@/lib/hurling/stats";

export function ShootingFigure({ s, ours }: { s: SideShooting; ours: boolean }) {
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-3">
        <span className="figure text-[2.6rem]">{s.overall.percent}%</span>
        <span className="text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
          {s.overall.fraction} scored, {formatScore(s.overall.score)}
        </span>
      </p>
      <p className="text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
        {s.fromPlay.percent}% from play ({s.fromPlay.fraction})
        {s.placed.total > 0 && `, ${s.placed.percent}% from frees and 65s (${s.placed.fraction})`}
      </p>
      <Meter
        parts={[
          { n: s.overall.scored, outcome: ours ? "positive" : "negative" },
          { n: s.overall.total - s.overall.scored, outcome: ours ? "negative" : "positive" },
        ]}
      />
    </div>
  );
}

/** A proportion made of parts that each mean something; see `.meter` in globals.css. */
export function Meter({ parts }: { parts: { n: number; outcome: StatOutcome }[] }) {
  const total = parts.reduce((a, p) => a + p.n, 0);
  if (total === 0) return null;
  return (
    <div className="meter mt-3" aria-hidden>
      {parts
        .filter((p) => p.n > 0)
        .map((p, i) => (
          <span key={i} style={{ width: `${(p.n / total) * 100}%`, background: OUTCOME_COLOURS[p.outcome] }} />
        ))}
    </div>
  );
}
