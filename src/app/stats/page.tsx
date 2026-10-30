import Link from "next/link";
import { and, count, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { visibleStat } from "@/lib/queries/stats";
import { db } from "@/lib/db/client";
import { matchGps, matchLineups, matchStats, matches, videos } from "@/lib/db/schema";
import { isCoach, requireUser } from "@/lib/auth/guard";
import type { SessionUser } from "@/lib/auth/session";
import { involves } from "@/lib/hurling/moments";
import { Nav } from "@/components/ui/Nav";
import { NewMatchForm } from "@/components/stats/NewMatchForm";
import { matchDate } from "@/lib/format";

/**
 * Where a coach starts logging stats.
 *
 * Logging used to be reached from a match's row on the Squad page, which is
 * where footage is managed, not where anyone looks on the morning of a game.
 * This is the front door: start a match (opponent and date, nothing else
 * needed, since footage can follow days later), or pick one already started
 * by another coach. Everyone logging the same game opens the same match, so
 * their stats land on one sheet.
 *
 * A player gets the other half: every sheet a coach has submitted, with how
 * many of its moments are theirs to watch back. Logging stays with coaches.
 * Both get the season views, added up from the submitted sheets.
 */
export default async function StatsPage() {
  const user = await requireUser();
  if (!isCoach(user)) return <PlayerStats user={user} />;

  const [rows, counts, footage, gpsCounts] = await Promise.all([
    db
      .select({
        id: matches.id,
        opponent: matches.opponent,
        playedOn: matches.playedOn,
        competition: matches.competition,
        statsSubmittedAt: matches.statsSubmittedAt,
      })
      .from(matches)
      .where(eq(matches.teamId, user.teamId))
      .orderBy(desc(matches.playedOn), desc(matches.createdAt)),
    db
      .select({ matchId: matchStats.matchId, n: count() })
      .from(matchStats)
      .where(and(eq(matchStats.teamId, user.teamId), visibleStat(user.id)))
      .groupBy(matchStats.matchId),
    db
      .select({ matchId: videos.matchId })
      .from(videos)
      .where(eq(videos.teamId, user.teamId)),
    db
      .select({ matchId: matchGps.matchId })
      .from(matchGps)
      .where(eq(matchGps.teamId, user.teamId))
      .groupBy(matchGps.matchId),
  ]);
  const hasGps = new Set(gpsCounts.map((g) => g.matchId));
  const logged = new Map(counts.map((c) => [c.matchId, c.n]));
  const filmed = new Set(footage.map((v) => v.matchId));

  return (
    <>
      <Nav user={user} />
      <main className="mx-auto max-w-3xl px-4 pt-8 pb-16">
        <h1 className="display text-[clamp(2rem,5vw,2.75rem)]">Stats</h1>
        <p className="measure mt-2 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
          Start a match to log it live, or open one another coach has started. Everyone logging the same
          game works on the same sheet, and footage can be added to it later.
        </p>
        <SeasonLinks />

        <NewMatchForm />

        <section className="mt-10">
          <h2 className="title border-b pb-2 text-base" style={{ borderColor: "var(--color-line-strong)" }}>
            Matches
          </h2>
          {rows.length === 0 ? (
            <p className="py-6 text-[14px]" style={{ color: "var(--color-ink-faint)" }}>
              No matches yet. Start one above and it opens ready to log.
            </p>
          ) : (
            <ul>
              {rows.map((m) => {
                const n = logged.get(m.id) ?? 0;
                return (
                  <li key={m.id} className="fixture flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                    <div
                      className="tabular w-[4.5rem] shrink-0 whitespace-nowrap text-[13px]"
                      style={{ color: "var(--color-ink-faint)" }}
                    >
                      {matchDate(m.playedOn)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold">{m.opponent}</div>
                      <div className="caption truncate">
                        {[
                          m.competition,
                          n === 0 ? "No stats yet" : `${n} ${n === 1 ? "stat" : "stats"} logged`,
                          n === 0 ? null : m.statsSubmittedAt ? "submitted" : "not submitted yet",
                          filmed.has(m.id) ? "footage added" : null,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {n > 0 && (
                        <Link href={`/matches/${m.id}/stats`} className="btn-ghost text-xs">
                          Report
                        </Link>
                      )}
                      <Link href={`/matches/${m.id}/gps`} className="btn-ghost text-xs">
                        {hasGps.has(m.id) ? "View GPS" : "Upload GPS"}
                      </Link>
                      <Link href={`/matches/${m.id}/stats/log`} className="btn-outline text-xs">
                        Log stats
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

/**
 * The submitted sheets, newest first. Drafts are left out altogether rather
 * than listed as coming: a coach may never submit a sheet for a challenge
 * match, and a list of promises is worse than a short list.
 */
async function PlayerStats({ user }: { user: SessionUser }) {
  const rows = await db
    .select({ id: matches.id, opponent: matches.opponent, playedOn: matches.playedOn, competition: matches.competition })
    .from(matches)
    .where(and(eq(matches.teamId, user.teamId), isNotNull(matches.statsSubmittedAt)))
    .orderBy(desc(matches.playedOn), desc(matches.createdAt));
  const ids = rows.map((m) => m.id);

  // The number this player wore in each match, then every entry it touches:
  // credited to them, or a delivery aimed at them, as the sheet itself counts.
  const [worn, entries] = ids.length
    ? await Promise.all([
        db
          .select({ matchId: matchLineups.matchId, number: matchLineups.number })
          .from(matchLineups)
          .where(and(eq(matchLineups.userId, user.id), inArray(matchLineups.matchId, ids))),
        db
          .select({ matchId: matchStats.matchId, playerNumber: matchStats.playerNumber, targetNumber: matchStats.targetNumber })
          .from(matchStats)
          .where(and(eq(matchStats.teamId, user.teamId), inArray(matchStats.matchId, ids), visibleStat(user.id))),
      ])
    : [[], []];
  const numberIn = new Map(worn.map((w) => [w.matchId, w.number]));
  const mine = new Map<string, number>();
  for (const e of entries) {
    const n = numberIn.get(e.matchId);
    if (n != null && involves(e, n)) mine.set(e.matchId, (mine.get(e.matchId) ?? 0) + 1);
  }

  return (
    <>
      <Nav user={user} />
      <main className="mx-auto max-w-3xl px-4 pt-8 pb-16">
        <h1 className="display text-[clamp(2rem,5vw,2.75rem)]">Stats</h1>
        <p className="measure mt-2 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
          The stat sheet for every match the coaches have finished. Open one to read it, and watch any moment on it
          back from ten seconds before it happened: yours, or anyone else&rsquo;s.
        </p>
        <SeasonLinks />

        <section className="mt-10">
          <h2 className="title border-b pb-2 text-base" style={{ borderColor: "var(--color-line-strong)" }}>
            Matches
          </h2>
          {rows.length === 0 ? (
            <p className="py-6 text-[14px]" style={{ color: "var(--color-ink-faint)" }}>
              No stat sheets out yet. Once a coach submits one, it shows up here.
            </p>
          ) : (
            <ul>
              {rows.map((m) => {
                const n = mine.get(m.id) ?? 0;
                return (
                  <li key={m.id} className="fixture flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                    <div
                      className="tabular w-[4.5rem] shrink-0 whitespace-nowrap text-[13px]"
                      style={{ color: "var(--color-ink-faint)" }}
                    >
                      {matchDate(m.playedOn)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold">{m.opponent}</div>
                      <div className="caption truncate">
                        {[
                          m.competition,
                          numberIn.has(m.id) ? `${n} ${n === 1 ? "moment" : "moments"} of yours` : null,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                    </div>
                    <Link href={`/matches/${m.id}/stats`} className="btn-outline text-xs">
                      Stat sheet
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

/**
 * The season across every submitted sheet, for the team and for each player.
 * Everyone gets both: the panel reads everyone's numbers, match or season.
 */
function SeasonLinks() {
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      <Link href="/stats/team" className="btn-outline text-xs">
        Team season
      </Link>
      <Link href="/stats/players" className="btn-outline text-xs">
        Player seasons
      </Link>
    </div>
  );
}
