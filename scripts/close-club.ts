/**
 * Close a club and delete everything in it, from the terminal.
 *
 *   npm run close-club -- --email secretary@club.ie          (shows what would go)
 *   npm run close-club -- --email secretary@club.ie --yes    (deletes it)
 *
 * Clubs cannot do this themselves: the squad page tells an admin to email
 * hello@ardawnsport.ie from their own address. The club is found by that
 * address, and only if it belongs to an admin, so the person who asked is the
 * person allowed to. Without --yes it only prints the club and what it holds,
 * which is the step to read back to the club before deleting.
 */
import "./_env";
import { and, count, eq } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { clubs, matches, teams, users, videos } from "../src/lib/db/schema";
import { closeClub } from "../src/lib/db/clubs";
import { normaliseEmail } from "../src/lib/auth/email-code";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(`--${flag}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = normaliseEmail(arg("email") ?? "");
  if (!email) {
    console.error("Usage: npm run close-club -- --email <admin's email> [--yes]");
    process.exit(1);
  }

  const [admin] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!admin) {
    console.error(`No account signs in with ${email}.`);
    process.exit(1);
  }
  if (admin.role !== "admin") {
    console.error(`${email} is a ${admin.role}, not an admin. Only an admin can ask to close a club.`);
    process.exit(1);
  }

  // The whole club goes, every team in it, so every team is read back.
  const [team] = await db.select().from(teams).where(eq(teams.id, admin.teamId)).limit(1);
  const [club] = await db.select().from(clubs).where(eq(clubs.id, team.clubId)).limit(1);
  const clubTeams = await db.select().from(teams).where(eq(teams.clubId, club.id));
  const tally = async (table: typeof users | typeof matches | typeof videos, teamId: string) =>
    (await db.select({ n: count() }).from(table).where(eq(table.teamId, teamId)))[0].n;
  const admins = await db
    .select({ email: users.email })
    .from(users)
    .innerJoin(teams, eq(teams.id, users.teamId))
    .where(and(eq(teams.clubId, club.id), eq(users.role, "admin")));

  console.log(`\n  ${club.name}, ${clubTeams.length === 1 ? "1 team" : `${clubTeams.length} teams`}`);
  for (const t of clubTeams) {
    console.log(
      `    ${t.name} (team code ${t.joinCode}): ${await tally(users, t.id)} people, ` +
        `${await tally(matches, t.id)} matches, ${await tally(videos, t.id)} files of footage`,
    );
  }
  console.log(`  Admins: ${admins.map((a) => a.email ?? "no email").join(", ")}\n`);

  if (!process.argv.includes("--yes")) {
    console.log("  Nothing deleted. Run again with --yes to close the club for good.\n");
    process.exit(0);
  }

  const { files } = await closeClub(club.id);
  console.log(`  ${club.name} is closed: everything deleted, ${files} files removed from storage.`);
  console.log("  Backups hold a copy for up to 30 days. Tell the club it is done.\n");
  process.exit(0);
}

void main();
