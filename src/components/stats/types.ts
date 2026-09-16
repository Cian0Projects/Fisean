/** Shapes shared between the stat report, the logging form and their pages. */
import type { PitchMark } from "@/components/pitch/PitchMap";
import {
  describeStat,
  statColour,
  statShape,
  type PuckoutSide,
  type ShotResult,
  type StatOutcome,
  type StatType,
} from "@/lib/hurling/stats";

export type StatRow = {
  id: string;
  statType: StatType;
  outcome: StatOutcome | null;
  playerId: string | null;
  originX: number | null;
  originY: number | null;
  destX: number | null;
  destY: number | null;
  shotResult: ShotResult | null;
  ledToScore: boolean | null;
  puckoutTakenBy: PuckoutSide | null;
  clipId: string | null;
  videoId: string | null;
  atMs: number | null;
  createdAt: number;
};

export type StatPlayer = {
  id: string;
  displayName: string;
  jerseyNumber: number | null;
  position: number | null;
};

export type StatMatchInfo = {
  id: string;
  opponent: string;
  competition: string | null;
  venue: string | null;
  playedOn: string;
};

/** Jersey number on the map, name in the table — fifteen dots stay readable. */
export function jerseyLabel(player: StatPlayer | undefined): string | null {
  return player?.jerseyNumber != null ? String(player.jerseyNumber) : null;
}

export function playerLabel(player: StatPlayer | undefined): string {
  if (!player) return "Unattributed";
  return player.jerseyNumber != null
    ? `${player.jerseyNumber}. ${player.displayName}`
    : player.displayName;
}

/**
 * Turn a stat row into a mark for the pitch map.
 *
 * One place applies the colour rule and the label rule, so every map in the
 * app reads the same way whoever drew it. A row with no location is not a
 * mark at all — it still counts in the tallies, it just cannot be plotted.
 */
export function statMark(
  row: StatRow,
  player: StatPlayer | undefined,
  options: { muted?: boolean; selected?: boolean } = {},
): PitchMark | null {
  if (row.originX == null || row.originY == null) return null;
  const who = player ? playerLabel(player) : null;

  return {
    id: row.id,
    x: row.originX,
    y: row.originY,
    toX: row.destX,
    toY: row.destY,
    colour: statColour(row),
    shape: statShape(row),
    label: jerseyLabel(player),
    title: [describeStat(row), who].filter(Boolean).join(" — "),
    muted: options.muted,
    selected: options.selected,
  };
}

/** Every mark for a set of rows, in one pass. */
export function statMarks(
  rows: StatRow[],
  players: Map<string, StatPlayer>,
  options: { muted?: boolean; selectedId?: string | null } = {},
): PitchMark[] {
  return rows
    .map((r) =>
      statMark(r, r.playerId ? players.get(r.playerId) : undefined, {
        muted: options.muted,
        selected: options.selectedId === r.id,
      }),
    )
    .filter((m): m is PitchMark => m !== null);
}
