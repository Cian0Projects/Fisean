import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  clipPlayers,
  clips,
  matches,
  playlistViewers,
  playlists,
  videos,
} from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/guard";
import { Nav } from "@/components/ui/Nav";
import { formatClock } from "@/lib/hurling/notation";

export default async function Dashboard() {
  const user = await requireUser();

  /**
   * A player's own clips come first, deliberately.
   *
   * Opening Físeán and landing on "your 6 clips from Sunday" rather than a
   * list of match files is what gets forty players actually using it — and it
   * is also what keeps the bandwidth sane, because a player watches five
   * minutes of clips instead of ninety minutes of match.
   */
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
    .limit(12);

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

  const matchRows = await db
    .select()
    .from(matches)
    .where(eq(matches.teamId, user.teamId))
    .orderBy(desc(matches.playedOn))
    .limit(20);

  const videoRows = matchRows.length
    ? await db
        .select()
        .from(videos)
        .where(
          inArray(
            videos.matchId,
            matchRows.map((m) => m.id),
          ),
        )
    : [];

  const videosByMatch = new Map<string, typeof videoRows>();
  for (const v of videoRows) {
    if (!v.matchId) continue;
    videosByMatch.set(v.matchId, [...(videosByMatch.get(v.matchId) ?? []), v]);
  }

  return (
    <>
      <Nav user={user} />

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-8">
        {myClipRows.length > 0 && (
          <section>
            <h2 className="mb-1 text-lg font-semibold">Your clips</h2>
            <p className="mb-4 text-[13px]" style={{ color: "var(--color-ink-dim)" }}>
              Clips the coaches have you marked in.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {myClipRows.map((c) => (
                <Link
                  key={c.id}
                  href={`/review/${c.videoId}?clip=${c.id}`}
                  className="card p-3 transition-colors hover:border-[var(--color-line-strong)]"
                >
                  <div className="text-[13px] font-medium">
                    {c.title || "Untitled clip"}
                  </div>
                  <div
                    className="tabular mt-1 text-[11px]"
                    style={{ color: "var(--color-ink-faint)" }}
                  >
                    {c.opponent ?? "Training"} · {formatClock(c.startMs)} ·{" "}
                    {((c.endMs - c.startMs) / 1000).toFixed(0)}s
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {assigned.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold">Assigned to you</h2>
            <div className="space-y-2">
              {assigned.map((p) => (
                <Link
                  key={p.id}
                  href={`/playlists/${p.id}`}
                  className="card flex items-center gap-3 p-3 transition-colors hover:border-[var(--color-line-strong)]"
                >
                  <div className="flex-1">
                    <div className="text-sm font-medium">{p.title}</div>
                    {p.description && (
                      <div className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                        {p.description}
                      </div>
                    )}
                  </div>
                  {!p.viewedAt && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                      style={{ background: "var(--color-brand-dim)", color: "white" }}
                    >
                      New
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Matches</h2>
            {user.role !== "player" && (
              <Link href="/admin" className="btn-outline text-xs">
                Add a match
              </Link>
            )}
          </div>

          {matchRows.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-sm" style={{ color: "var(--color-ink-dim)" }}>
                No matches yet.
              </p>
              <p className="mt-2 text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
                Add one from the admin page, then drop the match file into{" "}
                <code>data/media/</code> and run{" "}
                <code>npm run ingest -- &lt;file&gt;</code>.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {matchRows.map((m) => {
                const vids = videosByMatch.get(m.id) ?? [];
                return (
                  <div key={m.id} className="card p-4">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h3 className="font-medium">{m.opponent}</h3>
                      <span className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                        {m.playedOn}
                        {m.competition && ` · ${m.competition}`}
                        {m.venue && ` · ${m.venue}`}
                      </span>
                    </div>

                    {vids.length === 0 ? (
                      <p className="mt-2 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                        No footage attached yet.
                      </p>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {vids.map((v) => (
                          <Link
                            key={v.id}
                            href={`/review/${v.id}`}
                            className="btn-outline text-xs"
                            aria-disabled={v.status !== "ready"}
                          >
                            {v.status === "ready" ? "Review" : v.status}
                            <span className="tabular opacity-60">
                              {formatClock(v.durationMs)}
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
