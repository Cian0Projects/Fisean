import Link from "next/link";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
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
import { currentUser } from "@/lib/auth/session";
import { requireUser } from "@/lib/auth/guard";
import { Nav } from "@/components/ui/Nav";
import { formatClock, formatScore } from "@/lib/hurling/notation";
import {
  matchResult,
  shotSide,
  statColour,
  statShape,
  summariseShooting,
  type MatchResult,
  type SideShooting,
  type StatEntry,
} from "@/lib/hurling/stats";
import { ShootingFigure } from "@/components/stats/ShootingFigure";
import { matchDate, matchDateLong } from "@/lib/format";
import { footageFrame, previewClip, previewWindow } from "@/lib/hurling/clip-rules";
import { store } from "@/lib/storage";
import { MatchPreview, type PreviewSource } from "@/components/matches/MatchPreview";
import { PitchMap, type PitchMark } from "@/components/pitch/PitchMap";
import { ResultBox, verdict, verdictColour } from "@/components/matches/ResultBox";
import { PromoVideo } from "@/components/home/PromoVideo";

export default async function Home() {
  const user = await currentUser();
  if (!user) return <PublicHomepage />;
  return <Dashboard />;
}

function PublicHomepage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[var(--ardawn-night)] text-[var(--ardawn-paper)]">
      <header className="border-b" style={{ borderColor: "rgba(240, 238, 231, 0.14)" }}>
        <div className="sheet flex items-center justify-between py-4">
          <Link href="/" className="flex items-center gap-3" aria-label="Ardawn home">
            <ArdawnMark className="h-7 w-7" />
            <span className="wordmark text-[25px] leading-none text-[var(--ardawn-paper)]">Ardawn</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-5" aria-label="Main navigation">
            <a href="#how-it-works" className="hidden text-[13px] font-semibold text-[var(--ardawn-paper)]/65 sm:inline">
              How it works
            </a>
            <a href="#the-difference" className="hidden text-[13px] font-semibold text-[var(--ardawn-paper)]/65 sm:inline">
              Why Ardawn
            </a>
            <a href="/login" className="ardawn-outline">
              Sign in
            </a>
          </nav>
        </div>
      </header>

      <section className="sheet grid gap-12 pb-16 pt-14 sm:pb-24 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(25rem,0.88fr)] lg:items-center lg:gap-20 lg:pt-28">
        <div>
          <p className="mb-5 flex items-center gap-3 text-[12px] font-semibold tracking-[0.08em] text-[var(--color-ash)]">
            <span className="h-[3px] w-8 bg-[var(--ardawn-green)]" />
            GAA video review, clipping, stats and drills
          </p>
          <h1 className="display max-w-3xl text-[clamp(3.25rem,8vw,7.4rem)]">
            Turn match day into your next advantage.
          </h1>
          <p className="measure mt-7 text-[17px] leading-relaxed text-[var(--ardawn-paper)]/70 sm:text-[19px]">
            Ardawn gives your club one calm place to watch the match back, mark
            the moments that matter, and bring a better question to training.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="/join" className="ardawn-primary px-5 py-3 text-[14px]">
              Join your team
            </a>
            <a href="/start" className="ardawn-outline px-4 py-3 text-[14px]">
              Set up your club
            </a>
            <a href="#how-it-works" className="ardawn-ghost px-4 py-3 text-[14px]">
              See how it works <span aria-hidden>↓</span>
            </a>
          </div>
          <p className="mt-7 text-[12px] text-[var(--color-ink-faint)]">
            Private to your squad. Built for the way GAA is actually reviewed.
          </p>
        </div>

        <BrandBanner />
      </section>

      <section className="border-y border-white/10 bg-[#0d1712]" id="the-difference">
        <div className="sheet grid divide-y lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          <div className="py-7 lg:pr-10">
            <p className="figure text-[2.7rem] text-[var(--ardawn-green)]">01</p>
            <h2 className="title mt-3 text-[20px]">See the whole match</h2>
            <p className="mt-2 text-[14px] text-[var(--ardawn-paper)]/65">
              Keep the footage, fixture and scoreline together. No hunting through camera rolls.
            </p>
          </div>
          <div className="py-7 lg:px-10">
            <p className="figure text-[2.7rem] text-[var(--ardawn-green)]">02</p>
            <h2 className="title mt-3 text-[20px]">Keep the moments</h2>
            <p className="mt-2 text-[14px] text-[var(--ardawn-paper)]/65">
              Clip a delivery, a turnover or a score in seconds. Add context while it is fresh.
            </p>
          </div>
          <div className="py-7 lg:pl-10">
            <p className="figure text-[2.7rem] text-[var(--ardawn-green)]">03</p>
            <h2 className="title mt-3 text-[20px]">Share the lesson</h2>
            <p className="mt-2 text-[14px] text-[var(--ardawn-paper)]/65">
              Build playlists for the panel, then arrive at training ready to work on the detail.
            </p>
          </div>
        </div>
      </section>

      <section className="sheet py-20 sm:py-28" id="how-it-works">
        <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-24">
          <div>
            <p className="mb-3 text-[12px] font-semibold tracking-[0.08em] text-[var(--ardawn-green)]">The match desk</p>
            <h2 className="display max-w-lg text-[clamp(2.6rem,5vw,4.7rem)]">
              From raw footage to a useful conversation.
            </h2>
          </div>
          <div className="grid gap-0 border-t-[3px] border-[var(--ardawn-paper)]">
            <LandingStep number="01" title="Upload once" copy="Your match footage belongs to the club, alongside its fixture and stat sheet." />
            <LandingStep number="02" title="Mark what matters" copy="Use the timeline to cut clips, tag players and draw the shape of the play." />
            <LandingStep number="03" title="Give the panel a path" copy="Send a playlist to the team so review becomes shared language, not another chore." />
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10">
        <div className="sheet flex flex-col gap-4 py-8 text-[13px] text-[var(--ardawn-paper)]/50 sm:flex-row sm:items-center sm:justify-between">
          <span className="wordmark text-[18px] text-[var(--ardawn-paper)]">Ardawn</span>
          <span>Match footage, made useful.</span>
          <a href="/login" className="font-semibold text-[var(--ardawn-paper)]">Sign in to your team</a>
        </div>
      </footer>
    </main>
  );
}

