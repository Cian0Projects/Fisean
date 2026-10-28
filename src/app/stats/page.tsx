import Link from "next/link";
import { redirect } from "next/navigation";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matchGps, matchStats, matches, videos } from "@/lib/db/schema";
import { isCoach, requireUser } from "@/lib/auth/guard";
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
 * Coaches only, like the logging itself. A player reads the stat sheet from
 * the match instead.
 */
export default async function StatsPage() {
  const user = await requireUser();
  if (!isCoach(user)) redirect("/");

  const [rows, counts, footage, gpsCounts] = await Promise.all([
    db
      .select({ id: matches.id, opponent: matches.opponent, playedOn: matches.playedOn, competition: matches.competition })
      .from(matches)
      .where(eq(matches.teamId, user.teamId))
      .orderBy(desc(matches.playedOn), desc(matches.createdAt)),
    db
      .select({ matchId: matchStats.matchId, n: count() })
      .from(matchStats)
      .where(eq(matchStats.teamId, user.teamId))
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
