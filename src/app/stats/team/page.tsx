import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import { isCoach, requireUser } from "@/lib/auth/guard";
import { loadSeason } from "@/lib/queries/trends";
import {
  competitionsOf,
  matchLines,
  perMatch,
  readScope,
  scoped,
  seasonRecord,
  seasonsOf,
  squadSeason,
  teamSeason,
  unnamed,
  type SeasonRecord,
} from "@/lib/hurling/trends";
import { formatScorerTally, statVocabulary, type SideShooting } from "@/lib/hurling/stats";
import { formatScore, scoreTotal } from "@/lib/hurling/notation";
import { matchDate } from "@/lib/format";
import { Nav } from "@/components/ui/Nav";
import { PitchMap } from "@/components/pitch/PitchMap";
import { ShootingFigure } from "@/components/stats/ShootingFigure";
import { MarginBars, ScopeBar, SeasonSection, SeasonTabs, Trend, scopeHref, scopeTitle } from "@/components/stats/Season";
import { statMarks } from "@/components/stats/types";
import { verdict, verdictColour } from "@/components/matches/ResultBox";

/**
 * The team's season: form, then the same headings as a match's stat sheet,
 * each as a season figure and a line across the matches.
 *
 * Open to the whole panel, like the sheets it is made from. Only submitted
 * sheets count (src/lib/queries/trends.ts), so a player and a coach read the
 * same season. The rules are in src/lib/hurling/trends.ts.
 */
