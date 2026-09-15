/**
 * Password hashing with scrypt from Node's standard library.
 *
 * scrypt is memory-hard and built in, so there is no native dependency to
 * compile and nothing to install. argon2id would be marginally stronger, but
 * for a closed squad of 40 this is the right trade: one fewer build step is
 * worth more here than a theoretical margin.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LEN = 64;
const SALT_LEN = 16;

/** Stored as `scrypt$<salt hex>$<hash hex>` so the format is self-describing. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const hash = await scrypt(plain.normalize("NFKC"), salt, KEY_LEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  if (expected.length !== KEY_LEN) return false;

  const actual = await scrypt(plain.normalize("NFKC"), salt, KEY_LEN);
  return timingSafeEqual(actual, expected);
}

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
