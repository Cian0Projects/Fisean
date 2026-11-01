/**
 * Finding a team's opposition by name, and putting every match on one.
 *
 * Shared by everything that makes a match (the new match form, an upload, an
 * import, an opposition game) so a name typed in any of them lands on the
 * same opposition. Synchronous, because an upload and an import write their
 * match inside a better-sqlite3 transaction, which cannot await.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, type Db } from "./client";
import { matches, oppositions } from "./schema";
import { oppositionKey } from "../hurling/opposition";
import { tidyName } from "../hurling/squad";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * The team's opposition by this name, made if it is new. Its stored name is
 * the first spelling it was given; a later "St. Finbarrs" finds "St
 * Finbarr's" and is shown as that.
 */
export function oppositionFor(
  w: Db | Tx,
  teamId: string,
  rawName: string,
  createdBy: string | null,
): { id: string; name: string } {
  const name = tidyName(rawName);
  const key = oppositionKey(name);
  const found = () =>
    w
      .select({ id: oppositions.id, name: oppositions.name })
      .from(oppositions)
      .where(and(eq(oppositions.teamId, teamId), eq(oppositions.key, key)))
      .get();
  const existing = found();
  if (existing) return existing;
  // Two coaches naming the same new club at once both reach here; the
  // unique key lets one write and the other read what it wrote.
  w.insert(oppositions).values({ teamId, name, key, createdBy }).onConflictDoNothing().run();
  return found()!;
}

/**
 * Put every match without an opposition on one, oldest first so a club keeps
 * the spelling it was first given. Runs as the server starts: the matches made
 * before oppositions existed are linked on the first deploy, and anything a
 * path forgot is caught on the next.
 */
export async function linkOppositions(): Promise<number> {
  const loose = await db
    .select({ id: matches.id, teamId: matches.teamId, opponent: matches.opponent, createdBy: matches.createdBy })
    .from(matches)
    .where(isNull(matches.oppositionId))
    .orderBy(asc(matches.createdAt));
  if (!loose.length) return 0;

  db.transaction((tx) => {
    for (const m of loose) {
      const opp = oppositionFor(tx, m.teamId, m.opponent, m.createdBy);
      tx.update(matches).set({ oppositionId: opp.id, opponent: opp.name }).where(eq(matches.id, m.id)).run();
    }
  });
  return loose.length;
}
