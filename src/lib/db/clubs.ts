/**
 * Creating a club: the club, its first team, its first admin, and the shared
 * tag vocabulary. The club's other teams are added later by an admin
 * (`createTeam`), each with its own game and join code.
 *
 * One instance hosts every club, so this is something a club secretary does
 * from the sign-up page at /start, not something the host does from a
 * terminal. `npm run create-admin` calls the same function, so a club made
 * by hand and one made on the web come out identical.
 *
 * Plain functions over the database, not a server action, so the script can
 * call them too. The action in `src/lib/actions/auth.ts` adds the session.
 */
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { db } from "./client";
import { clubs, eventTypes, teams, users, videos } from "./schema";
import { BUILT_IN_EVENTS } from "../hurling/events";
import type { GameCode } from "../hurling/codes";
import { similarClubs } from "../hurling/club-names";
import { generateJoinCode } from "../auth/password";
import { appSecret } from "../auth/secret";
import { keyedHash, looksLikeEmail, normaliseEmail, sameHash } from "../auth/email-code";

/** A problem worth showing the person filling in the form, word for word. */
export class ClubSetupError extends Error {}

/**
 * Write the built-in event types once, with a NULL team id, so every club
 * shares them whatever its code (`tagsForCode` picks out each code's own).
 * Teams add their own rows beside these without a migration. Returns how
 * many were missing; 0 on every run after the first, until a new one is
 * added to the list.
 */
export async function seedTaxonomy(): Promise<number> {
  const existing = await db
    .select({ slug: eventTypes.slug })
    .from(eventTypes)
    .where(isNull(eventTypes.teamId));
  const have = new Set(existing.map((e) => e.slug));

  const missing = BUILT_IN_EVENTS.filter((e) => !have.has(e.slug));
  if (!missing.length) return 0;

  await db.insert(eventTypes).values(
    missing.map((e) => ({
      teamId: null,
      slug: e.slug,
      labelEn: e.labelEn,
      labelGa: e.labelGa ?? null,
      category: e.category,
      colour: e.colour,
      scoreValue: e.scoreValue ?? 0,
      hotkey: e.hotkey ?? null,
      sortOrder: BUILT_IN_EVENTS.indexOf(e),
    })),
  );
  return missing.length;
}

/**
 * A join code no other club holds. 26 letters to the sixth is 300 million
 * codes, so a clash is rare — but with many clubs on one instance, rare is
 * not never, and a clash would put a player on the wrong panel.
 */
export async function freshJoinCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateJoinCode();
    const [taken] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.joinCode, code))
      .limit(1);
    if (!taken) return code;
  }
  throw new Error("Could not find a free join code. Try again.");
}

/**
 * The form's own checks, run before the code is emailed as well as when the
 * club is made, so a missing name is caught before anyone opens their mail.
 */
export function checkClubFields(input: {
  teamName: string;
  displayName: string;
  email: string;
}): { teamName: string; displayName: string; email: string } | { error: string } {
  const teamName = input.teamName.trim();
  const displayName = input.displayName.trim();
  const email = normaliseEmail(input.email);
  if (!teamName) return { error: "Enter the club's name." };
  if (!displayName) return { error: "Enter your name." };
  if (!looksLikeEmail(email)) return { error: "Enter your email address." };
  return { teamName, displayName, email };
}

/**
 * Close a club: every team in it, and every match, file, clip, stat, drill
 * and person on those teams, at once.
 *
 * Only the host runs this, through `npm run close-club`, after the club has
 * asked by email and confirmed. It used to be a button on the squad page,
 * but it is the one action with no way back, and a club should never lose a
 * season because an admin pressed the wrong thing.
 *
 * Deleting the club row cascades to its teams and from them to everything
 * scoped by `teamId`, sessions included, so every member is signed out on
 * their next request. The footage is in storage, not the database, so its
 * keys are read out first and the files removed after. Backups still hold
 * the club until they age out, as docs/DEPLOYMENT.md sets.
 */
export async function closeClub(clubId: string): Promise<{ files: number }> {
  const footage = await db
    .select({ storageKey: videos.storageKey, uploadId: videos.uploadId })
    .from(videos)
    .innerJoin(teams, eq(teams.id, videos.teamId))
    .where(eq(teams.clubId, clubId));
  await db.delete(clubs).where(eq(clubs.id, clubId));
  // Storage is loaded only here, so the sign-up form and the host's check,
  // which import this file, do not pull in the footage drivers.
  const { removeFootage } = await import("../storage");
  await removeFootage(footage);
  return { files: footage.length };
}

/**
 * Another team in an existing club, made by one of its admins. It starts
 * with nobody on it: the admin sends its own join code to its own panel, or
 * moves people across from the team they are on. The badge is the club's,
 * so it is copied from a team that has one.
 */
export async function createTeam(input: {
  clubId: string;
  name: string;
  code: GameCode;
}): Promise<{ id: string; name: string; code: GameCode; joinCode: string }> {
  const name = input.name.trim();
  if (!name) throw new ClubSetupError("Enter the team's name.");

  const [badged] = await db
    .select({ badge: teams.badge, badgeUpdatedAt: teams.badgeUpdatedAt })
    .from(teams)
    .where(eq(teams.clubId, input.clubId))
    .limit(1);
  const joinCode = await freshJoinCode();
  const [team] = await db
    .insert(teams)
    .values({
      clubId: input.clubId,
      name,
      code: input.code,
      joinCode,
      badge: badged?.badge ?? null,
      badgeUpdatedAt: badged?.badgeUpdatedAt ?? null,
    })
    .returning();
  return { id: team.id, name: team.name, code: team.code, joinCode };
}

