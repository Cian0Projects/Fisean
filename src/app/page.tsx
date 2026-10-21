import type { Metadata } from "next";
import Image from "next/image";
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
import type { GameCode } from "@/lib/hurling/codes";
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
import { RevealOnScroll } from "@/components/home/RevealOnScroll";
import { CodeHero } from "@/components/home/CodeHero";
import { homeJsonLd, jsonLdScript } from "@/lib/seo";

/* Title and description come from the root layout; only the canonical is the
   home page's own, so a link carrying ?utm_source= still counts for "/". */
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  const user = await currentUser();
  if (!user) return <PublicHomepage />;
  return <Dashboard />;
}

/*
 * The page a club sees before it has an account. It is set like the rest of
 * the list pages, as a club programme, and the footage screens sit in it as
 * pictures of the real app rather than illustrations of one.
 *
 * The copy is held to two rules. Every claim is something the app does today,
 * shown or named precisely, because vague promises are what make a landing
 * page read as generated. And it never suggests Ardawn tags or counts the
 * match by itself: a coach does the clipping and logs the stat sheet, and the
 * pitch is that this is quick, not that it is automatic.
 */
function PublicHomepage() {
  return (
    <div className="dark-room">
      <main className="min-h-screen overflow-x-clip bg-stage text-ink">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(homeJsonLd()) }}
        />
        <RevealOnScroll />
        <CodeHero />

        {/* What Ardawn is, in one glance before any scrolling: watching the
            match is the product, and the other three are what you do with it. */}
        <section className="sheet pb-14 sm:pb-20" aria-label="What Ardawn does">
          <dl className="grid border-t-[3px] border-rule sm:grid-cols-2 lg:grid-cols-4">
            <Feature name="Watch">Full matches in game time, on any phone or laptop.</Feature>
            <Feature name="Clip">Cut out the key plays and send them to the players involved.</Feature>
            <Feature name="Stats">Log the stat sheet and see it on a pitch map.</Feature>
            <Feature name="Drills">Draw a drill, play it back and share it as a video.</Feature>
          </dl>
        </section>

        <section className="sheet pb-8 pt-14 sm:pb-12 sm:pt-20" id="how-it-works">
          <h2 className="section-head title text-[15px]">A closer look</h2>
          <div className="divide-y divide-line">
            <ScreenRow
              name="Clipping"
              title="Clip the match."
              image="/home/clipping.jpg"
              alt="The review screen: the match playing, six tagged clips listed beside it, and a timeline of clips underneath."
            >
              Tag each clip with the player and what happened, then share it with the panel.
            </ScreenRow>

            <ScreenRow
              name="Stats"
              title="Keep the stats."
              image="/home/stats.jpg"
              alt="Logging stats against the video: six numbered stat buttons, a pitch with numbered player marks, and a lane for each stat along the timeline."
              flip
            >
              Log tackles, shots, turnovers and more, and see them on a pitch map.
            </ScreenRow>

            <ScreenRow
              name="Drills"
              title="Draw the drills."
              image="/home/drill-dark.jpg"
              alt="The drill board: three attackers and two defenders on a pitch, with steps, playback speed and an export button below."
            >
              Plan a drill on the pitch, play it back, and send it to the panel as a video.
            </ScreenRow>
          </div>
        </section>

        {/* Logging by voice (VoiceEntry.tsx). It works live in a match as well
            as on footage, and it is sold for what it is good for: speed, and
            fewer slips than typing fields. The copy still says what really
            happens, that the form fills in and the coach places the stat on
            the pitch and presses log. The fragment is drawn in HTML from what
            voice.ts makes of the phrase. */}
        <section id="voice" className="sheet scroll-mt-4 py-16 sm:py-24" aria-label="Logging by voice">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center lg:gap-20">
            <div data-reveal="">
              <h2 className="headline max-w-xl text-[clamp(2.7rem,5vw,4.4rem)]">
                Log stats by voice.
              </h2>
              <p className="measure mt-6 text-[17px] leading-relaxed text-ink-dim sm:text-[19px]">
                Quicker than typing, with fewer mistakes, live or on the footage.
              </p>
            </div>

            <figure data-reveal="" data-from="right" className="m-0 border border-line-strong bg-surface">
              <div className="p-6 sm:p-8">
                <p className="flex items-center gap-2.5 text-[14px] font-semibold text-ink-dim">
                  <span className="h-2.5 w-2.5 rounded-full bg-ash" aria-hidden />
                  Listening
                </p>
                <blockquote className="headline m-0 mt-4 text-[clamp(2.1rem,3.8vw,3.4rem)]">
                  &ldquo;Shot, ours, score, number 12.&rdquo;
                </blockquote>
              </div>
              <dl className="m-0 grid grid-cols-2 border-t border-line sm:grid-cols-4">
              <div className="border-b border-line p-5 sm:border-b-0 sm:p-6">
                <dt className="text-[13px] font-semibold text-ink-faint">Stat</dt>
                <dd className="headline mt-1 text-[27px]">Shot</dd>
              </div>
              <div className="border-b border-line p-5 sm:border-b-0 sm:p-6">
                <dt className="text-[13px] font-semibold text-ink-faint">Side</dt>
                <dd className="headline mt-1 text-[27px]">Ours</dd>
              </div>
              <div className="border-b border-line p-5 sm:border-b-0 sm:p-6">
                <dt className="text-[13px] font-semibold text-ink-faint">Result</dt>
                <dd className="headline mt-1 text-[27px]">Score</dd>
              </div>
              <div className="border-b border-line p-5 sm:border-b-0 sm:p-6">
                <dt className="text-[13px] font-semibold text-ink-faint">Player</dt>
                <dd className="headline mt-1 text-[27px]">12</dd>
              </div>
              </dl>
              <figcaption className="sr-only">
                A spoken stat and the four fields it fills in: shot, ours, score, player 12.
              </figcaption>
            </figure>
          </div>
        </section>

        <section id="questions">
          <div className="sheet grid gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-20">
            <h2 className="headline text-[clamp(2.7rem,5vw,4.4rem)]">Questions clubs ask</h2>
            <div className="border-t-[3px] border-rule">
              <Question q="What footage works?">
                Any match saved as an MP4. Upload it, or bring it in from Veo, Pixellot,
                Hudl, Spiideo, Google Drive or Dropbox.
              </Question>
              <Question q="Who can see our footage?">
                Only your club. It is stored in the EU, and removing a player ends their access at
                once.{" "}
                <a href="/privacy" className="font-semibold text-ink underline">
                  Where footage is kept and who can see it
                </a>
              </Question>
              <Question q="Do players need to install anything?">
                No. It works in the browser on any phone or laptop.
              </Question>
              <Question q="How do we get started?">
                Press Set up your club, upload a match, and send the panel your club&apos;s
                code. Need a sign-up code? Email{" "}
                <a href="mailto:hello@ardawnsport.ie" className="font-semibold text-ink underline">
                  hello@ardawnsport.ie
                </a>
                .
              </Question>
            </div>
          </div>
        </section>

        <section className="border-t border-line bg-surface">
          <div className="sheet flex flex-col gap-6 py-14 sm:flex-row sm:items-end sm:justify-between sm:py-16">
            <h2 className="headline max-w-xl text-[clamp(2.7rem,5vw,4.4rem)]">Bring your next match in.</h2>
            <div className="flex flex-col items-start gap-3 sm:items-end">
              <a href="/start" className="btn-brand px-5 py-3 text-[14px]">
                Set up your club
              </a>
              <p className="text-[14px] text-ink-dim">
                Got a code?{" "}
                <a href="/join" className="font-semibold text-ink underline">
                  Join your team
                </a>
              </p>
            </div>
          </div>
        </section>

        <footer className="border-t border-line">
          <div className="sheet flex flex-col gap-4 py-8 text-[13px] text-ink-faint sm:flex-row sm:items-center sm:justify-between">
            <span className="wordmark text-[18px]">Ardawn</span>
            <a href="mailto:hello@ardawnsport.ie" className="hover:text-ink">
              hello@ardawnsport.ie
            </a>
            <a href="/privacy" className="hover:text-ink">
              Privacy and footage
            </a>
            <a href="/login" className="font-semibold text-ink">Sign in to your team</a>
          </div>
        </footer>
      </main>
    </div>
  );
}

