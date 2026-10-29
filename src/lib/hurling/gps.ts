/**
 * GPS match reports: reading the CSV a club exports from its GPS provider
 * (StatSports Sonra, Catapult OpenField, Playertek and the rest) and ranking
 * it for the two report pages.
 *
 * Every provider exports a table with one row per player, but they name and
 * order the columns differently, and a club often edits the sheet in Excel
 * before saving it. So columns are found by name, not position: the header
 * is lower-cased and stripped to letters and digits, then looked up in the
 * aliases below. Anything we do not recognise is ignored rather than
 * rejected, so an export with extra columns still imports.
 *
 * Kept free of the database and the browser so the tests can import it; the
 * upload action only persists what comes out of here.
 */

export type GpsPlayer = {
  name: string;
  /** Metres. */
  totalDistance: number;
  /** Metres at high metabolic load. Null when the export has no such column. */
  hmld: number | null;
  /** Metres run above the provider's high speed threshold. */
  hsr: number | null;
  /** Metres per second, whatever unit the export used. */
  maxSpeed: number | null;
  /** Top speed as a percentage of the player's own best, so it can pass 100. */
  percentSpeed: number | null;
  accels: number | null;
  decels: number | null;
};

export type GpsKey = Exclude<keyof GpsPlayer, "name">;

export type GpsColumn = {
  key: GpsKey;
  label: string;
  /** What it measures, in a sentence a player would follow. */
  means: string;
  /** Header spellings seen in exports, already reduced by `fold`. */
  aliases: string[];
};

export const GPS_COLUMNS: GpsColumn[] = [
  {
    key: "totalDistance",
    label: "Total distance",
    means: "Every metre covered in the match, walking, jogging and running. The simplest measure of workload.",
    aliases: ["totaldistance", "totaldistancem", "distance", "totaldist", "td"],
  },
  {
    key: "hmld",
    label: "HMLD",
    means:
      "High metabolic load distance, in metres. Distance covered while the body was working hard, which counts sprinting but also accelerating and braking, so it shows effort that plain running distance misses.",
    aliases: ["hmld", "hmldm", "highmetabolicloaddistance", "highmetabolicload", "hmd"],
  },
  {
    key: "hsr",
    label: "HSR",
    means:
      "High speed running, in metres. Distance covered above the club's high speed threshold, usually around 5.5 metres per second (20 km/h). The best single guide to how much sprint work a player did.",
    aliases: ["hsr", "hsrm", "highspeedrunning", "highspeedrunningdistance", "hsd", "highspeeddistance"],
  },
  {
    key: "maxSpeed",
    label: "Max speed",
    means: "The fastest the player moved in the match, in metres per second. Multiply by 3.6 for km/h.",
    aliases: ["maxspeed", "maxspeedms", "maxvelocity", "topspeed", "peakspeed", "maxvel"],
  },
  {
    key: "percentSpeed",
    label: "% speed",
    means:
      "Max speed as a percentage of the player's own best recorded speed. Near 100% means they reached top pace in the game; much lower means they were never fully stretched. It can pass 100% when a new best was set.",
    aliases: ["percentagespeed", "percentspeed", "speedpercent", "speedpercentage", "maxspeedpercent", "pctspeed", "percentofmaxspeed", "maxspeedpct"],
  },
  {
    key: "accels",
    label: "Accels",
    means: "Accelerations: how many times the player sped up sharply. A high count is a lot of short, explosive efforts.",
    aliases: ["accels", "accelerations", "acceleration", "acc", "accelcount", "accelerationcount"],
  },
  {
    key: "decels",
    label: "Decels",
    means: "Decelerations: how many times the player braked sharply. These load the legs as much as accelerations do.",
    aliases: ["decels", "decelerations", "deceleration", "dec", "decelcount", "decelerationcount"],
  },
];

const NAME_ALIASES = ["name", "player", "playername", "athlete", "athletename", "fullname"];

