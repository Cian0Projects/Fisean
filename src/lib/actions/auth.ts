"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams, users } from "@/lib/db/schema";
import { ClubSetupError, createClub } from "@/lib/db/clubs";
import { isGameCode } from "@/lib/hurling/codes";
import { hashPassword, normaliseJoinCode, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";

export type AuthState = { error?: string } | undefined;

function cleanUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * Where to go after signing in. Only a path on this site is accepted — a
 * `next` of `//evil.example` or a full URL would turn the sign-in form into
 * an open redirect, so anything that is not a plain local path goes home.
 */
function destination(form: FormData): string {
  const next = String(form.get("next") ?? "");
  return next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/";
}

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const username = cleanUsername(String(form.get("username") ?? ""));
  const password = String(form.get("password") ?? "");

  if (!username || !password) return { error: "Enter your username and password." };

  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);

  // Same message either way, so this cannot be used to discover who is on the
  // squad. Still run a hash when the user is missing, so the response time
  // does not give it away either.
  if (!user) {
    await hashPassword(password);
    return { error: "That username and password do not match." };
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    return { error: "That username and password do not match." };
  }

  await db.update(users).set({ lastSeenAt: Date.now() }).where(eq(users.id, user.id));
  await createSession(user.id);
  redirect(destination(form));
}

export async function joinTeam(_prev: AuthState, form: FormData): Promise<AuthState> {
  const code = normaliseJoinCode(String(form.get("joinCode") ?? ""));
  const displayName = String(form.get("displayName") ?? "").trim();
  const username = cleanUsername(String(form.get("username") ?? ""));
  const password = String(form.get("password") ?? "");

  if (!code) return { error: "Enter the join code your manager gave you." };
  if (!displayName) return { error: "Enter your name." };
  if (username.length < 3) return { error: "Pick a username of at least 3 characters." };
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };

  const [team] = await db.select().from(teams).where(eq(teams.joinCode, code)).limit(1);
  if (!team) return { error: "That join code was not recognised." };

  // Usernames are unique across every club on the instance, since signing in
  // asks for nothing else.
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (taken) return { error: "That username is taken. Try another." };

  const [created] = await db
    .insert(users)
    .values({
      teamId: team.id,
      username,
      displayName,
      passwordHash: await hashPassword(password),
      role: "player",
    })
    .returning();

  await createSession(created.id);
  redirect(destination(form));
}

/** Compare without leaking, through timing, how much of a guess was right. */
function sameText(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Set up a new club from the web. Whoever fills this in becomes its admin and
 * lands on the squad page, with the join code to hand out and a place to drop
 * the first match file. No email, no approval — the same bar as joining.
 */
export async function startClub(_prev: AuthState, form: FormData): Promise<AuthState> {
  // With SIGNUP_CODE set, only clubs the host has given the code to can set
  // up — every club is a promise of up to TEAM_STORAGE_GB of the host's disk.
  const required = process.env.SIGNUP_CODE;
  if (required && !sameText(String(form.get("signupCode") ?? "").trim(), required)) {
    return { error: "That sign-up code is not right. Ask whoever sent you the link." };
  }

  const code = form.get("code");
  if (!isGameCode(code)) return { error: "Choose the game your team plays." };

  let club;
  try {
    club = await createClub({
      teamName: String(form.get("teamName") ?? ""),
      code,
      displayName: String(form.get("displayName") ?? ""),
      username: String(form.get("username") ?? ""),
      password: String(form.get("password") ?? ""),
    });
  } catch (err) {
    if (err instanceof ClubSetupError) return { error: err.message };
    throw err;
  }

  await createSession(club.userId);
  redirect("/admin");
}

/** Signing out from the phone layout keeps the next sign-in on the phone layout. */
export async function signOut(form?: FormData): Promise<void> {
  await destroySession();
  const next = form ? destination(form) : "/";
  redirect(next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`);
}