/*
 * One screen of the real app beside what it is for. The rows alternate sides
 * so the eye zigzags down the page instead of reading a column of cards, and
 * each one plays into place the first time it is scrolled to (see
 * RevealOnScroll), the screenshot sliding in from its own side.
 */
function ScreenRow({
  name,
  title,
  image,
  alt,
  flip = false,
  children,
}: {
  name: string;
  title: string;
  image: string;
  alt: string;
  flip?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`grid gap-8 py-12 sm:py-16 lg:items-center lg:gap-16 ${
        flip ? "lg:grid-cols-[minmax(0,8fr)_minmax(0,5fr)]" : "lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]"
      }`}
    >
      <div data-reveal="" className={flip ? "lg:order-2" : undefined}>
        <p className="text-[13px] font-semibold text-ink-faint">{name}</p>
        <h3 className="headline mt-2 text-[clamp(2.3rem,3.8vw,3.4rem)]">{title}</h3>
        <p className="mt-4 max-w-md text-[16px] leading-relaxed text-ink-dim sm:text-[17px]">{children}</p>
      </div>
      <Image
        src={image}
        alt={alt}
        width={1920}
        height={1080}
        sizes="(min-width: 1024px) 60vw, 100vw"
        data-reveal=""
        data-from={flip ? "left" : "right"}
        className={`block h-auto w-full border border-line-strong ${flip ? "lg:order-1" : ""}`}
      />
    </div>
  );
}

function Feature({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line py-5 sm:pr-8 lg:border-b-0">
      <dt className="headline text-[27px]">{name}</dt>
      <dd className="mt-1.5 text-[15px] leading-relaxed text-ink-dim">{children}</dd>
    </div>
  );
}

/*
 * A plain disclosure, so the answers are in the page for search engines and
 * screen readers and the list still scans as six questions.
 */
function Question({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group border-b border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[17px] font-semibold [&::-webkit-details-marker]:hidden">
        {q}
        <span className="text-[22px] font-normal leading-none text-ink-faint transition-transform group-open:rotate-45" aria-hidden>
          +
        </span>
      </summary>
      <p className="measure pb-6 text-[15px] leading-relaxed text-ink-dim">{children}</p>
    </details>
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
            code={user.teamCode}
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
  code,
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
  code: GameCode;
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
            code={code}
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
  code,
  isCoach,
}: {
  matchId: string;
  opponent: string;
  ours: SideShooting | null;
  theirs: SideShooting | null;
  shotMarks: PitchMark[];
  /** The club's code, so a football shot map shows its arc. */
  code: GameCode;
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
              <PitchMap marks={shotMarks} caption="Our shots" code={code} />
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
