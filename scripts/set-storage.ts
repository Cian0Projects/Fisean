/**
 * Show or change a club's storage tier, from the terminal.
 *
 *   npm run set-storage -- --email secretary@club.ie            (shows the tier and usage)
 *   npm run set-storage -- --email secretary@club.ie --gb 250   (sets it to 250 GB)
 *
 * The club is found the way close-club finds it: by an admin's email address.
 * The tier is the footage all the club's teams together may hold; the next
 * upload or import is checked against it, so there is nothing to restart. It
 * may be set below what the club already holds, which blocks new footage
 * until the club deletes some but removes nothing.
 */
import "./_env";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { clubs, teams, users } from "../src/lib/db/schema";
import { normaliseEmail } from "../src/lib/auth/email-code";
import { clubStorage } from "../src/lib/queries/storage";
import { fileSize } from "../src/lib/format";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(`--${flag}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = normaliseEmail(arg("email") ?? "");
  if (!email) {
    console.error("Usage: npm run set-storage -- --email <admin's email> [--gb <whole gigabytes>]");
    process.exit(1);
  }

  const [admin] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!admin) {
    console.error(`No account signs in with ${email}.`);
    process.exit(1);
  }
  const [team] = await db.select().from(teams).where(eq(teams.id, admin.teamId)).limit(1);
  const [club] = await db.select().from(clubs).where(eq(clubs.id, team.clubId)).limit(1);

  const raw = arg("gb");
  if (raw !== undefined) {
    const gb = Number(raw);
    if (!Number.isInteger(gb) || gb < 1 || gb > 100_000) {
      console.error("--gb must be a whole number of gigabytes, such as 100 or 250.");
      process.exit(1);
    }
    await db.update(clubs).set({ storageGb: gb }).where(eq(clubs.id, club.id));
    console.log(`\n  ${club.name}: tier was ${club.storageGb} GB, now ${gb} GB.`);
  } else {
    console.log(`\n  ${club.name}: tier is ${club.storageGb} GB.`);
  }

  const { usedBytes, quotaBytes } = await clubStorage(club.id);
  console.log(`  Used ${fileSize(usedBytes)} of ${fileSize(quotaBytes)}, across all the club's teams.\n`);
  process.exit(0);
}

void main();
