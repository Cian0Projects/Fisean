/**
 * Sessions: a signed cookie carrying a session id, backed by a row.
 *
 * The row is what makes a session revocable — an admin removing a player from
 * the squad should end their access immediately, which a stateless JWT cannot
 * do. The cookie is signed so a forged session id is rejected before it ever
 * reaches the database.
 */
import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions, users, teams, type Role } from "@/lib/db/schema";

const COOKIE = "fisean_session";
const TTL_DAYS = 60;

function secret(): Uint8Array {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to at least 32 characters. " +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return new TextEncoder().encode(raw);
}

export type SessionUser = {
  id: string;
  teamId: string;
  username: string;
  displayName: string;
  role: Role;
  jerseyNumber: number | null;
  position: number | null;
  teamName: string;
};

export async function createSession(userId: string): Promise<void> {
  const expiresAt = Date.now() + TTL_DAYS * 86_400_000;

  const [row] = await db.insert(sessions).values({ userId, expiresAt }).returning();

  const token = await new SignJWT({ sid: row.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Left off in development so the app works over plain http on a LAN
    // address, which is how the squad will first try it at training.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_DAYS * 86_400,
  });

  // Opportunistic tidy-up; cheap on a table this small.
  await db.delete(sessions).where(lt(sessions.expiresAt, Date.now()));
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret());
      const sid = payload.sid;
      if (typeof sid === "string") {
        await db.delete(sessions).where(eq(sessions.id, sid));
      }
    } catch {
      // Expired or tampered-with: nothing to revoke.
    }
  }
  jar.delete(COOKIE);
}

/** The signed-in user, or null. Safe to call from any server component. */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  let sid: string;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.sid !== "string") return null;
    sid = payload.sid;
  } catch {
    return null;
  }

  const rows = await db
    .select({
      id: users.id,
      teamId: users.teamId,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      jerseyNumber: users.jerseyNumber,
      position: users.position,
      teamName: teams.name,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(teams, eq(teams.id, users.teamId))
    .where(and(eq(sessions.id, sid), gt(sessions.expiresAt, Date.now())))
    .limit(1);

  return rows[0] ?? null;
}
