/**
 * A match day panel from a spreadsheet: jersey numbers and names, one player
 * to a row, the way a club keeps its team sheet.
 *
 * Typing fifteen names into fifteen dropdowns is slow when the sheet already
 * exists in Excel or Google Sheets. This reads that file; src/lib/actions/
 * numbers.ts matches the names to the panel and writes the sheet.
 *
 * Clubs lay these out every way there is, so the reader asks little of the
 * file. A header row is optional and ignored. Number and name can be in
 * either order, with other columns (position, a note) around them: the cell
 * that is a whole number is the jersey, and the words in the other cells are
 * the name. Nothing here touches the database.
 */
import { parseCsv } from "./gps";
import { MAX_JERSEY } from "./stats";
import { MAX_PLAYER_NAME, tidyName } from "./squad";

/** More rows than any panel needs; a bigger file is the wrong file. */
export const MAX_LINEUP_ROWS = 60;

export type LineupRow = { number: number; name: string };

export type LineupParse = {
  rows: LineupRow[];
  /** Rows left out, each said in a sentence a coach can act on. */
  problems: string[];
  /** Set when nothing usable was found at all. */
  error?: string;
};

const NAME_HEADINGS = new Set(["name", "player", "playername", "fullname"]);

/** A cell that is nothing but a number: "7", " 12 ", "#7", "No. 7". */
function jerseyCell(cell: string): number | null {
  const m = /^\s*(?:no\.?|#)?\s*(\d{1,3})\s*$/i.exec(cell);
  return m ? Number(m[1]) : null;
}

export function parseLineupCsv(text: string): LineupParse {
  const all = parseCsv(text);
  if (all.length === 0) return { rows: [], problems: [], error: "That file is empty." };
  if (all.length > MAX_LINEUP_ROWS + 1) {
    return { rows: [], problems: [], error: `That has more than ${MAX_LINEUP_ROWS} rows. Is it the right file?` };
  }

  const rows: LineupRow[] = [];
  const problems: string[] = [];
  const seenNumbers = new Set<number>();
  const seenNames = new Set<string>();

  // When the heading names the name column, that column alone is the name, so
  // a Position or Notes column beside it does not end up inside it. Without
  // one, every text cell in the row is the name, which is what makes
  // "Seán, Murphy" in two columns work.
  const heading = all[0].every((c) => jerseyCell(c) == null) ? all[0] : null;
  const nameColumn = heading?.findIndex((c) => NAME_HEADINGS.has(c.toLowerCase().replace(/[^a-z]/g, ""))) ?? -1;

  all.forEach((cells, index) => {
    const at = cells.findIndex((c) => jerseyCell(c) != null);
    // A row with no number in it is a heading ("Number, Name") when it is the
    // first, and a mistake anywhere else.
    if (at === -1) {
      if (index > 0) problems.push(`Row ${index + 1} has no jersey number, so it was left out.`);
      return;
    }
    const number = jerseyCell(cells[at])!;
    const name = tidyName(
      nameColumn >= 0 && nameColumn !== at
        ? (cells[nameColumn] ?? "")
        : cells.filter((_, i) => i !== at && jerseyCell(cells[i]) == null).join(" "),
    );

    if (number < 1 || number > MAX_JERSEY) {
      problems.push(`Row ${index + 1}: jersey numbers run from 1 to ${MAX_JERSEY}, not ${number}.`);
    } else if (!name) {
      problems.push(`Row ${index + 1}: number ${number} has no name.`);
    } else if (name.length > MAX_PLAYER_NAME) {
      problems.push(`Row ${index + 1}: that name is longer than ${MAX_PLAYER_NAME} letters.`);
    } else if (seenNumbers.has(number)) {
      problems.push(`Number ${number} is on the sheet twice, so ${name} was left out.`);
    } else if (seenNames.has(name.toLocaleLowerCase("en-IE"))) {
      problems.push(`${name} is on the sheet twice, so the second was left out.`);
    } else {
      seenNumbers.add(number);
      seenNames.add(name.toLocaleLowerCase("en-IE"));
      rows.push({ number, name });
    }
  });

  if (rows.length === 0) {
    return {
      rows,
      problems,
      error: "No players found. Each row needs a jersey number and a name, such as 7, Seán Murphy.",
    };
  }
  return { rows, problems };
}