export default async function TeamSeasonPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; competition?: string }>;
}) {
  const user = await requireUser();
  const asked = await searchParams;
  const code = user.teamCode;
  const { terms } = statVocabulary(code);

  const [{ matches, sheets, names }, [team]] = await Promise.all([
    loadSeason(user.teamId),
    db.select({ name: teams.name }).from(teams).where(eq(teams.id, user.teamId)).limit(1),
  ]);
  const scope = readScope(matches, asked);
  const inScope = scoped(sheets, scope);
  const lines = matchLines(inScope, code);
  const season = teamSeason(inScope, code);
  const record = seasonRecord(lines);
  const gaps = unnamed(inScope);
  const scorerLines = [...squadSeason(inScope).values()]
    .filter((l) => scoreTotal(l.score) > 0)
    .sort((a, b) => scoreTotal(b.score) - scoreTotal(a.score) || b.score.cul - a.score.cul);
  const teamName = team?.name ?? "Us";
  const label = (i: number) => `${lines[i].match.opponent}, ${matchDate(lines[i].match.playedOn)}`;
  const { logged, summary } = season;

  return (
    <>
      <Nav user={user} />
      <main className="sheet pt-10 pb-16 print:pt-0">
        <header className="border-b-[3px] pb-5" style={{ borderColor: "var(--color-rule)" }}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="display text-[clamp(2.4rem,6vw,3.8rem)]">{teamName}</h1>
              <p className="mt-3 text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
                {scopeTitle(scope)}, from {inScope.length} submitted stat {inScope.length === 1 ? "sheet" : "sheets"}
              </p>
            </div>
            <SeasonTabs current="team" scope={scope} />
          </div>
          <ScopeBar
            path="/stats/team"
            scope={scope}
            seasons={seasonsOf(matches)}
            competitions={competitionsOf(matches, scope.season)}
          />
        </header>

        {inScope.length === 0 ? (
          <section className="py-16">
            <h2 className="title text-xl">No submitted stat sheets yet</h2>
            <p className="measure mt-2 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
              The season is built from every stat sheet a coach has submitted. Once the first one is out, it starts
              here.
            </p>
          </section>
        ) : (
          <>
            {gaps.entries > 0 && (
              <p className="measure mt-6 text-[13px]" style={{ color: "var(--color-ink-dim)" }}>
                {gaps.entries} {gaps.entries === 1 ? "entry is" : "entries are"} on numbers nobody has been put to,
                in {gaps.matches.map((m) => m.opponent).join(", ")}. They count for the team, but for no player until
                {isCoach(user) ? " the numbers are filled in on those sheets." : " a coach fills in those numbers."}
              </p>
            )}

            {/* --------------------------------------------------------- form */}
            <SeasonSection title="Form" note="Every match in scope, oldest first. Won above the line, lost below it.">
              <p className="measure text-[17px] leading-snug">{recordSentence(record)}</p>
              <MarginBars
                results={lines.map((l) => ({
                  opponent: l.match.opponent,
                  playedOn: l.match.playedOn,
                  margin: l.result?.margin ?? null,
                }))}
              />
              <ul className="border-t" style={{ borderColor: "var(--color-line-strong)" }}>
                {[...lines].reverse().map((l) => (
                  <li key={l.match.id} className="fixture flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5">
                    <span className="tabular w-[4.5rem] shrink-0 text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
                      {matchDate(l.match.playedOn)}
                    </span>
                    <Link href={`/matches/${l.match.id}/stats`} className="min-w-0 flex-1 truncate font-semibold">
                      {l.match.opponent}
                    </Link>
                    <span className="tabular text-[14px]">
                      {l.result ? formatScore(l.result.us) : "No score"}
                      {l.result?.them && <> to {formatScore(l.result.them)}</>}
                    </span>
                    <span
                      className="w-32 text-right text-[13px] font-semibold"
                      style={{ color: l.result?.margin != null ? verdictColour(l.result.margin) : "var(--color-ink-faint)" }}
                    >
                      {l.result?.margin != null ? verdict(l.result.margin) : "Their score not logged"}
                    </span>
                  </li>
                ))}
              </ul>
            </SeasonSection>

            {/* -------------------------------------------- score opportunities */}
            <SeasonSection
              title="Score opportunities"
              note="Season efficiency is every shot in the season in one pile, so a match with twenty shots counts for more than a match with five."
            >
              <div className="grid gap-10 lg:grid-cols-2">
                <div className="space-y-6">
                  <h3 className="title text-[15px]">{teamName}</h3>
                  {logged.shot > 0 ? (
                    <ShootingFigure s={season.shooting} ours />
                  ) : (
                    <Quiet>No shots logged.</Quiet>
                  )}
                  <Trend
                    title="Efficiency, match by match"
                    points={lines.map((l, i) => ({ label: label(i), value: l.shooting?.overall.total ? l.shooting.overall.percent : null }))}
                    max={100}
                    average={season.shooting.overall.total ? season.shooting.overall.percent : null}
                    format={(n) => `${n}%`}
                  />
                  <p className="text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
                    {halvesSentence(season.halves.first, season.halves.second, season.halves.unhalved)}
                  </p>
                </div>
                <div className="space-y-6">
                  <h3 className="title text-[15px]">Opposition</h3>
                  {season.theirShooting ? (
                    <>
                      <ShootingFigure s={season.theirShooting} ours={false} />
                      <Trend
                        title="Their efficiency, match by match"
                        points={lines.map((l, i) => ({
                          label: label(i),
                          value: l.theirShooting?.overall.total ? l.theirShooting.overall.percent : null,
                        }))}
                        max={100}
                        average={season.theirShooting.overall.percent}
                        format={(n) => `${n}%`}
                      />
                      <p className="text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
                        From the {logged.their_shot} {logged.their_shot === 1 ? "match" : "matches"} that logged their
                        shots.
                      </p>
                    </>
                  ) : (
                    <Quiet>No sheet in scope logged their shots.</Quiet>
                  )}
                </div>
              </div>
              {season.shooting.overall.total > 0 && (
                <figure className="m-0">
                  <figcaption className="mb-2 flex items-baseline justify-between gap-2">
                    <h3 className="title text-[14px]">Every shot of ours</h3>
                    <span className="tabular text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                      {season.shooting.overall.total} logged
                    </span>
                  </figcaption>
                  {/* A number means a different player from one match to the
                      next, so a season's map carries none, and no minutes. */}
                  <PitchMap
                    code={code}
                    marks={statMarks(
                      inScope.flatMap((s) =>
                        s.rows
                          .filter((r) => r.statType === "shot" && r.side !== "opposition")
                          .map((r) => ({ ...r, playerNumber: null, gameMs: null })),
                      ),
                      new Map(),
                      code,
                    )}
                  />
                </figure>
              )}
            </SeasonSection>

            {/* ---------------------------------------------------- restarts */}
            <SeasonSection
              title={terms.restarts}
              note={`Our own retained, counted as on the match sheet: a short one only once it is worked out past our ${terms.line}.`}
            >
              {logged.puckout === 0 ? (
                <Quiet>None logged.</Quiet>
              ) : (
                <div className="grid gap-10 lg:grid-cols-2">
                  <div className="space-y-4">
                    <Big
                      figure={`${season.restarts.retainedPercent}%`}
                      text={`of our own retained, ${season.restarts.retained} of ${season.restarts.taken}`}
                    />
                    <Trend
                      title="Ours retained, match by match"
                      points={lines.map((l, i) => ({ label: label(i), value: l.restarts ? l.restarts.retainedPercent : null }))}
                      max={100}
                      average={season.restarts.taken ? season.restarts.retainedPercent : null}
                      format={(n) => `${n}%`}
                    />
                  </div>
                  <div className="space-y-4">
                    <Big
                      figure={`${summary.theirPuckouts.percent}%`}
                      text={`of theirs won by us, ${summary.theirPuckouts.won} of ${summary.theirPuckouts.taken}`}
                    />
                    <Trend
                      title="Theirs won by us, match by match"
                      points={lines.map((l, i) => ({
                        label: label(i),
                        value: l.summary.theirPuckouts.taken ? l.summary.theirPuckouts.percent : null,
                      }))}
                      max={100}
                      average={summary.theirPuckouts.taken ? summary.theirPuckouts.percent : null}
                      format={(n) => `${n}%`}
                    />
                  </div>
                </div>
              )}
            </SeasonSection>

            {/* ------------------------------------------------- possession */}
            <SeasonSection
              title="Turnovers and tackles"
              note="A figure per match is over the matches that logged it, so a sheet that never logged turnovers does not count as one with none."
            >
              {logged.turnover === 0 && logged.tackle === 0 ? (
                <Quiet>None logged.</Quiet>
              ) : (
                <div className="grid gap-10 lg:grid-cols-2">
                  <div className="space-y-4">
                    <p className="measure text-[17px] leading-snug">
                      {possessionSentence(
                        summary.turnovers.won,
                        summary.turnovers.conceded,
                        summary.turnovers.ledToScorePercent,
                        logged.turnover,
                      )}
                      {logged.tackle > 0 && ` ${perMatch(summary.tackles, logged.tackle)} tackles a match.`}
                    </p>
                  </div>
                  <Trend
                    title="Turnovers won less lost, match by match"
                    points={lines.map((l, i) => ({
                      label: label(i),
                      value: l.logged.has("turnover") ? l.summary.turnovers.won - l.summary.turnovers.conceded : null,
                    }))}
                    average={perMatch(summary.turnovers.won - summary.turnovers.conceded, logged.turnover)}
                    format={(n) => (n > 0 ? `+${n}` : String(n))}
                  />
                </div>
              )}
            </SeasonSection>

            {/* ------------------------------------------------- discipline */}
            <SeasonSection title="Discipline">
              {logged.free_conceded === 0 ? (
                <Quiet>No frees conceded logged.</Quiet>
              ) : (
                <div className="grid gap-10 lg:grid-cols-2">
                  <p className="measure text-[17px] leading-snug">
                    {perMatch(summary.freesConceded, logged.free_conceded)} frees given away a match,{" "}
                    {perMatch(summary.scorableFreesConceded, logged.free_conceded)} of them within range.
                    {logged.free_won > 0 && ` ${perMatch(summary.freesWon, logged.free_won)} won a match.`}
                  </p>
                  <Trend
                    title="Frees given away, match by match"
                    points={lines.map((l, i) => ({
                      label: label(i),
                      value: l.logged.has("free_conceded") ? l.summary.freesConceded : null,
                    }))}
                    average={perMatch(summary.freesConceded, logged.free_conceded)}
                  />
                </div>
              )}
            </SeasonSection>

            {/* ---------------------------------------------------- scorers */}
            <SeasonSection title="Scorers" note="Per match is over the matches each player appeared in that logged shots.">
              {scorerLines.length === 0 ? (
                <Quiet>No named scorers yet.</Quiet>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[28rem] border-collapse text-[14px]">
                    <thead>
                      <tr style={{ color: "var(--color-ink-dim)", borderBottom: "1px solid var(--color-line-strong)" }}>
                        <th className="px-2 py-2 text-left font-medium">Player</th>
                        <th className="px-2 py-2 text-right font-medium">Played</th>
                        <th className="px-2 py-2 text-right font-medium">Scored</th>
                        <th className="px-2 py-2 text-right font-medium">Total</th>
                        <th className="px-2 py-2 text-right font-medium">Per match</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scorerLines.map((l) => (
                        <tr key={l.userId} style={{ borderBottom: "1px solid var(--color-line)" }}>
                          <td className="px-2 py-2">
                            <Link href={scopeHref(`/stats/players/${l.userId}`, scope)} className="hover:underline">
                              {names.get(l.userId) ?? "Former player"}
                            </Link>
                          </td>
                          <td className="tabular px-2 py-2 text-right">{l.appearances}</td>
                          <td className="tabular px-2 py-2 text-right">
                            {formatScorerTally({ playerNumber: null, score: l.score, fromFrees: l.fromFrees })}
                          </td>
                          <td className="tabular px-2 py-2 text-right">{scoreTotal(l.score)}</td>
                          <td className="tabular px-2 py-2 text-right">
                            {perMatch(scoreTotal(l.score), l.logged.shot) ?? "–"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SeasonSection>
          </>
        )}
      </main>
    </>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
      {children}
    </p>
  );
}

function Big({ figure, text }: { figure: string; text: string }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-3">
      <span className="figure text-[2.6rem]">{figure}</span>
      <span className="text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
        {text}
      </span>
    </p>
  );
}

function recordSentence(r: SeasonRecord): string {
  const decided = r.played - r.noResult;
  const parts =
    decided === 0
      ? `Played ${r.played}.`
      : `Played ${r.played}: won ${r.won}, drew ${r.drawn}, lost ${r.lost}.`;
  if (r.noResult === 0) return parts;
  return `${parts} ${r.noResult} ${r.noResult === 1 ? "sheet logged" : "sheets logged"} only our score, so ${r.noResult === 1 ? "has" : "have"} no result.`;
}

function halvesSentence(first: SideShooting, second: SideShooting, unhalved: number): string {
  if (first.overall.total + second.overall.total === 0) return "No shots with a half settled, so no split by half.";
  const half = (s: SideShooting) =>
    s.overall.total ? `${s.overall.percent}% (${s.overall.scored} of ${s.overall.total})` : "no shots logged";
  const tail = unhalved > 0 ? ` ${unhalved} more had no half, and are left out of both.` : "";
  return `First half ${half(first)}, second half ${half(second)}.${tail}`;
}

function possessionSentence(won: number, conceded: number, ledToScorePercent: number, matches: number): string {
  if (matches === 0) return "";
  return `${perMatch(won, matches)} turnovers won a match and ${perMatch(conceded, matches)} given away. ${ledToScorePercent}% of those won led to a score.`;
}
