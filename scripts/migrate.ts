/**
 * Apply pending migrations.
 *
 * `npm run db:push` is quicker while the schema is still moving; this is the
 * one to run on a server, where losing data to an inferred diff is not an
 * acceptable outcome.
 */
import "./_env";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "../src/lib/db/client";

migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
console.log("Migrations applied.");
process.exit(0);
