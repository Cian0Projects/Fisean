import Link from "next/link";
import { notFound } from "next/navigation";
import { isCoach, requireUser } from "@/lib/auth/guard";
import { loadSeason, loadSeasonFootage } from "@/lib/queries/trends";
import { loadSeasonGps, type PlayerGps } from "@/lib/queries/gps";
import { store } from "@/lib/storage";
import {
  competitionsOf,
  creditedRows,
  perMatch,
  playerMatches,
  readScope,
  scoped,
  scoresPerMatch,
  seasonLineOf,
  seasonShots,
  seasonsOf,
} from "@/lib/hurling/trends";
import { STAT_TYPES, formatScorerTally, statVocabulary, summariseShooting, type StatType } from "@/lib/hurling/stats";
import { involves, seasonMoments } from "@/lib/hurling/moments";
import { averageOf, formatSpeed, groupThousands } from "@/lib/hurling/gps";
import { scoreTotal } from "@/lib/hurling/notation";
import { positionByNumber } from "@/lib/hurling/positions";
import { matchDate } from "@/lib/format";
import { Nav } from "@/components/ui/Nav";
import { PitchMap } from "@/components/pitch/PitchMap";
import { ShootingFigure } from "@/components/stats/ShootingFigure";
import { Cell, ScopeBar, SeasonSection, Trend, scopeHref, scopeTitle } from "@/components/stats/Season";
import { statMarks, type StatRow } from "@/components/stats/types";
import { SeasonMoments, type SeasonRow } from "@/components/stats/SeasonMoments";

/**
 * One player's season: what they did, match by match, and where on the
 * pitch. Open to the whole panel, like the sheets it is added up from.
 *
 * Every moment of theirs can be watched back across the whole season, one
 * match after another, narrowed to a kind ("every shot I took this year");
 * each match also links to its own sheet with their number picked. So every
 * figure here is a click from the footage of it.
 *
 * Coaches also see their GPS running, match by match, once their GPS name is
 * linked (src/lib/queries/gps.ts). Players do not, since a player's running
 * load is health data and the GPS pages are coaches' only too.
 */
