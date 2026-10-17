/**
 * Give an existing account its sign-in email, from the terminal.
 *
 *   npm run set-email -- --username cian --email cian@example.ie
 *
 * For the host, after sign-in moved from passwords to email: an account made
 * before then has a username and no email, and its owner cannot sign in
 * again until it has one. A team admin can do the same from the squad page;
 * this is for the admin themselves, or anyone signed out of every device.
 */
import "./_env";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { users } from "../src/lib/db/schema";
import { looksLikeEmail, normaliseEmail } from "../src/lib/auth/email-code";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(`--${flag}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const username = arg("username")?.trim().toLowerCase();
  const email = normaliseEmail(arg("email") ?? "");
  if (!username || !looksLikeEmail(email)) {
    console.error("Usage: npm run set-email -- --username <username> --email <email>");
    process.exit(1);
  }

  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!user) {
    console.error(`No account has the username "${username}".`);
    process.exit(1);
  }
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (taken && taken.id !== user.id) {
    console.error(`${email} already belongs to another account.`);
    process.exit(1);
  }

  await db.update(users).set({ email }).where(eq(users.id, user.id));
  console.log(`\n  ${user.displayName} now signs in with ${email}.\n`);
  process.exit(0);
}

void main();
