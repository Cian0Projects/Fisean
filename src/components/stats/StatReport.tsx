import Link from "next/link";
import { MapGroups, MapViewProvider, MapViewToggle, type MapGroup } from "./MapView";
import { PrintButton } from "./PrintButton";
import {
  numberSheet,
  statMarks,
  type NumberSheet,
  type SheetEntry,
  type StatMatchInfo,
  type StatRow,
} from "./types";
import {
  ATTEMPT_SOURCES,
  NEUTRAL_COLOUR,
  OUTCOME_COLOURS,
  PUCKOUT_LENGTHS,
  PUCKOUT_LENGTH_LABELS,
  countShots,
  deliveryTally,
  effectiveOutcome,
  emptyStatLine,
  formatScorerTally,
  halfTimeScore,
  lineShooting,
  matchResult,
  oppositionRuns,
  playerStatLines,
  possessionTally,
  puckoutBreakdown,
  scorers,
  shootingEfficiency,
  statVocabulary,
  summariseShooting,
  summariseStats,
  type MarkSummary,
  type PlayerTally,
  type PuckoutBreakdown,
  type ShotResult,
  type SideShooting,
  type StatOutcome,
  type StatVocabulary,
} from "@/lib/hurling/stats";
import type { GameCode } from "@/lib/hurling/codes";
import { formatGameClock, formatScore } from "@/lib/hurling/notation";
import { positionByNumber } from "@/lib/hurling/positions";
import { matchDateLong } from "@/lib/format";
import { ResultBox } from "@/components/matches/ResultBox";
import { Meter, ShootingFigure } from "./ShootingFigure";
import { RestartLadderPanel } from "./RestartReport";
import { restartLadder } from "@/lib/hurling/restart-line";

/**
 * The per-match stat sheet, as a coach would hand it round.
 *
 * Laid out under the headings a club analyst's summary already uses, in the
 * same order — the scoreline, score opportunities for both teams, the spells
 * where they got on top, restarts, delivery, possessions won and lost,
 * discipline — so a dressing room that knows that sheet can read this one
 * without being taught it. Every section that happened somewhere on the
 * pitch has a map for each half, because a pattern that only shows up after
 * the break is usually the whole story.
 *
 * Everything here is derived from the logged entries — there is no stored
 * total anywhere, so a corrected entry corrects the report.
 *
 * It prints, a section to a page like the slides it replaces. The palette
 * flips to ink on paper and the controls disappear (see the print block in
 * globals.css), which is why there is no PDF dependency in this project.
 */
