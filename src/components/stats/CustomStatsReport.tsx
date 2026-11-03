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
import type { PitchMark } from "@/components/pitch/PitchMap";
import { MapGroups, MapViewProvider, MapViewToggle, type MapGroup } from "./MapView";
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

/**
 * The maps by half, the 2nd turned for the swap of ends, with a "Full game"
 * button for all of it on one pitch in the stored direction (see MapView).
 */
function Maps({ def, rows, code }: { def: CustomStatDef; rows: CustomEntryRow[]; code: GameCode }) {
  const unhalved = rows.filter((r) => r.half == null);
  const halved = unhalved.length !== rows.length;
  const group = (title: string, of: CustomEntryRow[], turned: boolean): MapGroup => {
    const marks = of
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
    return {
      title,
      count: marks.length === of.length ? `${of.length} logged` : `${marks.length} of ${of.length} placed`,
      marks,
      turned,
    };
  };
  const halves = halved
    ? [
        group("1st half", rows.filter((r) => r.half === 1), false),
        group("2nd half", rows.filter((r) => r.half === 2), true),
        ...(unhalved.length ? [group("Half not logged", unhalved, false)] : []),
      ]
    : [group("Whole match", rows, false)];

  return (
    <MapViewProvider>
      <div className="mt-6">
        {halved && (
          <div className="mb-3 flex justify-end">
            <MapViewToggle />
          </div>
        )}
        <MapGroups halves={halves} full={halved ? group("Full game", rows, false) : null} code={code} level={4} />
      </div>
    </MapViewProvider>
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
