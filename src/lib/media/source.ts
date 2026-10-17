/**
 * Fetching a match file from a link a coach pasted.
 *
 * The server fetches addresses typed by people outside it, which is the
 * classic way to trick a server into reading its own private network. So
 * every connection, including each redirect, resolves the host first and
 * refuses any address that is not on the public internet (`isPublicAddress`).
 * The check is in the connection's own DNS lookup, so the address checked is
 * the address connected to. That is why this uses node:https rather than
 * fetch, whose lookup cannot be reached without another dependency.
 *
 * `checkSource` answers the question the coach is waiting on: is this a
 * video, how big, what is it called. `openSource` is what the importer reads
 * the bytes through, a byte range at a time where the server allows.
 */
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request as httpRequest, type IncomingHttpHeaders, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import {
  SOURCE_HINTS,
  filenameFor,
  findVideoLink,
  isPublicAddress,
  totalFromContentRange,
  type SourceKind,
} from "./import";

/** A problem with the link itself, worded for the coach. Retrying will not help. */
export class SourceError extends Error {}

const REDIRECTS = 8;
/** No byte for this long and the connection is given up as dropped. */
const IDLE_MS = 60_000;
/** Most of a web page read when looking for the video link on it. */
const PAGE_BYTES = 3 * 1024 * 1024;

type Opened = { status: number; headers: IncomingHttpHeaders; body: IncomingMessage; url: URL };

function header(headers: IncomingHttpHeaders, name: string): string | null {
  const v = headers[name];
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/** DNS for an outgoing request, refusing any host that resolves somewhere private. */
function guardedLookup(
  hostname: string,
  options: { all?: boolean; family?: number },
  callback: (err: Error | null, address: string | LookupAddress[], family?: number) => void,
): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "");
    const list = addresses as LookupAddress[];
    if (!list.length || list.some((a) => !isPublicAddress(a.address))) {
      return callback(new SourceError("Ardawn cannot fetch from that address."), "");
    }
    if (options.all) callback(null, list);
    else callback(null, list[0].address, list[0].family);
  });
}

/**
 * One GET, following redirects, each hop checked. With `range`, asks for
 * those bytes only; the caller must look at the status to see whether the
 * server obliged (206) or sent the whole file anyway (200).
 */
export function openSource(
  url: URL,
  opts: { range?: { start: number; end: number }; signal?: AbortSignal } = {},
  hops = 0,
): Promise<Opened> {
  return new Promise((resolve, reject) => {
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return reject(new SourceError("Ardawn can only fetch web links."));
    }
    if (url.port && url.port !== "443" && url.port !== "80") {
      return reject(new SourceError("Ardawn cannot fetch from that link."));
    }
    // A bare IP address skips DNS, so the lookup guard never sees it.
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(host) && !isPublicAddress(host)) {
      return reject(new SourceError("Ardawn cannot fetch from that address."));
    }

    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = send(
      url,
      {
        method: "GET",
        lookup: guardedLookup as never,
        signal: opts.signal,
        headers: {
          // Some file hosts refuse requests that do not look like a browser's.
          "User-Agent": "Mozilla/5.0 (compatible; Ardawn footage import; +https://ardawnsport.ie)",
          Accept: "*/*",
          ...(opts.range ? { Range: `bytes=${opts.range.start}-${opts.range.end}` } : {}),
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = header(res.headers, "location");
        if (status >= 300 && status < 400 && location) {
          res.resume();
          if (hops >= REDIRECTS) return reject(new SourceError("That link redirects too many times."));
          let next: URL;
          try {
            next = new URL(location, url);
          } catch {
            return reject(new SourceError("That link redirects somewhere broken."));
          }
          return resolve(openSource(next, opts, hops + 1));
        }
        resolve({ status, headers: res.headers, body: res, url });
      },
    );
    req.setTimeout(IDLE_MS, () => req.destroy(new Error("The other site stopped answering.")));
    req.on("error", reject);
    req.end();
  });
}

/** What a link turned out to be, enough to name the match and plan the transfer. */
export type SourceInfo = {
  /** Where to fetch from: the pasted link, or the video found on the page it opened. */
  url: URL;
  filename: string;
  sizeBytes: number;
  ranges: boolean;
  lastModified: string | null;
};

/** Words for an HTTP refusal, for the coach. */
function refusal(status: number, source: SourceKind): string {
  // Drive and Dropbox answer "not found" for a file that is not shared, too.
  if ((source === "drive" || source === "dropbox") && [401, 403, 404].includes(status)) {
    return SOURCE_HINTS[source];
  }
  if (status === 401 || status === 403) {
    return "That link has expired, or only works when you are signed in. Get a fresh download link and paste it again.";
  }
  if (status === 404 || status === 410) {
    return "That link has expired or the video has moved. Get a fresh download link and paste it again.";
  }
  if (status === 429) return "The other site is busy. Wait a few minutes and try the link again.";
  return `The other site would not hand over the file (it answered ${status}). Try the link again later.`;
}

async function readText(body: IncomingMessage, limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    chunks.push(chunk as Buffer);
    total += (chunk as Buffer).length;
    if (total >= limit) break;
  }
  body.destroy();
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Look at a link without downloading it: ask for its first byte and read
 * what the server says. A link to a page rather than a file gets one more
 * try, at the video the page points to, which is how a share page or an
 * export email's landing page usually works.
 */
export async function checkSource(url: URL, source: SourceKind, depth = 0): Promise<SourceInfo> {
  const opened = await openSource(url, { range: { start: 0, end: 0 } }).catch((err) => {
    if (err instanceof SourceError) throw err;
    throw new SourceError("Ardawn could not reach that link. Check it opens in your browser, then try again.");
  });
  const { status, headers, body } = opened;

  if (status !== 200 && status !== 206) {
    body.resume();
    throw new SourceError(refusal(status, source));
  }

  const type = (header(headers, "content-type") ?? "").toLowerCase();
  if (type.includes("text/html")) {
    const page = await readText(body, PAGE_BYTES);
    const video = depth === 0 ? findVideoLink(page, opened.url) : null;
    if (video) return checkSource(video, source, depth + 1);
    throw new SourceError(SOURCE_HINTS[source]);
  }
  body.destroy();

  const filename = filenameFor({
    contentDisposition: header(headers, "content-disposition"),
    contentType: header(headers, "content-type"),
    url: opened.url,
  });
  if (!filename) {
    throw new SourceError("That link is not to a video Ardawn can play. It needs to be an MP4, MOV or WebM file.");
  }

  const ranges = status === 206;
  const sizeBytes = ranges
    ? totalFromContentRange(header(headers, "content-range"))
    : Number(header(headers, "content-length") ?? NaN);
  if (!sizeBytes || !Number.isFinite(sizeBytes)) {
    throw new SourceError(
      "That link does not say how big the file is, so Ardawn cannot bring it across. Download it and drop it on this page instead.",
    );
  }

  return { url, filename, sizeBytes, ranges, lastModified: header(headers, "last-modified") };
}
