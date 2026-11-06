/**
 * What to show a person when something they did fails.
 *
 * A server action's error message never reaches the browser in a production
 * build: Next.js swaps it for React's "Minified React error #441; visit
 * https://react.dev/errors/441…", with a `digest` to match the server log. In
 * development the real message does come through, which is how that text
 * reached a club's screen without anyone seeing it first. So the message is
 * only trusted when it is plainly one of ours: a bare `Error` with no digest,
 * no link and nothing that reads like a stack or a library talking. Anything
 * else (a hidden server message, a TypeError from fetch, a DOMException from
 * the recorder) shows the short fallback the caller wrote for that action.
 *
 * The full error still reaches us: the server one by email (onRequestError in
 * src/instrumentation.ts), the browser one in the console.
 */

/** Text that marks a message as written for developers, not for people. */
const TECHNICAL = /react\.dev|minified|omitted in production|digest|https?:\/\/|\bat \S+ \(|\n\s+at /i;

export function errorText(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  if (err.name !== "Error") return fallback;
  if ("digest" in err) return fallback;
  const message = err.message.trim();
  if (!message || message.length > 200 || TECHNICAL.test(message)) return fallback;
  return message;
}
