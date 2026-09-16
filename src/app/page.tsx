import Link from "next/link";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  clipPlayers,
  clips,
  matchStats,
  matches,
  playlistViewers,
  playlists,
  videos,
} from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/guard";
import { Nav } from "@/components/ui/Nav";
import { formatClock, formatScore } from "@/lib/hurling/notation";
import { countShots, shootingEfficiency, type Efficiency } from "@/lib/hurling/stats";
import { matchDate, matchDateLong } from "@/lib/format";

export default async function Dashboard() {
  const user = await requireUser();

  /**
   * The last match played leads, because that is what everyone came to look
   * at. Clips and playlists sit beside it as ways back into moments already
   * picked out — not as a gate in front of the footage.
   */
  const matchRows = await db
    .select()
    .from(matches)
    .where(eq(matches.teamId, user.teamId))
    .orderBy(desc(matches.playedOn))
    .limit(20);

  const ids = matchRows.map((m) => m.id);

  const videoRows = ids.length
    ? await db.select().from(videos).where(inArray(videos.matchId, ids))
    : [];

  // What each match actually holds, counted in one pass rather than per row.
  const statCounts = ids.length
    ? await db
        .select({ matchId: matchStats.matchId, n: sql<number>`count(*)` })
        .from(matchStats)
        .where(inArray(matchStats.matchId, ids))
        .groupBy(matchStats.matchId)
    : [];

  const clipCounts = ids.length
    ? await db
        .select({ matchId: videos.matchId, n: sql<number>`count(*)` })
        .from(clips)
        .innerJoin(videos, eq(videos.id, clips.videoId))
        .where(inArray(videos.matchId, ids))
        .groupBy(videos.matchId)
    : [];

  const videosByMatch = new Map<string, typeof videoRows>();
  for (const v of videoRows) {
    if (!v.matchId) continue;
    videosByMatch.set(v.matchId, [...(videosByMatch.get(v.matchId) ?? []), v]);
  }
  const statsByMatch = new Map(statCounts.map((r) => [r.matchId, Number(r.n)]));
  const clipsByMatch = new Map(clipCounts.map((r) => [r.matchId ?? "", Number(r.n)]));

  const myClipRows = await db
    .select({
      id: clips.id,
      videoId: clips.videoId,
      title: clips.title,
      startMs: clips.startMs,
      endMs: clips.endMs,
      opponent: matches.opponent,
      playedOn: matches.playedOn,
    })
    .from(clipPlayers)
    .innerJoin(clips, eq(clips.id, clipPlayers.clipId))
    .innerJoin(videos, eq(videos.id, clips.videoId))
    .leftJoin(matches, eq(matches.id, videos.matchId))
    .where(eq(clipPlayers.userId, user.id))
    .orderBy(desc(clips.createdAt))
    .limit(8);

  const assigned = await db
    .select({
      id: playlists.id,
      title: playlists.title,
      description: playlists.description,
      viewedAt: playlistViewers.viewedAt,
    })
    .from(playlistViewers)
    .innerJoin(playlists, eq(playlists.id, playlistViewers.playlistId))
    .where(eq(playlistViewers.userId, user.id))
    .orderBy(desc(playlistViewers.assignedAt));

  const [latest, ...earlier] = matchRows;
  const isCoach = user.role !== "player";

  // The lead match carries its scoreline, which is worth one more query: it is
  // the first thing anybody wants to see, and it is derived from the shots on
  // the stat sheet rather than stored anywhere.
  const latestStats =
    latest && (statsByMatch.get(latest.id) ?? 0) > 0
      ? await db
          .select({
            statType: matchStats.statType,
            outcome: matchStats.outcome,
            shotResult: matchStats.shotResult,
            ledToScore: matchStats.ledToScore,
            puckoutTakenBy: matchStats.puckoutTakenBy,
          })
          .from(matchStats)
          .where(eq(matchStats.matchId, latest.id))
      : [];

  return (
    <>
      <Nav user={user} />

      <main className="mx-auto max-w-6xl px-4 pb-16">
        {latest ? (
          <LeadMatch
            match={latest}
            footage={videosByMatch.get(latest.id) ?? []}
            clipCount={clipsByMatch.get(latest.id) ?? 0}
            shooting={latestStats.length ? shootingEfficiency(countShots(latestStats)) : null}
            statCount={statsByMatch.get(latest.id) ?? 0}
            isCoach={isCoach}
          />
        ) : (
          <section className="py-16">
            <h1 className="display text-4xl">No matches yet</h1>
            <p className="measure mt-3 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
              Add the fixture first — it can exist before the footage does. Then
              drop the file into <code>data/media/</code> and register it with{" "}
              <code>npm run ingest</code>.
            </p>
            {isCoach && (
              <Link href="/admin" className="btn-primary mt-6">
                Add a match
              </Link>
            )}
          </section>
        )}

        {/* The rail only earns its column when there is something in it. */}
        <div
          className={`mt-12 grid gap-12 ${
            myClipRows.length > 0 || assigned.length > 0
              ? "lg:grid-cols-[minmax(0,1fr)_19rem]"
              : ""
          }`}
        >
          <section>
            <div
              className="flex items-baseline justify-between border-b pb-2"
              style={{ borderColor: "var(--color-line-strong)" }}
            >
              <h2 className="title text-lg">Earlier matches</h2>
              {isCoach && (
                <Link
                  href="/admin"
                  className="text-[13px]"
                  style={{ color: "var(--color-ink-dim)" }}
                >
                  Add a match
                </Link>
              )}
            </div>

            {earlier.length === 0 ? (
              <p className="py-6 text-[14px]" style={{ color: "var(--color-ink-faint)" }}>
                Nothing else on record yet.
              </p>
            ) : (
              <ul>
                {earlier.map((m) => {
                  const vids = videosByMatch.get(m.id) ?? [];
                  const ready = vids.find((v) => v.status === "ready") ?? vids[0];
                  return (
                    <li key={m.id} className="fixture flex items-center gap-4 py-3">
                      <div
                        className="tabular w-16 shrink-0 text-[13px]"
                        style={{ color: "var(--color-ink-faint)" }}
                      >
                        {matchDate(m.playedOn)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="title truncate text-[17px]">{m.opponent}</div>
                        <div className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                          {[m.competition, m.venue].filter(Boolean).join(" at ") || "Friendly"}
                        </div>
                      </div>

                      <Holdings
                        clips={clipsByMatch.get(m.id) ?? 0}
                        stats={statsByMatch.get(m.id) ?? 0}
                        hasVideo={vids.length > 0}
                      />

                      <div className="flex shrink-0 items-center gap-1">
                        {ready && (
                          <Link href={`/review/${ready.id}`} className="btn-ghost text-xs">
                            Watch
                          </Link>
                        )}
                        <Link href={`/matches/${m.id}/stats`} className="btn-ghost text-xs">
                          Stats
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <aside className="space-y-10">
            {myClipRows.length > 0 && (
              <section>
                <h2
                  className="title border-b pb-2 text-base"
                  style={{ borderColor: "var(--color-line-strong)" }}
                >
                  Clips you are in
                </h2>
                <ul>
                  {myClipRows.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/review/${c.videoId}?clip=${c.id}`}
                        className="fixture block py-2.5"
                      >
                        <div className="truncate text-[14px]">{c.title || "Untitled clip"}</div>
                        <div
                          className="tabular mt-0.5 text-[12px]"
                          style={{ color: "var(--color-ink-faint)" }}
                        >
                          {c.opponent ?? "Training"}
                          <span className="mx-1.5" style={{ color: "var(--color-line-strong)" }}>
                            |
                          </span>
                          {formatClock(c.startMs)}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {assigned.length > 0 && (
              <section>
                <h2
                  className="title border-b pb-2 text-base"
                  style={{ borderColor: "var(--color-line-strong)" }}
                >
                  Set for you to watch
                </h2>
                <ul>
                  {assigned.map((p) => (
                    <li key={p.id}>
                      <Link href={`/playlists/${p.id}`} className="fixture flex gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px]">{p.title}</div>
                          {p.description && (
                            <div
                              className="truncate text-[12px]"
                              style={{ color: "var(--color-ink-faint)" }}
                            >
                              {p.description}
                            </div>
                          )}
                        </div>
                        {!p.viewedAt && (
                          <span
                            className="mt-1 h-2 w-2 shrink-0 rounded-full"
                            style={{ background: "var(--color-ash)" }}
                            title="Not watched yet"
                          />
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </main>
    </>
  );
}

/**
 * The lead match: opponent at full size, then the three things you can
 * actually do with it. Everything a coach opens Físeán for on a Sunday night
 * is in this block.
 */
function LeadMatch({
  match,
  footage,
  clipCount,
  shooting,
  statCount,
  isCoach,
}: {
  match: typeof matches.$inferSelect;
  footage: (typeof videos.$inferSelect)[];
  clipCount: number;
  shooting: Efficiency | null;
  statCount: number;
  isCoach: boolean;
}) {
  const ready = footage.find((v) => v.status === "ready");
  const pending = footage.find((v) => v.status !== "ready");

  return (
    <section className="pt-10 pb-8">
      <p className="text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
        Last out, {matchDateLong(match.playedOn)}
        {match.homeAway === "home" && ", at home"}
        {match.homeAway === "away" && ", away"}
      </p>

      <h1 className="display mt-2 text-[clamp(2.6rem,8vw,4.5rem)]">{match.opponent}</h1>

      <p className="mt-2 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
        {[match.competition, match.venue].filter(Boolean).join(" at ") || "Friendly"}
      </p>

      <div className="mt-7 flex flex-wrap items-center gap-2">
        {ready ? (
          <Link href={`/review/${ready.id}`} className="btn-primary">
            Watch the match
            <span className="tabular opacity-75">{formatClock(ready.durationMs)}</span>
          </Link>
        ) : pending ? (
          <span className="btn-outline pointer-events-none opacity-60">
            Footage {pending.status}
          </span>
        ) : null}

        <Link href={`/matches/${match.id}/stats`} className="btn-outline">
          Stat sheet
        </Link>
        {isCoach && (
          <Link href={`/matches/${match.id}/stats/log`} className="btn-ghost">
            Log stats
          </Link>
        )}
      </div>

      <div
        className="mt-7 flex flex-wrap items-center gap-x-8 gap-y-3 border-t pt-4 text-[13px]"
        style={{ borderColor: "var(--color-line)", color: "var(--color-ink-dim)" }}
      >
        {shooting && shooting.total > 0 && (
          <>
            <Figure value={formatScore(shooting.score)} label="scored" />
            <Figure value={`${shooting.percent}%`} label="of shots taken" />
          </>
        )}
        <Holding n={footage.length} one="camera angle" many="camera angles" />
        <Holding n={clipCount} one="clip" many="clips" />
        <Holding n={statCount} one="stat logged" many="stats logged" />
        {footage.length === 0 && (
          <span style={{ color: "var(--color-ink-faint)" }}>
            No footage attached — the stat sheet works without it
          </span>
        )}
      </div>
    </section>
  );
}

function Holding({ n, one, many }: { n: number; one: string; many: string }) {
  return (
    <Figure
      value={String(n)}
      label={n === 1 ? one : many}
      quiet={n === 0}
    />
  );
}

/** A number and what it counts, kept on one baseline. */
function Figure({ value, label, quiet }: { value: string; label: string; quiet?: boolean }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span
        className="figure text-[22px]"
        style={{ color: quiet ? "var(--color-ink-faint)" : "var(--color-ash)" }}
      >
        {value}
      </span>
      {label}
    </span>
  );
}

/** What a fixture holds, kept to a glance: footage, clips, stats. */
function Holdings({
  clips,
  stats,
  hasVideo,
}: {
  clips: number;
  stats: number;
  hasVideo: boolean;
}) {
  const bits = [
    hasVideo ? "footage" : null,
    clips > 0 ? `${clips} clips` : null,
    stats > 0 ? `${stats} stats` : null,
  ].filter(Boolean);

  return (
    <div
      className="tabular hidden w-40 shrink-0 text-right text-[12px] sm:block"
      style={{ color: "var(--color-ink-faint)" }}
    >
      {bits.length ? bits.join(", ") : "nothing logged yet"}
    </div>
  );
}
