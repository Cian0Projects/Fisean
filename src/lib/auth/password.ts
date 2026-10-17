/**
 * Team join codes. (The file's name is left from when it also hashed
 * passwords; sign-in is by emailed code now, in email-code.ts.)
 */
import { randomBytes } from "node:crypto";

/**
 * Join codes are read aloud in a dressing room and typed on phones, so the
 * alphabet excludes characters that get confused when spoken or read:
 * no O/0, I/1, or similar-looking pairs.
 */
const CODE_ALPHABET = "ACDEFGHJKLMNPQRTUVWXY34789";

export function generateJoinCode(length = 6): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

/** Accept a join code however it was typed: spaces, dashes, lower case. */
export function normaliseJoinCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
