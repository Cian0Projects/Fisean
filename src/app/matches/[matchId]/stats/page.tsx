import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matches, teams } from "@/lib/db/schema";
import { isCoach, requireUser } from "@/lib/auth/guard";
import { Nav } from "@/components/ui/Nav";
import { StatReport } from "@/components/stats/StatReport";
import { loadMatchMarkers, loadNumberSheet, loadStatRows } from "@/lib/queries/stats";
import { statTiming } from "@/lib/hurling/stats";

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

  const [team] = await db
    .select({ name: teams.name })
    .from(teams)
    .where(eq(teams.id, user.teamId))
    .limit(1);

  // Every map is split by half, so each row's half is settled here: from the
  // footage's markers where it was logged live, otherwise as the coach set it.
  const [stored, markers, numbers] = await Promise.all([
    loadStatRows(matchId, user.teamId),
    loadMatchMarkers(matchId),
    loadNumberSheet(matchId, user.teamId),
  ]);
  const rows = stored.map((r) => ({
    ...r,
    ...statTiming(r, r.videoId ? markers.get(r.videoId) : undefined, match.halfLengthMin),
  }));

  return (
    <>
      <Nav user={user} />
      <StatReport
        teamName={team?.name ?? "Us"}
        match={{
          id: match.id,
          opponent: match.opponent,
          competition: match.competition,
          venue: match.venue,
          playedOn: match.playedOn,
        }}
        rows={rows}
        numbers={numbers}
        canLog={isCoach(user)}
      />
    </>
  );
}
