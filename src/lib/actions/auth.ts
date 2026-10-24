"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubs, teams, users } from "@/lib/db/schema";
import {
  checkClubFields,
  ClubSetupError,
  clubForReview,
  createClub,
  hostEmail,
  reviewPath,
} from "@/lib/db/clubs";
import { GAME_LABELS, isGameCode, type GameCode } from "@/lib/hurling/codes";
import { sendMail } from "@/lib/mail";
import { clubReviewMail } from "@/lib/mail/templates";
import { appUrl } from "@/lib/url";
import { normaliseJoinCode } from "@/lib/auth/password";
import { looksLikeEmail, normaliseEmail } from "@/lib/auth/email-code";
import { issueSignIn, redeemCode, redeemLink, type SignInRequest } from "@/lib/auth/email-sign-in";
import { createSession, destroySession } from "@/lib/auth/session";

export type AuthState = { error?: string } | undefined;

/**
 * Where to go after signing in. Only a path on this site is accepted — a
 * `next` of `//evil.example` or a full URL would turn the sign-in form into
 * an open redirect, so anything that is not a plain local path goes home.
 */
function localPath(raw: unknown): string | null {
  const next = String(raw ?? "");
  return next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : null;
}

function destination(form: FormData): string {
  return localPath(form.get("next")) ?? "/";
}

/** The page that asks for the code, which every request lands on. */
function toCodePage(requestId: string): never {
  redirect(`/login/code?r=${requestId}`);
}

function emailFrom(form: FormData): string | null {
  const email = normaliseEmail(String(form.get("email") ?? ""));
  return looksLikeEmail(email) ? email : null;
}

/* --------------------------------------------------------------- asking */

export async function requestSignIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = emailFrom(form);
  if (!email) return { error: "Enter the email you joined with." };

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  // Sent only when someone has that email; see issueSignIn for why the page
  // that follows looks the same either way.
  const issued = await issueSignIn({ email, purpose: "sign-in", next: destination(form), send: Boolean(user) });
  if ("error" in issued) return issued;
  toCodePage(issued.requestId);
}

type JoinPayload = { teamId: string; displayName: string };

/**
 * Joining has to work on a phone, standing in a dressing room, in under a
 * minute: the team code, a name and an email. The account is only made once
 * the emailed code comes back, so nobody can put someone else's address on
 * a panel.
 */
export async function joinTeam(_prev: AuthState, form: FormData): Promise<AuthState> {
  const code = normaliseJoinCode(String(form.get("joinCode") ?? ""));
  const displayName = String(form.get("displayName") ?? "").trim();
  const email = emailFrom(form);

  if (!code) return { error: "Enter the join code your manager gave you." };
  if (!displayName) return { error: "Enter your name." };
  if (!email) return { error: "Enter your email address." };

  const [team] = await db.select().from(teams).where(eq(teams.joinCode, code)).limit(1);
  if (!team) return { error: "That join code was not recognised." };
  // A club the host has not checked yet has no panel. Its admin cannot see
  // the code, but a code guessed or passed on early should not get round that.
  const [club] = await db.select({ approvedAt: clubs.approvedAt }).from(clubs).where(eq(clubs.id, team.clubId)).limit(1);
  if (!club?.approvedAt) {
    return { error: "That club is still being set up. Try again once your manager says it is ready." };
  }

  const payload: JoinPayload = { teamId: team.id, displayName };
  const issued = await issueSignIn({
    email,
    purpose: "join",
    payload,
    next: destination(form),
    teamName: team.name,
    send: true,
  });
  if ("error" in issued) return issued;
  toCodePage(issued.requestId);
}

type StartPayload = { teamName: string; code: GameCode; displayName: string };

/**
 * Set up a new club from the web. Anyone can; there is no code to ask for
 * first. The club is made when their emailed code comes back, and waits
 * there until the host has checked it is real and not already here (see
 * "Checking a new club" in src/lib/db/clubs.ts). Every club is a promise of
 * up to TEAM_STORAGE_GB of the host's disk, which is why someone looks.
 */