function BrandBanner() {
  return (
    <div className="relative overflow-hidden border border-white/10 bg-[var(--ardawn-night)]">
      <PromoVideo src="/Ardawn_Promo.mp4" />
    </div>
  );
}

function ArdawnMark({ className = "" }: { className?: string }) {
  return (
    <span className={`relative inline-block shrink-0 ${className}`} aria-hidden>
      <span className="absolute inset-x-0 top-0 h-full border-x-[0.18em] border-[var(--ardawn-paper)]" />
      <span className="absolute inset-x-0 top-[53%] h-[0.18em] bg-[var(--ardawn-paper)]" />
      <span className="absolute inset-x-[0.18em] bottom-0 h-[47%] bg-[var(--ardawn-green)]" />
    </span>
  );
}

function LandingStep({ number, title, copy }: { number: string; title: string; copy: string }) {
  return (
    <div className="grid grid-cols-[3.5rem_1fr] gap-4 border-b border-[var(--color-line)] py-6 sm:grid-cols-[4.5rem_1fr] sm:gap-7">
      <span className="jersey h-8 w-8">{number}</span>
      <div>
        <h3 className="title text-[20px]">{title}</h3>
        <p className="mt-1 max-w-xl text-[14px] text-[var(--color-ink-dim)]">{copy}</p>
      </div>
    </div>
  );
}

