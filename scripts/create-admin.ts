/**
 * Create the squad and its first admin, and seed the hurling taxonomy.
 *
 *   npm run create-admin -- --team "Ballygunner" --name "Cian" --username cian
 *
 * Prints the join code, which is the only thing the panel needs to sign up.
 */
import "./_env";
import { createInterface } from "node:readline/promises";
import { eq, isNull } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { eventTypes, teams, users } from "../src/lib/db/schema";
import { generateJoinCode, hashPassword } from "../src/lib/auth/password";
import { HURLING_EVENTS } from "../src/lib/hurling/events";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(`--${flag}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

/**
 * Write the built-in event types once, with a NULL team id. Teams can add
 * their own rows beside these without a migration.
 */
async function seedTaxonomy(): Promise<number> {
  const existing = await db
    .select({ slug: eventTypes.slug })
    .from(eventTypes)
    .where(isNull(eventTypes.teamId));
  const have = new Set(existing.map((e) => e.slug));

  const missing = HURLING_EVENTS.filter((e) => !have.has(e.slug));
  if (!missing.length) return 0;

  await db.insert(eventTypes).values(
    missing.map((e, i) => ({
      teamId: null,
      slug: e.slug,
      labelEn: e.labelEn,
      labelGa: e.labelGa ?? null,
      category: e.category,
      colour: e.colour,
      scoreValue: e.scoreValue ?? 0,
      hotkey: e.hotkey ?? null,
      sortOrder: HURLING_EVENTS.indexOf(e) === -1 ? i : HURLING_EVENTS.indexOf(e),
    })),
  );
  return missing.length;
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q: string, fallback?: string) => {
    if (fallback) return fallback;
    return (await rl.question(q)).trim();
  };

  const teamName = await ask("Team name: ", arg("team"));
  const displayName = await ask("Your name: ", arg("name"));
  const username = (await ask("Username: ", arg("username"))).toLowerCase();
  const password = await ask("Password (min 8 chars): ", arg("password"));
  rl.close();

  if (!teamName || !displayName || !username) {
    console.error("\nTeam name, your name and a username are all required.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("\nUse a password of at least 8 characters.");
    process.exit(1);
  }

  const seeded = await seedTaxonomy();
  if (seeded) console.log(`\nSeeded ${seeded} hurling event types.`);

  const joinCode = generateJoinCode();
  const [team] = await db.insert(teams).values({ name: teamName, joinCode }).returning();

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (existing) {
    console.error(`\nThe username "${username}" is already taken.`);
    process.exit(1);
  }

  await db.insert(users).values({
    teamId: team.id,
    username,
    displayName,
    passwordHash: await hashPassword(password),
    role: "admin",
  });

  console.log(`
  Físeán is ready.

    Team       ${teamName}
    Admin      ${displayName} (@${username})
    Join code  ${joinCode}

  Start the app with:      npm run dev
  Share with the panel:    npm run lan      (then give out your LAN address)

  Next: add a match at /admin, then register the footage with
    npm run ingest -- "path/to/match.mp4" --match <match id>
`);
  process.exit(0);
}

void main();
