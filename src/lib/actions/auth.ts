"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams, users } from "@/lib/db/schema";
import { hashPassword, normaliseJoinCode, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";

export type AuthState = { error?: string } | undefined;

function cleanUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
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
  redirect("/");
}

export async function joinTeam(_prev: AuthState, form: FormData): Promise<AuthState> {
  const code = normaliseJoinCode(String(form.get("joinCode") ?? ""));
  const displayName = String(form.get("displayName") ?? "").trim();
  const username = cleanUsername(String(form.get("username") ?? ""));
  const password = String(form.get("password") ?? "");
  const jersey = String(form.get("jerseyNumber") ?? "").trim();

  if (!code) return { error: "Enter the join code your manager gave you." };
  if (!displayName) return { error: "Enter your name." };
  if (username.length < 3) return { error: "Pick a username of at least 3 characters." };
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };

  const [team] = await db.select().from(teams).where(eq(teams.joinCode, code)).limit(1);
  if (!team) return { error: "That join code was not recognised." };

  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.teamId, team.id), eq(users.username, username)))
    .limit(1);
  if (taken) return { error: "Somebody on the panel already has that username." };

  const [created] = await db
    .insert(users)
    .values({
      teamId: team.id,
      username,
      displayName,
      passwordHash: await hashPassword(password),
      role: "player",
      jerseyNumber: jersey ? Number(jersey) : null,
    })
    .returning();

  await createSession(created.id);
  redirect("/");
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/login");
}
