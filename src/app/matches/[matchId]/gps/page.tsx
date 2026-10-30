import { notFound } from "next/navigation";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matches, teams, users } from "@/lib/db/schema";
import { isCoach, requireUser } from "@/lib/auth/guard";
import { Nav } from "@/components/ui/Nav";
import { GpsReport } from "@/components/stats/GpsReport";
import { GpsUpload } from "@/components/stats/GpsUpload";
import { GpsNames } from "@/components/stats/GpsNames";
import { loadGpsLinks, loadMatchGps } from "@/lib/queries/gps";
import { gpsNameKey, suggestPlayer } from "@/lib/hurling/gps";
import { matchDateLong } from "@/lib/format";

/**
 * The GPS report for one match, and where a coach attaches the export.
 *
 * Coaches and admins only. A player's running load is health data, so it is
 * not shown to the whole panel the way the stat sheet is; opening it up to
 * players, or to each player's own line, is a rule to add here when asked.
 * Here too a coach links each GPS name to a player, which puts their running
 * on their season page (`GpsNames`).
 */
export default async function MatchGpsPage({ params }: { params: Promise<{ matchId: string }> }) {
  const user = await requireUser();
  const { matchId } = await params;

  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match || match.teamId !== user.teamId) notFound();

  if (!isCoach(user)) {
    return (
      <>
        <Nav user={user} />
        <main className="mx-auto max-w-2xl px-4 py-20">
          <h1 className="display text-3xl">GPS data is kept for the coaches</h1>
          <p className="measure mt-3 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
            Ask a coach if you would like to see how you ran in this match.
          </p>
          <Link href={`/matches/${matchId}/stats`} className="btn-primary mt-6">
            Read the stat sheet
          </Link>
        </main>
      </>
    );
  }

  const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, user.teamId)).limit(1);
  const [{ players }, links, people] = await Promise.all([
    loadMatchGps(matchId, user.teamId),
    loadGpsLinks(user.teamId),
    db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(eq(users.teamId, user.teamId))
      .orderBy(asc(users.displayName)),
  ]);

  return (
    <>
      <Nav user={user} />
      <main className="sheet pt-8 pb-16 print:max-w-none print:p-0">
        <GpsUpload
          matchId={match.id}
          hasData={players.length > 0}
          matchLabel={`Against ${match.opponent}, ${matchDateLong(match.playedOn)}`}
        />
        {players.length > 0 && (
          <GpsNames
            matchId={match.id}
            people={people}
            rows={players.map((p) => ({
              name: p.name,
              linked: links.get(gpsNameKey(p.name)) ?? null,
              suggested: suggestPlayer(p.name, people)?.id ?? null,
            }))}
          />
        )}
        {players.length > 0 && (
          <GpsReport
            teamName={team?.name ?? "Us"}
            badgeVersion={user.badgeVersion}
            match={{
              opponent: match.opponent,
              competition: match.competition,
              venue: match.venue,
              playedOn: match.playedOn,
            }}
            players={players}
          />
        )}
      </main>
    </>
  );
}
