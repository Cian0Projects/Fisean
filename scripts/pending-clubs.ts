/**
 * List the clubs waiting for the host's check, each with its review link.
 *
 *   npm run pending-clubs
 *
 * The link is normally emailed to HOST_EMAIL the moment a club is set up.
 * This is for when that email went astray, or to see what is outstanding.
 * The links open without signing in, so do not paste them anywhere public.
 */
import "./_env";
import { isNull } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { clubs } from "../src/lib/db/schema";
import { clubForReview, reviewPath } from "../src/lib/db/clubs";

async function main() {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const waiting = await db.select({ id: clubs.id }).from(clubs).where(isNull(clubs.approvedAt));
  if (!waiting.length) {
    console.log("\n  No clubs are waiting to be checked.\n");
    process.exit(0);
  }

  console.log("");
  for (const { id } of waiting) {
    const club = await clubForReview(id);
    if (!club) continue;
    console.log(`  ${club.name}, set up ${new Date(club.createdAt).toLocaleString("en-IE")}`);
    console.log(`    by ${club.admin?.name ?? "nobody"}, ${club.admin?.email ?? "no email"}`);
    if (club.similar.length) console.log(`    similar names already here: ${club.similar.map((c) => c.name).join(", ")}`);
    console.log(`    ${base}${reviewPath(club.id)}\n`);
  }
  process.exit(0);
}

void main();