export function StatReport({
  teamName,
  code,
  match,
  rows,
  numbers,
  canLog,
  banner,
  moments,
  custom,
  customCount = 0,
  removed = [],
}: {
  teamName: string;
  /** The club's code: every heading and label is said its way. */
  code: GameCode;
  match: StatMatchInfo;
  rows: StatRow[];
  /** Who wore what in this match. Entries are logged by number; this names them. */
  numbers: SheetEntry[];
  canLog: boolean;
  /** The coaches' bar saying whether the panel can see the sheet yet. */
  banner?: React.ReactNode;
  /** The sheet watched back on the footage. Screen only: it does not print. */
  moments?: React.ReactNode;
  /** The squad's own stats, as a section of their own (see CustomStatsReport). */
  custom?: React.ReactNode;
  /** How many of them are logged: a sheet with only those is not an empty one. */
  customCount?: number;
  /** Standard stats the squad has removed from logging. */
  removed?: StatRow["statType"][];
}) {
  const vocabulary = statVocabulary(code);
  const { terms } = vocabulary;
  const players = numberSheet(numbers);
  const summary = summariseStats(rows);
  const ours = summariseShooting(rows, "us", code);
  const theirs = summariseShooting(rows, "opposition", code);
  const of = (...types: StatRow["statType"][]) => rows.filter((r) => types.includes(r.statType));
  const judgedRestarts = restartLadder(rows, "us") != null || restartLadder(rows, "opposition") != null;
  const shots = of("shot");
  const ourShots = shots.filter((r) => r.side !== "opposition");
  const theirShots = shots.filter((r) => r.side === "opposition");
  const theirsLogged = theirShots.length > 0;
  const result = matchResult(rows);
  // A stat the squad has removed drops out of the report once nothing is logged
  // under it. Anything logged before it was removed still shows.
  const off = (...types: StatRow["statType"][]) =>
    types.every((t) => removed.includes(t)) && of(...types).length === 0;

  return (
    <main className="sheet pt-10 pb-16 print:pt-0">
      <header
        className="flex flex-wrap items-end justify-between gap-4 border-b-[3px] pb-5"
        style={{ borderColor: "var(--color-rule)" }}
      >
        <div>
          <h1 className="display text-[clamp(2.4rem,6vw,3.8rem)]">{match.opponent}</h1>
          <p className="mt-3 text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
            Stat sheet for {matchDateLong(match.playedOn)},{" "}
            {[match.competition, match.venue].filter(Boolean).join(" at ") || "a friendly"}
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          {moments && rows.length > 0 && (
            <a href="#moments" className="btn-outline text-xs">
              Watch it back
            </a>
          )}
          {rows.length > 0 && (
            <Link href={`/matches/${match.id}/stats/summary`} className="btn-outline text-xs">
              Summary
            </Link>
          )}
          <PrintButton />
          {canLog && (
            <Link href={`/matches/${match.id}/gps`} className="btn-outline text-xs">
              GPS data
            </Link>
          )}
          {canLog && (
            <Link href={`/matches/${match.id}/numbers`} className="btn-outline text-xs">
              Put names to numbers
            </Link>
          )}
          {canLog && (
            <Link href={`/matches/${match.id}/stats/log`} className="btn-primary text-xs">
              Log stats
            </Link>
          )}
        </div>
      </header>

      {banner}

      {rows.length === 0 && customCount > 0 ? (
        <>{custom}</>
      ) : rows.length === 0 ? (
        <section className="py-16">
          <h2 className="title text-xl">Nothing logged for this match yet</h2>
          <p className="measure mt-2 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
            {canLog
              ? "Open the logger and work down the notebook. A tackle is two clicks, and nothing takes more than five."
              : "A coach fills this in after the game. It will show up here."}
          </p>
          {canLog && (
            <Link href={`/matches/${match.id}/stats/log`} className="btn-primary mt-6">
              Start logging
            </Link>
          )}
        </section>
      ) : (
        <>
          {!off("shot") && (
            <>
          {/* The result as a match report opens: the scores panel from the
              cover, the half-time score, and who got them. */}
          <section className="mt-8 grid gap-8 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
            {result ? (
              <ResultBox
                result={result}
                halfTime={halfTimeScore(rows)}
                teamName={teamName}
                opponent={match.opponent}
              />
            ) : (
              <p className="text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
                No shots logged yet, so there is no score to give.
              </p>
            )}
            <ScorersLine
              rows={rows}
              players={players}
              teamName={teamName}
              opponent={match.opponent}
              vocabulary={vocabulary}
            />
          </section>

          {/* ---------------------------------------------- score opportunities */}
          <Section
            id="shooting"
            title="Score opportunities"
            maps={hasHalves(shots)}
            note="Every attempt at the posts, both ways. Their shots are coloured from our side of them: a red ring is one they scored."
            legend={<Legend />}
          >
            <div className={SIDE_BY_SIDE}>
              <ShootingColumn name={teamName} s={ours} ours rows={ourShots} players={players} vocabulary={vocabulary} />
              <ShootingColumn
                name={match.opponent}
                s={theirs}
                ours={false}
                rows={theirShots}
                players={players}
                vocabulary={vocabulary}
                empty="Log their shots with “Theirs” picked and they appear here."
              />
            </div>
          </Section>

          {/* ------------------------------------ consecutive opposition attempts */}
          <Section
            title="Consecutive opposition score attempts"
            note={`Spells where ${match.opponent} had four or more attempts in a row without a reply from us.`}
          >
            <OppositionRuns rows={rows} theirsLogged={theirsLogged} vocabulary={vocabulary} />
          </Section>

            </>
          )}

          {!off("puckout") && (
            <>
          {/* -------------------------------------------- poc amach or kick-outs */}
          <Section
            id="restarts"
            title={terms.restarts}
            maps={hasHalves(of("puckout"))}
            note={
              judgedRestarts
                ? "Each side's own restarts, read from the side taking them. A short one only counts as retained once it is worked out past the line it is judged at."
                : "Each side's own restarts, read from the side taking them."
            }
            legend={<Legend />}
          >
            <div className={SIDE_BY_SIDE}>
              <PuckoutColumn
                name={teamName}
                b={puckoutBreakdown(rows, "us")}
                ours
                rows={of("puckout").filter((r) => r.puckoutTakenBy === "us")}
                players={players}
                vocabulary={vocabulary}
                analyst={canLog}
                watchable={Boolean(moments)}
              />
              <PuckoutColumn
                name={match.opponent}
                b={puckoutBreakdown(rows, "opposition")}
                ours={false}
                rows={of("puckout").filter((r) => r.puckoutTakenBy === "opposition")}
                players={players}
                weWon={summary.theirPuckouts.won}
                vocabulary={vocabulary}
                analyst={canLog}
                watchable={Boolean(moments)}
              />
            </div>
          </Section>

            </>
          )}

          {!off("delivery") && (
            <>
          {/* --------------------------------------------------------- delivery */}
          <Section
            id="delivery"
            title="Delivery"
            maps={hasHalves(of("delivery"))}
            note={`From inside our ${terms.line} to beyond theirs. Each arrow runs from where it was struck to where it landed; a lost one is dashed.`}
            legend={<Legend />}
          >
            <Lead
              parts={[
                { n: summary.deliveries.won, outcome: "positive" },
                { n: summary.deliveries.unclear, outcome: "unclear" },
                { n: summary.deliveries.lost, outcome: "negative" },
              ]}
            >
              {deliverySentence(summary.deliveries)}
            </Lead>
            <HalfMaps rows={of("delivery")} players={players} code={code} />
            <PivotTable
              tally={deliveryTally(rows)}
              players={players}
              note="Delivered is who struck it. Received and lost are who it was aimed at."
            />
          </Section>

            </>
          )}

          {!off("tackle", "turnover") && (
            <>
          {/* ---------------------------------------------- turnovers and tackles */}
          <Section
            id="turnovers"
            title="Turnovers and tackles"
            maps={hasHalves(of("tackle", "turnover"))}
            note="Possessions won and lost, and the tackles that won them."
            legend={<Legend tackle />}
          >
            <Lead
              parts={[
                { n: summary.turnovers.won, outcome: "positive" },
                { n: summary.turnovers.conceded, outcome: "negative" },
              ]}
            >
              {possessionSentence(summary)}
            </Lead>
            <HalfMaps rows={of("tackle", "turnover")} players={players} code={code} />
            <PivotTable tally={possessionTally(rows)} players={players} />
          </Section>

            </>
          )}

          {!off("free_conceded", "free_won") && (
            <>
          {/* ------------------------------------------------------- discipline */}
          <Section
            id="discipline"
            title="Discipline"
            maps={hasHalves(of("free_conceded", "free_won"))}
            note="Where frees were given, both ways. Ringed in red against us, filled green for us."
            legend={<Legend />}
          >
            <Lead>{disciplineSentence(summary)}</Lead>
            <HalfMaps rows={of("free_conceded", "free_won")} players={players} code={code} />
          </Section>

            </>
          )}

          {/* ------------------------------------------------- marks, football */}
          {terms.marks && !off("mark") && (
            <Section
              id="marks"
              title="Marks"
              maps={hasHalves(of("mark"))}
              note={`Clean catches that earn a free, both ways: off a ${terms.restart.toLowerCase()}, or an advanced mark inside the 45. Filled green for ours, ringed red for theirs.`}
              legend={<Legend />}
            >
              <Lead
                parts={[
                  { n: summary.ourMarks.total, outcome: "positive" },
                  { n: summary.theirMarks.total, outcome: "negative" },
                ]}
              >
                {marksSentence(summary.ourMarks, summary.theirMarks, terms.restart)}
              </Lead>
              <HalfMaps rows={of("mark")} players={players} code={code} />
            </Section>
          )}

          {custom}

          {/* -------------------------------------------------- player by player */}
          <Section
            title="Player by player"
            note={`A ${terms.restart.toLowerCase()} is credited to whoever won it. Entries logged without a name still count in the totals above, and subs with nothing logged are left off.`}
          >
            <PlayerTable rows={rows} players={players} vocabulary={vocabulary} />
          </Section>

          {/* ------------------------------------------------- the footage */}
          {moments && (
            <div className="no-print">
              <Section
                id="moments"
                title="Watch it back"
                note="Every entry on the sheet, played from ten seconds before it happened. Pick a player, a half or a kind of moment, then play them all or one at a time. If a moment starts too late or ends too soon, 5 s back and 5 s on reach past it."
              >
                {moments}
              </Section>
            </div>
          )}
        </>
      )}
    </main>
  );
}

