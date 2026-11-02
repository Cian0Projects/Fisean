/**
 * The squad's own stats on the match report.
 *
 * One block per stat that has anything logged, headed by its name and opened
 * with a sentence of totals, the way every built-in section opens. Then the
 * maps by half, if the stat has a place on the pitch, and who it was credited
 * to. Everything is derived from the entries when the page is read: nothing
 * is stored, so a corrected entry corrects the report. A retired stat still
 * shows here, because retiring only stops it being logged.
 *
 * Kept apart from StatReport, which is already long and is organised around
 * the built-in stat types. It prints with the rest: a block per page.
 */
import { PitchMap, type PitchMark } from "@/components/pitch/PitchMap";
import {
  customColour,
  customSentence,
  customShape,
  describeCustom,
  summariseCustom,
  type CustomEntryRow,
  type CustomStatDef,
} from "@/lib/hurling/custom-stats";
import type { GameCode } from "@/lib/hurling/codes";
import { playerLabel, type NumberSheet } from "./types";

export function CustomStatsReport({
  defs,
  rows,
  sheet,
  code,
}: {
  /** Every stat the squad has, retired ones too. */
  defs: CustomStatDef[];
  rows: CustomEntryRow[];
  sheet: NumberSheet;
  code: GameCode;
}) {
  const shown = defs.filter((d) => rows.some((r) => r.statId === d.id));
  if (shown.length === 0) return null;

  return (
    <section id="own-stats" className="mt-14 scroll-mt-6 print:mt-0 print:break-before-page">
      <div className="section-head mb-6">
        <h2 className="title text-xl">Our own stats</h2>
        <p className="measure mt-1 text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
          The stats the coaches added for this squad. They stand on their own and do not change the match score.
        </p>
      </div>
      <div className="space-y-12">
        {shown.map((def) => (
          <StatBlock key={def.id} def={def} rows={rows.filter((r) => r.statId === def.id)} sheet={sheet} code={code} />
        ))}
      </div>
    </section>
  );
}

function StatBlock({
  def,
  rows,
  sheet,
  code,
}: {
  def: CustomStatDef;
  rows: CustomEntryRow[];
  sheet: NumberSheet;
  code: GameCode;
}) {
  const summary = summariseCustom(rows);
  const placed = rows.some((r) => r.originX != null && r.originY != null);

  return (
    <div>
      <h3 className="title text-lg">
        {def.name}
        {def.archivedAt != null && (
          <span className="ml-2 text-[12px] font-normal" style={{ color: "var(--color-ink-faint)" }}>
            Retired
          </span>
        )}
      </h3>
      <p className="measure mt-2 text-[17px] leading-snug">{customSentence(def, summary)}</p>

      {def.points > 0 && placed && <Maps def={def} rows={rows} code={code} />}

      {(summary.players.length > 0 || summary.opposition.length > 0) && (
        <div className="mt-6 grid gap-8 sm:grid-cols-2">
          {summary.players.length > 0 && (
            <Tally
              title="Our players"
              lines={summary.players.map((p) => ({ label: playerLabel(p.number, sheet), value: p.count }))}
            />
          )}
          {summary.opposition.length > 0 && (
            <Tally
              title="Their players"
              lines={summary.opposition.map((p) => ({ label: `Their ${p.number}`, value: p.count }))}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** The pitch is normalised so we always attack to the right, so the halves line up. */
function Maps({ def, rows, code }: { def: CustomStatDef; rows: CustomEntryRow[]; code: GameCode }) {
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
    <div className="mt-6 grid gap-6 md:grid-cols-2">
      {groups.map((g) => {
        const marks = g.rows
          .filter((r) => r.originX != null && r.originY != null)
          .map(
            (r): PitchMark => ({
              id: r.id,
              x: r.originX!,
              y: r.originY!,
              toX: r.destX,
              toY: r.destY,
              colour: customColour(r),
              shape: customShape(r),
              label: r.playerNumber != null ? String(r.playerNumber) : null,
              title: describeCustom(def, r),
            }),
          );
        return (
          <figure key={g.title} className="m-0">
            <figcaption className="mb-2 flex items-baseline justify-between gap-2">
              <h4 className="title text-[14px]">{g.title}</h4>
              <span className="tabular text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                {marks.length === g.rows.length ? `${g.rows.length} logged` : `${marks.length} of ${g.rows.length} placed`}
              </span>
            </figcaption>
            <PitchMap marks={marks} code={code} />
          </figure>
        );
      })}
    </div>
  );
}

function Tally({ title, lines }: { title: string; lines: { label: string; value: number }[] }) {
  return (
    <div>
      <h4 className="label mb-1.5">{title}</h4>
      <ul className="border-t" style={{ borderColor: "var(--color-line-strong)" }}>
        {lines.map((l) => (
          <li
            key={l.label}
            className="flex items-baseline justify-between gap-3 border-b py-1.5 text-[14px]"
            style={{ borderColor: "var(--color-line)" }}
          >
            <span>{l.label}</span>
            <span className="tabular">{l.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
