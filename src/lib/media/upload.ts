/**
 * The rules for getting a match file in through the browser.
 *
 * A full match is two to four gigabytes, usually sent from a club laptop on
 * the clubhouse WiFi. One request carrying the whole file would fail at the
 * first dropped packet and start again from nothing, so it goes up as an S3
 * multipart upload: numbered parts, each PUT to its own signed URL, in any
 * order, any number of times. The store keeps whatever parts arrive; the
 * upload is finished only once every part is there at the right size.
 *
 * That is what makes it safe to retry. A part sent twice simply replaces
 * itself. An upload that dies altogether — the laptop is closed, the tab is
 * shut — resumes when the same file is dropped again: the server lists the
 * parts it holds and the browser sends only the rest.
 *
 * Kept free of the database, the filesystem and the network so the tests can
 * import it.
 */

/**
 * 8 MiB a part. S3 refuses parts under 5 MiB (bar the last) and allows at most
 * 10,000, so very large files get larger parts; a 4 GB match is 477 of these.
 * Small enough that a part lost to a dropped connection costs little.
 */
export const MIN_PART_BYTES = 8 * 1024 * 1024;
export const MAX_PARTS = 10_000;

/** How many parts the browser sends at once. */
export const PARALLEL_PARTS = 3;

/** Most part URLs handed out in one request. */
export const MAX_URLS_PER_REQUEST = 50;

export type PartPlan = { partSize: number; count: number };

/** The part layout for a file of `size` bytes. The same size always gives the same plan. */
export function planParts(size: number): PartPlan {
  const mib = 1024 * 1024;
  const partSize = Math.max(MIN_PART_BYTES, Math.ceil(size / MAX_PARTS / mib) * mib);
  return { partSize, count: Math.max(1, Math.ceil(size / partSize)) };
}

/** Bytes in part `n` (1-based): every part is full but the last. */
export function partBytes(n: number, plan: PartPlan, size: number): number {
  return n < plan.count ? plan.partSize : size - plan.partSize * (plan.count - 1);
}

/**
 * Part numbers still to send: missing, or held at the wrong size (a part cut
 * off mid-way). Empty means the upload can be completed.
 */
export function missingParts(
  plan: PartPlan,
  size: number,
  held: { partNumber: number; sizeBytes: number }[],
): number[] {
  const good = new Set(
    held.filter((p) => p.sizeBytes === partBytes(p.partNumber, plan, size)).map((p) => p.partNumber),
  );
  const missing: number[] = [];
  for (let n = 1; n <= plan.count; n++) if (!good.has(n)) missing.push(n);
  return missing;
}

/** Parse "3,4,5" into valid part numbers for this plan; null if any is not. */
export function parsePartList(raw: string | null, plan: PartPlan): number[] | null {
  if (!raw) return null;
  const nums = raw.split(",").map(Number);
  if (nums.length > MAX_URLS_PER_REQUEST) return null;
  if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > plan.count)) return null;
  return nums;
}

/** What the player can actually play. MKV is left out: Safari will not open it. */
export const VIDEO_EXTENSIONS = ["mp4", "m4v", "mov", "webm"] as const;

/** The `accept` attribute for the file picker. */
export const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm,.mp4,.m4v,.mov,.webm";

/**
 * A match named at the moment its footage is dropped. The match does not
 * exist until there is video of it, so dropping a file asks for a title and
 * a date, not for a choice from a list of matches that are not there yet.
 */
export type NewMatch = { opponent: string; playedOn: string };

/**
 * The title, as typed, cleaned into an opponent. People write the fixture
 * the way it is said — "v Sarsfields", "vs. Sarsfields" — and the app already
 * puts the "v" in where it is wanted, so it comes off here.
 */
export function readNewMatch(input: { title?: unknown; playedOn?: unknown }): NewMatch | { error: string } {
  const title = typeof input.title === "string" ? input.title : "";
  const opponent = title
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(v|vs|versus)\.?(\s+|$)/i, "")
    .trim();
  if (!opponent) return { error: "Give the match a title, such as who you played." };
  if (opponent.length > 80) return { error: "Keep the title under 80 characters." };

  const playedOn = typeof input.playedOn === "string" ? input.playedOn : "";
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(playedOn);
  const date = day ? new Date(Date.UTC(+day[1], +day[2] - 1, +day[3])) : null;
  if (!date || date.toISOString().slice(0, 10) !== playedOn) {
    return { error: "Enter the date the match was played." };
  }
  return { opponent, playedOn };
}

/**
 * A date as YYYY-MM-DD in the viewer's own time zone. A file's last-modified
 * time is usually when it was recorded, so it makes a good first guess at
 * the day the match was played.
 */
export function localDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Default storage allowance per club, when the host has not set one. */
export const DEFAULT_TEAM_STORAGE_GB = 100;

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

export function isAcceptedVideo(filename: string): boolean {
  return (VIDEO_EXTENSIONS as readonly string[]).includes(extensionOf(filename));
}

/**
 * Where a club's file is stored. The team id comes first so the media route
 * can tell at a glance whose footage a key belongs to; the file's own name is
 * never used, because it arrives from the browser and could be anything.
 */
export function uploadKey(teamId: string, filename: string, uuid: string): string {
  const ext = isAcceptedVideo(filename) ? extensionOf(filename) : "mp4";
  return `${teamId}/${uuid}.${ext}`;
}

/**
 * Bytes per club, from `TEAM_STORAGE_GB`. Hosting one instance for many clubs
 * means one club's season of 4K footage must not fill the disk for the rest.
 */
export function teamQuotaBytes(env: string | undefined): number {
  const gb = Number(env);
  return (Number.isFinite(gb) && gb > 0 ? gb : DEFAULT_TEAM_STORAGE_GB) * 1024 ** 3;
}

/** Null when the file fits, or the sentence to show the coach when it does not. */
export function quotaProblem(usedBytes: number, incomingBytes: number, quotaBytes: number): string | null {
  if (usedBytes + incomingBytes <= quotaBytes) return null;
  const gb = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GB`;
  return (
    `This file is ${gb(incomingBytes)} and the club has ${gb(Math.max(0, quotaBytes - usedBytes))} ` +
    `of its ${gb(quotaBytes)} left. Delete footage nobody watches any more to make room.`
  );
}
