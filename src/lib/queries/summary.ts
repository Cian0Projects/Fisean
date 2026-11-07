/**
 * What the match summary reads beyond the stat sheet itself: the squad's
 * targets and fixed tiles, the tiles confirmed for a match, and whose
 * entries are still drafts. The judging is in src/lib/hurling/summary.ts.
 */
import "server-only";
import { and, count, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { customStatEntries, matchStats, statTargets, summaryPicks, summaryPins, users } from "@/lib/db/schema";
import { customKey, type SummaryStage, type Target, type TileKey } from "@/lib/hurling/summary";

/** The targets a coach has set, by tile key. Anything missing takes the code's default. */
export async function loadTargets(teamId: string): Promise<Map<TileKey, Target>> {
  const rows = await db.select().from(statTargets).where(eq(statTargets.teamId, teamId));
  return new Map(rows.map((r) => [r.statKey, { measure: r.measure, direction: r.direction, value: r.target }]));
}

/** The squad's two fixed tiles, or null for the default pair. */
export async function loadPins(teamId: string): Promise<TileKey[] | null> {
  const [row] = await db.select().from(summaryPins).where(eq(summaryPins.teamId, teamId)).limit(1);
  return row ? [row.first, row.second] : null;
}

/** The tiles confirmed for each stage of one match, or null where nobody has confirmed any. */
export async function loadPicks(matchId: string, teamId: string): Promise<Record<SummaryStage, TileKey[] | null>> {
  const rows = await db
    .select({ stage: summaryPicks.stage, picks: summaryPicks.picks })
    .from(summaryPicks)
    .where(and(eq(summaryPicks.matchId, matchId), eq(summaryPicks.teamId, teamId)));
  const out: Record<SummaryStage, TileKey[] | null> = { half_time: null, full_time: null };
  for (const r of rows) out[r.stage] = Array.isArray(r.picks) ? r.picks : null;
  return out;
}

export type Unsent = {
  /** Each other logger still holding drafts, with how many, most first. */
  loggers: { name: string; entries: number }[];
  /** For each tile, who is holding entries for it: the tile waits on them. */
  byTile: Map<TileKey, string[]>;
};

/**
 * Entries other loggers have not sent yet. The viewer's own drafts are not
 * here: they see those already, on every screen. Counted by stat as well as
 * by person, which is how the summary knows which tiles a missing sheet
 * would change without anyone saying who logs what.
 */
export async function loadUnsent(matchId: string, teamId: string, viewerId: string): Promise<Unsent> {
  const [standard, custom] = await Promise.all([
    db
      .select({ userId: users.id, name: users.displayName, statType: matchStats.statType, n: count() })
      .from(matchStats)
      .innerJoin(users, eq(users.id, matchStats.createdBy))
      .where(
        and(
          eq(matchStats.matchId, matchId),
          eq(matchStats.teamId, teamId),
          eq(matchStats.draft, true),
          ne(matchStats.createdBy, viewerId),
        ),
      )
      .groupBy(users.id, matchStats.statType),
    db
      .select({ userId: users.id, name: users.displayName, statId: customStatEntries.statId, n: count() })
      .from(customStatEntries)
      .innerJoin(users, eq(users.id, customStatEntries.createdBy))
      .where(
        and(
          eq(customStatEntries.matchId, matchId),
          eq(customStatEntries.teamId, teamId),
          eq(customStatEntries.draft, true),
          ne(customStatEntries.createdBy, viewerId),
        ),
      )
      .groupBy(users.id, customStatEntries.statId),
  ]);

  const totals = new Map<string, { name: string; entries: number }>();
  const byTile = new Map<TileKey, string[]>();
  const add = (userId: string, name: string, key: TileKey, n: number) => {
    const t = totals.get(userId) ?? { name, entries: 0 };
    t.entries += n;
    totals.set(userId, t);
    const names = byTile.get(key) ?? [];
    if (!names.includes(name)) byTile.set(key, [...names, name]);
  };
  for (const r of standard) add(r.userId, r.name, r.statType, r.n);
  for (const r of custom) add(r.userId, r.name, customKey(r.statId), r.n);

  return { loggers: [...totals.values()].sort((a, b) => b.entries - a.entries), byTile };
}
