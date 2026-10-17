/**
 * Unsubscribe links carry the user id and a signature over it, so one click
 * from the email works without signing in, and nobody can turn off someone
 * else's emails by changing the id in the address.
 */
import { appSecret } from "../auth/secret";
import { keyedHash, sameHash } from "../auth/email-code";

export function unsubscribeSignature(userId: string): string {
  return keyedHash(appSecret(), userId, "unsubscribe");
}

export function validUnsubscribe(userId: string, signature: string): boolean {
  return /^[0-9a-f]{64}$/.test(signature) && sameHash(unsubscribeSignature(userId), signature);
}

export function unsubscribePath(userId: string): string {
  return `/unsubscribe?u=${encodeURIComponent(userId)}&s=${unsubscribeSignature(userId)}`;
}