export default async function PlayerSeasonPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  /** `watch`: kinds of stat to open the season's reel on, comma separated, e.g. "shot". */
  searchParams: Promise<{ season?: string; competition?: string; watch?: string }>;
}) {
  const user = await requireUser();
  const [{ userId }, asked] = await Promise.all([params, searchParams]);
  const code = user.teamCode;
  const { terms } = statVocabulary(code);

  const coach = isCoach(user);
  const [{ matches, sheets, names, clocks }, footageByMatch, gpsByPlayer] = await Promise.all([
    loadSeason(user.teamId),
    loadSeasonFootage(user.teamId),
    coach ? loadSeasonGps(user.teamId) : null,
  ]);
  // Scoped by team through the names: a user id from another club is not found.
  const name = names.get(userId);
  if (!name) notFound();

  const scope = readScope(matches, asked);
  const inScope = scoped(sheets, scope);
  const played = playerMatches(inScope, userId);
  const season = seasonLineOf(userId, played);
  const rows = creditedRows(inScope, userId);
  const shooting = summariseShooting(rows, "us", code);
  const shots = seasonShots(season);
  const t = season.totals;
  const label = (i: number) => `${played[i].match.opponent}, ${matchDate(played[i].match.playedOn)}`;

  // Their moments in each match they played, each placed on that match's
  // own footage by its own clock, then one match after another.
  const sheetOf = new Map(inScope.map((s) => [s.match.id, s]));
  const reel = seasonMoments(
    played.map((m) => {
      const footage = footageByMatch.get(m.match.id) ?? [];
      const clock = clocks.get(m.match.id)!;
      const rows: SeasonRow[] = (sheetOf.get(m.match.id)?.rows ?? [])
        .filter((r) => involves(r, m.number))
        .map((r) => ({
          ...r,
          matchId: m.match.id,
          opponent: m.match.opponent,
          playedOn: m.match.playedOn,
          filmed: footage.length > 0,
        }));
      return { rows, footage, whistles: clock.whistles, halfLengthMin: clock.halfLengthMin };
    }),
  );
  // Only the files the reel plays are signed: a season can have many.
  const used = new Set(reel.placed.map((m) => m.videoId));
  const media = await store();
  const reelFootage = [...footageByMatch.values()]
    .flat()
    .filter((f) => used.has(f.id))
    .map((f) => ({ id: f.id, durationMs: f.durationMs, markers: f.markers, src: media.readUrl(f.storageKey) }));
  const watch = (asked.watch ?? "")
    .split(",")
    .filter((k): k is StatType => (STAT_TYPES as readonly string[]).includes(k));

  // Their GPS lines in scope, oldest first. Coaches only.
  const order = new Map(inScope.map((s, i) => [s.match.id, i]));
  const gps = (gpsByPlayer?.get(userId) ?? [])
    .filter((g) => order.has(g.matchId))
    .sort((a, b) => order.get(a.matchId)! - order.get(b.matchId)!);

  return (
    <>
      <Nav user={user} />
      <main className="sheet pt-10 pb-16 print:pt-0">
        <header className="border-b-[3px] pb-5" style={{ borderColor: "var(--color-rule)" }}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="display text-[clamp(2.4rem,6vw,3.8rem)]">{name}</h1>
              <p className="mt-3 text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
                {scopeTitle(scope)}, {season.appearances} {season.appearances === 1 ? "match" : "matches"} on submitted
                stat sheets
              </p>
            </div>
            <Link href={scopeHref("/stats/players", scope)} className="btn-ghost no-print text-xs">
              All players
            </Link>
          </div>
          <ScopeBar
            path={`/stats/players/${userId}`}
            scope={scope}
            seasons={seasonsOf(matches)}
            competitions={competitionsOf(matches, scope.season)}
          />
        </header>

        {played.length === 0 ? (
          <section className="py-16">
            <h2 className="title text-xl">No matches in scope</h2>
            <p className="measure mt-2 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
              {name} shows up here once a submitted stat sheet puts their name to a number. Try another season above.
            </p>
          </section>
        ) : (
          <>
            <SeasonSection title="The season">
              <p className="measure text-[17px] leading-snug">{seasonSentence(season.appearances, season, shots)}</p>
              <div className="grid gap-x-10 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
                <Figure label="Possession won" value={t.turnoversWon} per={perMatch(t.turnoversWon, season.logged.turnover)} />
                <Figure
                  label="Possession lost"
                  value={t.turnoversConceded}
                  per={perMatch(t.turnoversConceded, season.logged.turnover)}
                  negative
                />
                <Figure label="Tackles" value={t.tackles} per={perMatch(t.tackles, season.logged.tackle)} />
                <Figure
                  label="Deliveries received"
                  value={season.received}
                  detail={season.received + season.lostAsTarget > 0 ? `of ${season.received + season.lostAsTarget} aimed at them` : null}
                />
                <Figure label="Frees won" value={t.freesWon} per={perMatch(t.freesWon, season.logged.free_won)} />
                <Figure
                  label="Frees given away"
                  value={t.freesConceded}
                  per={perMatch(t.freesConceded, season.logged.free_conceded)}
                  negative
                />
                <Figure label={`${terms.restarts} won`} value={t.puckoutsWon} />
                {terms.marks && <Figure label="Marks" value={t.marks} />}
              </div>
            </SeasonSection>

            {shots.total > 0 && (
              <SeasonSection title="Shooting" note="Every attempt of theirs in scope, from play and from frees.">
                <div className="grid gap-10 lg:grid-cols-2">
                  <div className="space-y-6">
                    <ShootingFigure s={shooting} ours />
                    <Trend
                      title="Scored, match by match"
                      points={played.map((m, i) => ({
                        label: label(i),
                        value: m.logged.has("shot") ? scoreTotal(m.score) : null,
                      }))}
                      average={scoresPerMatch(season)}
                    />
                  </div>
                  <SeasonMap title="Every shot" rows={rows.filter((r) => r.statType === "shot")} code={code} />
                </div>
                <a
                  href={`${scopeHref(`/stats/players/${userId}`, scope, { watch: "shot" })}#watch`}
                  className="btn-outline no-print text-xs"
                >
                  Watch every shot
                </a>
              </SeasonSection>
            )}

            {rows.some((r) => r.statType === "turnover" || r.statType === "tackle") && (
              <SeasonSection title="Turnovers and tackles">
                <div className="grid gap-10 lg:grid-cols-2">
                  <Trend
                    title="Won less lost, match by match"
                    points={played.map((m, i) => ({
                      label: label(i),
                      value: m.logged.has("turnover") ? m.line.turnoversWon - m.line.turnoversConceded : null,
                    }))}
                    average={perMatch(t.turnoversWon - t.turnoversConceded, season.logged.turnover)}
                    format={(n) => (n > 0 ? `+${n}` : String(n))}
                  />
                  <SeasonMap
                    title="Where"
                    rows={rows.filter((r) => r.statType === "turnover" || r.statType === "tackle")}
                    code={code}
                  />
                </div>
              </SeasonSection>
            )}

            <div className="no-print">
              <SeasonSection
                id="watch"
                title="Watch the season"
                note="Every moment of theirs in scope, one match after another, each from ten seconds before it happened. Pick a kind of moment, a match, a half or an outcome."
              >
                <SeasonMoments
                  code={code}
                  placed={reel.placed}
                  unplaced={reel.unplaced}
                  footage={reelFootage}
                  initialTypes={watch}
                />
              </SeasonSection>
            </div>

            {coach && <GpsSeason gps={gps} inScope={inScope.map((s) => s.match)} name={name} />}

            <SeasonSection
              title="Match by match"
              note="Watch opens the match's sheet with their moments picked, each from ten seconds before."
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] border-collapse text-[14px]">
                  <thead>
                    <tr style={{ color: "var(--color-ink-dim)", borderBottom: "1px solid var(--color-line-strong)" }}>
                      <th className="px-2 py-2 text-left font-medium">Match</th>
                      <th className="px-2 py-2 text-left font-medium">Wore</th>
                      <th className="px-2 py-2 text-right font-medium">Scored</th>
                      <th className="px-2 py-2 text-right font-medium">Shots</th>
                      <th className="px-2 py-2 text-right font-medium whitespace-nowrap">Possession won</th>
                      <th className="px-2 py-2 text-right font-medium whitespace-nowrap">Possession lost</th>
                      <th className="px-2 py-2 text-right font-medium">Tackles</th>
                      <th className="px-2 py-2 text-right font-medium">Received</th>
                      <th className="no-print px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {[...played].reverse().map((m) => {
                      const attempts = m.line.goals + m.line.points + m.line.twoPointers + m.line.missed;
                      return (
                        <tr key={m.match.id} style={{ borderBottom: "1px solid var(--color-line)" }}>
                          <td className="px-2 py-2">
                            <div className="font-semibold">{m.match.opponent}</div>
                            <div className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                              {matchDate(m.match.playedOn)}
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <span className="jersey">{m.number}</span>{" "}
                            <span className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                              {positionByNumber(m.number)?.name ?? "Sub"}
                            </span>
                          </td>
                          <Cell>
                            {scoreTotal(m.score) > 0
                              ? formatScorerTally({ playerNumber: null, score: m.score, fromFrees: m.fromFrees })
                              : null}
                          </Cell>
                          <Cell>{attempts || null}</Cell>
                          <Cell>{m.line.turnoversWon || null}</Cell>
                          <Cell negative>{m.line.turnoversConceded || null}</Cell>
                          <Cell>{m.line.tackles || null}</Cell>
                          <Cell>{m.received + m.lostAsTarget > 0 ? `${m.received} of ${m.received + m.lostAsTarget}` : null}</Cell>
                          <td className="no-print px-2 py-2 text-right">
                            <Link href={`/matches/${m.match.id}/stats?number=${m.number}#moments`} className="btn-ghost text-xs">
                              Watch
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SeasonSection>
          </>
        )}
      </main>
    </>
  );
}