/** Lower-case and keep letters and digits only, so "Max Speed (m/s)" matches "maxspeedms". */
function fold(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Turn a chosen file's bytes into text without losing the fadas.
 *
 * `File.text()` always assumes UTF-8, but Excel's plain "CSV" save is
 * Windows-1252, where Ó is one byte that is not valid UTF-8 and comes out as a
 * replacement character. So: honour a UTF-16 byte-order mark (Excel's
 * "Unicode text"), try strict UTF-8 (Sonra, OpenField and Excel's "CSV UTF-8"),
 * and only when that fails read it as Windows-1252.
 */
export function decodeCsvBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * Split CSV text into rows of cells. Handles quoted cells (with doubled
 * quotes and embedded commas or newlines), a byte-order mark, and the
 * semicolon or tab separators Excel uses in some locales.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"]
    .map((d) => ({ d, n: firstLine.split(d).length }))
    .sort((a, b) => b.n - a.n)[0].d;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // A blank line, or a row of nothing but separators, is not a player.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** "7,861", "70%", "8.1 " and "6,5" (decimal comma) all read as numbers; anything else is null. */
export function parseNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  let s = raw.trim().replace(/%$/, "").trim();
  if (s === "") return null;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else if (/^\d+,\d+$/.test(s)) s = s.replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export type GpsParse = {
  players: GpsPlayer[];
  /** Header cells we did not recognise, so the uploader can see what was left out. */
  ignored: string[];
  /** Data rows dropped because they had no name or no total distance. */
  skipped: number;
  /** Set when nothing usable was found; the message is written for the uploader. */
  error?: string;
};

export function parseGpsCsv(text: string): GpsParse {
  const rows = parseCsv(text);
  const fail = (error: string): GpsParse => ({ players: [], ignored: [], skipped: 0, error });
  if (rows.length < 2) return fail("That file has no player rows. Export the player table as a CSV and try again.");

  const header = rows[0].map(fold);
  const nameAt = header.findIndex((h) => NAME_ALIASES.includes(h));
  if (nameAt === -1) return fail("Could not find a Name column in the first row of that file.");

  const at = new Map<GpsKey, number>();
  const known = new Set<number>([nameAt]);
  for (const col of GPS_COLUMNS) {
    const i = header.findIndex((h, idx) => !known.has(idx) && col.aliases.includes(h));
    if (i !== -1) {
      at.set(col.key, i);
      known.add(i);
    }
  }
  if (!at.has("totalDistance")) return fail("Could not find a Total Distance column in that file.");

  const ignored = rows[0].filter((h, i) => !known.has(i) && h.trim() !== "").map((h) => h.trim());

  const cell = (r: string[], key: GpsKey) => (at.has(key) ? parseNumber(r[at.get(key)!]) : null);
  const players: GpsPlayer[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const name = (r[nameAt] ?? "").trim().replace(/\s+/g, " ");
    const totalDistance = cell(r, "totalDistance");
    if (!name || totalDistance == null) {
      skipped++;
      continue;
    }
    players.push({
      name,
      totalDistance,
      hmld: cell(r, "hmld"),
      hsr: cell(r, "hsr"),
      maxSpeed: cell(r, "maxSpeed"),
      percentSpeed: cell(r, "percentSpeed"),
      accels: cell(r, "accels"),
      decels: cell(r, "decels"),
    });
  }
  if (players.length === 0) return fail("No rows in that file had both a name and a total distance.");

  // Providers disagree on the speed unit. No one runs faster than about 12
  // metres per second, so a figure above 15 can only be km/h.
  const speeds = players.map((p) => p.maxSpeed).filter((s): s is number => s != null);
  if (speeds.length > 0 && Math.max(...speeds) > 15) {
    for (const p of players) if (p.maxSpeed != null) p.maxSpeed = Math.round((p.maxSpeed / 3.6) * 100) / 100;
  }
  // A sheet formatted as percentages exports "70%", but an unformatted one
  // exports 0.7. Nobody tops out at under 1.5% of their own best.
  const pcts = players.map((p) => p.percentSpeed).filter((s): s is number => s != null);
  if (pcts.length > 0 && Math.max(...pcts) <= 1.5) {
    for (const p of players) if (p.percentSpeed != null) p.percentSpeed = Math.round(p.percentSpeed * 100);
  }

  return { players, ignored, skipped };
}

/** Highest first, players with no figure last, ties by name so the order never shuffles. */
export function rankBy<T extends GpsPlayer>(players: readonly T[], key: GpsKey): T[] {
  return [...players].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x == null && y == null) return a.name.localeCompare(b.name);
    if (x == null) return 1;
    if (y == null) return -1;
    return y - x || a.name.localeCompare(b.name);
  });
}

export type GpsSummary = {
  leader: { name: string; value: number } | null;
  average: number | null;
  /** Players with a figure for this column. */
  count: number;
};

export function summarise(players: readonly GpsPlayer[], key: GpsKey): GpsSummary {
  const ranked = rankBy(players, key).filter((p) => p[key] != null);
  if (ranked.length === 0) return { leader: null, average: null, count: 0 };
  const total = ranked.reduce((sum, p) => sum + (p[key] as number), 0);
  return {
    leader: { name: ranked[0].name, value: ranked[0][key] as number },
    average: total / ranked.length,
    count: ranked.length,
  };
}

/**
 * High speed running as a percentage of total distance: how much of a
 * player's work was at pace rather than just how much ground they covered.
 * Null without an HSR figure, since a missing column is not a zero.
 */
export function hsrShare(p: Pick<GpsPlayer, "hsr" | "totalDistance">): number | null {
  if (p.hsr == null || p.totalDistance <= 0) return null;
  return (p.hsr / p.totalDistance) * 100;
}

/** How far along a bar a value sits, 0 to 1, against the biggest in the squad. */
export function barShare(value: number | null, peak: number | null): number {
  if (value == null || peak == null || peak <= 0) return 0;
  return Math.max(0, Math.min(1, value / peak));
}

/** 7861 becomes "7,861". Done by hand so the server and the browser can never disagree. */
export function groupThousands(n: number): string {
  const [whole, frac] = String(Math.round(n * 100) / 100).split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (frac ? `.${frac}` : "");
}

/** Metres per second as a figure to read: 8.9 m/s, with the km/h beside it. */
export function formatSpeed(ms: number): { ms: string; kmh: string } {
  return { ms: (Math.round(ms * 100) / 100).toString(), kmh: (Math.round(ms * 3.6 * 10) / 10).toString() };
}
