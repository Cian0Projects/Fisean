import Link from "next/link";
import { PitchMap } from "@/components/pitch/PitchMap";
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
import { formatClock, formatScore } from "@/lib/hurling/notation";
import { positionByNumber } from "@/lib/hurling/positions";
import { matchDateLong } from "@/lib/format";
import { ResultBox } from "@/components/matches/ResultBox";
import { Meter, ShootingFigure } from "./ShootingFigure";

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
}) {
  const vocabulary = statVocabulary(code);
  const { terms } = vocabulary;
  const players = numberSheet(numbers);
  const summary = summariseStats(rows);
  const ours = summariseShooting(rows, "us", code);
  const theirs = summariseShooting(rows, "opposition", code);
  const of = (...types: StatRow["statType"][]) => rows.filter((r) => types.includes(r.statType));
  const shots = of("shot");
  const ourShots = shots.filter((r) => r.side !== "opposition");
  const theirShots = shots.filter((r) => r.side === "opposition");
  const theirsLogged = theirShots.length > 0;
  const result = matchResult(rows);

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

      {rows.length === 0 ? (
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
            <ScorersLine rows={rows} players={players} teamName={teamName} vocabulary={vocabulary} />
          </section>

          {/* ---------------------------------------------- score opportunities */}
          <Section
            id="shooting"
            title="Score opportunities"
            note="Every attempt at the posts, both ways. Their shots are coloured from our side of them: a red ring is one they scored."
            legend={<Legend />}
          >
            <div className="grid gap-10 lg:grid-cols-2">
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

          {/* -------------------------------------------- poc amach or kick-outs */}
          <Section
            title={terms.restarts}
            note={`Each side's own restarts, read from the side taking them. A short one of ours only counts as retained once it is worked out past our ${terms.line}.`}
            legend={<Legend />}
          >
            <div className="grid gap-10 lg:grid-cols-2">
              <PuckoutColumn
                name={teamName}
                b={puckoutBreakdown(rows, "us")}
                ours
                rows={of("puckout").filter((r) => r.puckoutTakenBy === "us")}
                players={players}
                vocabulary={vocabulary}
              />
              <PuckoutColumn
                name={match.opponent}
                b={puckoutBreakdown(rows, "opposition")}
                ours={false}
                rows={of("puckout").filter((r) => r.puckoutTakenBy === "opposition")}
                players={players}
                weWon={summary.theirPuckouts.won}
                vocabulary={vocabulary}
              />
            </div>
          </Section>

          {/* --------------------------------------------------------- delivery */}
          <Section
            title="Delivery"
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

          {/* ---------------------------------------------- turnovers and tackles */}
          <Section
            title="Turnovers and tackles"
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

          {/* ------------------------------------------------------- discipline */}
          <Section
            title="Discipline"
            note="Where frees were given, both ways. Ringed in red against us, filled green for us."
            legend={<Legend />}
          >
            <Lead>{disciplineSentence(summary)}</Lead>
            <HalfMaps rows={of("free_conceded", "free_won")} players={players} code={code} />
          </Section>

          {/* ------------------------------------------------- marks, football */}
          {terms.marks && (
            <Section
              title="Marks"
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
                note="Every entry on the sheet, played from ten seconds before it happened. Pick a player, a half or a kind of moment, then play them all or one at a time."
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
  vocabulary,
}: {
  rows: StatRow[];
  players: NumberSheet;
  teamName: string;
  vocabulary: StatVocabulary;
}) {
  const lines = scorers(rows);
  if (lines.length === 0) return null;
  const named = lines.map((l) => {
    const who =
      l.playerNumber === null
        ? "not named"
        : (initialled(players.get(l.playerNumber)?.displayName) ?? `No. ${l.playerNumber}`);
    // Non-breaking inside an entry, so a name never splits from its score.
    return `${who} ${formatScorerTally(l)}`.replace(/ /g, " ");
  });
  return (
    <div>
      <h2 className="section-head title text-[16px]">Scorers for {teamName}</h2>
      <p className="measure mt-2 text-[17px] leading-relaxed">{named.join(", ")}.</p>
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
    <div>
      <h3 className="title text-[16px]">{name}</h3>

      {/* Overall scoring efficiency — the number that settles the argument. */}
      <div className="mt-3">
        <ShootingFigure s={s} ours={ours} />
      </div>

      {/* Four panels sit two by two; hurling's three stay in a row. */}
      <div
        className={`mt-6 grid gap-5 lg:grid-cols-1 ${arcRows ? "sm:grid-cols-2 xl:grid-cols-2" : "sm:grid-cols-3 xl:grid-cols-3"}`}
      >
        <Counts title={vocabulary.shotKindLabels.play} rows={resultRows(s.playResults)} />
        <Counts title={`Scorable free or ${vocabulary.terms.endLineFree}`} rows={resultRows(s.placedResults)} />
        <Counts title="Attempt came from" rows={sourceRows} />
        {arcRows && <Counts title="Inside or outside the arc" rows={arcRows} />}
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
                      <td className="tabular px-2 py-1.5">{r.gameMs != null ? formatClock(r.gameMs) : <Dash />}</td>
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
}: {
  name: string;
  b: PuckoutBreakdown;
  ours: boolean;
  rows: StatRow[];
  players: NumberSheet;
  /** Theirs only: how many of their restarts we broke. */
  weWon?: number;
  vocabulary: StatVocabulary;
}) {
  const { line: ourLine, restarts } = vocabulary.terms;
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

  // Words from the taker's side, colour from ours: their "won" is red for us.
  const kept: Tone = ours ? "positive" : "negative";
  const lost: Tone = ours ? "negative" : "positive";

  const lengthRows = PUCKOUT_LENGTHS.flatMap((length) => {
    const line = b.byLength[length];
    const label = PUCKOUT_LENGTH_LABELS[length];
    const out: CountRow[] = [{ label: `${label} won`, value: line.kept, tone: kept }];
    // The short ones we won, split by whether they did their job.
    if (ours && length === "short" && (b.shortPastSixtyFive > 0 || b.shortHeldInside > 0)) {
      out.push({ label: `Past our ${ourLine}`, value: b.shortPastSixtyFive, tone: "positive", indent: true });
      out.push({ label: `Held inside our ${ourLine}`, value: b.shortHeldInside, tone: "negative", indent: true });
    }
    // A short one is rarely lost outright, so that row only appears when it was.
    if (line.lost > 0 || length !== "short") out.push({ label: `${label} lost`, value: line.lost, tone: lost });
    return out;
  });
  const unrecorded = b.byLength.unrecorded;
  if (unrecorded.kept + unrecorded.lost > 0) {
    lengthRows.push({ label: "Length not logged, won", value: unrecorded.kept, tone: kept });
    lengthRows.push({ label: "Length not logged, lost", value: unrecorded.lost, tone: lost });
  }
  const unclear = Object.values(b.byLength).reduce((n, l) => n + l.unclear, 0);
  if (unclear > 0) lengthRows.push({ label: "Broke unclear", value: unclear, tone: "unclear" });

  return (
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

      <div className="mt-6 sm:w-2/3 lg:w-full xl:w-2/3">
        <Counts title={`${name} ${restarts.toLowerCase()}`} rows={lengthRows} />
      </div>

      <div className="mt-6">
        <HalfMaps rows={rows} players={players} code={vocabulary.code} stacked />
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
  children,
}: {
  /** An anchor other pages can link to — the matches cover links to #shooting. */
  id?: string;
  title: string;
  note?: string;
  legend?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
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
        {legend}
      </div>
      <div className="space-y-8">{children}</div>
    </section>
  );
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
 * A section's maps, one per half. The pitch is normalised so we always attack
 * to the right, whichever end we played in, so the two halves line up.
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
  const groups =
    unhalved.length === rows.length
      ? [{ title: "Whole match", rows }]
      : [
          { title: "1st half", rows: rows.filter((r) => r.half === 1) },
          { title: "2nd half", rows: rows.filter((r) => r.half === 2) },
          ...(unhalved.length ? [{ title: "Half not logged", rows: unhalved }] : []),
        ];

  return (
    <div className={`grid gap-6 ${stacked ? "" : "md:grid-cols-2"}`}>
      {groups.map((g) => {
        const marks = statMarks(g.rows, players, code);
        return (
          <figure key={g.title} className="m-0">
            <figcaption className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="title text-[14px]">{g.title}</h3>
              <span className="tabular text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                {marks.length === g.rows.length
                  ? `${g.rows.length} logged`
                  : `${marks.length} of ${g.rows.length} placed`}
              </span>
            </figcaption>
            <PitchMap marks={marks} code={code} />
          </figure>
        );
      })}
    </div>
  );
}

type CountRow = { label: string; value: number; tone?: Tone; indent?: boolean; detail?: string };

/** A short labelled list of counts, like the panels on the analyst's slides. */
function Counts({ title, rows }: { title: string; rows: CountRow[] }) {
  return (
    <div>
      <h4 className="label mb-1.5">{title}</h4>
      <ul className="border-t" style={{ borderColor: "var(--color-line-strong)" }}>
        {rows.map((r) => (
          <li
            key={r.label}
            className="flex items-baseline justify-between gap-3 border-b py-1.5 text-[14px]"
            style={{ borderColor: "var(--color-line)", paddingLeft: r.indent ? "1rem" : undefined }}
          >
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
            </span>
          </li>
        ))}
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
 */
function PlayerCell({ number, players }: { number: number; players: NumberSheet }) {
  const who = players.get(number);
  return (
    <div className="flex items-center gap-2.5">
      <span className="jersey">{number}</span>
      <div className="min-w-0">
        <div className="truncate" style={who ? undefined : { color: "var(--color-ink-faint)" }}>
          {who ? who.displayName : "No name yet"}
        </div>
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
