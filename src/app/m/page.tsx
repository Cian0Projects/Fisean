import Link from "next/link";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  clipPlayers,
  clips,
  matchStats,
  matches,
  playlistItems,
  playlistViewers,
  playlists,
  videos,
} from "@/lib/db/schema";
import { isCoach, requireUserFor } from "@/lib/auth/guard";
import { signOut } from "@/lib/actions/auth";
import { Mark } from "@/components/ui/Mark";
import { InstallHint } from "@/components/ui/InstallHint";
import { formatClock, formatScore } from "@/lib/hurling/notation";
import { matchResult, type StatEntry } from "@/lib/hurling/stats";
import { verdict, verdictColour } from "@/components/matches/ResultBox";
import { matchDate, matchDateLong } from "@/lib/format";
import { ChevronIcon } from "@/components/ui/Icon";

/**
 * The phone's front page.
 *
 * What a player opens it for, in that order: what they have been set to
 * watch, then the last match and how it went, then the clips they are in.
 * Every row is the whole width and at least 56 px tall, so it is one thumb
 * tap with a glove half on. Reading the stat sheet is left to the desktop,
 * where it is read at a table; logging it is not, because that happens on
 * the line or in front of a stream, so a coach gets a way in to it here.
 */
export default async function PhoneHome() {
  const user = await requireUserFor("/m");
  const coach = isCoach(user);

  const matchRows = await db
    .select()
    .from(matches)
    .where(eq(matches.teamId, user.teamId))
    .orderBy(desc(matches.playedOn))
    .limit(30);

  const ids = matchRows.map((m) => m.id);
  const videoRows = ids.length
    ? await db
        .select({ id: videos.id, matchId: videos.matchId, status: videos.status })
        .from(videos)
        .where(inArray(videos.matchId, ids))
    : [];

  // The first ready file for each match is the one a tap should open.
  const watchable = new Map<string, string>();
  for (const v of videoRows) {
    if (v.matchId && v.status === "ready" && !watchable.has(v.matchId)) {
      watchable.set(v.matchId, v.id);
    }
  }

  const myClips = await db
    .select({
      id: clips.id,
      videoId: clips.videoId,
      title: clips.title,
      startMs: clips.startMs,
      endMs: clips.endMs,
      opponent: matches.opponent,
    })
    .from(clipPlayers)
    .innerJoin(clips, eq(clips.id, clipPlayers.clipId))
    .innerJoin(videos, eq(videos.id, clips.videoId))
    .leftJoin(matches, eq(matches.id, videos.matchId))
    .where(and(eq(clipPlayers.userId, user.id), eq(clips.teamId, user.teamId)))
    .orderBy(desc(clips.createdAt))
    .limit(10);

  // Set for you: the reason most of the panel opens the app between work and
  // training, so it leads, with the ones still to watch marked.
  const assigned = await db
    .select({
      id: playlists.id,
      title: playlists.title,
      description: playlists.description,
      viewedAt: playlistViewers.viewedAt,
      clipCount: sql<number>`(select count(*) from ${playlistItems} where ${playlistItems.playlistId} = ${playlists.id})`,
    })
    .from(playlistViewers)
    .innerJoin(playlists, eq(playlists.id, playlistViewers.playlistId))
    .where(and(eq(playlistViewers.userId, user.id), eq(playlists.teamId, user.teamId)))
    .orderBy(desc(playlistViewers.assignedAt))
    .limit(6);

  const [latest, ...earlier] = matchRows;
  const latestVideo = latest ? watchable.get(latest.id) : undefined;
  const latestResult = latest
    ? matchResult(
        (await db
          .select({
            statType: matchStats.statType,
            outcome: matchStats.outcome,
            shotResult: matchStats.shotResult,
            side: matchStats.side,
          })
          .from(matchStats)
          .where(eq(matchStats.matchId, latest.id))) as StatEntry[],
      )
    : null;

  return (
    <div
      className="mx-auto min-h-dvh max-w-xl"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)",
      }}
    >
      <header className="flex items-center gap-3 px-4 py-3">
        <Mark className="h-6" />
        <span className="wordmark -ml-0.5 text-[24px]">Ardawn</span>
        <span className="truncate text-[13px]" style={{ color: "var(--color-ink-dim)" }}>
          {user.teamName}
        </span>
      </header>

      {assigned.length > 0 && (
        <section className="mt-4">
          <h2 className="section-head title mx-4 text-lg">Set for you to watch</h2>
          <ul className="mt-1">
            {assigned.map((p) => (
              <li key={p.id}>
                <Link href={`/playlists/${p.id}`} className="fixture flex min-h-14 items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[16px] font-semibold">{p.title}</div>
                    <div className="truncate text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
                      {Number(p.clipCount)} clip{Number(p.clipCount) === 1 ? "" : "s"}
                      {p.description && `. ${p.description}`}
                    </div>
                  </div>
                  {!p.viewedAt && (
                    <span className="shrink-0 text-[13px] font-semibold" style={{ color: "var(--color-ash)" }}>
                      Not watched
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {latest ? (
        <section className={`px-4 ${assigned.length > 0 ? "mt-10" : "pt-4"}`}>
          <h1 className="display text-[44px]">{latest.opponent}</h1>
          <div className="mt-1 text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
            {[latest.competition, latest.venue].filter(Boolean).join(" at ") || "Friendly"},{" "}
            {matchDateLong(latest.playedOn)}
          </div>
          {/* The result as the back page prints it: the score, then the word. */}
          {latestResult && (
            <div className="mt-4 flex items-baseline gap-3">
              <span className="figure text-[28px]">
                {formatScore(latestResult.us)}
                {latestResult.them && (
                  <>
                    <span className="mx-2 text-[17px] font-normal" style={{ color: "var(--color-ink-faint)" }}>
                      to
                    </span>
                    {formatScore(latestResult.them)}
                  </>
                )}
              </span>
              {latestResult.margin != null && (
                <span className="text-[14px] font-bold" style={{ color: verdictColour(latestResult.margin) }}>
                  {verdict(latestResult.margin)}
                </span>
              )}
            </div>
          )}
          {latestVideo ? (
            <Link href={`/m/watch/${latestVideo}`} className="btn-primary mt-5 min-h-12 w-full text-[16px]">
              Watch the match
            </Link>
          ) : (
            <p className="mt-5 text-[14px]" style={{ color: "var(--color-ink-faint)" }}>
              The footage is not up yet.
            </p>
          )}
          {coach && (
            <div className="mt-3 flex items-center gap-4">
              <Link
                href={`/matches/${latest.id}/stats/log`}
                className="btn-outline min-h-12 flex-1 text-[16px]"
              >
                Log stats live
              </Link>
              {/* A fixture not on the list yet is started there, and opens ready to log. */}
              <Link href="/stats" className="py-3 text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
                Another match
              </Link>
            </div>
          )}
        </section>
      ) : (
        <section className="px-4 pt-6">
          <h1 className="display text-[36px]">No matches yet</h1>
          <p className="mt-2 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
            Once a coach adds a match and its footage, it will be here.
          </p>
          {coach && (
            <Link href="/stats" className="btn-primary mt-5 min-h-12 w-full text-[16px]">
              Start a match and log it live
            </Link>
          )}
        </section>
      )}

      {myClips.length > 0 && (
        <section className="mt-10">
          <h2 className="section-head title mx-4 text-lg">Clips you are in</h2>
          <ul>
            {myClips.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/m/watch/${c.videoId}?clip=${c.id}`}
                  className="fixture flex min-h-14 items-center gap-3 px-4 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px]">{c.title || "Untitled clip"}</div>
                    <div className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                      {c.opponent ? `v ${c.opponent}, ` : ""}
                      {formatClock(c.startMs)}
                    </div>
                  </div>
                  <span className="tabular text-[13px]" style={{ color: "var(--color-ash-dim)" }}>
                    {Math.round((c.endMs - c.startMs) / 1000)} s
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {earlier.length > 0 && (
        <section className="mt-10">
          <h2 className="section-head title mx-4 text-lg">Earlier matches</h2>
          <ul>
            {earlier.map((m) => {
              const videoId = watchable.get(m.id);
              const body = (
                <>
                  <div className="tabular w-20 shrink-0 text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
                    {matchDate(m.playedOn)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="title truncate text-[17px]">{m.opponent}</div>
                    <div className="truncate text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                      {videoId ? m.competition || "Friendly" : "No footage yet"}
                    </div>
                  </div>
                  {videoId && (
                    <span aria-hidden style={{ color: "var(--color-ink-faint)" }}>
                      <ChevronIcon direction="right" size={14} />
                    </span>
                  )}
                </>
              );
              return (
                <li key={m.id}>
                  {videoId ? (
                    <Link href={`/m/watch/${videoId}`} className="fixture flex min-h-14 items-center gap-3 px-4 py-2">
                      {body}
                    </Link>
                  ) : (
                    <div className="fixture flex min-h-14 items-center gap-3 px-4 py-2 opacity-60">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <footer className="mt-12 flex items-center justify-between px-4 text-[14px]">
        {/* The full site still works on a phone; this is the way back to it. */}
        <Link href="/" style={{ color: "var(--color-ink-dim)" }} className="py-3">
          Full site
        </Link>
        <form action={signOut}>
          <input type="hidden" name="next" value="/m" />
          <button type="submit" className="py-3" style={{ color: "var(--color-ink-faint)" }}>
            Sign out
          </button>
        </form>
      </footer>
      <InstallHint />
    </div>
  );
}