export async function createClub(input: {
  teamName: string;
  /** Which game the team plays. The terminal script leaves it out and gets hurling. */
  code?: GameCode;
  displayName: string;
  /** On the web, already proven by the code emailed before this runs. */
  email: string;
}): Promise<{ clubId: string; teamId: string; userId: string; joinCode: string }> {
  const fields = checkClubFields(input);
  if ("error" in fields) throw new ClubSetupError(fields.error);
  const { teamName, displayName, email } = fields;

  // Checked before the team is written, so a taken email leaves no empty club.
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (taken) throw new ClubSetupError("That email is already on a panel. Sign in with it, or use another.");

  await seedTaxonomy();
  const joinCode = await freshJoinCode();

  // One transaction, so a failure part-way never leaves a club with no admin.
  // The first team takes the club's name; a club with one team needs no other.
  return db.transaction((tx) => {
    const club = tx.insert(clubs).values({ name: teamName }).returning().get();
    const team = tx
      .insert(teams)
      .values({ clubId: club.id, name: teamName, joinCode, code: input.code ?? "hurling" })
      .returning()
      .get();
    const admin = tx
      .insert(users)
      .values({ teamId: team.id, email, displayName, role: "admin" })
      .returning()
      .get();
    return { clubId: club.id, teamId: team.id, userId: admin.id, joinCode };
  });
}

/* ------------------------------------------------------ checking a new club */

/*
 * Anyone can set up a club at /start, with no code to ask for first. What
 * stands between that and a club using the host's disk is the host: a club
 * is made waiting (`approvedAt` null), the host is emailed who it is and
 * which clubs already here have a similar name, and lets it in or turns it
 * away from a page the email links to. Until then its admin sees a waiting
 * page, and its join code lets nobody in, so nothing is uploaded and no
 * panel forms around a club that may be a duplicate.
 *
 * The page needs no sign-in, because the host has no account on any club.
 * Its link carries a signature over the club id instead, like an
 * unsubscribe link, so it opens that one club's check and nothing else.
 * `npm run pending-clubs` prints the same links, in case an email is lost.
 */

export function reviewSignature(clubId: string): string {
  return keyedHash(appSecret(), clubId, "club-review");
}

export function validReview(clubId: string, signature: string): boolean {
  return /^[0-9a-f]{64}$/.test(signature) && sameHash(reviewSignature(clubId), signature);
}

export function reviewPath(clubId: string): string {
  return `/host/clubs/${encodeURIComponent(clubId)}?k=${reviewSignature(clubId)}`;
}

/** Where the host is told about new clubs. */
export function hostEmail(): string {
  return process.env.HOST_EMAIL?.trim() || "hello@ardawnsport.ie";
}

export type ClubForReview = {
  id: string;
  name: string;
  approvedAt: number | null;
  createdAt: number;
  game: GameCode;
  admin: { name: string; email: string | null } | null;
  similar: { id: string; name: string }[];
};

/** Everything the host needs to decide, or null once the club is gone. */
export async function clubForReview(clubId: string): Promise<ClubForReview | null> {
  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);
  if (!club) return null;
  const [team] = await db
    .select({ code: teams.code })
    .from(teams)
    .where(eq(teams.clubId, clubId))
    .orderBy(asc(teams.createdAt))
    .limit(1);
  const [admin] = await db
    .select({ name: users.displayName, email: users.email })
    .from(users)
    .innerJoin(teams, eq(teams.id, users.teamId))
    .where(and(eq(teams.clubId, clubId), eq(users.role, "admin")))
    .orderBy(asc(users.createdAt))
    .limit(1);
  const others = await db
    .select({ id: clubs.id, name: clubs.name })
    .from(clubs)
    .where(ne(clubs.id, clubId));
  return {
    id: club.id,
    name: club.name,
    approvedAt: club.approvedAt,
    createdAt: club.createdAt,
    game: team?.code ?? "hurling",
    admin: admin ?? null,
    similar: similarClubs(club.name, others),
  };
}

/** Let a waiting club in. Returns false if it was already in. */
export async function approveClub(clubId: string): Promise<boolean> {
  const done = await db
    .update(clubs)
    .set({ approvedAt: Date.now() })
    .where(and(eq(clubs.id, clubId), isNull(clubs.approvedAt)))
    .returning({ id: clubs.id });
  return done.length > 0;
}

/**
 * Turn a waiting club away. It is deleted outright: while it waited nothing
 * could be uploaded and nobody could join, so there is nothing of anyone's
 * to keep, and its admin's email is freed to join a real club's panel.
 * Refuses a club already let in; that is `npm run close-club`'s job.
 */
export async function declineClub(clubId: string): Promise<boolean> {
  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);
  if (!club || club.approvedAt !== null) return false;
  await closeClub(clubId);
  return true;
}
