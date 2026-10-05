/** Shapes shared between the stat report, the logging form and their pages. */
import type { PitchMark } from "@/components/pitch/PitchMap";
import {
  describeStat,
  gameMinute,
  statColour,
  statShape,
  type AttemptSource,
  type Half,
  type PossessionKind,
  type PuckoutLength,
  type PuckoutSide,
  type ShotKind,
  type ShotResult,
  type Side,
  type StatOutcome,
  type StatType,
} from "@/lib/hurling/stats";

export type StatRow = {
  id: string;
  statType: StatType;
  outcome: StatOutcome | null;
  playerNumber: number | null;
  targetNumber: number | null;
  originX: number | null;
  originY: number | null;
  destX: number | null;
  destY: number | null;
  half: Half | null;
  side: Side | null;
  shotResult: ShotResult | null;
  shotKind: ShotKind | null;
  attemptSource: AttemptSource | null;
  ledToScore: boolean | null;
  possession: PossessionKind | null;
  frontEight: boolean | null;
  scorable: boolean | null;
  puckoutTakenBy: PuckoutSide | null;
  puckoutLength: PuckoutLength | null;
  pastSixtyFive: boolean | null;
  clipId: string | null;
  videoId: string | null;
  atMs: number | null;
  createdAt: number;
  /** Game clock, filled in by the report page from the video's markers. */
  gameMs?: number | null;
};

/** One number on a match's sheet, and who wore it. */
export type SheetEntry = {
  number: number;
  userId: string;
  displayName: string;
};

/** A match's numbers, looked up by the number a stat was logged against. */
export type NumberSheet = Map<number, SheetEntry>;

export function numberSheet(entries: readonly SheetEntry[]): NumberSheet {
  return new Map(entries.map((e) => [e.number, e]));
}

export type StatMatchInfo = {
  id: string;
  opponent: string;
  competition: string | null;
  venue: string | null;
  playedOn: string;
};

/**
 * A logged number as a person reads it: with the name once the match's sheet
 * has one, and as the bare number until then — it still counts either way.
 */
export function playerLabel(number: number | null | undefined, sheet: NumberSheet): string {
  if (number == null) return "Nobody named";
  const who = sheet.get(number);
  return who ? `${number}. ${who.displayName}` : `Number ${number}`;
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
  sheet: NumberSheet,
  options: { muted?: boolean; selected?: boolean } = {},
): PitchMark | null {
  if (row.originX == null || row.originY == null) return null;
  const who = row.playerNumber != null ? playerLabel(row.playerNumber, sheet) : null;

  return {
    id: row.id,
    x: row.originX,
    y: row.originY,
    toX: row.destX,
    toY: row.destY,
    colour: statColour(row),
    shape: statShape(row),
    // The number on the map, the name in the table: fifteen dots stay readable.
    label: row.playerNumber != null ? String(row.playerNumber) : null,
    // The minute under the mark, as the analyst's maps have it — only when
    // the footage's halves are marked, because a guessed minute is worse
    // than none.
    note: row.gameMs != null ? `${gameMinute(row.gameMs)}′` : null,
    title: [describeStat(row), who].filter(Boolean).join(" — "),
    muted: options.muted,
    selected: options.selected,
  };
}

/** Every mark for a set of rows, in one pass. */
export function statMarks(
  rows: StatRow[],
  sheet: NumberSheet,
  options: { muted?: boolean; selectedId?: string | null } = {},
): PitchMark[] {
  return rows
    .map((r) =>
      statMark(r, sheet, {
        muted: options.muted,
        selected: options.selectedId === r.id,
      }),
    )
    .filter((m): m is PitchMark => m !== null);
}
