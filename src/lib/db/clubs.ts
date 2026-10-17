/**
 * Creating a club: the team, its first admin, and the shared tag vocabulary.
 *
 * One instance hosts every club, so this is something a club secretary does
 * from the sign-up page at /start, not something the host does from a
 * terminal. `npm run create-admin` calls the same function, so a club made
 * by hand and one made on the web come out identical.
 *
 * Plain functions over the database, not a server action, so the script can
 * call them too. The action in `src/lib/actions/auth.ts` adds the session.
 */
import { eq, isNull } from "drizzle-orm";
import { db } from "./client";
import { eventTypes, teams, users } from "./schema";
import { HURLING_EVENTS } from "../hurling/events";
import type { GameCode } from "../hurling/codes";
import { generateJoinCode } from "../auth/password";
import { looksLikeEmail, normaliseEmail } from "../auth/email-code";

/** A problem worth showing the person filling in the form, word for word. */
export class ClubSetupError extends Error {}

/**
 * Write the built-in event types once, with a NULL team id, so every club
 * shares them. Teams add their own rows beside these without a migration.
 * Returns how many were missing; 0 on every run after the first.
 */
export async function seedTaxonomy(): Promise<number> {
  const existing = await db
    .select({ slug: eventTypes.slug })
    .from(eventTypes)
    .where(isNull(eventTypes.teamId));
  const have = new Set(existing.map((e) => e.slug));

  const missing = HURLING_EVENTS.filter((e) => !have.has(e.slug));
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
      sortOrder: HURLING_EVENTS.indexOf(e),
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
  if (!teamName) return { error: "Enter the club or team name." };
  if (!displayName) return { error: "Enter your name." };
  if (!looksLikeEmail(email)) return { error: "Enter your email address." };
  return { teamName, displayName, email };
}

export async function createClub(input: {
  teamName: string;
  /** Which game the team plays. The terminal script leaves it out and gets hurling. */
  code?: GameCode;
  displayName: string;
  /** On the web, already proven by the code emailed before this runs. */
  email: string;
}): Promise<{ teamId: string; userId: string; joinCode: string }> {
  const fields = checkClubFields(input);
  if ("error" in fields) throw new ClubSetupError(fields.error);
  const { teamName, displayName, email } = fields;

  // Checked before the team is written, so a taken email leaves no empty club.
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (taken) throw new ClubSetupError("That email is already on a panel. Sign in with it, or use another.");

  await seedTaxonomy();
  const joinCode = await freshJoinCode();

  // One transaction, so a failure part-way never leaves a club with no admin.
  return db.transaction((tx) => {
    const team = tx
      .insert(teams)
      .values({ name: teamName, joinCode, code: input.code ?? "hurling" })
      .returning()
      .get();
    const admin = tx
      .insert(users)
      .values({ teamId: team.id, email, displayName, role: "admin" })
      .returning()
      .get();
    return { teamId: team.id, userId: admin.id, joinCode };
  });
}
