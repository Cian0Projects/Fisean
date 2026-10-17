/**
 * Apply pending migrations.
 *
 * `npm run db:push` is quicker while the schema is still moving; this is the
 * one to run on a server, where losing data to an inferred diff is not an
 * acceptable outcome.
 *
 * Foreign keys are switched off around the run, and that matters. SQLite can
 * only change a column by rebuilding its table, so drizzle-kit writes "copy
 * to a new table, DROP the old one, rename". Its migration says
 * `PRAGMA foreign_keys=OFF` first, but the migrator runs each migration
 * inside a transaction, where SQLite ignores that pragma. With keys still on,
 * dropping `users` would cascade: every session, playlist assignment and
 * clip tag pointing at a user would be deleted with it. Off here, outside
 * any transaction, the rebuild is the plain copy it was meant to be; the
 * check afterwards refuses to carry on if it left anything dangling.
 */
import "./_env";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "../src/lib/db/client";

db.run(sql`PRAGMA foreign_keys = OFF`);
try {
  migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  const broken = db.all(sql`PRAGMA foreign_key_check`);
  if (broken.length) {
    console.error("Migrations left rows pointing at nothing:", broken.slice(0, 10));
    process.exit(1);
  }
} finally {
  db.run(sql`PRAGMA foreign_keys = ON`);
}
console.log("Migrations applied.");
process.exit(0);