/* ------------------------------------------------------------- the sections */

/**
 * "Scorers: R Hayes 0-5 (0-2f), A Considine 1-1." The line a selector reads
 * out in the dressing room, set as prose because that is how it is printed.
 */
function ScorersLine({
  rows,
  players,
  teamName,
  opponent,
  vocabulary,
}: {
  rows: StatRow[];
  players: NumberSheet;
  teamName: string;
  opponent: string;
  vocabulary: StatVocabulary;
}) {
  const lines = scorers(rows);
  // Theirs only once someone has caught a number: a line of "not named" says nothing.
  const theirLines = scorers(rows, "opposition");
  const theirsNamed = theirLines.some((l) => l.playerNumber !== null);
  if (lines.length === 0 && !theirsNamed) return null;
  const named = lines.map((l) => {
    const who =
      l.playerNumber === null
        ? "not named"
        : (initialled(players.get(l.playerNumber)?.displayName) ?? `No. ${l.playerNumber}`);
    // Non-breaking inside an entry, so a name never splits from its score.
    return `${who} ${formatScorerTally(l)}`.replace(/ /g, " ");
  });
  const theirs = theirLines.map((l) =>
    `${l.playerNumber === null ? "not named" : `No. ${l.playerNumber}`} ${formatScorerTally(l)}`.replace(/ /g, " "),
  );
  return (
    <div>
      {named.length > 0 && (
        <>
          <h2 className="section-head title text-[16px]">Scorers for {teamName}</h2>
          <p className="measure mt-2 text-[17px] leading-relaxed">{named.join(", ")}.</p>
        </>
      )}
      {theirsNamed && (
        <>
          <h2 className="section-head title mt-5 text-[16px]">Scorers for {opponent}</h2>
          <p className="measure mt-2 text-[17px] leading-relaxed">{theirs.join(", ")}.</p>
        </>
      )}
      <p className="caption mt-2">
        Counted from the shots on this sheet. An f marks scores from frees and {vocabulary.terms.endLineFree}s.
      </p>
    </div>
  );
}

