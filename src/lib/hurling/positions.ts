/**
 * The hurling numbering, 1–15, and the six lines of a team.
 *
 * Positions are stored on `users.position` as a plain integer so a coach can
 * filter clips by line ("show me everything the half backs were involved in").
 */

export type Line =
  | "goalkeeper"
  | "full_back"
  | "half_back"
  | "midfield"
  | "half_forward"
  | "full_forward";

export type Position = {
  number: number;
  /** Short form used on the pitch map and in dense lists. */
  abbr: string;
  name: string;
  line: Line;
};

export const LINE_LABELS: Record<Line, string> = {
  goalkeeper: "Goalkeeper",
  full_back: "Full back line",
  half_back: "Half back line",
  midfield: "Midfield",
  half_forward: "Half forward line",
  full_forward: "Full forward line",
};

export const POSITIONS: Position[] = [
  { number: 1, abbr: "GK", name: "Goalkeeper", line: "goalkeeper" },

  { number: 2, abbr: "RCB", name: "Right corner back", line: "full_back" },
  { number: 3, abbr: "FB", name: "Full back", line: "full_back" },
  { number: 4, abbr: "LCB", name: "Left corner back", line: "full_back" },

  { number: 5, abbr: "RHB", name: "Right half back", line: "half_back" },
  { number: 6, abbr: "CB", name: "Centre back", line: "half_back" },
  { number: 7, abbr: "LHB", name: "Left half back", line: "half_back" },

  { number: 8, abbr: "MF", name: "Midfield", line: "midfield" },
  { number: 9, abbr: "MF", name: "Midfield", line: "midfield" },

  { number: 10, abbr: "RHF", name: "Right half forward", line: "half_forward" },
  { number: 11, abbr: "CF", name: "Centre forward", line: "half_forward" },
  { number: 12, abbr: "LHF", name: "Left half forward", line: "half_forward" },

  { number: 13, abbr: "RCF", name: "Right corner forward", line: "full_forward" },
  { number: 14, abbr: "FF", name: "Full forward", line: "full_forward" },
  { number: 15, abbr: "LCF", name: "Left corner forward", line: "full_forward" },
];

export function positionByNumber(n: number | null | undefined): Position | undefined {
  return n == null ? undefined : POSITIONS.find((p) => p.number === n);
}

/** e.g. 6 -> "6 · Centre back". Falls back cleanly for panel players. */
export function positionLabel(n: number | null | undefined): string {
  const p = positionByNumber(n);
  return p ? `${p.number} · ${p.name}` : "Squad";
}

export function positionsByLine(line: Line): Position[] {
  return POSITIONS.filter((p) => p.line === line);
}

export const LINES: Line[] = [
  "goalkeeper",
  "full_back",
  "half_back",
  "midfield",
  "half_forward",
  "full_forward",
];