function seasonSentence(
  appearances: number,
  season: Parameters<typeof scoresPerMatch>[0],
  shots: { scored: number; total: number; percent: number },
): string {
  const played = `Played ${appearances}.`;
  if (scoreTotal(season.score) === 0) {
    return shots.total ? `${played} ${shots.total} shots, none scored.` : played;
  }
  const tally = formatScorerTally({ playerNumber: null, score: season.score, fromFrees: season.fromFrees });
  const per = scoresPerMatch(season);
  return `${played} Scored ${tally}${per != null ? `, ${per} a match` : ""}, from ${shots.scored} of ${shots.total} shots.`;
}

/** A season figure with its per-match rate beside it, when there is one. */
function Figure({
  label,
  value,
  per,
  detail,
  negative,
}: {
  label: string;
  value: number;
  per?: number | null;
  detail?: string | null;
  negative?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-2" style={{ borderColor: "var(--color-line)" }}>
      <span className="text-[14px]">{label}</span>
      <span className="tabular text-right">
        <span style={negative && value > 0 ? { color: "var(--color-danger-ink)" } : undefined}>{value}</span>
        {(per != null || detail) && (
          <span className="ml-1.5 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            {detail ?? `${per} a match`}
          </span>
        )}
      </span>
    </div>
  );
}

