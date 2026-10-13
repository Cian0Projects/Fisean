/**
 * Create a club and its first admin from the terminal.
 *
 *   npm run create-admin -- --team "Ballygunner" --name "Cian" --username cian
 *
 * On a hosted instance clubs set themselves up at /start instead; this is for
 * the host, and for a fresh local copy. Both go through `createClub`.
 */
import "./_env";
import { createInterface } from "node:readline/promises";
import { ClubSetupError, createClub } from "../src/lib/db/clubs";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(`--${flag}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q: string, fallback?: string) => {
    if (fallback) return fallback;
    return (await rl.question(q)).trim();
  };

  const teamName = await ask("Team name: ", arg("team"));
  const displayName = await ask("Your name: ", arg("name"));
  const username = await ask("Username: ", arg("username"));
  const password = await ask("Password (min 8 chars): ", arg("password"));
  rl.close();

  let club;
  try {
    club = await createClub({ teamName, displayName, username, password });
  } catch (err) {
    if (err instanceof ClubSetupError) {
      console.error(`\n${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  console.log(`
  Ardawn is ready.

    Team       ${teamName}
    Admin      ${displayName} (@${username.toLowerCase()})
    Join code  ${club.joinCode}

  Start the app with:      npm run dev
  Share with the panel:    npm run lan      (then give out your LAN address)

  Next: sign in and drop a match file onto the squad page.
`);
  process.exit(0);
}

void main();
