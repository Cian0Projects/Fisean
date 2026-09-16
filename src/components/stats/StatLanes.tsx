"use client";

/**
 * The stat sheet as lanes under the scrub bar.
 *
 * A clip is a range and reads as a bar; a stat is an instant and reads as a
 * mark. Stacking every kind on one line would say only "something happened
 * here" — a lane each says *what*, and the shape of a match falls out of it:
 * a row of red in the deliveries lane through the third quarter is the thing
 * a coach is actually looking for.
 *
 * Two lanes are in view and the rest scroll, because six lanes plus the video
 * and the pad is more than the screen has. The lane label is the index, so the
 * colours are the second way of telling lanes apart and never the only one.
 *
 * Marks keep the outcome colours — green won, red lost, amber unclear. The
 * lane's own colour names the *category*, which is why it is kept off those
 * three: the lane says what these are, the marks say how they went.
 */
import { useEffect, useRef } from "react";
import type { PlayerEngine } from "@/components/player/engine";
import { formatClock } from "@/lib/hurling/notation";
import {
  STAT_TYPES,
  STAT_TYPE_COLOURS,
  STAT_TYPE_META,
  describeStat,
  statColour,
  type StatType,
} from "@/lib/hurling/stats";
import { playerLabel, type StatPlayer, type StatRow } from "./types";

/** Tall enough to hit a mark on, short enough that two fit above the pad. */
const LANE_H = 34;
const LANES_IN_VIEW = 2;

export function StatLanes({
  engine,
  durationMs,
  rows,
  players,
  focusType,
  onFocusType,
  onSelectStat,
  gutterPx,
}: {
  engine: PlayerEngine;
  durationMs: number;
  rows: StatRow[];
  players: Map<string, StatPlayer>;
  focusType: StatType;
  onFocusType: (type: StatType) => void;
  onSelectStat: (row: StatRow) => void;
  /** Width of the label column, matched by the scrub bar's left padding. */
  gutterPx: number;
}) {
  const playheadRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLDivElement>(null);

  // The playhead spans every lane, but the lanes start after the labels — so
  // it travels the track's width, offset by the gutter, not the whole box.
  useEffect(() => {
    return engine.subscribe((t) => {
      if (!playheadRef.current || durationMs <= 0) return;
      const ratio = Math.min(1, Math.max(0, t.positionMs / durationMs));
      playheadRef.current.style.left = `calc((100% - ${gutterPx}px) * ${ratio} + ${gutterPx}px)`;
    });
  }, [engine, durationMs, gutterPx]);

  // Picking a type in the pad should bring its lane into view, or the two
  // showing would have nothing to do with what is being logged.
  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: "nearest" });
  }, [focusType]);

  return (
    <div className="relative shrink-0 pr-3 pb-2" style={{ paddingLeft: 12 }}>
      <div className="overflow-y-auto" style={{ maxHeight: LANE_H * LANES_IN_VIEW }}>
        {STAT_TYPES.map((type) => {
          const meta = STAT_TYPE_META[type];
          const colour = STAT_TYPE_COLOURS[type];
          const here = type === focusType;
          const mine = rows.filter((r) => r.statType === type && r.atMs != null);

          return (
            <div
              key={type}
              ref={here ? focusRef : undefined}
              className="flex items-center rounded"
              style={{
                height: LANE_H,
                background: here ? `color-mix(in oklab, ${colour} 12%, transparent)` : undefined,
              }}
            >
              <button
                onClick={() => onFocusType(type)}
                title={`Log and watch ${meta.plural.toLowerCase()}`}
                className="flex shrink-0 items-center gap-1.5 pr-2 text-left text-[12px]"
                // The lane's own colour, on the word as well as the chip:
                // the label is what names it, so it is what should carry it.
                style={{ width: gutterPx, color: colour, opacity: here ? 1 : 0.72 }}
              >
                <span
                  aria-hidden
                  className="h-3.5 w-[3px] shrink-0 rounded-sm"
                  style={{ background: colour }}
                />
                <span className="truncate" style={{ fontWeight: here ? 600 : 400 }}>
                  {meta.label}
                </span>
                <span className="tabular ml-auto" style={{ color: "var(--color-ink-faint)" }}>
                  {mine.length}
                </span>
              </button>

              <div className="relative h-full flex-1">
                {/* The lane's own rule, so an empty lane still reads as a lane. */}
                <div
                  className="absolute inset-x-0 top-1/2 h-px"
                  style={{ background: `color-mix(in oklab, ${colour} 42%, transparent)` }}
                />

                {mine.map((r) => {
                  const who = r.playerId ? players.get(r.playerId) : undefined;
                  return (
                    <button
                      key={r.id}
                      title={[formatClock(r.atMs!), describeStat(r), who ? playerLabel(who) : null]
                        .filter(Boolean)
                        .join(" — ")}
                      onClick={() => onSelectStat(r)}
                      // A 3px mark keeps a full match readable; the button
                      // around it is wide enough to actually hit.
                      className="absolute top-1/2 flex h-4 w-2.5 -translate-y-1/2 justify-center"
                      style={{
                        left: `${durationMs > 0 ? Math.min(100, Math.max(0, (r.atMs! / durationMs) * 100)) : 0}%`,
                        marginLeft: "-5px",
                      }}
                    >
                      <span
                        className="h-full w-[3px] rounded-sm transition-transform hover:scale-y-110"
                        style={{ background: statColour(r) }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div
        ref={playheadRef}
        aria-hidden
        className="pointer-events-none absolute inset-y-0 z-10 w-px"
        style={{ background: "var(--color-ink)", opacity: 0.5, left: `${gutterPx}px` }}
      />
    </div>
  );
}