async function Dashboard() {
  const user = await requireUser();

  /**
   * The match whose footage arrived last leads, because a new video is what
   * everyone came to look at — even when it is of a game played a fortnight
   * ago. Only finished uploads count, so a file stopped part-way never takes
   * the cover. With no footage at all, the last match played leads instead.
   * Below it the season runs as a fixture list in date order, and beside that
   * a rail of ways back into moments already picked out.
   */
  const [lastUpload] = await db
    .select({ matchId: videos.matchId, videoId: videos.id, createdAt: videos.createdAt })
    .from(videos)
    .innerJoin(matches, eq(matches.id, videos.matchId))
    .where(and(eq(videos.teamId, user.teamId), eq(videos.status, "ready")))
    .orderBy(desc(videos.createdAt))
    .limit(1);

  const season = await db
    .select()
    .from(matches)
    .where(eq(matches.teamId, user.teamId))
    .orderBy(desc(matches.playedOn))
    .limit(20);

  // The lead may be older than the twenty listed; fetch it so it still leads.
  const leadRow =
    season.find((m) => m.id === lastUpload?.matchId) ??
    (lastUpload?.matchId
      ? (await db.select().from(matches).where(eq(matches.id, lastUpload.matchId)).limit(1))[0]
      : undefined) ??
    season[0];
  const matchRows = leadRow ? [leadRow, ...season.filter((m) => m.id !== leadRow.id)] : season;

  const ids = matchRows.map((m) => m.id);

  const videoRows = ids.length
    ? await db.select().from(videos).where(inArray(videos.matchId, ids))
    : [];

  // Every stat on every listed sheet, in one pass: the counts per match and
  // each fixture's scoreline both come out of it, and a season of sheets is a
  // few thousand small rows at most.
  const statRows = ids.length
    ? await db
        .select({
          id: matchStats.id,
          matchId: matchStats.matchId,
          statType: matchStats.statType,
          outcome: matchStats.outcome,
          shotResult: matchStats.shotResult,
          // From play or a placed ball, and what led to it, for the cover's
          // shooting panel — the same split the stat sheet makes.
          shotKind: matchStats.shotKind,
          attemptSource: matchStats.attemptSource,
          // Their shots are on the sheet too, and must not count as ours.
          side: matchStats.side,
          // Where each was struck from, for the cover's shot map.
          originX: matchStats.originX,
          originY: matchStats.originY,
          playerNumber: matchStats.playerNumber,
        })
        .from(matchStats)
        .where(inArray(matchStats.matchId, ids))
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
  const statsByMatch = new Map<string, StatEntry[]>();
  for (const s of statRows) {
    statsByMatch.set(s.matchId, [...(statsByMatch.get(s.matchId) ?? []), s as StatEntry & { id: string }]);
  }
  const clipsByMatch = new Map(clipCounts.map((r) => [r.matchId ?? "", Number(r.n)]));

  // Each match's picture: one of its first few team clips, played from
  // footage that is ready to serve. A private clip is somebody's own notes,
  // so it never becomes the face of a match.
  const previewRows = ids.length
    ? await db
        .select({
          clipId: clips.id,
          videoId: clips.videoId,
          title: clips.title,
          startMs: clips.startMs,
          endMs: clips.endMs,
          matchId: videos.matchId,
          storageKey: videos.storageKey,
        })
        .from(clips)
        .innerJoin(videos, eq(videos.id, clips.videoId))
        .where(
          and(
            inArray(videos.matchId, ids),
            eq(clips.visibility, "team"),
            eq(videos.status, "ready"),
          ),
        )
    : [];

  const media = await store();
  const previewCandidates = new Map<string, typeof previewRows>();
  for (const r of previewRows) {
    if (!r.matchId) continue;
    previewCandidates.set(r.matchId, [...(previewCandidates.get(r.matchId) ?? []), r]);
  }
  const previews = new Map<string, PreviewSource>();
  for (const [matchId, candidates] of previewCandidates) {
    const pick = previewClip(candidates);
    if (!pick) continue;
    previews.set(matchId, {
      clipId: pick.clipId,
      videoId: pick.videoId,
      src: media.readUrl(pick.storageKey),
      title: pick.title,
      ...previewWindow(pick),
    });
  }
  // A match nobody has clipped yet still gets a picture: a frame from its own
  // footage, the same one each visit.
  for (const id of ids) {
    if (previews.has(id)) continue;
    const footage = (videosByMatch.get(id) ?? []).find((v) => v.status === "ready" && v.durationMs > 0);
    if (!footage) continue;
    previews.set(id, {
      clipId: null,
      videoId: footage.id,
      src: media.readUrl(footage.storageKey),
      title: "",
      ...footageFrame(footage.id, footage.durationMs),
    });
  }

  const myClipRows = await db
    .select({
      id: clips.id,
      videoId: clips.videoId,
      title: clips.title,
      startMs: clips.startMs,
      opponent: matches.opponent,
    })
    .from(clipPlayers)
    .innerJoin(clips, eq(clips.id, clipPlayers.clipId))
    .innerJoin(videos, eq(videos.id, clips.videoId))
    .leftJoin(matches, eq(matches.id, videos.matchId))
    .where(eq(clipPlayers.userId, user.id))
    .orderBy(desc(clips.createdAt))
    .limit(8);

  // What the rest of the panel has been cutting. Team clips only — a private
  // clip is somebody's own notes.
  const recentClipRows = await db
    .select({
      id: clips.id,
      videoId: clips.videoId,
      title: clips.title,
      startMs: clips.startMs,
      opponent: matches.opponent,
    })
    .from(clips)
    .innerJoin(videos, eq(videos.id, clips.videoId))
    .leftJoin(matches, eq(matches.id, videos.matchId))
    .where(and(eq(clips.teamId, user.teamId), eq(clips.visibility, "team")))
    .orderBy(desc(clips.createdAt))
    .limit(6);

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

  const isCoach = user.role !== "player";

  // A coach's own playlists and how many of the panel have opened each: the
  // follow-up a selector actually does before Tuesday training.
  const published = isCoach
    ? await db
        .select({
          id: playlists.id,
          title: playlists.title,
          assigned: sql<number>`count(${playlistViewers.userId})`,
          watched: sql<number>`count(${playlistViewers.viewedAt})`,
        })
        .from(playlists)
        .leftJoin(playlistViewers, eq(playlistViewers.playlistId, playlists.id))
        .where(and(eq(playlists.teamId, user.teamId), eq(playlists.createdBy, user.id)))
        .groupBy(playlists.id)
        .orderBy(desc(playlists.createdAt))
        .limit(5)
    : [];

  const [latest, ...earlier] = matchRows;
  const latestStats = latest ? (statsByMatch.get(latest.id) ?? []) : [];
  const hasRail =
    myClipRows.length + recentClipRows.length + assigned.length + published.length > 0;

  return (
    <>
      <Nav user={user} />

      <main className="sheet pb-20">
        {latest ? (
          <LeadMatch
            match={latest}
            teamName={user.teamName}
            footage={videosByMatch.get(latest.id) ?? []}
            upload={lastUpload?.matchId === latest.id ? lastUpload : null}
            clipCount={clipsByMatch.get(latest.id) ?? 0}
            preview={previews.get(latest.id) ?? null}
            result={matchResult(latestStats)}
            ours={latestStats.length ? summariseShooting(latestStats, "us") : null}
            theirs={latestStats.length ? summariseShooting(latestStats, "opposition") : null}
            shotMarks={shotMarks(latestStats)}
            statCount={latestStats.length}
            isCoach={isCoach}
          />
        ) : (
          <section className="py-16">
            <h1 className="display text-5xl">No matches yet</h1>
            <p className="measure mt-4 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
              {isCoach
                ? "Upload a match video and it appears here, ready for the panel to watch."
                : "When a coach uploads a match, it appears here."}
            </p>
            {isCoach && (
              <Link href="/admin" className="btn-primary mt-6">
                Upload a match
              </Link>
            )}
          </section>
        )}

        {/* The rail only earns its column when there is something in it. */}
        <div
          className={`mt-14 grid gap-x-14 gap-y-14 ${
            hasRail ? "lg:grid-cols-[minmax(0,1fr)_22rem]" : ""
          }`}
        >
          <section>
            <div className="section-head flex items-baseline justify-between gap-4">
              <h2 className="title text-xl">Other matches</h2>
              {isCoach && (
                <Link
                  href="/admin"
                  className="text-[13px] font-semibold underline"
                  style={{ color: "var(--color-ash)" }}
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
              <table className="mt-3 w-full border-collapse text-left">
                <thead>
                  <tr className="caption border-b" style={{ borderColor: "var(--color-line)" }}>
                    <th className="hidden w-24 py-2 pr-3 font-medium sm:table-cell">Date</th>
                    <th className="py-2 pr-3 font-medium">Opponent</th>
                    <th className="py-2 pr-3 font-medium">Result</th>
                    <th className="hidden py-2 pr-3 text-right font-medium md:table-cell">Clips</th>
                    <th className="hidden py-2 pr-3 text-right font-medium md:table-cell">Logged</th>
                    <th className="py-2">
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {earlier.map((m) => {
                    const vids = videosByMatch.get(m.id) ?? [];
                    const ready = vids.find((v) => v.status === "ready");
                    const stats = statsByMatch.get(m.id) ?? [];
                    const clipN = clipsByMatch.get(m.id) ?? 0;
                    return (
                      <tr key={m.id} className="fixture align-top" data-preview-host>
                        <td
                          className="tabular hidden whitespace-nowrap py-3.5 pr-3 text-[13px] sm:table-cell"
                          style={{ color: "var(--color-ink-faint)" }}
                        >
                          {matchDate(m.playedOn)}
                        </td>
                        <td className="py-3 pr-3">
                          <div className="flex items-start gap-3 sm:gap-4">
                            <MatchPreview
                              preview={previews.get(m.id) ?? null}
                              size="row"
                              empty={
                                vids.some((v) => v.status === "uploading")
                                  ? "Video uploading"
                                  : vids.length
                                    ? "No clips yet"
                                    : "No footage"
                              }
                            />
                            <div className="min-w-0">
                              <div className="title text-[17px]">{m.opponent}</div>
                              <div className="caption mt-0.5">
                                <span className="sm:hidden">{matchDate(m.playedOn)}, </span>
                                {[m.competition, m.venue].filter(Boolean).join(" at ") ||
                                  "Friendly"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-3">
                          <ResultLine result={matchResult(stats)} />
                        </td>
                        <Count n={clipN} />
                        <Count n={stats.length} />
                        <td className="py-2.5">
                          <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end">
                            {ready && (
                              <Link href={`/review/${ready.id}`} className="btn-ghost text-xs">
                                Watch
                              </Link>
                            )}
                            <Link href={`/matches/${m.id}/stats`} className="btn-ghost text-xs">
                              Stat sheet
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          {hasRail && (
            <aside className="space-y-12">
              {published.length > 0 && (
                <RailSection title="Your playlists">
                  {published.map((p) => {
                    const assignedTo = Number(p.assigned);
                    const watched = Number(p.watched);
                    return (
                      <li key={p.id}>
                        <Link href={`/playlists/${p.id}`} className="fixture block py-3">
                          <div className="truncate text-[14px] font-semibold">{p.title}</div>
                          {assignedTo > 0 ? (
                            <div className="mt-1.5 flex items-center gap-2.5">
                              <div className="meter w-20 shrink-0" aria-hidden>
                                {watched > 0 && (
                                  <span
                                    style={{
                                      width: `${(watched / assignedTo) * 100}%`,
                                      background: "var(--color-ash)",
                                    }}
                                  />
                                )}
                              </div>
                              <span className="caption tabular">
                                Watched by {watched} of {assignedTo}
                              </span>
                            </div>
                          ) : (
                            <div className="caption">Not set for anyone yet</div>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </RailSection>
              )}

              {assigned.length > 0 && (
                <RailSection title="Set for you to watch">
                  {assigned.map((p) => (
                    <li key={p.id}>
                      <Link href={`/playlists/${p.id}`} className="fixture flex gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px] font-semibold">{p.title}</div>
                          {p.description && (
                            <div className="caption truncate">{p.description}</div>
                          )}
                        </div>
                        {!p.viewedAt && (
                          <span
                            className="mt-0.5 shrink-0 text-[12px] font-semibold"
                            style={{ color: "var(--color-ash)" }}
                          >
                            Not watched
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </RailSection>
              )}

              {myClipRows.length > 0 && (
                <RailSection title="Clips you are in">
                  {myClipRows.map((c) => (
                    <ClipItem key={c.id} clip={c} />
                  ))}
                </RailSection>
              )}

              {recentClipRows.length > 0 && (
                <RailSection title="Recently clipped">
                  {recentClipRows.map((c) => (
                    <ClipItem key={c.id} clip={c} />
                  ))}
                </RailSection>
              )}
            </aside>
          )}
        </div>
      </main>
    </>
  );
}

/**
 * The lead match: the newest footage, shown big.
 *
 * The picture is the largest thing on the page, because the video is what
 * people open the app for. The fixture sits over it as a line — our club, a
 * light "v", theirs — at heading size, not poster size: set huge on its own,
 * the opponent's name read as if it were the club that owns the account.
 * Beside the picture, the result and how well we took our chances, which is
 * the conversation after any match; the full stat sheet is a click away.
 */
function LeadMatch({
  match,
  teamName,
  footage,
  upload,
  clipCount,
  preview,
  result,
  ours,
  theirs,
  shotMarks,
  statCount,
  isCoach,
}: {
  match: typeof matches.$inferSelect;
  teamName: string;
  footage: (typeof videos.$inferSelect)[];
  /** The upload that put this match on the cover, when that is why it leads. */
  upload: { videoId: string; createdAt: number } | null;
  clipCount: number;
  preview: PreviewSource | null;
  result: MatchResult | null;
  ours: SideShooting | null;
  theirs: SideShooting | null;
  shotMarks: PitchMark[];
  statCount: number;
  isCoach: boolean;
}) {
  // Watch the file that was just added, not whichever angle happens to be first.
  const ready =
    footage.find((v) => v.id === upload?.videoId) ?? footage.find((v) => v.status === "ready");
  const arriving = !ready && footage.some((v) => v.status === "uploading");
  const where = [match.competition, match.venue].filter(Boolean).join(" at ") || "Friendly";
  const ground = match.homeAway === "home" ? ", at home" : match.homeAway === "away" ? ", away" : "";

  return (
    <section className="pt-8 lg:pt-12" aria-labelledby="lead-fixture">
      <header className="max-w-4xl">
        <h1
          id="lead-fixture"
          className="title text-[clamp(1.65rem,3.4vw,2.4rem)] leading-[1.1]"
          style={{ textWrap: "balance" }}
        >
          {teamName}{" "}
          <span className="font-normal" style={{ color: "var(--color-ink-faint)" }}>
            v
          </span>{" "}
          {match.opponent}
        </h1>
        <p className="mt-2 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
          {where}, {matchDateLong(match.playedOn)}
          {ground}.
        </p>
        {/* Why this match leads, and what it holds, said in a line. */}
        <p className="tabular mt-1 text-[14px]" style={{ color: "var(--color-ink-faint)" }}>
          {upload && <>Video added {matchDateLong(new Date(upload.createdAt).toISOString().slice(0, 10))}. </>}
          {sentence([
            footage.length ? count(footage.length, "camera angle", "camera angles") : "no footage yet",
            count(clipCount, "clip", "clips"),
            count(statCount, "stat logged", "stats logged"),
          ])}
        </p>
      </header>

      <div className="mt-6 grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div>
          <MatchPreview
            preview={preview}
            size="lead"
            empty=""
            fallback={<NoPicture arriving={arriving} isCoach={isCoach} />}
          />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {ready && (
              <Link href={`/review/${ready.id}`} className="btn-primary px-4 py-2.5 text-[14px]">
                Watch the match
                <span className="tabular font-normal opacity-80">{formatClock(ready.durationMs)}</span>
              </Link>
            )}
            <Link href={`/matches/${match.id}/stats`} className="btn-outline px-4 py-2.5 text-[14px]">
              Stat sheet
            </Link>
            {isCoach && (
              <Link href={`/matches/${match.id}/stats/log`} className="btn-ghost px-4 py-2.5 text-[14px]">
                Log stats
              </Link>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-8">
          {result ? (
            <ResultBox result={result} teamName={teamName} opponent={match.opponent} />
          ) : (
            // Held open rather than left out, so the cover keeps its shape from
            // one match to the next, and says where the scoreline will appear.
            <div
              className="border-[1.5px] border-dashed px-4 py-4"
              style={{ borderColor: "var(--color-line-strong)" }}
            >
              <p className="text-[14px] font-semibold">No result yet</p>
              <p className="caption mt-1">
                The scoreline is worked out from the shots on the stat sheet, once
                they are logged.
              </p>
            </div>
          )}

          <ShootingPanel
            matchId={match.id}
            opponent={match.opponent}
            ours={ours}
            theirs={theirs}
            shotMarks={shotMarks}
            isCoach={isCoach}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * The picture's place when there is no picture: the same 16:9, so the cover
 * keeps its shape, saying what will fill it and how.
 */
function NoPicture({ arriving, isCoach }: { arriving: boolean; isCoach: boolean }) {
  return (
    <div
      className="flex aspect-video w-full flex-col items-center justify-center gap-3 border-[1.5px] border-dashed px-6 text-center"
      style={{ borderColor: "var(--color-line-strong)", borderRadius: 2 }}
    >
      <p className="text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
        {arriving
          ? "The video is still uploading. It appears here once it has all arrived."
          : "No video for this match yet."}
      </p>
      {isCoach && !arriving && (
        <Link href="/admin" className="btn-outline text-[13px]">
          Upload the video
        </Link>
      )}
    </div>
  );
}

/**
 * How well we took our chances — the stat sheet's own shooting figure, set
 * the same way — with theirs beside it for comparison and the map of where
 * ours came from. The rest of the shooting breakdown is on the sheet, which
 * the link opens at that section.
 */
function ShootingPanel({
  matchId,
  opponent,
  ours,
  theirs,
  shotMarks,
  isCoach,
}: {
  matchId: string;
  opponent: string;
  ours: SideShooting | null;
  theirs: SideShooting | null;
  shotMarks: PitchMark[];
  isCoach: boolean;
}) {
  const logged = ours !== null && ours.overall.total > 0;

  return (
    <section className="section-head" aria-labelledby="lead-shooting">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="lead-shooting" className="title text-[16px]">
          Shooting
        </h2>
        {logged && (
          <Link
            href={`/matches/${matchId}/stats#shooting`}
            className="text-[13px] font-semibold underline"
            style={{ color: "var(--color-ash)" }}
          >
            Full shooting stats
          </Link>
        )}
      </div>

      {logged ? (
        <div className="mt-3">
          <ShootingFigure s={ours} ours />
          {theirs && theirs.overall.total > 0 && (
            <p className="tabular mt-3 text-[13px]" style={{ color: "var(--color-ink-dim)" }}>
              {opponent} scored {theirs.overall.label}.
            </p>
          )}
          {shotMarks.length > 0 && (
            <figure className="m-0 mt-5">
              <PitchMap marks={shotMarks} caption="Our shots" />
              <figcaption className="caption mt-1.5">
                Where our shots came from. Filled ones scored.
              </figcaption>
            </figure>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[14px]" style={{ color: "var(--color-ink-faint)" }}>
          No shots logged for this match yet.
          {isCoach && (
            <>
              {" "}
              <Link
                href={`/matches/${matchId}/stats/log`}
                className="font-semibold underline"
                style={{ color: "var(--color-ash)" }}
              >
                Log stats
              </Link>
            </>
          )}
        </p>
      )}
    </section>
  );
}

/** Our shots that were placed on the pitch, as the stat sheet draws them. */
function shotMarks(rows: StatEntry[]): PitchMark[] {
  return (rows as (StatEntry & { id: string })[])
    .filter((r) => r.statType === "shot" && shotSide(r) === "us" && r.originX != null && r.originY != null)
    .map((r) => ({
      id: r.id,
      x: r.originX!,
      y: r.originY!,
      colour: statColour(r),
      shape: statShape(r),
      label: r.playerNumber != null ? String(r.playerNumber) : null,
    }));
}

/** A fixture's scoreline on one line, with the verdict beside it. */
function ResultLine({ result }: { result: MatchResult | null }) {
  if (!result) {
    return (
      <span className="text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
        No sheet
      </span>
    );
  }
  return (
    <div>
      <div className="tabular text-[15px] font-bold">
        {formatScore(result.us)}
        {result.them && (
          <>
            <span className="mx-1.5 font-normal" style={{ color: "var(--color-ink-faint)" }}>
              to
            </span>
            {formatScore(result.them)}
          </>
        )}
      </div>
      {result.margin != null && (
        <div className="text-[12px] font-semibold" style={{ color: verdictColour(result.margin) }}>
          {verdict(result.margin)}
        </div>
      )}
    </div>
  );
}

function Count({ n }: { n: number }) {
  return (
    <td
      className="tabular hidden py-3.5 pr-3 text-right text-[14px] md:table-cell"
      style={{ color: n ? "var(--color-ink)" : "var(--color-ink-faint)" }}
    >
      {n}
    </td>
  );
}

/** "1 clip", "3 clips" — never "1 clips". */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "a, b and c." with the first letter raised: a line of prose, not a list. */
function sentence(parts: string[]): string {
  const text =
    parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="section-head title text-base">{title}</h2>
      <ul className="mt-1">{children}</ul>
    </section>
  );
}

function ClipItem({
  clip,
}: {
  clip: { id: string; videoId: string; title: string; startMs: number; opponent: string | null };
}) {
  return (
    <li>
      <Link
        href={`/review/${clip.videoId}?clip=${clip.id}`}
        className="fixture flex items-baseline gap-3 py-2.5"
      >
        <span
          className="tabular w-12 shrink-0 text-[12px] font-semibold"
          style={{ color: "var(--color-ash)" }}
        >
          {formatClock(clip.startMs)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px]">{clip.title || "Untitled clip"}</span>
          <span className="caption block truncate">{clip.opponent ?? "Training"}</span>
        </span>
      </Link>
    </li>
  );
}
