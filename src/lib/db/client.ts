/**
 * SQLite connection.
 *
 * SQLite is the production database too, not just a local stand-in. For a
 * 40-person squad on one box it is the right choice: no separate process to
 * run, no connection pool to tune, and a backup is a copy of one file. That
 * also means there is no second dialect to support and no ORM adapter layer —
 * the same schema runs on your laptop and on the server.
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const DB_PATH = resolve(process.env.DATABASE_PATH ?? "./data/fisean.db");

function open() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);

  // WAL lets readers run while a write is in flight — which is what happens
  // when a coach is saving tags while players are loading their clips.
  sqlite.pragma("journal_mode = WAL");
  // Wait rather than throwing SQLITE_BUSY if a write overlaps.
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  // NORMAL is durable enough with WAL and much faster than FULL.
  sqlite.pragma("synchronous = NORMAL");

  return drizzle(sqlite, { schema });
}

/**
 * Next's dev server re-evaluates modules on every edit, which would otherwise
 * leave a trail of open file handles. Cache the connection on globalThis.
 */
const globalForDb = globalThis as unknown as {
  __fiseanDb?: ReturnType<typeof open>;
};

export const db = globalForDb.__fiseanDb ?? open();
if (process.env.NODE_ENV !== "production") globalForDb.__fiseanDb = db;

export { schema };
export type Db = typeof db;
