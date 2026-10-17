/**
 * The pieces of email sign-in that are plain arithmetic, kept apart from the
 * database so the tests can reach them.
 *
 * A request carries two secrets: a 6-digit code to type and a long key that
 * rides in the emailed link. Neither is stored. What is stored is an HMAC of
 * each, keyed with SESSION_SECRET and salted with the request id, so a copy
 * of the database is not enough to walk the million possible codes offline;
 * the attacker would need the server's secret as well.
 *
 * Six digits is a small space on its own. What makes it safe is the rest of
 * the request: five wrong guesses and it is dead, it lasts fifteen minutes,
 * and an address can only ask for a few at a time.
 */
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const CODE_TTL_MS = 15 * 60_000;
export const MAX_ATTEMPTS = 5;
/** Requests one email address may make in a window; enough to cover a typo and a resend. */
export const PER_EMAIL_LIMIT = 3;
/** Requests one network address may make in a window: a dressing room shares one wifi. */
export const PER_IP_LIMIT = 20;
export const LIMIT_WINDOW_MS = 15 * 60_000;

/** Addresses are compared lower-cased: nobody means two accounts by Cian@ and cian@. */
export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * A sanity check, not validation: the email itself is the real test. This
 * only catches a name typed into the wrong box before a code is wasted on it.
 */
export function looksLikeEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Accept a code however it was typed or pasted: "482 913", "482-913". */
export function normaliseCode(input: string): string {
  return input.replace(/\D/g, "");
}

/** Shown as two threes, the way people read a code aloud. */
export function formatCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

export function newLinkKey(): string {
  return randomBytes(32).toString("base64url");
}

export function keyedHash(secret: string, salt: string, value: string): string {
  return createHmac("sha256", secret).update(`${salt}:${value}`).digest("hex");
}

/** Compare two hex digests without leaking, through timing, how much matched. */
export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
