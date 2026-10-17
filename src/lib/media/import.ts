/**
 * The rules for bringing a club's old footage across from another app.
 *
 * A club moving to Ardawn has last season on Veo, Pixellot, Hudl or Spiideo,
 * or in a Google Drive or Dropbox folder. None of those offers a way to move
 * a whole library out, but every one of them hands over a single match as a
 * download link: Veo's Download full game, the email Pixellot and Hudl send
 * with an export, a Drive or Dropbox share link. So that is what Ardawn
 * takes. The coach pastes the link and the server fetches the file itself,
 * straight into storage, instead of the coach downloading four gigabytes
 * over clubhouse broadband and sending it all back up again.
 *
 * This file is what can be decided without the network: reading a pasted
 * link, turning a share link into a download link, naming the file, and
 * guessing the match from the file's name so the coach mostly just confirms.
 * Fetching is in source.ts and the transfer itself in importer.ts.
 *
 * Kept free of the database, the filesystem and the network so the tests can
 * import it.
 */
import { extensionOf, isAcceptedVideo } from "./upload";

export const SOURCE_KINDS = ["veo", "pixellot", "hudl", "spiideo", "drive", "dropbox", "other"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_LABELS: Record<SourceKind, string> = {
  veo: "Veo",
  pixellot: "Pixellot",
  hudl: "Hudl",
  spiideo: "Spiideo",
  drive: "Google Drive",
  dropbox: "Dropbox",
  other: "the other site",
};

/**
 * What to tell a coach whose link opened a web page rather than the video.
 * Every app has a page for the match and a separate link for the file, and
 * the page is the one people copy.
 */
export const SOURCE_HINTS: Record<SourceKind, string> = {
  veo:
    "That is the Veo page for the match, not the video file. In Veo, press Download, then Download full game, and copy the link of that download instead.",
  pixellot:
    "That is a Pixellot page, not the video file. Request an HD export of the game and paste the link from the email Pixellot sends.",
  hudl:
    "That is a Hudl page, not the video file. Ask Hudl to download the game and paste the link from the email Hudl sends.",
  spiideo:
    "That is a Spiideo page, not the video file. Make a download of the game in Spiideo and copy the link of that download instead.",
  drive:
    "Google Drive would not hand over that file. Share it so anyone with the link can view it, then paste the link again.",
  dropbox:
    "Dropbox would not hand over that file. Check the link is shared so anyone with it can view, then paste it again.",
  other:
    "That link opens a web page, not the video file. Start the download in your browser, open its list of downloads, and copy the link of the download instead.",
};

/** Sites that will not give up the file behind a link, and what to do instead. */
const REFUSED: { host: RegExp; message: string }[] = [
  {
    host: /(^|\.)(youtube\.com|youtu\.be)$/,
    message:
      "YouTube does not hand over the file behind a link. If it is your club's channel, download the video in YouTube Studio and drop it on this page.",
  },
  {
    host: /(^|\.)(facebook\.com|fb\.watch|instagram\.com)$/,
    message: "Facebook and Instagram do not hand over the file behind a link. Download the video and drop it on this page.",
  },
  {
    host: /(^|\.)vimeo\.com$/,
    message: "Vimeo does not hand over the file behind a link. Download the video from Vimeo and drop it on this page.",
  },
];

function sourceOf(host: string): SourceKind {
  const h = host.toLowerCase();
  const on = (domain: string) => h === domain || h.endsWith(`.${domain}`);
  if (on("veo.co") || on("veo.com")) return "veo";
  if (on("pixellot.tv") || on("pixellot.com")) return "pixellot";
  if (on("hudl.com")) return "hudl";
  if (on("spiideo.com") || on("spiideo.net")) return "spiideo";
  if (on("drive.google.com") || on("drive.usercontent.google.com") || on("docs.google.com")) return "drive";
  if (on("dropbox.com") || on("dropboxusercontent.com")) return "dropbox";
  return "other";
}

/**
 * The link a coach pasted, made ready to fetch. Whatever they pasted, an
 * email's worth of text included, the first web address in it is the link.
 * Share links become download links, so a Drive or Dropbox file comes as the
 * file and not as its preview page.
 */
export function readSourceLink(raw: string): { url: URL; source: SourceKind } | { error: string } {
  const found = /https?:\/\/[^\s<>"']+/i.exec(raw ?? "");
  if (!found) return { error: "Paste the whole link, starting with https://" };

  let url: URL;
  try {
    url = new URL(found[0].replace(/[).,;]+$/, ""));
  } catch {
    return { error: "That link is not complete. Copy it again and paste the whole thing." };
  }
  // A name and password in the link, or an unusual port, is nothing a video
  // service hands out, and both are ways of aiming the server somewhere odd.
  if (url.username || url.password) return { error: "Paste the link without a username or password in it." };
  if (url.port && url.port !== "443" && url.port !== "80") return { error: "Ardawn cannot fetch from that link." };

  const refused = REFUSED.find((r) => r.host.test(url.hostname.toLowerCase()));
  if (refused) return { error: refused.message };

  const source = sourceOf(url.hostname);
  return { url: downloadUrl(url, source), source };
}

/** The address of the file itself, for links that normally open a preview. */
function downloadUrl(url: URL, source: SourceKind): URL {
  if (source === "dropbox") {
    const out = new URL(url);
    out.searchParams.delete("raw");
    out.searchParams.set("dl", "1");
    return out;
  }
  if (source === "drive") {
    const id =
      /\/file\/d\/([A-Za-z0-9_-]{10,})/.exec(url.pathname)?.[1] ??
      (url.searchParams.get("id") || null);
    if (id && /^[A-Za-z0-9_-]+$/.test(id)) {
      // `confirm=t` skips the "too large to scan for viruses" page that a
      // match-sized file otherwise gets in place of the file.
      return new URL(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`);
    }
  }
  return url;
}

/**
 * True for an address on the public internet. The server fetches whatever a
 * coach pastes, so it must never be talked into fetching from itself, the
 * hosting provider's metadata service or anything else on a private network.
 */
export function isPublicAddress(ip: string): boolean {
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i.exec(ip);
  if (v4) {
    const [a, b, c] = v4.slice(1, 4).map(Number);
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
    if (a === 169 && b === 254) return false; // link-local, cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a >= 224) return false; // multicast and reserved
    return true;
  }
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (!v6.includes(":")) return false;
  if (v6 === "::" || v6 === "::1") return false;
  if (/^f[cd]/.test(v6)) return false; // unique local
  if (/^fe[89ab]/.test(v6)) return false; // link-local
  if (v6.startsWith("2001:db8") || v6.startsWith("64:ff9b")) return false;
  if (v6.startsWith("::ffff:")) return false; // a mapped address not written as dotted IPv4
  return true;
}

const TYPE_EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/x-m4v": "m4v",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/** Content types a file server sends when it does not know or care what the file is. */
const GENERIC_TYPES = ["application/octet-stream", "binary/octet-stream", "application/download", "application/force-download", ""];

/**
 * The file's name, from what the server says about it, ending in an extension
 * the player can play. Null when the answer is not a playable video at all.
 */
export function filenameFor(input: {
  contentDisposition?: string | null;
  contentType?: string | null;
  url: URL;
}): string | null {
  const type = (input.contentType ?? "").split(";")[0].trim().toLowerCase();
  if (!type.startsWith("video/") && !GENERIC_TYPES.includes(type)) return null;

  const fromHeader = dispositionName(input.contentDisposition ?? "");
  const fromPath = decodeSafe(input.url.pathname.split("/").pop() ?? "");
  let name = clean(fromHeader || fromPath);

  if (!isAcceptedVideo(name)) {
    const ext = TYPE_EXTENSIONS[type];
    if (!ext) return null; // generic type and no video extension: could be anything
    name = `${name.replace(/\.[A-Za-z0-9]{1,5}$/, "") || "match"}.${ext}`;
  }
  return name;
}

function dispositionName(header: string): string {
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)?''([^;]+)/.exec(header);
  if (star) return decodeSafe(star[1].trim().replace(/^"|"$/g, ""));
  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/.exec(header);
  return plain ? (plain[2] ?? plain[1]).trim() : "";
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** A name safe to show and to store: no folders, no control characters, not too long. */
function clean(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const tidy = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (tidy.length <= 200) return tidy;
  const ext = extensionOf(tidy);
  return `${tidy.slice(0, 190)}${ext ? `.${ext}` : ""}`;
}

/** The whole file's size from a `Content-Range: bytes 0-0/123456` header. */
export function totalFromContentRange(header: string | null | undefined): number | null {
  const m = /\/(\d+)\s*$/.exec(header ?? "");
  return m ? Number(m[1]) : null;
}

/**
 * The video file a web page points at, for links that open a page with the
 * file on it. Looks for the page's declared video first, then any link to a
 * video file, including ones written into the page's scripts.
 */
export function findVideoLink(html: string, base: URL): URL | null {
  const text = html
    .replace(/\\u002[fF]/g, "/")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");

  const declared = /<meta[^>]+property=["']og:video(?::url|:secure_url)?["'][^>]+content=["']([^"']+)["']/i.exec(text);
  const candidates = [
    ...(declared ? [declared[1]] : []),
    ...Array.from(
      text.matchAll(/(?:https?:)?\/\/[^\s"'<>()\\]+?\.(?:mp4|m4v|mov|webm)(?:\?[^\s"'<>()\\]*)?(?=["'\s<>()\\]|$)/gi),
      (m) => m[0],
    ),
  ];

  for (const c of candidates) {
    try {
      const url = new URL(c, base);
      if (url.protocol === "https:" || url.protocol === "http:") return url;
    } catch {
      // Not a usable address; try the next.
    }
  }
  return null;
}

/** Words an app puts in a file name that say nothing about the match. */
const NOISE = new Set([
  "veo", "pixellot", "hudl", "spiideo", "full", "match", "game", "recording", "followcam",
  "follow", "cam", "camera", "panorama", "pano", "hd", "sd", "export", "download", "video",
  "final", "copy", "broadcast", "tactical", "view", "mp4", "mov",
]);

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function isoDay(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  const iso = date.toISOString().slice(0, 10);
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? iso : null;
}

/** The first date written in a file name, with where it sits, or null. Irish order: day first. */
function dateIn(name: string): { iso: string; at: number; length: number } | null {
  const patterns: { re: RegExp; read: (m: RegExpExecArray) => string | null }[] = [
    { re: /(20\d{2})[-_. ]?(\d{2})[-_. ]?(\d{2})(?!\d)/, read: (m) => isoDay(+m[1], +m[2], +m[3]) },
    { re: /(?<!\d)(\d{1,2})[-_. ](\d{1,2})[-_. ](20\d{2}|\d{2})(?!\d)/, read: (m) => isoDay(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]) },
    {
      re: /(?<!\d)(\d{1,2})(?:st|nd|rd|th)?[-_. ]?(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*[-_. ]?(20\d{2})/i,
      read: (m) => isoDay(+m[3], MONTHS[m[2].toLowerCase()], +m[1]),
    },
  ];
  for (const { re, read } of patterns) {
    const m = re.exec(name);
    const iso = m && read(m);
    if (m && iso) return { iso, at: m.index, length: m[0].length };
  }
  return null;
}

/**
 * A first guess at the match a file is of, for the coach to confirm: the
 * title from the file's name, the date from the name or else from when the
 * file was last changed on the other app. Most apps name a download after
 * the fixture, so most of the time the coach changes nothing.
 */
export function suggestMatch(
  filename: string,
  lastModified: string | null | undefined,
  today: string,
): { title: string; playedOn: string } {
  const bare = filename.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  const date = dateIn(bare);
  const withoutDate = date ? bare.slice(0, date.at) + " " + bare.slice(date.at + date.length) : bare;

  let words = withoutDate
    .replace(/[_\-.+]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w.toLowerCase()) && !/^\d+$/.test(w) && !/^[0-9a-f]{8,}$/i.test(w));

  // "Ballygunner v Sarsfields" is a fixture; the title is the opponent. Which
  // side is ours is a guess, so the second name is taken, as fixtures are
  // usually written home side first and clubs mostly film at home.
  const versus = words.findIndex((w) => /^(v|vs|versus)\.?$/i.test(w));
  if (versus >= 0 && versus < words.length - 1) words = words.slice(versus + 1);

  const title = words.join(" ").trim().slice(0, 80);

  const modified = lastModified ? new Date(lastModified) : null;
  const fromHeader =
    modified && !Number.isNaN(modified.getTime()) ? modified.toISOString().slice(0, 10) : null;
  const playedOn = date?.iso ?? (fromHeader && fromHeader <= today ? fromHeader : today);

  return { title, playedOn };
}
