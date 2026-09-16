import Link from "next/link";
import { PitchMap } from "@/components/pitch/PitchMap";
import { PrintButton } from "./PrintButton";
import { statMarks, type StatMatchInfo, type StatPlayer, type StatRow } from "./types";
import {
  OUTCOME_COLOURS,
  emptyStatLine,
  lineShooting,
  playerStatLines,
  summariseStats,
} from "@/lib/hurling/stats";
import { formatScore } from "@/lib/hurling/notation";
import { positionLabel } from "@/lib/hurling/positions";
import { matchDateLong } from "@/lib/format";

/**
 * The per-match stat sheet, as a coach would hand it round.
 *
 * Everything here is derived from the logged entries — there is no stored
 * total anywhere, so a corrected entry corrects the report. Shooting
 * efficiency leads because it is the one number that settles an argument, and
 * it is the only figure on the page set that large.
 *
 * It prints. The palette flips to ink on paper and the controls disappear
 * (see the print block in globals.css), which is why there is no PDF
 * dependency in this project.
 */
export function StatReport({
  match,
  rows,
  panel,
  canLog,
}: {
  match: StatMatchInfo;
  rows: StatRow[];
  /** Everyone who could appear in the table: the panel, plus anyone credited. */
  panel: StatPlayer[];
  canLog: boolean;
}) {
  const players = new Map(panel.map((p) => [p.id, p]));
  const summary = summariseStats(rows);
  const lines = playerStatLines(rows);
  const { shooting, deliveries, turnovers, ourPuckouts, theirPuckouts } = summary;

  const maps = [
    {
      title: "Deliveries",
      note: "Drawn from where it was struck to where it landed. A lost one is dashed.",
      rows: rows.filter((r) => r.statType === "delivery"),
    },
    {
      title: "Shots",
      note: "Filled dots were scored, rings went wide.",
      rows: rows.filter((r) => r.statType === "shot"),
    },
    {
      title: "Our poc amach",
      note: "Coloured by who won the break, never by whose puck it was.",
      rows: rows.filter((r) => r.statType === "puckout" && r.puckoutTakenBy === "us"),
    },
    {
      title: "Their poc amach",
      note: "A filled dot here is us winning theirs.",
      rows: rows.filter((r) => r.statType === "puckout" && r.puckoutTakenBy === "opposition"),
    },
    {
      title: "Turnovers",
      note: "Filled where we won it, ringed where we coughed it up.",
      rows: rows.filter((r) => r.statType === "turnover"),
    },
    {
      title: "Frees conceded",
      note: "Always against us, so where they were given is the whole story.",
      rows: rows.filter((r) => r.statType === "free_conceded"),
    },
  ].filter((m) => m.rows.length > 0);

  return (
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-16 print:pt-0">
      <header
        className="flex flex-wrap items-end justify-between gap-4 border-b pb-5"
        style={{ borderColor: "var(--color-line-strong)" }}
      >
        <div>
          <p className="text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
            Stat sheet — {matchDateLong(match.playedOn)}
          </p>
          <h1 className="display mt-1.5 text-[clamp(2.2rem,6vw,3.4rem)]">{match.opponent}</h1>
          <p className="mt-1.5 text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
            {[match.competition, match.venue].filter(Boolean).join(" at ") || "Friendly"}
          </p>
        </div>
        <div className="no-print flex items-center gap-2">
          <PrintButton />
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
          {/* The one figure on the page set large: what the shooting was worth. */}
          <section className="slab mt-8 flex flex-wrap items-center gap-x-14 gap-y-6 px-6 py-7">
            <div>
              <p className="text-[13px]" style={{ color: "var(--color-ink-dim)" }}>
                Scored
              </p>
              <p
                className="figure mt-2 text-[clamp(3.4rem,9vw,5.2rem)]"
                style={{ color: "var(--color-ash)" }}
              >
                {formatScore(shooting.score)}
              </p>
            </div>

            <div style={{ minWidth: "16rem", maxWidth: "26rem" }}>
              <p className="text-[13px]" style={{ color: "var(--color-ink-dim)" }}>
                Shooting efficiency
              </p>
              <p className="mt-2 flex items-baseline gap-3">
                <span className="figure text-[2.6rem]">{shooting.percent}%</span>
                <span className="text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
                  {shooting.scored} scored of {shooting.total} shots
                </span>
              </p>
              <div className="meter mt-3" aria-hidden>
                <span
                  style={{
                    width: `${shooting.percent}%`,
                    background: OUTCOME_COLOURS.positive,
                  }}
                />
                <span
                  style={{
                    width: `${100 - shooting.percent}%`,
                    background: OUTCOME_COLOURS.negative,
                  }}
                />
              </div>
            </div>
          </section>

          <section className="mt-10">
            <SectionHead
              title="How the game went"
              note="Everything logged, counted from our side of it."
            />

            <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
              <Tally value={summary.tackles} label="Tackles" note="credited to the panel" />
              <Tally
                value={summary.freesConceded}
                label="Frees conceded"
                note="given away by us"
                tone="negative"
              />
              <Split
                label="Turnovers"
                won={turnovers.won}
                lost={turnovers.conceded}
                wonWord="won"
                lostWord="conceded"
              />
              <Tally
                value={turnovers.ledToScore}
                label="Turnovers we scored from"
                note={`${turnovers.ledToScorePercent}% of the ones we won`}
                tone="positive"
              />
              <Split
                label="Deliveries"
                won={deliveries.won}
                lost={deliveries.lost}
                unclear={deliveries.unclear}
                wonWord="won"
                lostWord="lost"
              />
              <Split
                label="Our poc amach"
                won={ourPuckouts.won}
                lost={ourPuckouts.lost}
                unclear={ourPuckouts.unclear}
                wonWord="retained"
                lostWord="lost"
              />
              <Split
                label="Their poc amach"
                won={theirPuckouts.won}
                lost={theirPuckouts.lost}
                unclear={theirPuckouts.unclear}
                wonWord="won by us"
                lostWord="theirs"
              />
              <Tally
                value={shooting.total}
                label="Shots"
                note={`${shooting.total - shooting.scored} of them wide`}
              />
            </div>
          </section>

          {maps.length > 0 && (
            <section className="mt-12">
              <SectionHead title="Where it happened" note="Every map faces the same way: we attack to the right.">
                <Legend />
              </SectionHead>

              <div className="grid gap-6 lg:grid-cols-2">
                {maps.map((m) => {
                  const marks = statMarks(m.rows, players);
                  return (
                    <figure key={m.title} className="m-0">
                      <figcaption className="mb-2 flex items-baseline justify-between gap-2">
                        <h3 className="title text-[15px]">{m.title}</h3>
                        <span
                          className="tabular text-[12px]"
                          style={{ color: "var(--color-ink-faint)" }}
                        >
                          {marks.length === m.rows.length
                            ? `${m.rows.length} logged`
                            : `${marks.length} of ${m.rows.length} placed`}
                        </span>
                      </figcaption>
                      <PitchMap marks={marks} />
                      <p className="mt-2 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                        {m.note}
                      </p>
                    </figure>
                  );
                })}
              </div>
            </section>
          )}

          <section className="mt-12">
            <SectionHead
              title="Player by player"
              note="A poc amach is credited to whoever won it; entries logged without a name still count in the totals above."
            />

            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] border-collapse text-[14px]">
                <thead>
                  <tr
                    style={{
                      color: "var(--color-ink-dim)",
                      borderBottom: "1px solid var(--color-line-strong)",
                    }}
                  >
                    <th className="px-2 py-2 text-left font-medium">Player</th>
                    <Th>Tackles</Th>
                    <Th>Deliveries</Th>
                    <Th>Turnovers</Th>
                    <Th>Scored from</Th>
                    <Th>Shots</Th>
                    <Th>Scored</Th>
                    <Th>Efficiency</Th>
                    <Th>Frees</Th>
                    <Th>Poc amach</Th>
                  </tr>
                </thead>
                <tbody>
                  {panel.map((p) => {
                    const line = lines.get(p.id) ?? emptyStatLine(p.id);
                    const shots = lineShooting(line);
                    const quiet = line.entries === 0;
                    return (
                      <tr
                        key={p.id}
                        style={{
                          borderBottom: "1px solid var(--color-line)",
                          opacity: quiet ? 0.55 : 1,
                        }}
                      >
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2.5">
                            {p.jerseyNumber != null && (
                              <span className="jersey">{p.jerseyNumber}</span>
                            )}
                            <div className="min-w-0">
                              <div className="truncate">{p.displayName}</div>
                              <div
                                className="truncate text-[12px]"
                                style={{ color: "var(--color-ink-faint)" }}
                              >
                                {positionLabel(p.position)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <Num value={line.tackles} />
                        <Pair a={line.deliveriesWon} b={line.deliveriesLost} />
                        <Pair a={line.turnoversWon} b={line.turnoversConceded} />
                        <Num value={line.turnoversLedToScore} />
                        <Num value={shots.total} />
                        <Cell>
                          {shots.scored > 0 ? formatScore(shots.score) : <Dash />}
                        </Cell>
                        <Cell>{shots.total > 0 ? `${shots.percent}%` : <Dash />}</Cell>
                        <Num value={line.freesConceded} tone="negative" />
                        <Num value={line.puckoutsWon} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function SectionHead({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b pb-2"
      style={{ borderColor: "var(--color-line-strong)" }}
    >
      <div>
        <h2 className="title text-lg">{title}</h2>
        {note && (
          <p className="measure mt-1 text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
            {note}
          </p>
        )}
      </div>
      {children}
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
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);

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
      <div className="meter mt-2.5" aria-hidden>
        {won > 0 && <span style={{ width: `${pct(won)}%`, background: OUTCOME_COLOURS.positive }} />}
        {unclear > 0 && (
          <span style={{ width: `${pct(unclear)}%`, background: OUTCOME_COLOURS.unclear }} />
        )}
        {lost > 0 && (
          <span style={{ width: `${pct(lost)}%`, background: OUTCOME_COLOURS.negative }} />
        )}
      </div>
    </div>
  );
}

function Legend() {
  const items: { colour: string; label: string; shape: "filled" | "ring" | "dashed" }[] = [
    { colour: OUTCOME_COLOURS.positive, label: "Our way", shape: "filled" },
    { colour: OUTCOME_COLOURS.negative, label: "Against us", shape: "ring" },
    { colour: OUTCOME_COLOURS.unclear, label: "Unclear", shape: "dashed" },
  ];

  return (
    <div className="flex items-center gap-4 text-[12px]" style={{ color: "var(--color-ink-dim)" }}>
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
        <span style={tone === "negative" ? { color: "var(--color-danger-ink)" } : undefined}>
          {value}
        </span>
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
      <span style={{ color: b > 0 ? "var(--color-danger-ink)" : "var(--color-ink-faint)" }}>
        {b}
      </span>
    </Cell>
  );
}
