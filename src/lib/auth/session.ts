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
import { clubs, sessions, users, teams, type Role } from "@/lib/db/schema";
import type { GameCode } from "@/lib/hurling/codes";
import { appSecret } from "./secret";

const COOKIE = "fisean_session";
const TTL_DAYS = 90;

function secret(): Uint8Array {
  return new TextEncoder().encode(appSecret());
}

export type SessionUser = {
  id: string;
  /** The one team this person is on. Everything they can see is scoped to it. */
  teamId: string;
  /** Only an admin acts on it: which teams they may reach and move people between. */
  clubId: string;
  /** Null only for an account from before sign-in moved to email. */
  email: string | null;
  displayName: string;
  role: Role;
  position: number | null;
  teamName: string;
  /** Which game the club plays, for every word and rule that differs by code. */
  teamCode: GameCode;
  /** When the club badge last changed, or null for a club without one. */
  badgeVersion: number | null;
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

/**
 * The signed-in user, or null. Safe to call from any server component.
 *
 * Someone whose club is still waiting for the host's check counts as
 * signed out here, so every page, action and API route refuses them without
 * each having to ask. The guards send them to the waiting page rather than
 * the sign-in form, using `waitingUser` below.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const row = await sessionRow();
  if (!row || row.clubApprovedAt === null) return null;
  return asUser(row);
}

/** Signed in, but on a club the host has not let in yet; otherwise null. */
export async function waitingUser(): Promise<(SessionUser & { clubName: string }) | null> {
  const row = await sessionRow();
  if (!row || row.clubApprovedAt !== null) return null;
  const user = asUser(row);
  const [club] = await db.select({ name: clubs.name }).from(clubs).where(eq(clubs.id, user.clubId)).limit(1);
  return { ...user, clubName: club?.name ?? user.teamName };
}

/** The session's user without the approval date, which is the gate's business only. */
function asUser(row: SessionUser & { clubApprovedAt: number | null }): SessionUser {
  const user: SessionUser & { clubApprovedAt?: number | null } = { ...row };
  delete user.clubApprovedAt;
  return user;
}

async function sessionRow(): Promise<(SessionUser & { clubApprovedAt: number | null }) | null> {
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
      clubId: teams.clubId,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      position: users.position,
      teamName: teams.name,
      teamCode: teams.code,
      badgeVersion: teams.badgeUpdatedAt,
      clubApprovedAt: clubs.approvedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(teams, eq(teams.id, users.teamId))
    .innerJoin(clubs, eq(clubs.id, teams.clubId))
    .where(and(eq(sessions.id, sid), gt(sessions.expiresAt, Date.now())))
    .limit(1);

  return rows[0] ?? null;
}
