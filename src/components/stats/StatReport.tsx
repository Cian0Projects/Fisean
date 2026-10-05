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
  ATTEMPT_SOURCE_LABELS,
  NEUTRAL_COLOUR,
  OUTCOME_COLOURS,
  PUCKOUT_LENGTHS,
  PUCKOUT_LENGTH_LABELS,
  SHOT_KIND_LABELS,
  SHOT_RESULT_LABELS,
  deliveryTally,
  effectiveOutcome,
  emptyStatLine,
  lineShooting,
  oppositionRuns,
  playerStatLines,
  possessionTally,
  puckoutBreakdown,
  summariseShooting,
  summariseStats,
  type PlayerTally,
  type PuckoutBreakdown,
  type ShotResult,
  type SideShooting,
  type StatOutcome,
} from "@/lib/hurling/stats";
import { formatClock, formatScore, scoreMargin } from "@/lib/hurling/notation";
import { positionByNumber } from "@/lib/hurling/positions";
import { matchDateLong } from "@/lib/format";

/**
 * The per-match stat sheet, as a coach would hand it round.
 *
 * Laid out under the headings a club analyst's summary already uses, in the
 * same order — the scoreline, score opportunities for both teams, the spells
 * where they got on top, poc amach, delivery, possessions won and lost,
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
  match,
  rows,
  numbers,
  canLog,
}: {
  teamName: string;
  match: StatMatchInfo;
  rows: StatRow[];
  /** Who wore what in this match. Entries are logged by number; this names them. */
  numbers: SheetEntry[];
  canLog: boolean;
}) {
  const players = numberSheet(numbers);
  const summary = summariseStats(rows);
  const ours = summariseShooting(rows, "us");
  const theirs = summariseShooting(rows, "opposition");
  const of = (...types: StatRow["statType"][]) => rows.filter((r) => types.includes(r.statType));
  const shots = of("shot");
  const ourShots = shots.filter((r) => r.side !== "opposition");
  const theirShots = shots.filter((r) => r.side === "opposition");
  const theirsLogged = theirShots.length > 0;

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
        <div className="no-print flex items-center gap-2">
          <PrintButton />
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
          {/* Summary: the scoreline both ways, set large. */}
          <section className="slab mt-8 flex flex-wrap items-end gap-x-14 gap-y-6 px-6 py-7">
            <Scoreline name={teamName} score={formatScore(ours.overall.score)} />
            <Scoreline
              name={match.opponent}
              score={theirsLogged ? formatScore(theirs.overall.score) : null}
            />
            <p className="pb-2 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
              {theirsLogged
                ? marginSentence(scoreMargin(ours.overall.score, theirs.overall.score))
                : "Their shots are not logged, so there is no margin to give."}
              <span className="block text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                Counted from the shots on this sheet.
              </span>
            </p>
          </section>

          {/* ---------------------------------------------- score opportunities */}
          <Section
            title="Score opportunities"
            note="Every attempt at the posts, both ways. Their shots are coloured from our side of them: a red ring is one they scored."
            legend={<Legend />}
          >
            <div className="grid gap-10 lg:grid-cols-2">
              <ShootingColumn name={teamName} s={ours} ours rows={ourShots} players={players} />
              <ShootingColumn
                name={match.opponent}
                s={theirs}
                ours={false}
                rows={theirShots}
                players={players}
                empty="Log their shots with “Theirs” picked and they appear here."
              />
            </div>
          </Section>

          {/* ------------------------------------ consecutive opposition attempts */}
          <Section
            title="Consecutive opposition score attempts"
            note={`Spells where ${match.opponent} had four or more attempts in a row without a reply from us.`}
          >
            <OppositionRuns rows={rows} theirsLogged={theirsLogged} />
          </Section>

          {/* -------------------------------------------------------- poc amach */}
          <Section
            title="Poc amach"
            note="Each side's own restarts, read from the side taking them. A short one of ours only counts as retained once it is worked out past our 65."
            legend={<Legend />}
          >
            <div className="grid gap-10 lg:grid-cols-2">
              <PuckoutColumn
                name={teamName}
                b={puckoutBreakdown(rows, "us")}
                ours
                rows={of("puckout").filter((r) => r.puckoutTakenBy === "us")}
                players={players}
              />
              <PuckoutColumn
                name={match.opponent}
                b={puckoutBreakdown(rows, "opposition")}
                ours={false}
                rows={of("puckout").filter((r) => r.puckoutTakenBy === "opposition")}
                players={players}
                weWon={summary.theirPuckouts.won}
              />
            </div>
          </Section>

          {/* --------------------------------------------------------- delivery */}
          <Section
            title="Delivery"
            note="From inside our 65 to beyond theirs. Each arrow runs from where it was struck to where it landed; a lost one is dashed."
            legend={<Legend />}
          >
            <Figures>
              <Split
                label="Deliveries"
                won={summary.deliveries.won}
                lost={summary.deliveries.lost}
                unclear={summary.deliveries.unclear}
                wonWord="received"
                lostWord="lost"
              />
            </Figures>
            <HalfMaps rows={of("delivery")} players={players} />
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
            <Figures>
              <Split
                label="Possessions"
                won={summary.turnovers.won}
                lost={summary.turnovers.conceded}
                wonWord="won"
                lostWord="lost"
              />
              <Tally
                value={summary.turnovers.ledToScore}
                label="Won and scored from"
                note={`${summary.turnovers.ledToScorePercent}% of the ones we won`}
                tone="positive"
              />
              <Tally
                value={summary.tackles}
                label="Tackles"
                note={`${summary.frontEightTackles} by the front eight`}
              />
            </Figures>
            <HalfMaps rows={of("tackle", "turnover")} players={players} />
            <PivotTable tally={possessionTally(rows)} players={players} />
          </Section>

          {/* ------------------------------------------------------- discipline */}
          <Section
            title="Discipline"
            note="Where frees were given, both ways. Ringed in red against us, filled green for us."
            legend={<Legend />}
          >
            <Figures>
              <Tally
                value={summary.freesConceded - summary.scorableFreesConceded}
                label="Frees conceded"
                note="out of their range"
                tone="negative"
              />
              <Tally
                value={summary.scorableFreesConceded}
                label="Scorable frees conceded"
                note="within their free-taker's range"
                tone="negative"
              />
              <Tally value={summary.freesWon} label="Frees won" tone="positive" />
            </Figures>
            <HalfMaps rows={of("free_conceded", "free_won")} players={players} />
          </Section>

          {/* -------------------------------------------------- player by player */}
          <Section
            title="Player by player"
            note="A poc amach is credited to whoever won it; entries logged without a name still count in the totals above."
          >
            <PlayerTable rows={rows} players={players} />
          </Section>
        </>
      )}
    </main>
  );
}

