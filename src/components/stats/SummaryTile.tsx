/**
 * One stat on the match summary: its number, the target it is judged
 * against, and whether it is on course.
 *
 * Colour here means exactly what it means everywhere else in the app: green
 * on target, red off it, amber close. The verdict is said in words and shown
 * by shape too (filled, ring, dashed), so a projector that washes colour out
 * still tells the room. A stat with no target stays in plain ink: nothing to
 * judge it by, so nothing is coloured.
 *
 * Two sizes. Large is for the player view, read from across a dressing room:
 * one number big enough to see from three metres, and a small map. Compact is
 * the management grid, every stat at once, each a link into the full report.
 */
import Link from "next/link";
import { PitchMap, type PitchMark } from "@/components/pitch/PitchMap";
import {
  TARGET_DIRECTION_LABELS,
  formatFigure,
  formatGoal,
  type Judged,
  type SummaryStage,
  type TileResult,
  type Verdict,
} from "@/lib/hurling/summary";
import type { GameCode } from "@/lib/hurling/codes";

const VERDICT_INK: Record<Verdict, string> = {
  met: "var(--color-brand)",
  close: "var(--color-mark)",
  missed: "var(--color-danger-ink)",
  untargeted: "var(--color-ink)",
  no_data: "var(--color-ink-faint)",
  waiting: "var(--color-ink-dim)",
};

const VERDICT_WORDS: Record<Verdict, string> = {
  met: "On target",
  close: "Close",
  missed: "Off target",
  untargeted: "No target set",
  no_data: "Nothing logged",
  waiting: "Waiting",
};

/** Filled, dashed, ring: the outcome shapes the maps use. */
function VerdictMark({ verdict, size = 12 }: { verdict: Verdict; size?: number }) {
  if (verdict !== "met" && verdict !== "close" && verdict !== "missed") return null;
  const r = size / 2 - 1.5;
  const ink = VERDICT_INK[verdict];
  return (
    <svg width={size} height={size} aria-hidden className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill={verdict === "met" ? ink : "none"}
        stroke={ink}
        strokeWidth={2.5}
        strokeDasharray={verdict === "close" ? "3 2.5" : undefined}
      />
    </svg>
  );
}

function verdictWords(tile: TileResult, judged: Judged): string {
  if (judged.verdict === "waiting") return `Waiting on ${tile.waitingOn.join(" and ")}`;
  return VERDICT_WORDS[judged.verdict];
}

function targetLine(tile: TileResult, judged: Judged, stage: SummaryStage): string | null {
  if (judged.goal == null) return null;
  const words = TARGET_DIRECTION_LABELS[tile.target.direction].toLowerCase();
  const by = stage === "half_time" && tile.target.measure === "count" ? " by half time" : "";
  return `Target ${words} ${formatGoal(judged.goal, tile.target)}${by}`;
}

/** The two halves at full time, each against half the target. */
function Halves({ tile, size }: { tile: TileResult; size: "large" | "compact" }) {
  if (!tile.halves) return null;
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1 ${size === "large" ? "text-[16px]" : "text-[13px]"}`}>
      {tile.halves.map(({ half, judged }) => (
        <span key={half} className="flex items-center gap-1.5 whitespace-nowrap">
          <VerdictMark verdict={judged.verdict} size={size === "large" ? 12 : 10} />
          <span style={{ color: "var(--color-ink-dim)" }}>
            {size === "large" ? (half === 1 ? "First half" : "Second half") : half === 1 ? "1st half" : "2nd half"}
          </span>
          <span className="tabular font-bold">{formatFigure(judged.figure, tile.target.measure)}</span>
        </span>
      ))}
    </div>
  );
}

export function SummaryTile({
  tile,
  stage,
  size,
  marks,
  code,
  href,
}: {
  tile: TileResult;
  stage: SummaryStage;
  size: "large" | "compact";
  /** Large tiles only: where it happened. */
  marks?: PitchMark[];
  code?: GameCode;
  /** Compact tiles open the matching section of the full report. */
  href?: string;
}) {
  const { headline } = tile;
  const ink = VERDICT_INK[headline.verdict];
  const target = targetLine(tile, headline, stage);
  const large = size === "large";

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className={large ? "title text-[20px]" : "title text-[15px]"}>{tile.title}</h3>
        <span
          className={`flex items-center gap-1.5 font-semibold ${large ? "text-[15px]" : "text-[12px]"}`}
          style={{ color: ink }}
        >
          <VerdictMark verdict={headline.verdict} size={large ? 14 : 11} />
          {verdictWords(tile, headline)}
        </span>
      </div>

      <p className="mt-2 flex flex-wrap items-baseline gap-x-3">
        <span
          className={`figure tabular leading-none ${large ? "text-[clamp(3.2rem,6vw,4.6rem)]" : "text-[2.1rem]"}`}
          style={{ color: ink }}
        >
          {formatFigure(headline.figure, tile.target.measure)}
        </span>
        {tile.target.measure === "rate" && headline.figure.whole != null && headline.figure.whole > 0 && (
          <span className={large ? "text-[17px]" : "text-[13px]"} style={{ color: "var(--color-ink-dim)" }}>
            {headline.figure.part} of {headline.figure.whole}
          </span>
        )}
      </p>
      <p className={large ? "mt-1 text-[16px]" : "mt-1 text-[13px]"} style={{ color: "var(--color-ink-dim)" }}>
        {tile.caption}
      </p>
      {target && (
        <p className={`font-semibold ${large ? "mt-1 text-[16px]" : "text-[12px]"}`} style={{ color: "var(--color-ink)" }}>
          {target}
        </p>
      )}

      {tile.halves && (
        <div className={large ? "mt-3" : "mt-2"}>
          <Halves tile={tile} size={size} />
        </div>
      )}

      {tile.supporting.length > 0 && (
        <ul className={`${large ? "mt-3 text-[15px]" : "mt-2 text-[12px]"} space-y-0.5`} style={{ color: "var(--color-ink-dim)" }}>
          {tile.supporting.slice(0, large ? 3 : 2).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {large && marks && marks.length > 0 && (
        <div className="mt-4">
          <PitchMap marks={marks} code={code} />
        </div>
      )}
    </>
  );

  const frame = {
    border: "1px solid var(--color-line)",
    borderTop: `4px solid ${headline.verdict === "untargeted" || headline.verdict === "no_data" || headline.verdict === "waiting" ? "var(--color-line-strong)" : ink}`,
    background: "var(--color-surface)",
  };

  if (href) {
    return (
      <Link href={href} className={`block rounded ${large ? "p-5" : "p-3.5"}`} style={frame}>
        {body}
      </Link>
    );
  }
  return (
    <div className={`rounded ${large ? "p-5" : "p-3.5"}`} style={frame}>
      {body}
    </div>
  );
}
