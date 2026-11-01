/**
 * Remove for good what an admin deleted more than twenty days ago.
 *
 *   npm run purge-deleted              # remove what is due
 *   npm run purge-deleted -- --dry-run # list what is due, remove nothing
 *
 * A deleted match or video waits in recently deleted, where an admin can put
 * it back (src/lib/media/deleted.ts). This takes what has waited its twenty
 * days, rows first and files second (purgeDue in src/lib/db/deleted.ts). Run
 * nightly from deploy/backup-cron.sh, after the backup, so tonight's copy of
 * the database still has the rows.
 *
 * It can only remove rows that carry a deletion date at least twenty days
 * old. A missing or empty database therefore means nothing is due, never
 * that everything is; the check below only stops it making an empty
 * database at a wrong path.
 */
import "./_env";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { and, isNotNull, lte } from "drizzle-orm";

const DB_PATH = resolve(process.env.DATABASE_PATH ?? "./data/fisean.db");
const dryRun = process.argv.includes("--dry-run");

async function main() {
  if (!existsSync(DB_PATH)) {
    console.error(`purge-deleted: no database at ${DB_PATH}; nothing done.`);
    process.exitCode = 1;
    return;
  }
  // Loaded after the check, since opening the client creates the file.
  const { db } = await import("../src/lib/db/client");
  const { matches, videos } = await import("../src/lib/db/schema");
  const { purgeCutoff } = await import("../src/lib/media/deleted");
  const { purgeDue } = await import("../src/lib/db/deleted");

  const now = Date.now();
  if (dryRun) {
    const cutoff = purgeCutoff(now);
    const dueMatches = await db
      .select({ id: matches.id, opponent: matches.opponent, playedOn: matches.playedOn })
      .from(matches)
      .where(and(isNotNull(matches.deletedAt), lte(matches.deletedAt, cutoff)));
    const dueVideos = await db
      .select({ id: videos.id, file: videos.originalFilename })
      .from(videos)
      .where(and(isNotNull(videos.deletedAt), lte(videos.deletedAt, cutoff)));
    for (const m of dueMatches) console.log(`match ${m.id}: v ${m.opponent}, ${m.playedOn}`);
    for (const v of dueVideos) console.log(`video ${v.id}: ${v.file}`);
    console.log(`purge-deleted (dry run): ${dueMatches.length} matches and ${dueVideos.length} videos are due.`);
    return;
  }

  const done = await purgeDue(now);
  console.log(
    `purge-deleted: removed ${done.matches} matches and ${done.videos} videos, ${done.files} files.`,
  );
}

main().catch((err) => {
  console.error("purge-deleted failed:", err);
  process.exit(1);
});