/* ------------------------------------------------------------- the sections */

function marginSentence(margin: number): string {
  if (margin === 0) return "Level.";
  const n = Math.abs(margin);
  return `${margin > 0 ? "Won" : "Lost"} by ${n} point${n === 1 ? "" : "s"}.`;
}

function Scoreline({ name, score }: { name: string; score: string | null }) {
  return (
    <div>
      <p className="text-[13px]" style={{ color: "var(--color-ink-dim)" }}>
        {name}
      </p>
      <p className="figure mt-2 text-[clamp(3rem,8vw,4.6rem)]" style={{ color: "var(--color-ash)" }}>
        {score ?? <span style={{ color: "var(--color-ink-faint)" }}>&ndash;</span>}
      </p>
    </div>
  );
}

/** Rows in the order the analyst's sheet lists them; the rarer ones only when they happened. */
const RESULT_ROWS: { result: ShotResult; always: boolean }[] = [
  { result: "goal", always: true },
  { result: "point", always: true },
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
}: {
  name: string;
  s: SideShooting;
  ours: boolean;
  rows: StatRow[];
  players: NumberSheet;
  empty?: string;
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
    RESULT_ROWS.filter((r) => r.always || results[r.result] > 0).map((r) => ({
      label: SHOT_RESULT_LABELS[r.result],
      value: results[r.result],
      tone: resultTone(r.result, ours),
    }));

  const sourceRows = [...ATTEMPT_SOURCES, "unrecorded" as const]
    .filter((k) => k !== "unrecorded" || s.sources.unrecorded.attempts > 0)
    .map((k) => ({
      label: k === "unrecorded" ? "Not logged" : ATTEMPT_SOURCE_LABELS[k],
      value: s.sources[k].attempts,
      detail: `${s.sources[k].scored} scored`,
    }));

  return (
    <div>
      <h3 className="title text-[16px]">{name}</h3>

      {/* Overall scoring efficiency — the number that settles the argument. */}
      <div className="mt-3">
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className="figure text-[2.6rem]">{s.overall.percent}%</span>
          <span className="text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
            {s.overall.fraction} scored, {formatScore(s.overall.score)}
          </span>
        </p>
        <p className="text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
          {s.fromPlay.percent}% from play ({s.fromPlay.fraction})
          {s.placed.total > 0 && `, ${s.placed.percent}% from frees and 65s (${s.placed.fraction})`}
        </p>
        <Meter
          parts={[
            { n: s.overall.scored, outcome: ours ? "positive" : "negative" },
            { n: s.overall.total - s.overall.scored, outcome: ours ? "negative" : "positive" },
          ]}
        />
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        <Counts title={SHOT_KIND_LABELS.play} rows={resultRows(s.playResults)} />
        <Counts title="Scorable free or 65" rows={resultRows(s.placedResults)} />
        <Counts title="Attempt came from" rows={sourceRows} />
      </div>

      <div className="mt-6">
        <HalfMaps rows={rows} players={players} stacked />
      </div>
    </div>
  );
}

