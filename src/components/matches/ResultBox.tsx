/**
 * The result, boxed and ruled like the scores panel on a programme's back
 * page: one line per side, the total in brackets because that is how a
 * margin is read at a glance, and the verdict in words under it. The verdict
 * is the one thing here in an outcome colour, and it says what it means in
 * words too.
 *
 * Shared by the matches cover and the stat sheet, so one match's score is set
 * one way wherever it appears.
 */
import { formatScore, scoreTotal, type Score } from "@/lib/hurling/notation";
import type { Efficiency, MatchResult } from "@/lib/hurling/stats";

export function ResultBox({
  result,
  shooting,
  halfTime,
  teamName,
  opponent,
  className = "",
}: {
  result: MatchResult;
  shooting?: Efficiency | null;
  /** The half-time line a programme prints under the score, when it is known. */
  halfTime?: { us: Score; them: Score | null } | null;
  teamName: string;
  opponent: string;
  className?: string;
}) {
  return (
    <div className={`border-[1.5px] ${className}`} style={{ borderColor: "var(--color-rule)" }}>
      <ScoreRow name={teamName} score={result.us} />
      {result.them ? (
        <ScoreRow name={opponent} score={result.them} ruled />
      ) : (
        <p className="caption border-t px-4 py-3" style={{ borderColor: "var(--color-line)" }}>
          Their shots were not logged, so there is no margin.
        </p>
      )}
      {halfTime && (
        <p className="caption tabular border-t px-4 py-2.5" style={{ borderColor: "var(--color-line)" }}>
          Half time: {formatScore(halfTime.us)}
          {halfTime.them && <> to {formatScore(halfTime.them)}</>}
        </p>
      )}
      {shooting && shooting.total > 0 && (
        <p className="caption tabular border-t px-4 py-2.5" style={{ borderColor: "var(--color-line)" }}>
          We scored {shooting.scored} of {shooting.total} shots, {shooting.percent}%.
        </p>
      )}
      {result.margin != null && (
        <p
          className="border-t-[1.5px] px-4 py-2.5 text-[14px] font-bold"
          style={{ borderColor: "var(--color-rule)", color: verdictColour(result.margin) }}
        >
          {verdict(result.margin)}
        </p>
      )}
    </div>
  );
}

function ScoreRow({ name, score, ruled }: { name: string; score: Score; ruled?: boolean }) {
  return (
    <div
      className={`flex items-baseline justify-between gap-6 px-4 py-3 ${ruled ? "border-t" : ""}`}
      style={{ borderColor: "var(--color-line)" }}
    >
      <span className="truncate text-[14px] font-semibold">{name}</span>
      <span className="flex shrink-0 items-baseline gap-2">
        <span className="figure text-[2.5rem]">{formatScore(score)}</span>
        <span className="tabular text-[14px]" style={{ color: "var(--color-ink-faint)" }}>
          ({scoreTotal(score)})
        </span>
      </span>
    </div>
  );
}

export function verdict(margin: number): string {
  if (margin === 0) return "Level";
  const by = Math.abs(margin);
  return `${margin > 0 ? "Won" : "Lost"} by ${by} point${by === 1 ? "" : "s"}`;
}

/** Green good for us, red against — and a draw is neither, so it stays ink. */
export function verdictColour(margin: number): string {
  if (margin > 0) return "var(--color-brand)";
  if (margin < 0) return "var(--color-danger-ink)";
  return "var(--color-ink-dim)";
}
