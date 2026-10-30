"use client";

/**
 * One player's season watched back: every moment of theirs on every sheet in
 * scope, one match after another, narrowed to the kind of moment wanted.
 * "Every shot I took this year" is one chip.
 *
 * The page places each match's moments on that match's footage
 * (`seasonMoments`); this is the filters, and MomentReel plays them. A
 * player's moments are what the match's own "Watch it back" gives for their
 * number, so a delivery aimed at them is theirs as much as one they struck.
 */
import { useMemo, useState } from "react";
import { MomentReel, Chip, OUTCOME_FILTERS, Toggles, type MomentFootage } from "./MomentReel";
import type { StatRow } from "./types";
import { effectiveOutcome, statVocabulary, type StatOutcome, type StatType } from "@/lib/hurling/stats";
import type { Moment } from "@/lib/hurling/moments";
import type { GameCode } from "@/lib/hurling/codes";
import { matchDate } from "@/lib/format";

export type SeasonRow = StatRow & {
  matchId: string;
  opponent: string;
  playedOn: string;
  /** Whether the match has footage at all, for saying why a moment cannot be played. */
  filmed: boolean;
};

type Filter = { types: StatType[]; outcome: StatOutcome | null; half: 1 | 2 | null; matchId: string | null };

function fits(r: SeasonRow, f: Filter): boolean {
  if (f.types.length > 0 && !f.types.includes(r.statType)) return false;
  if (f.outcome != null && effectiveOutcome(r) !== f.outcome) return false;
  if (f.half != null && r.half !== f.half) return false;
  if (f.matchId != null && r.matchId !== f.matchId) return false;
  return true;
}

export function SeasonMoments({
  code,
  placed,
  unplaced,
  footage,
  initialTypes,
}: {
  code: GameCode;
  placed: Moment<SeasonRow>[];
  unplaced: SeasonRow[];
  /** Every file the moments are on, with signed links. */
  footage: MomentFootage[];
  /** Kinds to open on, from a link such as "Watch every shot". */
  initialTypes: StatType[];
}) {
  const vocabulary = statVocabulary(code);
  const [filter, setFilter] = useState<Filter>({ types: initialTypes, outcome: null, half: null, matchId: null });

  const all = useMemo(() => [...placed.map((m) => m.row), ...unplaced], [placed, unplaced]);
  const kinds = vocabulary.statTypes.filter((t) => all.some((r) => r.statType === t));
  const matchesIn = useMemo(() => {
    const seen = new Map<string, { opponent: string; playedOn: string }>();
    for (const r of all) seen.set(r.matchId, { opponent: r.opponent, playedOn: r.playedOn });
    return [...seen].sort((a, b) => a[1].playedOn.localeCompare(b[1].playedOn));
  }, [all]);

  const visible = useMemo(() => placed.filter((m) => fits(m.row, filter)), [placed, filter]);
  const missing = unplaced.filter((r) => r.filmed && fits(r, filter)).length;
  const unfilmed = unplaced.filter((r) => !r.filmed && fits(r, filter)).length;

  if (all.length === 0) {
    return (
      <p className="text-[14px]" style={{ color: "var(--color-ink-faint)" }}>
        Nothing of theirs logged in scope yet.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <label className="block">
          <span className="label mb-1.5 block">Match</span>
          <select
            value={filter.matchId ?? ""}
            onChange={(e) => setFilter({ ...filter, matchId: e.target.value || null })}
            className="field min-w-[13rem]"
          >
            <option value="">Every match</option>
            {matchesIn.map(([id, m]) => (
              <option key={id} value={id}>
                {m.opponent}, {matchDate(m.playedOn)}
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
          onChange={(half) => setFilter({ ...filter, half: half as Filter["half"] })}
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
                  setFilter({ ...filter, types: on ? filter.types.filter((x) => x !== t) : [...filter.types, t] })
                }
              >
                {vocabulary.meta[t].plural}
              </Chip>
            );
          })}
        </div>
      )}

      {footage.length === 0 ? (
        <p className="text-[14px]" style={{ color: "var(--color-ink-faint)" }}>
          None of these matches has footage yet. Once it is uploaded, every moment here can be played from ten seconds
          before it happened.
        </p>
      ) : (
        <>
          {/* A new filter is a new reel: whatever was playing belonged to the old one. */}
          <MomentReel
            key={JSON.stringify(filter)}
            code={code}
            moments={visible}
            footage={footage}
            missing={missing}
            subtitle={(r) => `${r.opponent}, ${matchDate(r.playedOn)}`}
          />
          {unfilmed > 0 && (
            <p className="caption">
              {unfilmed} more {unfilmed === 1 ? "is" : "are"} from matches with no footage.
            </p>
          )}
        </>
      )}
    </div>
  );
}