function OppositionRuns({ rows, theirsLogged }: { rows: StatRow[]; theirsLogged: boolean }) {
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

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-[14px]">
        <thead>
          <tr style={{ color: "var(--color-ink-dim)", borderBottom: "1px solid var(--color-line-strong)" }}>
            <th className="px-2 py-2 text-left font-medium">Time</th>
            <th className="px-2 py-2 text-left font-medium">Half</th>
            <th className="px-2 py-2 text-left font-medium">Attempt</th>
            <th className="px-2 py-2 text-left font-medium">Outcome</th>
          </tr>
        </thead>
        {runs.map((run, i) => {
          const scored = run.filter((r) => r.shotResult === "goal" || r.shotResult === "point");
          const goals = scored.filter((r) => r.shotResult === "goal").length;
          return (
            <tbody key={run[0].id}>
              <tr>
                <td colSpan={4} className="px-2 pt-4 pb-1 text-[13px]" style={{ color: "var(--color-ink-dim)" }}>
                  Spell {i + 1}: {run.length} attempts, {formatScore({ cul: goals, cuilin: scored.length - goals })} from them
                </td>
              </tr>
              {run.map((r) => {
                const outcome = effectiveOutcome(r);
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--color-line)" }}>
                    <td className="tabular px-2 py-1.5">{r.gameMs != null ? formatClock(r.gameMs) : <Dash />}</td>
                    <td className="tabular px-2 py-1.5">{r.half ?? <Dash />}</td>
                    <td className="px-2 py-1.5">{SHOT_KIND_LABELS[r.shotKind ?? "play"]}</td>
                    <td
                      className="px-2 py-1.5"
                      style={{ color: outcome ? toneInk(outcome) : undefined }}
                    >
                      {r.shotResult ? SHOT_RESULT_LABELS[r.shotResult] : <Dash />}
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
}: {
  name: string;
  b: PuckoutBreakdown;
  ours: boolean;
  rows: StatRow[];
  players: NumberSheet;
  /** Theirs only: how many of their restarts we broke. */
  weWon?: number;
}) {
  if (b.taken === 0) {
    return (
      <div>
        <h3 className="title text-[16px]">{name}</h3>
        <p className="mt-2 text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
          No poc amach logged.
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
      out.push({ label: "Past our 65", value: b.shortPastSixtyFive, tone: "positive", indent: true });
      out.push({ label: "Held inside our 65", value: b.shortHeldInside, tone: "negative", indent: true });
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
            <p className="flex flex-wrap items-baseline gap-x-3">
              <span className="figure text-[2.6rem]">{b.retainedPercent}%</span>
              <span className="text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
                retained, {b.retained} of {b.taken}
              </span>
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
            <p className="flex flex-wrap items-baseline gap-x-3">
              <span className="figure text-[2.6rem]">{weWon ?? 0}</span>
              <span className="text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
                of {b.taken} won by us
              </span>
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
        <Counts title={`${name} poc amach`} rows={lengthRows} />
      </div>

      <div className="mt-6">
        <HalfMaps rows={rows} players={players} stacked />
      </div>
    </div>
  );
}

/**
 * A line per number: every number on the match's sheet, and any number
 * logged that nobody has been put to yet — those still count, and showing
 * them is what prompts someone to fill the sheet in.
 */
function PlayerTable({ rows, players }: { rows: StatRow[]; players: NumberSheet }) {
  const lines = playerStatLines(rows);
  const numbers = [...new Set([...players.keys(), ...lines.keys()])].sort((a, b) => a - b);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] border-collapse text-[14px]">
        <thead>
          <tr style={{ color: "var(--color-ink-dim)", borderBottom: "1px solid var(--color-line-strong)" }}>
            <th className="px-2 py-2 text-left font-medium">Player</th>
            <Th>Tackles</Th>
            <Th>Deliveries</Th>
            <Th>Turnovers</Th>
            <Th>Scored from</Th>
            <Th>Shots</Th>
            <Th>Scored</Th>
            <Th>Efficiency</Th>
            <Th>Frees won</Th>
            <Th>Frees given</Th>
            <Th>Poc amach</Th>
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
                <Pair a={line.deliveriesWon} b={line.deliveriesLost} />
                <Pair a={line.turnoversWon} b={line.turnoversConceded} />
                <Num value={line.turnoversLedToScore} />
                <Num value={shots.total} />
                <Cell>{shots.scored > 0 ? formatScore(shots.score) : <Dash />}</Cell>
                <Cell>{shots.total > 0 ? `${shots.percent}%` : <Dash />}</Cell>
                <Num value={line.freesWon} />
                <Num value={line.freesConceded} tone="negative" />
                <Num value={line.puckoutsWon} />
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
  title,
  note,
  legend,
  children,
}: {
  title: string;
  note?: string;
  legend?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-14 print:mt-0 print:break-before-page">
      <div
        className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b pb-2"
        style={{ borderColor: "var(--color-line-strong)" }}
      >
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

function Figures({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
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
  stacked = false,
}: {
  rows: StatRow[];
  players: NumberSheet;
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
        const marks = statMarks(g.rows, players);
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
            <PitchMap marks={marks} />
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
                <th
                  key={c.key}
                  className="px-2 py-2 text-right font-medium whitespace-nowrap"
                  style={{ color: toneInk(c.tone) }}
                >
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

function Meter({ parts }: { parts: { n: number; outcome: StatOutcome }[] }) {
  const total = parts.reduce((a, p) => a + p.n, 0);
  if (total === 0) return null;
  return (
    <div className="meter mt-3" aria-hidden>
      {parts
        .filter((p) => p.n > 0)
        .map((p, i) => (
          <span key={i} style={{ width: `${(p.n / total) * 100}%`, background: OUTCOME_COLOURS[p.outcome] }} />
        ))}
    </div>
  );
}

/** A count that stands on its own: a tally with nothing to compare it to. */
function Tally({
  value,
  label,
  note,
  tone,
}: {
  value: number;
  label: string;
  note?: string;
  tone?: "positive" | "negative";
}) {
  const colour =
    tone === "positive"
      ? OUTCOME_COLOURS.positive
      : tone === "negative"
        ? OUTCOME_COLOURS.negative
        : "var(--color-ink)";

  return (
    <div>
      <div className="flex h-[2.4rem] items-end">
        <span className="figure text-[2.3rem]" style={{ color: colour }}>
          {value}
        </span>
      </div>
      <div className="mt-1.5 text-[14px]">{label}</div>
      {note && (
        <div className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          {note}
        </div>
      )}
    </div>
  );
}

/**
 * A count that only means something against its opposite — won and lost. The
 * bar is the proportion; the words underneath say which way round it is, so
 * the colours are never doing the work alone.
 */
function Split({
  label,
  won,
  lost,
  unclear = 0,
  wonWord,
  lostWord,
}: {
  label: string;
  won: number;
  lost: number;
  unclear?: number;
  wonWord: string;
  lostWord: string;
}) {
  const total = won + lost + unclear;

  return (
    <div>
      <div className="flex h-[2.4rem] items-end gap-1.5">
        <span className="figure text-[2.3rem]">{won}</span>
        <span className="text-[1.1rem] leading-none" style={{ color: "var(--color-ink-faint)" }}>
          of {total}
        </span>
      </div>
      <div className="mt-1.5 text-[14px]">{label}</div>
      <div className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
        {won} {wonWord}, {lost} {lostWord}
        {unclear > 0 && `, ${unclear} unclear`}
      </div>
      <Meter
        parts={[
          { n: won, outcome: "positive" },
          { n: unclear, outcome: "unclear" },
          { n: lost, outcome: "negative" },
        ]}
      />
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

/** Won and lost in one cell, the way a coach reads a line: 5–2. */
function Pair({ a, b }: { a: number; b: number }) {
  if (a === 0 && b === 0) {
    return (
      <Cell>
        <Dash />
      </Cell>
    );
  }
  return (
    <Cell>
      <span style={{ color: a > 0 ? "var(--color-brand)" : "var(--color-ink-faint)" }}>{a}</span>
      <span style={{ color: "var(--color-ink-faint)" }}>&ndash;</span>
      <span style={{ color: b > 0 ? "var(--color-danger-ink)" : "var(--color-ink-faint)" }}>{b}</span>
    </Cell>
  );
}
