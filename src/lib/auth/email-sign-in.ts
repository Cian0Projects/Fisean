/**
 * Email sign-in: issuing a request, and redeeming its code or its link.
 *
 * There are no passwords. Proving you read an inbox is the whole of signing
 * in, which is also the whole of a password reset on any site that has one,
 * so a password would only have added something to forget.
 *
 * What the request was for (signing in, joining a panel, setting up a club,
 * changing your email) is finished in src/lib/actions/auth.ts. This file only
 * answers "did this person just show they read this inbox?", once per request.
 */
import "server-only";
import { headers } from "next/headers";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { signInRequests, type SignInPurpose } from "@/lib/db/schema";
import { sendMail } from "@/lib/mail";
import { signInMail } from "@/lib/mail/templates";
import { appUrl } from "@/lib/url";
import { appSecret } from "./secret";
import {
  CODE_TTL_MS,
  LIMIT_WINDOW_MS,
  MAX_ATTEMPTS,
  PER_EMAIL_LIMIT,
  PER_IP_LIMIT,
  keyedHash,
  newCode,
  newLinkKey,
  normaliseCode,
  sameHash,
} from "./email-code";

export type SignInRequest = typeof signInRequests.$inferSelect;

async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

/**
 * Make a request and, when `send` is true, email its code.
 *
 * `send` is false when someone asks to sign in with an address no account
 * uses. The request is still made and the same "check your email" page still
 * follows, so the form cannot be used to find out who is on a panel; the
 * code that nobody was sent simply never matches.
 */
export async function issueSignIn(input: {
  email: string;
  purpose: SignInPurpose;
  payload?: unknown;
  next?: string | null;
  teamName?: string | null;
  send: boolean;
}): Promise<{ requestId: string } | { error: string }> {
  const now = Date.now();
  const ip = await clientIp();
  const since = now - LIMIT_WINDOW_MS;

  const [{ byEmail }] = await db
    .select({ byEmail: sql<number>`count(*)` })
    .from(signInRequests)
    .where(and(eq(signInRequests.email, input.email), gt(signInRequests.createdAt, since)));
  if (byEmail >= PER_EMAIL_LIMIT) {
    return { error: "Several codes have gone to that email already. Use the newest one, or try again in 15 minutes." };
  }
  if (ip) {
    const [{ byIp }] = await db
      .select({ byIp: sql<number>`count(*)` })
      .from(signInRequests)
      .where(and(eq(signInRequests.ip, ip), gt(signInRequests.createdAt, since)));
    if (byIp >= PER_IP_LIMIT) return { error: "Too many codes asked for from here. Try again in 15 minutes." };
  }

  const id = crypto.randomUUID();
  const code = newCode();
  const key = newLinkKey();
  const secret = appSecret();

  await db.insert(signInRequests).values({
    id,
    email: input.email,
    purpose: input.purpose,
    payload: input.payload === undefined ? null : JSON.stringify(input.payload),
    next: input.next ?? null,
    codeHash: keyedHash(secret, id, `code:${code}`),
    linkHash: keyedHash(secret, id, `link:${key}`),
    ip,
    expiresAt: now + CODE_TTL_MS,
    createdAt: now,
  });

  // Old requests are no use to anyone; tidy them on the way past.
  await db.delete(signInRequests).where(lt(signInRequests.createdAt, now - 86_400_000));

  if (input.send) {
    const link = `${await appUrl()}/login/link?r=${id}&k=${key}`;
    try {
      await sendMail({ to: input.email, ...signInMail({ purpose: input.purpose, code, link, teamName: input.teamName }) });
    } catch (err) {
      console.error("Could not send a sign-in email:", err);
      await db.delete(signInRequests).where(eq(signInRequests.id, id));
      return { error: "The email could not be sent just now. Try again in a minute." };
    }
  }
  return { requestId: id };
}

const EXPIRED = "That code has expired or been used. Ask for a new one.";

/**
 * Spend a request, exactly once. The update only matches while `used_at` is
 * still empty, so a code typed in the app and the link tapped in the browser
 * at the same moment cannot both sign someone in.
 */
async function spend(row: SignInRequest): Promise<{ request: SignInRequest } | { error: string }> {
  const [spent] = await db
    .update(signInRequests)
    .set({ usedAt: Date.now() })
    .where(and(eq(signInRequests.id, row.id), isNull(signInRequests.usedAt)))
    .returning();
  return spent ? { request: spent } : { error: EXPIRED };
}

async function live(requestId: string): Promise<SignInRequest | null> {
  const [row] = await db.select().from(signInRequests).where(eq(signInRequests.id, requestId)).limit(1);
  if (!row || row.usedAt || row.expiresAt < Date.now() || row.attempts >= MAX_ATTEMPTS) return null;
  return row;
}

export async function redeemCode(
  requestId: string,
  typed: string,
): Promise<{ request: SignInRequest } | { error: string }> {
  const row = await live(requestId);
  if (!row) return { error: EXPIRED };

  const code = normaliseCode(typed);
  if (code.length !== 6) return { error: "The code is six digits." };

  if (!sameHash(keyedHash(appSecret(), row.id, `code:${code}`), row.codeHash)) {
    await db
      .update(signInRequests)
      .set({ attempts: sql`${signInRequests.attempts} + 1` })
      .where(eq(signInRequests.id, row.id));
    const left = MAX_ATTEMPTS - row.attempts - 1;
    return {
      error: left > 0 ? "That code is not right. Check the newest email." : "Too many wrong codes. Ask for a new one.",
    };
  }
  return spend(row);
}

export async function redeemLink(
  requestId: string,
  key: string,
): Promise<{ request: SignInRequest } | { error: string }> {
  const row = await live(requestId);
  if (!row || !key || !sameHash(keyedHash(appSecret(), row.id, `link:${key}`), row.linkHash)) {
    return { error: "That link has expired or been used. Ask for a new code." };
  }
  return spend(row);
}
