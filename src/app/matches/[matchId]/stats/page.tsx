import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matchStats, matches, teams, users, videos } from "@/lib/db/schema";
import { isCoach, requireUser } from "@/lib/auth/guard";
import { canReadStats } from "@/lib/auth/visibility";
import { store } from "@/lib/storage";
import { Nav } from "@/components/ui/Nav";
import { StatReport } from "@/components/stats/StatReport";
import { StatMoments } from "@/components/stats/StatMoments";
import { SubmitStats } from "@/components/stats/SubmitStats";
import { loadMatchMarkers, loadNumberSheet, loadStatRows } from "@/lib/queries/stats";
import { statTiming, whistlesOf } from "@/lib/hurling/stats";
import { matchDateLong } from "@/lib/format";

/**
 * The stat sheet for one match.
 *
 * Open to the whole squad once a coach submits it, like the matches and clips
 * it sits beside: the numbers are most useful to the players in them, and
 * everyone reads everyone's (src/lib/auth/visibility.ts, `canReadStats`).
 * Until then it is the coaches' draft. Logging is the restricted half, at
 * /stats/log.
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

  // A draft says so rather than 404ing: the player followed a real link,
  // and "not out yet" tells them to come back.
  if (!canReadStats(user, match)) {
    return (
      <>
        <Nav user={user} />
        <main className="sheet pt-10 pb-16">
          <h1 className="display text-[clamp(2.4rem,6vw,3.8rem)]">{match.opponent}</h1>
          <p className="measure mt-4 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
            The stat sheet for {matchDateLong(match.playedOn)} is not out yet. The coaches are still putting it
            together, and it shows up here once they submit it.
          </p>
          <Link href="/" className="btn-outline mt-6">
            Back to matches
          </Link>
        </main>
      </>
    );
  }

  const coach = isCoach(user);
  const [team] = await db
    .select({ name: teams.name })
    .from(teams)
    .where(eq(teams.id, user.teamId))
    .limit(1);

  // Every map is split by half, so each row's half is settled here: from the
  // footage's markers where it was logged against video, from its logger's
  // own clock where it was logged on the line (or the match's old shared
  // whistles, for entries from before), otherwise as the coach set it.
  const [stored, markers, numbers, footage, loggers, submitter] = await Promise.all([
    loadStatRows(matchId, user.teamId, user.id),
    loadMatchMarkers(matchId),
    loadNumberSheet(matchId, user.teamId),
    db
      .select({ id: videos.id, durationMs: videos.durationMs, storageKey: videos.storageKey })
      .from(videos)
      .where(and(eq(videos.matchId, matchId), eq(videos.teamId, user.teamId), eq(videos.status, "ready")))
      .orderBy(asc(videos.createdAt)),
    // Who logged what, for the coach deciding whether the sheet is finished.
    // Counted with their drafts, so someone still logging shows as such;
    // the entries themselves stay theirs until they submit.
    coach
      ? db
          .select({ name: users.displayName, n: count(), drafts: sql<number>`sum(${matchStats.draft})` })
          .from(matchStats)
          .innerJoin(users, eq(users.id, matchStats.createdBy))
          .where(and(eq(matchStats.matchId, matchId), eq(matchStats.teamId, user.teamId)))
          .groupBy(users.id)
          .orderBy(desc(count()))
      : [],
    coach && match.statsSubmittedBy
      ? db
          .select({ name: users.displayName })
          .from(users)
          .where(and(eq(users.id, match.statsSubmittedBy), eq(users.teamId, user.teamId)))
          .limit(1)
      : [],
  ]);
  const whistles = whistlesOf(match);
  const rows = stored.map((r) => ({
    ...r,
    ...statTiming(r, r.videoId ? markers.get(r.videoId) : undefined, match.halfLengthMin, whistles),
  }));

  const media = await store();

  return (
    <>
      <Nav user={user} />
      <StatReport
        teamName={team?.name ?? "Us"}
        code={user.teamCode}
        match={{
          id: match.id,
          opponent: match.opponent,
          competition: match.competition,
          venue: match.venue,
          playedOn: match.playedOn,
        }}
        rows={rows}
        numbers={numbers}
        canLog={coach}
        banner={
          coach && (
            <SubmitStats
              matchId={match.id}
              submittedAt={match.statsSubmittedAt}
              submittedBy={submitter[0]?.name ?? null}
              loggers={loggers}
            />
          )
        }
        moments={
          <StatMoments
            code={user.teamCode}
            rows={rows}
            numbers={numbers}
            footage={footage.map((f) => ({
              id: f.id,
              durationMs: f.durationMs,
              markers: markers.get(f.id) ?? {},
              src: media.readUrl(f.storageKey),
            }))}
            whistles={whistles}
            halfLengthMin={match.halfLengthMin}
            viewerNumber={numbers.find((n) => n.userId === user.id)?.number ?? null}
          />
        }
      />
    </>
  );
}
