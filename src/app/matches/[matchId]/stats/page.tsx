import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matchStats, matches, users } from "@/lib/db/schema";
import { isCoach, requireUser } from "@/lib/auth/guard";
import { Nav } from "@/components/ui/Nav";
import { StatReport } from "@/components/stats/StatReport";
import type { StatRow } from "@/components/stats/types";

/**
 * The stat sheet for one match.
 *
 * Open to the whole squad, like the matches and clips it sits beside — the
 * numbers are most useful to the players in them. Logging is the restricted
 * half, at /stats/log.
 */
export default async function MatchStatsPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const user = await requireUser();
  const { matchId } = await params;

  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match || match.teamId !== user.teamId) notFound();

  const rows: StatRow[] = await db
    .select({
      id: matchStats.id,
      statType: matchStats.statType,
      outcome: matchStats.outcome,
      playerId: matchStats.playerId,
      originX: matchStats.originX,
      originY: matchStats.originY,
      destX: matchStats.destX,
      destY: matchStats.destY,
      shotResult: matchStats.shotResult,
      ledToScore: matchStats.ledToScore,
      puckoutTakenBy: matchStats.puckoutTakenBy,
      clipId: matchStats.clipId,
      videoId: matchStats.videoId,
      atMs: matchStats.atMs,
      createdAt: matchStats.createdAt,
    })
    .from(matchStats)
    // Scoped by team as well as match: a match id is a URL, and a URL travels.
    .where(and(eq(matchStats.matchId, matchId), eq(matchStats.teamId, user.teamId)))
    .orderBy(asc(matchStats.createdAt));

  const squad = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      jerseyNumber: users.jerseyNumber,
      position: users.position,
      role: users.role,
    })
    .from(users)
    .where(eq(users.teamId, user.teamId))
    .orderBy(asc(users.jerseyNumber), asc(users.displayName));

  // The table lists the panel. A coach who came on and was credited with
  // something belongs in it too, so anyone with an entry is included.
  const credited = new Set(rows.map((r) => r.playerId).filter((id): id is string => !!id));
  const panel = squad
    .filter((u) => u.role === "player" || credited.has(u.id))
    .map(({ id, displayName, jerseyNumber, position }) => ({
      id,
      displayName,
      jerseyNumber,
      position,
    }));

  return (
    <>
      <Nav user={user} />
      <StatReport
        match={{
          id: match.id,
          opponent: match.opponent,
          competition: match.competition,
          venue: match.venue,
          playedOn: match.playedOn,
        }}
        rows={rows}
        panel={panel}
        canLog={isCoach(user)}
      />
    </>
  );
}