/** A season's marks for one player: no numbers on the dots, since they are all theirs. */
function SeasonMap({ title, rows, code }: { title: string; rows: StatRow[]; code: Parameters<typeof statMarks>[2] }) {
  const marks = statMarks(
    rows.map((r) => ({ ...r, playerNumber: null, gameMs: null })),
    new Map(),
    code,
  );
  return (
    <figure className="m-0">
      <figcaption className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="title text-[14px]">{title}</h3>
        <span className="tabular text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          {marks.length === rows.length ? `${rows.length} logged` : `${marks.length} of ${rows.length} placed`}
        </span>
      </figcaption>
      <PitchMap marks={marks} code={code} />
    </figure>
  );
}

/**
 * Their running, match by match, from the GPS exports whose name is linked
 * to them. Averages are over the matches with a figure, since an export
 * without an HSR column is not a match with none.
 */
function GpsSeason({
  gps,
  inScope,
  name,
}: {
  gps: PlayerGps[];
  inScope: { id: string; opponent: string; playedOn: string }[];
  name: string;
}) {
  const matchOf = new Map(inScope.map((m) => [m.id, m]));
  const distance = averageOf(gps.map((g) => g.totalDistance));
  const hsr = averageOf(gps.map((g) => g.hsr));
  const top = gps.reduce<number | null>(
    (best, g) => (g.maxSpeed != null && (best == null || g.maxSpeed > best) ? g.maxSpeed : best),
    null,
  );
  const metres = (n: number | null) => (n != null ? `${groupThousands(Math.round(n))} m` : null);
  return (
    <SeasonSection
      title="GPS"
      note="Coaches only. From each match's GPS export, where the name in it is linked to this player on that match's GPS page."
    >
      {gps.length === 0 ? (
        <p className="text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
          No GPS figures for {name} in scope. If a match has an export, link their name to them on its GPS page.
        </p>
      ) : (
        <>
          <div className="grid gap-x-10 gap-y-2 sm:grid-cols-3">
            <GpsFigure label="Distance a match" value={metres(distance)} />
            <GpsFigure label="High speed running a match" value={metres(hsr)} />
            <GpsFigure label="Top speed" value={top != null ? `${formatSpeed(top).kmh} km/h` : null} />
          </div>
          <Trend
            title="Distance, match by match"
            points={gps.map((g) => {
              const m = matchOf.get(g.matchId)!;
              return { label: `${m.opponent}, ${matchDate(m.playedOn)}`, value: Math.round(g.totalDistance) };
            })}
            average={distance != null ? Math.round(distance) : null}
            format={(n) => `${groupThousands(n)} m`}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-[14px]">
              <thead>
                <tr style={{ color: "var(--color-ink-dim)", borderBottom: "1px solid var(--color-line-strong)" }}>
                  <th className="px-2 py-2 text-left font-medium">Match</th>
                  <th className="px-2 py-2 text-right font-medium">Distance</th>
                  <th className="px-2 py-2 text-right font-medium">HMLD</th>
                  <th className="px-2 py-2 text-right font-medium">High speed</th>
                  <th className="px-2 py-2 text-right font-medium">Top speed</th>
                  <th className="px-2 py-2 text-right font-medium">Accels</th>
                  <th className="px-2 py-2 text-right font-medium">Decels</th>
                </tr>
              </thead>
              <tbody>
                {[...gps].reverse().map((g) => {
                  const m = matchOf.get(g.matchId)!;
                  return (
                    <tr key={g.matchId} style={{ borderBottom: "1px solid var(--color-line)" }}>
                      <td className="px-2 py-2">
                        <Link href={`/matches/${g.matchId}/gps`} className="font-semibold hover:underline">
                          {m.opponent}
                        </Link>
                        <div className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                          {matchDate(m.playedOn)}
                        </div>
                      </td>
                      <Cell>{metres(g.totalDistance)}</Cell>
                      <Cell>{metres(g.hmld)}</Cell>
                      <Cell>{metres(g.hsr)}</Cell>
                      <Cell>{g.maxSpeed != null ? `${formatSpeed(g.maxSpeed).kmh} km/h` : null}</Cell>
                      <Cell>{g.accels}</Cell>
                      <Cell>{g.decels}</Cell>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </SeasonSection>
  );
}

function GpsFigure({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-2" style={{ borderColor: "var(--color-line)" }}>
      <span className="text-[14px]">{label}</span>
      <span className="tabular">{value ?? <span style={{ color: "var(--color-ink-faint)" }}>&ndash;</span>}</span>
    </div>
  );
}