export async function startClub(_prev: AuthState, form: FormData): Promise<AuthState> {
  const code = form.get("code");
  if (!isGameCode(code)) return { error: "Choose the game your team plays." };

  const fields = checkClubFields({
    teamName: String(form.get("teamName") ?? ""),
    displayName: String(form.get("displayName") ?? ""),
    email: String(form.get("email") ?? ""),
  });
  if ("error" in fields) return fields;

  const payload: StartPayload = { teamName: fields.teamName, code, displayName: fields.displayName };
  const issued = await issueSignIn({
    email: fields.email,
    purpose: "start",
    payload,
    next: "/admin",
    teamName: fields.teamName,
    send: true,
  });
  if ("error" in issued) return issued;
  toCodePage(issued.requestId);
}

/* ------------------------------------------------------------ answering */

export async function confirmCode(_prev: AuthState, form: FormData): Promise<AuthState> {
  const result = await redeemCode(String(form.get("r") ?? ""), String(form.get("code") ?? ""));
  if ("error" in result) return result;
  return finish(result.request);
}

/**
 * The emailed link lands on a page with a button, and only the button calls
 * this. Mail scanners at work and school open every link in a message to
 * check it; if opening the link were enough, the scanner would spend it.
 */
export async function confirmLink(_prev: AuthState, form: FormData): Promise<AuthState> {
  const result = await redeemLink(String(form.get("r") ?? ""), String(form.get("k") ?? ""));
  if ("error" in result) return result;
  return finish(result.request);
}

/** The inbox is proven; now do what the request was for. */
async function finish(request: SignInRequest): Promise<AuthState> {
  const next = localPath(request.next) ?? "/";
  const payload = request.payload ? JSON.parse(request.payload) : null;

  switch (request.purpose) {
    case "sign-in": {
      const [user] = await db.select().from(users).where(eq(users.email, request.email)).limit(1);
      if (!user) return { error: "No account uses that email. Join with your team code instead." };
      await db.update(users).set({ lastSeenAt: Date.now() }).where(eq(users.id, user.id));
      await createSession(user.id);
      redirect(next);
    }

    case "join": {
      const { teamId, displayName } = payload as JoinPayload;
      const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).limit(1);
      if (!team) return { error: "That panel no longer exists. Ask your manager for the code again." };
      // Checked here rather than on the form, so only the inbox's owner learns it is taken.
      const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, request.email)).limit(1);
      if (taken) return { error: "That email is already on a panel. Sign in with it instead." };

      const [created] = await db
        .insert(users)
        .values({ teamId, email: request.email, displayName, role: "player" })
        .returning();
      await createSession(created.id);
      redirect(next);
    }

    case "start": {
      const { teamName, code, displayName } = payload as StartPayload;
      let club;
      try {
        club = await createClub({ teamName, code, displayName, email: request.email });
      } catch (err) {
        if (err instanceof ClubSetupError) return { error: err.message };
        throw err;
      }
      await createSession(club.userId);
      await askHostToCheck(club.clubId);
      redirect("/start/waiting");
    }

    case "change-email": {
      const { userId } = payload as { userId: string };
      const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, request.email)).limit(1);
      if (taken && taken.id !== userId) return { error: "That email is already used by someone else on Ardawn." };
      await db.update(users).set({ email: request.email }).where(eq(users.id, userId));
      redirect("/account?changed=1");
    }
  }
}

/**
 * Tell the host a club is waiting. A failed send must not lose the club
 * its admin has just made, so it is logged rather than thrown; the host
 * finds it again with `npm run pending-clubs`.
 */
async function askHostToCheck(clubId: string): Promise<void> {
  try {
    const club = await clubForReview(clubId);
    if (!club) return;
    const mail = clubReviewMail({
      clubName: club.name,
      game: GAME_LABELS[club.game],
      adminName: club.admin?.name ?? "unknown",
      adminEmail: club.admin?.email ?? "no email",
      similar: club.similar.map((c) => c.name),
      reviewUrl: `${await appUrl()}${reviewPath(club.id)}`,
    });
    await sendMail({ to: hostEmail(), ...mail });
  } catch (err) {
    console.error(`Could not email the host about club ${clubId}; run npm run pending-clubs.`, err);
  }
}

/** Signing out from the phone layout keeps the next sign-in on the phone layout. */
export async function signOut(form?: FormData): Promise<void> {
  await destroySession();
  const next = form ? destination(form) : "/";
  redirect(next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`);
}
