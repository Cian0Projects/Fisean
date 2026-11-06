/**
 * Advanced puckout analysis, as the report reads it: one side's short
 * restarts, judged at the squad's line (src/lib/hurling/restart-line.ts).
 *
 * Two readers, two depths. A player gets a pitch map and one line: a dot
 * where each short restart was won, filled green if it went our way and a
 * red ring if not, and "8 of 14 worked through". Unclear and unsettled ones
 * are left off, so there are only two colours to read. A coach gets the four
 * answers counted, where the lost ones went, who was on the ball, and the
 * unclear and unsettled ones counted apart.
 *
 * A dot opens that moment on the footage, in "Watch it back" further down,
 * wherever the match has footage.
 */
"use client";

import { PitchMap, type PitchMark } from "@/components/pitch/PitchMap";
import { describeStat, OUTCOME_COLOURS, OUTCOME_SHAPES, type PuckoutSide } from "@/lib/hurling/stats";
import {
  ladderParts,
  lineName,
  restartLadder,
  restartStage,
  stageLabel,
  stageOutcome,
  type RestartStage,
} from "@/lib/hurling/restart-line";
import type { GameCode } from "@/lib/hurling/codes";
import { Meter } from "./ShootingFigure";
import { playerLabel, type NumberSheet, type StatRow } from "./types";
import { playMoment } from "./StatMoments";

const COUNTED = new Set<string>(["lost_first", "lost_before", "lost_past", "worked_through"]);

export function RestartLadderPanel({
  rows,
  takenBy,
  analyst,
  code,
  players,
  restartsWord,
  watchable,
}: {
  /** Every restart of the match; this picks out one side's judged ones. */
  rows: StatRow[];
  takenBy: PuckoutSide;
  /** A coach: the full picture. Anyone else: the green and red map. */
  analyst: boolean;
  code: GameCode;
  players: NumberSheet;
  /** "Poc amach" or "Kick-outs", as the code says them. */
  restartsWord: string;
  /** Whether the match has moments to open from a dot. */
  watchable: boolean;
}) {
  const ladder = restartLadder(rows, takenBy);
  if (!ladder) return null;
  const ours = takenBy === "us";
  const at = ladder.line ? lineName(ladder.line, takenBy) : "the line set at the time";
  const judged = rows.filter((r) => r.puckoutTakenBy === takenBy && COUNTED.has(restartStage(r) ?? ""));
  const good = ours ? ladder.workedThrough : ladder.counted - ladder.workedThrough;

  const marks: PitchMark[] = judged.flatMap((r) => {
    if (r.originX == null || r.originY == null) return [];
    const stage = restartStage(r) as RestartStage;
    const outcome = stageOutcome(stage, takenBy);
    const lostBy = analyst && r.lostByNumber != null ? r.lostByNumber : null;
    return [
      {
        id: r.id,
        x: r.originX,
        y: r.originY,
        // Where a lost one went, for the coach, when the entry that settled it said.
        toX: analyst ? r.destX : null,
        toY: analyst ? r.destY : null,
        colour: OUTCOME_COLOURS[outcome],
        shape: OUTCOME_SHAPES[outcome],
        label: lostBy != null ? String(lostBy) : null,
        title: [
          stageLabel(stage, takenBy, r.restartLine),
          analyst ? describeStat(r, code) : null,
          lostBy != null ? `lost by ${ours ? playerLabel(lostBy, players) : `their ${lostBy}`}` : null,
        ]
          .filter(Boolean)
          .join(", "),
      },
    ];
  });

  // Who was on the ball when they went, most first. Coaches only.
  const lostBy = new Map<number, number>();
  if (analyst) {
    for (const r of judged) {
      if (r.lostByNumber != null) lostBy.set(r.lostByNumber, (lostBy.get(r.lostByNumber) ?? 0) + 1);
    }
  }

  const headline = ours
    ? `${ladder.workedThrough} of ${ladder.counted} worked through`
    : `They worked ${ladder.workedThrough} of ${ladder.counted} through`;

  return (
    <div className="space-y-3">
      <div>
        <h4 className="label">
          Short {restartsWord.toLowerCase()}, judged at {at}
        </h4>
        <p className="mt-1 text-[16px]">
          {headline}
          {ladder.counted > 0 && <span style={{ color: "var(--color-ink-dim)" }}>, {ladder.percent}%</span>}
        </p>
        <Meter
          parts={[
            { n: good, outcome: "positive" },
            { n: ladder.counted - good, outcome: "negative" },
          ]}
        />
      </div>

      {analyst && (
        <ul className="text-[14px]">
          {ladderParts(ladder).map(({ stage, n }) => {
            const outcome = stageOutcome(stage, takenBy);
            return (
              <li
                key={stage}
                className="flex items-baseline justify-between gap-3 border-b py-1.5"
                style={{ borderColor: "var(--color-line)" }}
              >
                <span className="flex items-baseline gap-2">
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={
                      outcome === "positive"
                        ? { background: OUTCOME_COLOURS.positive }
                        : { border: `2px solid ${OUTCOME_COLOURS.negative}` }
                    }
                  />
                  {stageLabel(stage, takenBy, ladder.line)}
                </span>
                <span className="tabular" style={{ color: "var(--color-ash)" }}>
                  {n}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <PitchMap
        marks={marks}
        code={code}
        onSelect={watchable ? (id) => playMoment(id) : undefined}
        caption={
          marks.length < judged.length ? `${marks.length} of ${judged.length} placed on the pitch.` : undefined
        }
      />

      {analyst && (ladder.unclear > 0 || ladder.notSettled > 0 || lostBy.size > 0) && (
        <div className="space-y-1 text-[13px]" style={{ color: "var(--color-ink-dim)" }}>
          {lostBy.size > 0 && (
            <p>
              Lost by:{" "}
              {[...lostBy]
                .sort((a, b) => b[1] - a[1] || a[0] - b[0])
                .map(([n, times]) => `${ours ? playerLabel(n, players) : `their ${n}`} (${times})`)
                .join(", ")}
            </p>
          )}
          {(ladder.unclear > 0 || ladder.notSettled > 0) && (
            <p>
              Left out of the count:{" "}
              {[
                ladder.unclear > 0 ? `${ladder.unclear} broke unclear` : null,
                ladder.notSettled > 0 ? `${ladder.notSettled} not settled` : null,
              ]
                .filter(Boolean)
                .join(", ")}
              .
            </p>
          )}
        </div>
      )}
    </div>
  );
}
