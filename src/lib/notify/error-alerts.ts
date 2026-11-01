/**
 * The rules for emailing the host when the server throws, kept free of Next,
 * the database and the mailer so the tests can import them.
 *
 * A broken page can throw on every request, so an alert needs a brake or one
 * bad deploy fills the inbox and, worse, dents the sending domain's standing.
 * Two limits, both held in memory: the same error (message plus route) at most
 * once an hour, and no more than twenty emails in any day whatever the errors
 * are. A restart forgets both, which at worst sends a few extra emails after a
 * deploy; that is the right way round for an alert.
 *
 * Nothing here sees cookies, headers or request bodies, and the email is built
 * only from what this file returns. The two things that could still ride in on
 * an error are a sign-in code or link key quoted in a message or a query
 * string, so those are stripped.
 */

export const PER_ERROR_MS = 60 * 60_000;
export const PER_DAY_MAX = 20;
export const DAY_MS = 24 * 60 * 60_000;

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
  };
}

export type Throttle = {
  /** True if this error may be emailed now; true also counts it against the limits. */
  allow(key: string, now: number): boolean;
};

export function createThrottle(limits?: { perErrorMs?: number; perDayMax?: number; dayMs?: number }): Throttle {
  const perErrorMs = limits?.perErrorMs ?? PER_ERROR_MS;
  const perDayMax = limits?.perDayMax ?? PER_DAY_MAX;
  const dayMs = limits?.dayMs ?? DAY_MS;
  const lastSent = new Map<string, number>();
  let sent: number[] = [];

  return {
    allow(key, now) {
      sent = sent.filter((t) => now - t < dayMs);
      for (const [k, t] of lastSent) if (now - t >= perErrorMs) lastSent.delete(k);

      if (sent.length >= perDayMax) return false;
      const last = lastSent.get(key);
      if (last !== undefined && now - last < perErrorMs) return false;

      lastSent.set(key, now);
      sent.push(now);
      return true;
    },
  };
}
