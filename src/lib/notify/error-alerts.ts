/**
 * The rules for emailing the host when the server throws, kept free of Next,
 * the database and the mailer so the tests can import them.
 *
 * The host wants to hear about the big things and the things that keep
 * happening, not every stray error. So an error is emailed only if it is
 * severe (the database, the disk or the storage keys failing: the app is
 * broken for everyone, so once is enough) or it has now happened three times
 * in fifteen minutes (the same message on the same route, so it is not a
 * one-off). Everything else stays in the server log.
 *
 * A broken page can then throw on every request, so two limits remain on top,
 * both held in memory: the same error at most once an hour, and no more than
 * twenty emails in any day whatever the errors are. A restart forgets all of
 * it, which at worst delays an alert by a few errors or sends a few extra
 * emails after a deploy; that is the right way round for an alert.
 *
 * Nothing here sees cookies, headers or request bodies, and the email is built
 * only from what this file returns. The two things that could still ride in on
 * an error are a sign-in code or link key quoted in a message or a query
 * string, so those are stripped.
 */

export const PER_ERROR_MS = 60 * 60_000;
export const PER_DAY_MAX = 20;
export const DAY_MS = 24 * 60 * 60_000;
/** Not severe, but the same error this many times within the window is no one-off. */
export const REPEAT_COUNT = 3;
export const REPEAT_WINDOW_MS = 15 * 60_000;

/**
 * Failures of the things everything else stands on. A constraint error is left
 * out on purpose: a duplicate row is usually someone double clicking.
 */
const SEVERE =
  /SQLITE_(?!CONSTRAINT)\w+|database is locked|readonly database|database disk image|no such (table|column)|ENOSPC|EMFILE|ENOMEM|out of memory|EACCES|SignatureDoesNotMatch|InvalidAccessKeyId|AccessDenied/i;

export function isSevere(message: string): boolean {
  return SEVERE.test(message);
}

/** A stack can run to hundreds of lines; the top of it is what is read. */
const MAX_STACK_LINES = 25;
const MAX_MESSAGE = 500;

export type AlertInput = {
  err: unknown;
  /** The request path as Next gives it, query string and all. */
  path: string;
  method: string;
  /** The route file, e.g. /app/blog/[dynamic]; groups errors better than the path. */
  routePath?: string;
  now: number;
};

export type Alert = {
  key: string;
  route: string;
  method: string;
  message: string;
  stack: string;
  at: string;
  /** Severe errors are emailed the first time; the rest only when they repeat. */
  severe: boolean;
};

/** Six digits as typed ("482913", "482 913", "482-913") and link keys (base64url, 32 bytes). */
export function scrub(text: string): string {
  return text
    .replace(/(?<![\d])\d{3}[ -]?\d{3}(?![\d])/g, "[code]")
    .replace(/[A-Za-z0-9_-]{40,}/g, "[key]");
}

/** The route file if Next gave one, else the path with its query string and fragment dropped: that is where link keys and codes sit. */
export function routeOf(path: string, routePath?: string): string {
  const bare = (routePath || path || "unknown").split(/[?#]/)[0] || "unknown";
  return scrub(bare);
}

export function describeError(err: unknown): { message: string; stack: string } {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
  const stack = err instanceof Error && err.stack ? err.stack : "";
  return {
    message: scrub(message).slice(0, MAX_MESSAGE),
    stack: scrub(stack.split("\n").slice(0, MAX_STACK_LINES).join("\n")),
  };
}

export function alertKey(message: string, route: string): string {
  return `${route}\u0000${message}`;
}

export function buildAlert(input: AlertInput): Alert {
  const { message, stack } = describeError(input.err);
  const route = routeOf(input.path, input.routePath);
  return {
    key: alertKey(message, route),
    route,
    method: input.method.toUpperCase().slice(0, 10),
    message,
    stack,
    at: new Date(input.now).toISOString(),
    severe: isSevere(message),
  };
}

export type Throttle = {
  /**
   * True if this error may be emailed now; true also counts it against the
   * limits. Every call counts as one occurrence, whatever the answer.
   */
  allow(key: string, now: number, severe?: boolean): boolean;
};

export function createThrottle(limits?: {
  perErrorMs?: number;
  perDayMax?: number;
  dayMs?: number;
  repeatCount?: number;
  repeatWindowMs?: number;
}): Throttle {
  const perErrorMs = limits?.perErrorMs ?? PER_ERROR_MS;
  const perDayMax = limits?.perDayMax ?? PER_DAY_MAX;
  const dayMs = limits?.dayMs ?? DAY_MS;
  const repeatCount = limits?.repeatCount ?? REPEAT_COUNT;
  const repeatWindowMs = limits?.repeatWindowMs ?? REPEAT_WINDOW_MS;
  const seen = new Map<string, number[]>();
  const lastSent = new Map<string, number>();
  let sent: number[] = [];

  return {
    allow(key, now, severe = false) {
      sent = sent.filter((t) => now - t < dayMs);
      for (const [k, t] of lastSent) if (now - t >= perErrorMs) lastSent.delete(k);
      for (const [k, times] of seen) {
        if (times.every((t) => now - t >= repeatWindowMs)) seen.delete(k);
      }

      const recent = (seen.get(key) ?? []).filter((t) => now - t < repeatWindowMs);
      recent.push(now);
      seen.set(key, recent);
      if (!severe && recent.length < repeatCount) return false;

      if (sent.length >= perDayMax) return false;
      const last = lastSent.get(key);
      if (last !== undefined && now - last < perErrorMs) return false;

      lastSent.set(key, now);
      sent.push(now);
      return true;
    },
  };
}
