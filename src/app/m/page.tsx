import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clipPlayers, clips, matches, videos } from "@/lib/db/schema";
import { requireUserFor } from "@/lib/auth/guard";
import { signOut } from "@/lib/actions/auth";
import { Mark } from "@/components/ui/Mark";
import { formatClock } from "@/lib/hurling/notation";
import { matchDate, matchDateLong } from "@/lib/format";
import { ChevronIcon } from "@/components/ui/Icon";

/**
 * The phone's front page.
 *
 * Two things only, because on a phone there is room for two: the matches,
 * newest first, and the clips you are in. Every row is the whole width and
 * at least 56 px tall, so it is one thumb tap with a glove half on. The stat
 * sheet is left to the desktop — it is a coach's tool, read at a table.
 */
export default async function PhoneHome() {
  const user = await requireUserFor("/m");

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
    .where(eq(clipPlayers.userId, user.id))
    .orderBy(desc(clips.createdAt))
    .limit(10);

  const [latest, ...earlier] = matchRows;
  const latestVideo = latest ? watchable.get(latest.id) : undefined;

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
        <span className="wordmark -ml-0.5 text-[24px]">Físeán</span>
        <span className="truncate text-[13px]" style={{ color: "var(--color-ink-dim)" }}>
          {user.teamName}
        </span>
      </header>

      {latest ? (
        <section className="px-4 pt-4">
          <div className="text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
            {matchDateLong(latest.playedOn)}
          </div>
          <h1 className="display mt-1 text-[44px]">{latest.opponent}</h1>
          <div className="mt-1 text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
            {[latest.competition, latest.venue].filter(Boolean).join(" at ") || "Friendly"}
          </div>
          {latestVideo ? (
            <Link href={`/m/watch/${latestVideo}`} className="btn-primary mt-5 min-h-12 w-full text-[16px]">
              Watch the match
            </Link>
          ) : (
            <p className="mt-5 text-[14px]" style={{ color: "var(--color-ink-faint)" }}>
              The footage is not up yet.
            </p>
          )}
        </section>
      ) : (
        <section className="px-4 pt-6">
          <h1 className="display text-[36px]">No matches yet</h1>
          <p className="mt-2 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
            Once a coach adds a match and its footage, it will be here.
          </p>
        </section>
      )}

      {myClips.length > 0 && (
        <section className="mt-10">
          <h2 className="title border-b px-4 pb-2 text-lg" style={{ borderColor: "var(--color-line-strong)" }}>
            Clips you are in
          </h2>
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
                    {Math.round((c.endMs - c.startMs) / 1000)}s
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {earlier.length > 0 && (
        <section className="mt-10">
          <h2 className="title border-b px-4 pb-2 text-lg" style={{ borderColor: "var(--color-line-strong)" }}>
            Earlier matches
          </h2>
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
    </div>
  );
}