/** "Rory Hayes" to "R Hayes", the way a programme prints a scorer. */
function initialled(name: string | undefined): string | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]} ${parts.slice(1).join(" ")}`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function deliverySentence(d: { won: number; lost: number; unclear: number }): string {
  const total = d.won + d.lost + d.unclear;
  if (total === 0) return "No deliveries logged.";
  const rest = [d.lost > 0 && `${d.lost} lost`, d.unclear > 0 && `${d.unclear} unclear`].filter(Boolean);
  return `${d.won} of ${plural(total, "delivery", "deliveries")} received${rest.length ? `, ${rest.join(" and ")}` : ""}.`;
}

function possessionSentence(s: ReturnType<typeof summariseStats>): string {
  const t = s.turnovers;
  const won = `We won ${plural(t.won, "possession")} and lost ${t.conceded}.`;
  const scored =
    t.won > 0 && t.ledToScore > 0
      ? ` ${t.ledToScore} of the ones we won ended in a score, ${t.ledToScorePercent}%.`
      : "";
  const tackles =
    s.tackles > 0 ? ` ${plural(s.tackles, "tackle")}, ${s.frontEightTackles} by the front eight.` : "";
  return won + scored + tackles;
}

function disciplineSentence(s: ReturnType<typeof summariseStats>): string {
  if (s.freesConceded + s.freesWon === 0) return "No frees logged either way.";
  const given =
    s.freesConceded === 0
      ? "We gave away no frees"
      : `We gave away ${plural(s.freesConceded, "free")}${
          s.scorableFreesConceded > 0 ? `, ${s.scorableFreesConceded} within their free-taker's range` : ""
        }`;
  return `${given}, and won ${s.freesWon}.`;
}

/**
 * "We won 6 marks: 4 advanced and 2 off a kick-out. We scored from 3 of
 * them, 50%. They won 2, and scored from 1." Kinds nobody logged are left
 * out rather than said as nought.
 */
function marksSentence(ours: MarkSummary, theirs: MarkSummary, restart: string): string {
  if (ours.total + theirs.total === 0) return "No marks logged either way.";
  const kinds = (m: MarkSummary) => {
    const parts = [
      m.byKind.advanced > 0 && `${m.byKind.advanced} advanced`,
      m.byKind.kickout > 0 && `${m.byKind.kickout} off a ${restart.toLowerCase()}`,
    ].filter(Boolean);
    return parts.length ? `: ${parts.join(" and ")}` : "";
  };
  const us =
    ours.total === 0
      ? "We won no marks."
      : `We won ${plural(ours.total, "mark")}${kinds(ours)}.${
          ours.scoredFrom > 0 ? ` We scored from ${ours.scoredFrom} of them, ${ours.scoredFromPercent}%.` : ""
        }`;
  const them =
    theirs.total === 0
      ? " They won none."
      : ` They won ${theirs.total}${kinds(theirs)}${theirs.scoredFrom > 0 ? `, and scored from ${theirs.scoredFrom}` : ""}.`;
  return us + them;
}

/** Rows in the order the analyst's sheet lists them; the rarer ones only when they happened. */
const RESULT_ROWS: { result: ShotResult; always: boolean }[] = [
  { result: "goal", always: true },
  { result: "point", always: true },
  // Only offered where the code has the arc, and shown there even at nought.
  { result: "two_pointer", always: true },
  { result: "wide", always: true },
  { result: "saved", always: true },
  { result: "lost", always: true },
  { result: "retained", always: false },
  { result: "sixty_five", always: false },
];

function resultTone(result: ShotResult, ours: boolean): Tone {
  const outcome = effectiveOutcome({
    statType: "shot",
    outcome: null,
    shotResult: result,
    side: ours ? "us" : "opposition",
  });
  return outcome ?? "neutral";
}

function ShootingColumn({
  name,
  s,
  ours,
  rows,
  players,
  empty,
  vocabulary,
}: {
  name: string;
  s: SideShooting;
  ours: boolean;
  rows: StatRow[];
  players: NumberSheet;
  empty?: string;
  vocabulary: StatVocabulary;
}) {
  if (rows.length === 0) {
    return (
      <div>
        <h3 className="title text-[16px]">{name}</h3>
        <p className="mt-2 text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
          {empty ?? "No shots logged."}
        </p>
      </div>
    );
  }

  const resultRows = (results: Record<ShotResult, number>) =>
    RESULT_ROWS.filter(
      (r) => vocabulary.shotResults.includes(r.result) && (r.always || results[r.result] > 0),
    ).map((r) => ({
      label: vocabulary.shotResultLabels[r.result],
      value: results[r.result],
      tone: resultTone(r.result, ours),
    }));

  const sourceRows = [...ATTEMPT_SOURCES, "unrecorded" as const]
    .filter((k) => k !== "unrecorded" || s.sources.unrecorded.attempts > 0)
    .map((k) => ({
      label: k === "unrecorded" ? "Not logged" : vocabulary.attemptSourceLabels[k],
      value: s.sources[k].attempts,
      detail: `${s.sources[k].scored} scored`,
    }));

  // Football only: where they went for two, read off the marks on the map.
  const arcRows = s.arc
    ? [
        { label: "Outside the arc", value: s.arc.outside.attempts, detail: `${s.arc.outside.scored} scored` },
        { label: "Inside the arc", value: s.arc.inside.attempts, detail: `${s.arc.inside.scored} scored` },
        ...(s.arc.unplaced.attempts > 0
          ? [{ label: "Not on the map", value: s.arc.unplaced.attempts, detail: `${s.arc.unplaced.scored} scored` }]
          : []),
      ]
    : null;

  return (
    <div className={SIDE_COLUMN}>
      <div>
        <h3 className="title text-[16px]">{name}</h3>

        {/* Overall scoring efficiency — the number that settles the argument. */}
        <div className="mt-3">
          <ShootingFigure s={s} ours={ours} />
        </div>
      </div>

      {/* Four panels sit two by two; hurling's three stay in a row. Laid out by
          the width of the column, not the screen, so they fill whatever room
          the half of the page gives them. */}
      <div className="@container mt-6">
        <div
          className={`grid gap-x-5 gap-y-5 ${arcRows ? "@[22rem]:grid-cols-2" : "@[22rem]:grid-cols-2 @[36rem]:grid-cols-3"}`}
        >
          <Counts title={vocabulary.shotKindLabels.play} rows={resultRows(s.playResults)} />
          <Counts title={`Scorable free or ${vocabulary.terms.endLineFree}`} rows={resultRows(s.placedResults)} />
          <Counts title="Attempt came from" rows={sourceRows} />
          {arcRows && <Counts title="Inside or outside the arc" rows={arcRows} />}
        </div>
      </div>

      <div className="mt-6">
        <HalfMaps rows={rows} players={players} code={vocabulary.code} stacked />
      </div>
    </div>
  );
}

function OppositionRuns({
  rows,
  theirsLogged,
  vocabulary,
}: {
  rows: StatRow[];
  theirsLogged: boolean;
  vocabulary: StatVocabulary;
}) {
  if (!theirsLogged) {
    return (
      <p className="text-[14px]" style={{ color: "var(--color-ink-faint)" }}>
        This needs their shots logged as well as ours.
      </p>
    );
  }
  const runs = oppositionRuns(rows);
  if (runs.length === 0) {
    return (
      <p className="text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
        None. They never had four attempts in a row without us replying.
      </p>
    );
  }

  // A column nobody filled in is a column of dashes; leave it off.
  const timed = runs.some((run) => run.some((r) => r.gameMs != null));
  const halved = runs.some((run) => run.some((r) => r.half != null));
  const span = 2 + Number(timed) + Number(halved);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[24rem] border-collapse text-[14px]">
        <thead>
          <tr style={{ color: "var(--color-ink-dim)", borderBottom: "1px solid var(--color-line-strong)" }}>
            {timed && <th className="px-2 py-2 text-left font-medium">Time</th>}
            {halved && <th className="px-2 py-2 text-left font-medium">Half</th>}
            <th className="px-2 py-2 text-left font-medium">Attempt</th>
            <th className="px-2 py-2 text-left font-medium">Outcome</th>
          </tr>
        </thead>
        {runs.map((run, i) => {
          const score = shootingEfficiency(countShots(run, "opposition")).score;
          return (
            <tbody key={run[0].id}>
              <tr>
                <td colSpan={span} className="px-2 pt-4 pb-1 text-[13px]" style={{ color: "var(--color-ink-dim)" }}>
                  Spell {i + 1}: {run.length} attempts, {formatScore(score)} from them
                </td>
              </tr>
              {run.map((r) => {
                const outcome = effectiveOutcome(r);
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--color-line)" }}>
                    {timed && (
                      <td className="tabular px-2 py-1.5">{r.gameMs != null ? formatGameClock(r.gameMs) : <Dash />}</td>
                    )}
                    {halved && <td className="tabular px-2 py-1.5">{r.half ?? <Dash />}</td>}
                    <td className="px-2 py-1.5">{vocabulary.shotKindLabels[r.shotKind ?? "play"]}</td>
                    <td
                      className="px-2 py-1.5"
                      style={{ color: outcome ? toneInk(outcome) : undefined }}
                    >
                      {r.shotResult ? vocabulary.shotResultLabels[r.shotResult] : <Dash />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

function PuckoutColumn({
  name,
  b,
  ours,
  rows,
  players,
  weWon,
  vocabulary,
  analyst,
  watchable,
}: {
  name: string;
  b: PuckoutBreakdown;
  ours: boolean;
  rows: StatRow[];
  players: NumberSheet;
  /** Theirs only: how many of their restarts we broke. */
  weWon?: number;
  vocabulary: StatVocabulary;
  /** A coach: the full advanced puckout picture. Players get the green and red map. */
  analyst: boolean;
  /** Whether a dot can open its moment on the footage. */
  watchable: boolean;
}) {
  const { restarts } = vocabulary.terms;
  if (b.taken === 0) {
    return (
      <div>
        <h3 className="title text-[16px]">{name}</h3>
        <p className="mt-2 text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
          No {restarts.toLowerCase()} logged.
        </p>
      </div>
    );
  }

  // The lengths run across the panel: short, mid and long, each with how many
  // of them were won and what share that is. The length is worked out from
  // where the restart was marked, so it appears here and nowhere in the
  // logging. On a narrow screen the same cells just read one after another.
  const unclear = Object.values(b.byLength).reduce((n, l) => n + l.unclear, 0);
  const lengthRows: CountRow[] = PUCKOUT_LENGTHS.map((length) => {
    const w = b.wonByLength[length];
    return {
      label: PUCKOUT_LENGTH_LABELS[length],
      detail: w.taken === 0 ? "none taken" : `${w.won} of ${w.taken}`,
      value: w.percent,
      suffix: "%",
      tone: "positive",
    };
  });
  const unrecorded = b.byLength.unrecorded;
  const unrecordedLogged = unrecorded.kept + unrecorded.lost > 0;
  if (unrecordedLogged) {
    // Won and lost are ours, as in every row above: on their restarts, the
    // ones we broke and the ones they kept.
    lengthRows.push({
      label: "Length not logged, won",
      value: ours ? unrecorded.kept : unrecorded.lost,
      tone: "positive",
    });
    lengthRows.push({
      label: "Length not logged, lost",
      value: ours ? unrecorded.lost : unrecorded.kept,
      tone: "negative",
    });
  }
  if (unclear > 0) lengthRows.push({ label: "Broke unclear", value: unclear, tone: "unclear" });

  return (
    <div className={SIDE_COLUMN}>
      <div>
      <h3 className="title text-[16px]">{name}</h3>
      <div className="mt-3">
        {ours ? (
          <>
            <p className="text-[17px]">
              We kept {b.retained} of our {b.taken}, {b.retainedPercent}%.
            </p>
            <Meter
              parts={[
                { n: b.retained, outcome: "positive" },
                { n: unclear, outcome: "unclear" },
                { n: b.taken - b.retained - unclear, outcome: "negative" },
              ]}
            />
          </>
        ) : (
          <>
            <p className="text-[17px]">
              We won {weWon ?? 0} of their {b.taken}.
            </p>
            <Meter
              parts={[
                { n: weWon ?? 0, outcome: "positive" },
                { n: unclear, outcome: "unclear" },
                { n: b.taken - (weWon ?? 0) - unclear, outcome: "negative" },
              ]}
            />
          </>
        )}
      </div>
      </div>

      <div className="mt-6">
        <Counts title={`${name} ${restarts.toLowerCase()}`} rows={lengthRows} columns={3} />
      </div>

      <div className="mt-6 space-y-8">
        <RestartLadderPanel
          rows={rows}
          takenBy={ours ? "us" : "opposition"}
          analyst={analyst}
          code={vocabulary.code}
          players={players}
          restartsWord={restarts}
          watchable={watchable}
        />
        {/* A player reads the short ones on the map above, when the squad
            judges them; every restart's map is the coach's. */}
        {(analyst || !restartLadder(rows, ours ? "us" : "opposition")) && (
          <HalfMaps rows={rows} players={players} code={vocabulary.code} stacked />
        )}
      </div>
    </div>
  );
}

/**
 * A line per number: every number on the match's sheet, and any number
 * logged that nobody has been put to yet — those still count, and showing
 * them is what prompts someone to fill the sheet in.
 */
function PlayerTable({
  rows,
  players,
  vocabulary,
}: {
  rows: StatRow[];
  players: NumberSheet;
  vocabulary: StatVocabulary;
}) {
  const lines = playerStatLines(rows);
  // The fifteen always, and a sub only if they did something: a programme
  // lists the subs who came on, not the whole bench.
  const numbers = [...new Set([...players.keys(), ...lines.keys()])]
    .filter((n) => n <= 15 || (lines.get(n)?.entries ?? 0) > 0)
    .sort((a, b) => a - b);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] border-collapse text-[14px]">
        <thead>
          <tr style={{ color: "var(--color-ink-dim)", borderBottom: "1px solid var(--color-line-strong)" }}>
            <th className="px-2 py-2 text-left font-medium">Player</th>
            <Th>Tackles</Th>
            <Th>Received</Th>
            <Th>Possession won</Th>
            <Th>Possession lost</Th>
            <Th>Scored from</Th>
            <Th>Shots</Th>
            <Th>Scored</Th>
            <Th>Efficiency</Th>
            <Th>Frees won</Th>
            <Th>Frees given</Th>
            <Th>{vocabulary.terms.restarts}</Th>
            {vocabulary.terms.marks && <Th>Marks</Th>}
          </tr>
        </thead>
        <tbody>
          {numbers.map((n) => {
            const line = lines.get(n) ?? emptyStatLine(n);
            const shots = lineShooting(line);
            const quiet = line.entries === 0;
            return (
              <tr
                key={n}
                style={{ borderBottom: "1px solid var(--color-line)", opacity: quiet ? 0.55 : 1 }}
              >
                <td className="px-2 py-2">
                  <PlayerCell number={n} players={players} />
                </td>
                <Num value={line.tackles} />
                <OfCell won={line.deliveriesWon} total={line.deliveriesWon + line.deliveriesLost} />
                <Num value={line.turnoversWon} />
                <Num value={line.turnoversConceded} tone="negative" />
                <Num value={line.turnoversLedToScore} />
                <Num value={shots.total} />
                <Cell>{shots.scored > 0 ? formatScore(shots.score) : <Dash />}</Cell>
                <Cell>{shots.total > 0 ? `${shots.percent}%` : <Dash />}</Cell>
                <Num value={line.freesWon} />
                <Num value={line.freesConceded} tone="negative" />
                <Num value={line.puckoutsWon} />
                {vocabulary.terms.marks && <Num value={line.marks} />}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------------- the parts */

type Tone = StatOutcome | "neutral";

/** Text colour for a tone — the ink shade of red, which holds up set small. */
function toneInk(tone: Tone): string | undefined {
  if (tone === "positive") return "var(--color-brand)";
  if (tone === "negative") return "var(--color-danger-ink)";
  if (tone === "unclear") return "var(--color-mark)";
  return undefined;
}

/**
 * One heading of the sheet. Each starts a fresh page when printed, the way the
 * analyst's slides do, so a section can be handed round on its own.
 */
function Section({
  id,
  title,
  note,
  legend,
  maps = false,
  children,
}: {
  /** An anchor other pages can link to — the matches cover links to #shooting. */
  id?: string;
  title: string;
  note?: string;
  legend?: React.ReactNode;
  /** Its maps have halves to switch between: adds the "Full game" button. */
  maps?: boolean;
  children: React.ReactNode;
}) {
  const section = (
    <section id={id} className="mt-14 scroll-mt-6 print:mt-0 print:break-before-page">
      <div className="section-head mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="title text-xl">{title}</h2>
          {note && (
            <p className="measure mt-1 text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
              {note}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {legend}
          {maps && <MapViewToggle />}
        </div>
      </div>
      <div className="space-y-8">{children}</div>
    </section>
  );
  return maps ? <MapViewProvider>{section}</MapViewProvider> : section;
}

/**
 * A section's lead: what happened, in a sentence, the way a match report
 * opens a paragraph — rather than a strip of big figures that each need a
 * label to mean anything. The meter under it is the same count at a glance.
 */
function Lead({
  children,
  parts,
}: {
  children: React.ReactNode;
  parts?: { n: number; outcome: StatOutcome }[];
}) {
  return (
    <div className="measure">
      <p className="text-[17px] leading-snug">{children}</p>
      {parts && <Meter parts={parts} />}
    </div>
  );
}

/**
 * A section's maps, one per half, drawn the way the game went: the pitch is
 * stored with us attacking to the right in both halves, and the 2nd is turned
 * to match the swap of ends. The section's "Full game" button puts the lot on
 * one pitch in the stored direction (see MapView).
 * Entries typed up without a half get a third map rather than being guessed
 * into one — and a sheet with no halves at all gets a single map of the lot.
 */
function HalfMaps({
  rows,
  players,
  code,
  stacked = false,
}: {
  rows: StatRow[];
  players: NumberSheet;
  code: GameCode;
  stacked?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
        Nothing logged.
      </p>
    );
  }

  const unhalved = rows.filter((r) => r.half == null);
  const halved = unhalved.length !== rows.length;
  const group = (title: string, of: StatRow[], turned: boolean): MapGroup => {
    const marks = statMarks(of, players, code);
    return {
      title,
      count: marks.length === of.length ? `${of.length} logged` : `${marks.length} of ${of.length} placed`,
      marks,
      turned,
    };
  };
  // The teams swap ends at the break, so the 2nd half is drawn turned. Entries
  // with no half cannot be placed in the game, so they stay as stored.
  const halves = halved
    ? [
        group("1st half", rows.filter((r) => r.half === 1), false),
        group("2nd half", rows.filter((r) => r.half === 2), true),
        ...(unhalved.length ? [group("Half not logged", unhalved, false)] : []),
      ]
    : [group("Whole match", rows, false)];

  return (
    <MapGroups
      halves={halves}
      full={halved ? group("Full game", rows, false) : null}
      code={code}
      stacked={stacked}
    />
  );
}

/** Whether a section's entries carry halves, so there is something to switch between. */
function hasHalves(rows: StatRow[]): boolean {
  return rows.some((r) => r.half != null);
}

type CountRow = {
  label: string;
  value: number;
  /** Sits right after the value, such as a percent sign. */
  suffix?: string;
  tone?: Tone;
  indent?: boolean;
  detail?: string;
  /** An empty cell that holds its place in a multi-column list. */
  blank?: boolean;
};

/**
 * Two grids for the two halves of a comparison. Side by side, the head, the
 * list and the maps of each column share rows (a subgrid), so the pitches start
 * at the same height however many rows one side has. Stacked on a phone they
 * are just two blocks, one after the other.
 */
const SIDE_BY_SIDE = "grid gap-10 lg:grid-cols-2 lg:gap-x-10 lg:gap-y-0";
const SIDE_COLUMN = "min-w-0 lg:row-span-3 lg:grid lg:grid-rows-subgrid";

/**
 * A short labelled list of counts, like the panels on the analyst's slides.
 * With `columns` it runs that many across once the panel is wide enough, and
 * reads as one list below that; the width is the panel's own, not the screen's.
 */
function Counts({ title, rows, columns = 1 }: { title: string; rows: CountRow[]; columns?: 1 | 3 }) {
  // Pad to a whole last row so its rules run to the edge.
  const padding: CountRow[] =
    columns === 1 || rows.length % columns === 0
      ? []
      : Array.from({ length: columns - (rows.length % columns) }, () => ({ label: "", value: 0, blank: true }));
  const cells = [...rows, ...padding];
  return (
    <div className="@container">
      <h4 className="label mb-1.5">{title}</h4>
      <ul
        className={`border-t ${columns === 3 ? "grid @[36rem]:grid-cols-3" : ""}`}
        style={{ borderColor: "var(--color-line-strong)" }}
      >
        {cells.map((r, i) => {
          // Vertical rules and padding between the columns, only once they exist.
          const col = columns === 3 ? i % 3 : 0;
          const across = columns === 3 ? `${col > 0 ? "@[36rem]:border-l @[36rem]:pl-4 " : ""}${col < 2 ? "@[36rem]:pr-4" : ""}` : "";
          return (
            <li
              key={`${i}-${r.label}`}
              aria-hidden={r.blank || undefined}
              className={`${r.blank ? "hidden @[36rem]:flex" : "flex"} items-baseline justify-between gap-3 border-b py-1.5 text-[14px] ${across}`}
              style={{
                borderColor: "var(--color-line)",
                paddingLeft: r.indent ? "1rem" : undefined,
              }}
            >
              {r.blank ? (
                <span>&nbsp;</span>
              ) : (
                <>
                  <span style={{ color: r.indent ? "var(--color-ink-dim)" : undefined }}>
                    {r.label}
                    {r.detail && (
                      <span className="ml-1.5 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                        {r.detail}
                      </span>
                    )}
                  </span>
                  <span
                    className="tabular"
                    style={{ color: r.value === 0 ? "var(--color-ink-faint)" : toneInk(r.tone ?? "neutral") }}
                  >
                    {r.value}
                    {r.suffix}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * One section, player by player: the analyst's pivot table, turned so the
 * players run down the page rather than across it — fifteen names fit a
 * phone's height, not its width. Columns nobody scored in are left out.
 */
function PivotTable({
  tally,
  players,
  note,
}: {
  tally: PlayerTally;
  players: NumberSheet;
  note?: string;
}) {
  const columns = tally.columns.filter((c) => tally.totals[c.key] > 0);
  if (columns.length === 0) return null;

  const lines = [...tally.lines].sort((a, b) => {
    if (a.playerNumber === null) return 1;
    if (b.playerNumber === null) return -1;
    return a.playerNumber - b.playerNumber;
  });
  const grouped = columns.some((c) => c.group);
  const groups = grouped
    ? columns.reduce<{ name: string; span: number }[]>((acc, c) => {
        const last = acc[acc.length - 1];
        if (last && last.name === (c.group ?? "")) last.span += 1;
        else acc.push({ name: c.group ?? "", span: 1 });
        return acc;
      }, [])
    : [];

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[14px]" style={{ minWidth: `${14 + columns.length * 5}rem` }}>
          <thead>
            {grouped && (
              <tr style={{ color: "var(--color-ink-faint)" }}>
                <th />
                {groups.map((g, i) => (
                  <th key={i} colSpan={g.span} className="px-2 pt-1 text-center text-[12px] font-medium">
                    {g.name}
                  </th>
                ))}
                <th />
              </tr>
            )}
            <tr style={{ color: "var(--color-ink-dim)", borderBottom: "1px solid var(--color-line-strong)" }}>
              <th className="px-2 py-2 text-left font-medium">Player</th>
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-2 text-right font-medium whitespace-nowrap">
                  {c.label}
                </th>
              ))}
              <Th>Total</Th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.playerNumber ?? "nobody"} style={{ borderBottom: "1px solid var(--color-line)" }}>
                <td className="px-2 py-2">
                  {line.playerNumber != null ? (
                    <PlayerCell number={line.playerNumber} players={players} />
                  ) : (
                    <span style={{ color: "var(--color-ink-faint)" }}>Nobody named</span>
                  )}
                </td>
                {columns.map((c) => (
                  <Num key={c.key} value={line.counts[c.key]} tone={c.tone === "negative" ? "negative" : undefined} />
                ))}
                <Num value={line.total} />
              </tr>
            ))}
            <tr className="font-medium" style={{ borderTop: "1px solid var(--color-line-strong)" }}>
              <td className="px-2 py-2">Total</td>
              {columns.map((c) => (
                <Num key={c.key} value={tally.totals[c.key]} tone={c.tone === "negative" ? "negative" : undefined} />
              ))}
              <Num value={columns.reduce((n, c) => n + tally.totals[c.key], 0)} />
            </tr>
          </tbody>
        </table>
      </div>
      {note && (
        <p className="mt-2 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          {note}
        </p>
      )}
    </div>
  );
}

/**
 * The number as worn, the name if the match's sheet has one, and the position
 * that number means on a team sheet — 1 to 15 are positions, the rest subs.
 * The name opens that player's season.
 */
function PlayerCell({ number, players }: { number: number; players: NumberSheet }) {
  const who = players.get(number);
  return (
    <div className="flex items-center gap-2.5">
      <span className="jersey">{number}</span>
      <div className="min-w-0">
        {who ? (
          <Link href={`/stats/players/${who.userId}`} className="block truncate hover:underline">
            {who.displayName}
          </Link>
        ) : (
          <div className="truncate" style={{ color: "var(--color-ink-faint)" }}>
            No name yet
          </div>
        )}
        <div className="truncate text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          {positionByNumber(number)?.name ?? "Sub"}
        </div>
      </div>
    </div>
  );
}

function Legend({ tackle = false }: { tackle?: boolean }) {
  const items: { colour: string; label: string; shape: "filled" | "ring" | "dashed" }[] = [
    { colour: OUTCOME_COLOURS.positive, label: "Our way", shape: "filled" },
    { colour: OUTCOME_COLOURS.negative, label: "Against us", shape: "ring" },
    { colour: OUTCOME_COLOURS.unclear, label: "Unclear", shape: "dashed" },
    ...(tackle ? [{ colour: NEUTRAL_COLOUR, label: "Tackle", shape: "dashed" as const }] : []),
  ];

  return (
    <div className="flex flex-wrap items-center gap-4 text-[12px]" style={{ color: "var(--color-ink-dim)" }}>
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{
              background: i.shape === "filled" ? i.colour : "transparent",
              border: i.shape === "filled" ? "none" : `2px ${i.shape === "dashed" ? "dashed" : "solid"} ${i.colour}`,
              printColorAdjust: "exact",
            }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-2 py-2 text-right font-medium whitespace-nowrap">{children}</th>;
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="tabular px-2 py-2 text-right">{children}</td>;
}

function Dash() {
  return <span style={{ color: "var(--color-ink-faint)" }}>&ndash;</span>;
}

/** A zero is noise in a fifteen-row table, so it reads as a dash. */
function Num({ value, tone }: { value: number; tone?: "negative" }) {
  return (
    <Cell>
      {value === 0 ? (
        <Dash />
      ) : (
        <span style={tone === "negative" ? { color: "var(--color-danger-ink)" } : undefined}>{value}</span>
      )}
    </Cell>
  );
}

/**
 * Won out of aimed at, in words: "1 of 2". Never "1–1", which on a hurling
 * sheet reads as a goal and a point.
 */
function OfCell({ won, total }: { won: number; total: number }) {
  if (total === 0) {
    return (
      <Cell>
        <Dash />
      </Cell>
    );
  }
  return (
    <Cell>
      {won} <span style={{ color: "var(--color-ink-faint)" }}>of</span> {total}
    </Cell>
  );
}
