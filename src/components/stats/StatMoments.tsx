"use client";

/**
 * The stat sheet watched back.
 *
 * Every entry on the sheet already knows when it happened, so a player can
 * pick their own number, narrow it to the kind of moment they care about
 * (every ball they lost, every shot in the second half) and watch each one
 * from ten seconds before. The rules for finding a stat on the footage and
 * for running moments together are in src/lib/hurling/moments.ts; the player
 * and the list are MomentReel, shared with a player's season. This is the
 * filters.
 */
import { useMemo, useState } from "react";
import { numberSheet, playerLabel, whoLabel, type SheetEntry, type StatRow } from "./types";
import { MomentReel, Chip, OUTCOME_FILTERS, Toggles, type MomentFootage } from "./MomentReel";
import { statVocabulary, type StatOutcome, type StatType } from "@/lib/hurling/stats";
import { ALL_MOMENTS, inFilter, statMoments, type MomentFilter } from "@/lib/hurling/moments";
import type { Markers } from "@/lib/hurling/notation";
import type { GameCode } from "@/lib/hurling/codes";

export function StatMoments({
  code,
  rows,
  numbers,
  footage,
  whistles,
  halfLengthMin,
  viewerNumber,
}: {
  code: GameCode;
  /** The sheet, with each row's half and game clock already settled by the page. */
  rows: StatRow[];
  numbers: SheetEntry[];
  /** This match's ready footage, in playing order. */
  footage: MomentFootage[];
  whistles: Markers;
  halfLengthMin: number;
  /**
   * The number to open on: the viewer's own in this match, so a player opens
   * on their own moments, or the one a player's season page linked here for.
   */
  viewerNumber: number | null;
}) {
  const vocabulary = statVocabulary(code);
  const sheet = useMemo(() => numberSheet(numbers), [numbers]);

  const { placed, unplaced } = useMemo(
    () => statMoments(rows, footage, whistles, halfLengthMin),
    [rows, footage, whistles, halfLengthMin],
  );

  const [filter, setFilter] = useState<MomentFilter>(() => ({
    ...ALL_MOMENTS,
    number: viewerNumber != null && placed.some((m) => inFilter(m.row, { ...ALL_MOMENTS, number: viewerNumber }))
      ? viewerNumber
      : null,
  }));

  const visible = useMemo(() => placed.filter((m) => inFilter(m.row, filter)), [placed, filter]);
  const missing = unplaced.filter((r) => inFilter(r, filter)).length;

  // Every number anyone logged, named where the sheet names it.
  const people = useMemo(() => {
    const seen = new Set<number>();
    for (const r of rows) {
      if (r.playerNumber != null) seen.add(r.playerNumber);
      if (r.targetNumber != null) seen.add(r.targetNumber);
    }
    return [...seen].sort((a, b) => a - b);
  }, [rows]);
  const kinds = vocabulary.statTypes.filter((t) => rows.some((r) => r.statType === t));

  if (footage.length === 0) {
    return (
      <p className="text-[14px]" style={{ color: "var(--color-ink-faint)" }}>
        No footage of this match yet, so there is nothing to watch back. Once it is uploaded, every entry here can be
        played from ten seconds before it happened.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <label className="block">
          <span className="label mb-1.5 block">Player</span>
          <select
            value={filter.number ?? ""}
            onChange={(e) => setFilter({ ...filter, number: e.target.value === "" ? null : Number(e.target.value) })}
            className="field min-w-[13rem]"
          >
            <option value="">Everyone</option>
            {people.map((n) => (
              <option key={n} value={n}>
                {playerLabel(n, sheet)}
                {n === viewerNumber ? " (you)" : ""}
              </option>
            ))}
          </select>
        </label>

        <Toggles
          label="Half"
          options={[
            { value: null, label: "Both" },
            { value: 1, label: "1st" },
            { value: 2, label: "2nd" },
          ]}
          value={filter.half}
          onChange={(half) => setFilter({ ...filter, half: half as MomentFilter["half"] })}
        />

        <Toggles
          label="Outcome"
          options={[{ value: null, label: "Any" }, ...OUTCOME_FILTERS]}
          value={filter.outcome}
          onChange={(outcome) => setFilter({ ...filter, outcome: outcome as StatOutcome | null })}
        />
      </div>

      {kinds.length > 1 && (
        <div role="group" aria-label="Kind of stat" className="flex flex-wrap gap-1.5">
          <Chip on={filter.types.length === 0} onClick={() => setFilter({ ...filter, types: [] })}>
            Every kind
          </Chip>
          {kinds.map((t) => {
            const on = filter.types.includes(t);
            return (
              <Chip
                key={t}
                on={on}
                onClick={() =>
                  setFilter({
                    ...filter,
                    types: on ? filter.types.filter((x) => x !== t) : [...filter.types, t as StatType],
                  })
                }
              >
                {vocabulary.meta[t].plural}
              </Chip>
            );
          })}
        </div>
      )}

      {/* A new filter is a new reel: whatever was playing belonged to the old one. */}
      <MomentReel
        key={JSON.stringify(filter)}
        code={code}
        moments={visible}
        footage={footage}
        missing={missing}
        subtitle={(r) => whoOf(r, sheet)}
      />
    </div>
  );
}

/**
 * "6. Áine Ryan to 14. Clodagh Moore" for a delivery, with whoever of theirs
 * won it; otherwise ours and theirs as every list says them (`whoLabel`).
 */
function whoOf(r: StatRow, sheet: ReturnType<typeof numberSheet>): string {
  if (r.targetNumber == null) return whoLabel(r, sheet);
  const to = playerLabel(r.targetNumber, sheet);
  const pass = r.playerNumber != null ? `${playerLabel(r.playerNumber, sheet)} to ${to}` : `To ${to}`;
  return r.oppositionNumber != null ? `${pass}, won by their ${r.oppositionNumber}` : pass;
}
