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
import { generateJoinCode, hashPassword } from "../auth/password";

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

export async function createClub(input: {
  teamName: string;
  /** Which game the team plays. The terminal script leaves it out and gets hurling. */
  code?: GameCode;
  displayName: string;
  username: string;
  password: string;
}): Promise<{ teamId: string; userId: string; joinCode: string }> {
  const teamName = input.teamName.trim();
  const displayName = input.displayName.trim();
  const username = input.username.trim().toLowerCase().replace(/\s+/g, "");

  if (!teamName) throw new ClubSetupError("Enter the club or team name.");
  if (!displayName) throw new ClubSetupError("Enter your name.");
  if (username.length < 3) throw new ClubSetupError("Pick a username of at least 3 characters.");
  if (input.password.length < 8) throw new ClubSetupError("Use a password of at least 8 characters.");

  // Checked before the team is written, so a taken name leaves no empty club.
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (taken) throw new ClubSetupError("That username is taken. Try another.");

  await seedTaxonomy();
  const joinCode = await freshJoinCode();
  const passwordHash = await hashPassword(input.password);

  // One transaction, so a failure part-way never leaves a club with no admin.
  return db.transaction((tx) => {
    const team = tx
      .insert(teams)
      .values({ name: teamName, joinCode, code: input.code ?? "hurling" })
      .returning()
      .get();
    const admin = tx
      .insert(users)
      .values({ teamId: team.id, username, displayName, passwordHash, role: "admin" })
      .returning()
      .get();
    return { teamId: team.id, userId: admin.id, joinCode };
  });
}
