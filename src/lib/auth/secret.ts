/**
 * SESSION_SECRET, the one server secret. It signs session cookies, keys the
 * hashes of emailed sign-in codes, and signs unsubscribe links, so all three
 * are void together if it is ever rotated.
 */
export function appSecret(): string {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to at least 32 characters. " +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return raw;
}
