"use server";

/**
 * Opposition analysis: the team's list of clubs it plays or studies, and the
 * games of theirs brought in to study.
 *
 * Coaches and admins only. The stats and analysis people at club level are
 * coaches, and an opposition game is footage on the club's storage, so it is
 * the coaches who add one. Everyone on the team then sees it and clips it
 * like any match; who sees each clip is the clip's own business.
 */
import { revalidatePath } from "next/cache";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matches, oppositions, teams } from "@/lib/db/schema";
import { oppositionFor } from "@/lib/db/oppositions";
import { oppositionKey, oppositionNameProblem } from "@/lib/hurling/opposition";
import { halfLengthProblem } from "@/lib/hurling/notation";
import { tidyName } from "@/lib/hurling/squad";
import { assertSameTeam, requireCoach } from "@/lib/auth/guard";

/** Put a club on the list before there is any footage of them: next week's opponent. */
export async function addOpposition(name: string): Promise<{ id: string }> {
  const user = await requireCoach();
  const problem = oppositionNameProblem(name);
  if (problem) throw new Error(problem);
  const opp = oppositionFor(db, user.teamId, name, user.id);
  revalidatePath("/opposition");
  return { id: opp.id };
}

/**
 * Add a game between two other clubs, to study one or both. The studied team
 * goes on the sheet's opposition side and the team they played in our slot,
 * so everything about a club sits on the same side of every sheet (see the
 * matches schema). The footage is uploaded to it after, like any match.
 */
export async function createOppositionGame(input: {
  team: string;
  vs: string;
  playedOn: string;
  competition?: string;
  halfLengthMin?: number;
}): Promise<{ id: string; oppositionId: string }> {
  const user = await requireCoach();
  const problem = oppositionNameProblem(input.team) ?? oppositionNameProblem(input.vs);
  if (problem) throw new Error(problem);
  if (oppositionKey(input.team) === oppositionKey(input.vs)) throw new Error("A team cannot play itself.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.playedOn)) throw new Error("When was it played?");
  const halves = input.halfLengthMin != null ? halfLengthProblem(input.halfLengthMin) : null;
  if (halves) throw new Error(halves);

  const [team] = await db
    .select({ halfLengthMin: teams.halfLengthMin })
    .from(teams)
    .where(eq(teams.id, user.teamId))
    .limit(1);

  const match = db.transaction((tx) => {
    const studied = oppositionFor(tx, user.teamId, input.team, user.id);
    const vs = oppositionFor(tx, user.teamId, input.vs, user.id);
    return tx
      .insert(matches)
      .values({
        teamId: user.teamId,
        kind: "opposition",
        opponent: studied.name,
        oppositionId: studied.id,
        vsOppositionId: vs.id,
        playedOn: input.playedOn,
        competition: input.competition?.trim() || null,
        homeAway: "neutral",
        halfLengthMin: input.halfLengthMin ?? team?.halfLengthMin ?? 30,
        createdBy: user.id,
      })
      .returning()
      .get();
  });

  revalidatePath("/opposition", "layout");
  return { id: match.id, oppositionId: match.oppositionId! };
}

/** Rename a club, and every match that names it, so the two never disagree. */
export async function renameOpposition(oppositionId: string, name: string): Promise<void> {
  const user = await requireCoach();
  const problem = oppositionNameProblem(name);
  if (problem) throw new Error(problem);
  const [opp] = await db.select().from(oppositions).where(eq(oppositions.id, oppositionId)).limit(1);
  if (!opp) throw new Error("That team is no longer on the list.");
  assertSameTeam(user, opp);

  const tidy = tidyName(name);
  const key = oppositionKey(tidy);
  const [clash] = await db
    .select({ id: oppositions.id, name: oppositions.name })
    .from(oppositions)
    .where(and(eq(oppositions.teamId, user.teamId), eq(oppositions.key, key)))
    .limit(1);
  if (clash && clash.id !== opp.id) {
    throw new Error(`${clash.name} is already on the list. Merge the two instead.`);
  }

  db.transaction((tx) => {
    tx.update(oppositions).set({ name: tidy, key }).where(eq(oppositions.id, opp.id)).run();
    tx.update(matches).set({ opponent: tidy }).where(eq(matches.oppositionId, opp.id)).run();
  });
  revalidatePath("/", "layout");
}

/**
 * Two spellings of the one club, put together: "Barrs" into "St Finbarr's".
 * Every match on `fromId`, on either side, moves to `intoId` and takes its
 * name, then `fromId` goes. Refused where it would make a club play itself.
 */
export async function mergeOppositions(fromId: string, intoId: string): Promise<void> {
  const user = await requireCoach();
  if (fromId === intoId) return;
  const rows = await db
    .select()
    .from(oppositions)
    .where(or(eq(oppositions.id, fromId), eq(oppositions.id, intoId)));
  const from = rows.find((r) => r.id === fromId);
  const into = rows.find((r) => r.id === intoId);
  if (!from || !into) throw new Error("One of those teams is no longer on the list.");
  assertSameTeam(user, from);
  assertSameTeam(user, into);

  const [selfGame] = await db
    .select({ id: matches.id })
    .from(matches)
    .where(
      or(
        and(eq(matches.oppositionId, fromId), eq(matches.vsOppositionId, intoId)),
        and(eq(matches.oppositionId, intoId), eq(matches.vsOppositionId, fromId)),
      ),
    )
    .limit(1);
  if (selfGame) throw new Error(`${from.name} played ${into.name}, so they cannot be the one club.`);

  db.transaction((tx) => {
    tx.update(matches).set({ oppositionId: into.id, opponent: into.name }).where(eq(matches.oppositionId, from.id)).run();
    tx.update(matches).set({ vsOppositionId: into.id }).where(eq(matches.vsOppositionId, from.id)).run();
    tx.delete(oppositions).where(eq(oppositions.id, from.id)).run();
  });
  revalidatePath("/", "layout");
}
