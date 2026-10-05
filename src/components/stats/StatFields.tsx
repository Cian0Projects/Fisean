"use client";

/**
 * The questions one stat asks, shared by both ways of logging it.
 *
 * The standalone sheet (StatLogger) and the live pad in the review workspace
 * (StatPad) differ in everything around the form — clock, layout, clip
 * picker — but must ask exactly the same things of a shot or a poc amach, or
 * the two would log different sheets. So the fields live here once, driven
 * by one `StatDetail` value, and each form keeps only its own frame.
 *
 * Every follow-up question appears only once the answer before it makes it
 * meaningful: "worked past our 65" only for our short poc amach that we won,
 * "unforced" only for a ball we lost. A coach never sees a field that cannot
 * apply, which is most of what keeps a nine-column row quick to log.
 *
 * Players are logged by the number on their back, typed. From the line a
 * number is what you can actually see, and two keystrokes beat finding a name
 * in a list of thirty. The match's number sheet puts names to them, whenever
 * someone gets round to it.
 */
import type { StatDraft } from "@/lib/hurling/stats";
import {
  ATTEMPT_SOURCES,
  ATTEMPT_SOURCE_LABELS,
  MAX_JERSEY,
  OUTCOME_COLOURS,
  POSSESSION_KINDS,
  POSSESSION_KIND_LABELS,
  PUCKOUT_LENGTHS,
  PUCKOUT_LENGTH_LABELS,
  SHOT_KINDS,
  SHOT_KIND_LABELS,
  SHOT_RESULTS,
  SHOT_RESULT_LABELS,
  STAT_TYPE_META,
  effectiveOutcome,
  outcomeLabel,
  puckoutOutcome,
  puckoutWinner,
  type AttemptSource,
  type Half,
  type PossessionKind,
  type PuckoutLength,
  type PuckoutSide,
  type PuckoutWinner,
  type ShotKind,
  type ShotResult,
  type Side,
  type StatOutcome,
  type StatType,
} from "@/lib/hurling/stats";
import type { NumberSheet, StatRow } from "./types";

export type StatDetail = {
  half: Half | null;
  outcome: StatOutcome | null;
  /** Jersey numbers as typed, so a half-typed one survives a re-render. */
  playerNumber: string;
  targetNumber: string;
  side: Side;
  shotResult: ShotResult | null;
  shotKind: ShotKind;
  attemptSource: AttemptSource | null;
  ledToScore: boolean;
  possession: PossessionKind;
  frontEight: boolean;
  scorable: boolean;
  puckoutTakenBy: PuckoutSide;
  puckoutLength: PuckoutLength | null;
  pastSixtyFive: boolean;
};

export const EMPTY_DETAIL: StatDetail = {
  half: null,
  outcome: null,
  playerNumber: "",
  targetNumber: "",
  side: "us",
  shotResult: null,
  shotKind: "play",
  attemptSource: null,
  ledToScore: false,
  possession: "turnover",
  frontEight: false,
  scorable: false,
  puckoutTakenBy: "us",
  puckoutLength: null,
  pastSixtyFive: false,
};

/**
 * The next entry is a different moment, so the details go — but the half and
 * whose ball it was are context, and usually the same again. Keeping them
 * saves a click on nearly every entry during a spell of pressure.
 */
export function nextDetail(prev: StatDetail): StatDetail {
  return {
    ...EMPTY_DETAIL,
    half: prev.half,
    side: prev.side,
    puckoutTakenBy: prev.puckoutTakenBy,
  };
}

/** Switching type keeps who and where; how it ended belongs to the old type. */
export function detailForType(prev: StatDetail): StatDetail {
  return { ...prev, outcome: null, shotResult: null, ledToScore: false, pastSixtyFive: false };
}

export function detailFromRow(row: StatRow): StatDetail {
  return {
    half: row.half,
    outcome: row.outcome,
    playerNumber: row.playerNumber != null ? String(row.playerNumber) : "",
    targetNumber: row.targetNumber != null ? String(row.targetNumber) : "",
    side: row.side ?? "us",
    shotResult: row.shotResult,
    shotKind: row.shotKind ?? "play",
    attemptSource: row.attemptSource,
    ledToScore: Boolean(row.ledToScore),
    possession: row.possession ?? "turnover",
    frontEight: Boolean(row.frontEight),
    scorable: Boolean(row.scorable),
    puckoutTakenBy: row.puckoutTakenBy ?? "us",
    puckoutLength: row.puckoutLength,
    pastSixtyFive: Boolean(row.pastSixtyFive),
  };
}

/**
 * Whether a player can be named at all. A poc amach names its receiver, so
 * only one we won; their shot names nobody, because the panel list is ours.
 */
export function playerAllowed(type: StatType, d: StatDetail): boolean {
  if (type === "puckout") return d.outcome === "positive";
  if (type === "shot") return d.side === "us";
  return true;
}

/** A typed jersey number, or null for an empty box or one nobody could wear. */
export function typedNumber(value: string): number | null {
  const n = Number(value.trim());
  return value.trim() && Number.isInteger(n) && n >= 1 && n <= MAX_JERSEY ? n : null;
}

const numberOk = (value: string) => value.trim() === "" || typedNumber(value) !== null;

export function detailReady(type: StatType, d: StatDetail): boolean {
  const meta = STAT_TYPE_META[type];
  if (meta.outcomes.length > 0 && d.outcome === null) return false;
  if (type === "shot" && d.shotResult === null) return false;
  if (playerAllowed(type, d) && !numberOk(d.playerNumber)) return false;
  if (type === "delivery" && !numberOk(d.targetNumber)) return false;
  return true;
}

/** The detail as the server action wants it. The action normalises it again. */
export function detailToDraft(type: StatType, d: StatDetail): StatDraft {
  return {
    statType: type,
    half: d.half,
    outcome: d.outcome,
    playerNumber: playerAllowed(type, d) ? typedNumber(d.playerNumber) : null,
    targetNumber: type === "delivery" ? typedNumber(d.targetNumber) : null,
    side: d.side,
    shotResult: d.shotResult,
    shotKind: d.shotKind,
    attemptSource: d.attemptSource,
    ledToScore: d.ledToScore,
    possession: d.possession,
    frontEight: d.frontEight,
    scorable: d.scorable,
    puckoutTakenBy: d.puckoutTakenBy,
    puckoutLength: d.puckoutLength,
    pastSixtyFive: d.pastSixtyFive,
  };
}

const PUCKOUT_WINNERS: { value: PuckoutWinner; label: string }[] = [
  { value: "us", label: "We won it" },
  { value: "opposition", label: "They won it" },
  { value: "unclear", label: "Broke unclear" },
];

const PLAYER_LABELS: Partial<Record<StatType, string>> = {
  delivery: "Struck by",
  puckout: "Won by",
  tackle: "Tackle by",
  free_won: "Fouled",
  free_conceded: "Conceded by",
};

export function StatFields({
  statType,
  detail,
  onChange,
  sheet,
  idPrefix,
  halfNote,
}: {
  statType: StatType;
  detail: StatDetail;
  onChange: (patch: Partial<StatDetail>) => void;
  /** This match's numbers, to show who a typed number is. */
  sheet: NumberSheet;
  /** Keeps label ids unique when two forms could share a page. */
  idPrefix: string;
  /** Said under the half picker, e.g. that the video's markers set it. */
  halfNote?: string;
}) {
  const meta = STAT_TYPE_META[statType];
  const d = detail;
  const named = playerAllowed(statType, d);

  return (
    <>
      <Choice
        label="Half"
        options={[
          { value: "1", label: "1st half" },
          { value: "2", label: "2nd half" },
        ]}
        value={d.half ? String(d.half) : null}
        onChange={(v) => onChange({ half: Number(v) as Half })}
        note={halfNote}
      />

      {statType === "shot" && (
        <>
          <Choice
            label="Whose shot"
            options={[
              { value: "us", label: "Ours" },
              { value: "opposition", label: "Theirs" },
            ]}
            value={d.side}
            onChange={(v) => onChange({ side: v as Side })}
          />
          <Choice
            label="From"
            options={SHOT_KINDS.map((k) => ({ value: k, label: SHOT_KIND_LABELS[k] }))}
            value={d.shotKind}
            onChange={(v) => onChange({ shotKind: v as ShotKind })}
          />
          <Choice
            label="Result"
            options={SHOT_RESULTS.map((r) => {
              const outcome = effectiveOutcome({ statType: "shot", outcome: null, shotResult: r, side: d.side });
              return {
                value: r,
                label: SHOT_RESULT_LABELS[r],
                colour: outcome ? OUTCOME_COLOURS[outcome] : undefined,
              };
            })}
            value={d.shotResult}
            onChange={(v) => onChange({ shotResult: v as ShotResult })}
          />
          <Choice
            label="Came from"
            options={ATTEMPT_SOURCES.map((s) => ({ value: s, label: ATTEMPT_SOURCE_LABELS[s] }))}
            value={d.attemptSource}
            onChange={(v) => onChange({ attemptSource: v as AttemptSource })}
            clearable
            onClear={() => onChange({ attemptSource: null })}
          />
        </>
      )}

      {statType === "puckout" && (
        <>
          <Choice
            label="Whose poc amach"
            options={[
              { value: "us", label: "Ours" },
              { value: "opposition", label: "Theirs" },
            ]}
            value={d.puckoutTakenBy}
            onChange={(v) => onChange({ puckoutTakenBy: v as PuckoutSide })}
          />
          <Choice
            label="How far"
            options={PUCKOUT_LENGTHS.map((l) => ({ value: l, label: PUCKOUT_LENGTH_LABELS[l] }))}
            value={d.puckoutLength}
            onChange={(v) => onChange({ puckoutLength: v as PuckoutLength })}
            clearable
            onClear={() => onChange({ puckoutLength: null })}
          />
          <Choice
            label="Who won the break"
            options={PUCKOUT_WINNERS.map((w) => ({
              value: w.value,
              label: w.label,
              colour: OUTCOME_COLOURS[puckoutOutcome(w.value)],
            }))}
            value={d.outcome ? puckoutWinner(d.outcome) : null}
            onChange={(v) => onChange({ outcome: puckoutOutcome(v as PuckoutWinner) })}
          />
          {d.puckoutTakenBy === "us" && d.puckoutLength === "short" && d.outcome === "positive" && (
            <Check
              checked={d.pastSixtyFive}
              onChange={(v) => onChange({ pastSixtyFive: v })}
              label="Worked out past our 65"
            />
          )}
        </>
      )}

      {(statType === "delivery" || statType === "turnover") && (
        <Choice
          label="How it ended"
          options={meta.outcomes.map((o) => ({
            value: o,
            label: outcomeLabel(statType, o),
            colour: OUTCOME_COLOURS[o],
          }))}
          value={d.outcome}
          onChange={(v) => {
            const outcome = v as StatOutcome;
            // An unforced loss cannot be won, so winning one resets it.
            const possession = outcome === "positive" && d.possession === "unforced" ? "turnover" : d.possession;
            onChange({ outcome, possession });
          }}
        />
      )}

      {statType === "turnover" && (
        <Choice
          label="How"
          options={POSSESSION_KINDS.filter((k) => k !== "unforced" || d.outcome !== "positive").map((k) => ({
            value: k,
            label: POSSESSION_KIND_LABELS[k],
          }))}
          value={d.possession}
          onChange={(v) => onChange({ possession: v as PossessionKind })}
        />
      )}

      {statType === "turnover" && d.outcome === "positive" && (
        <Check checked={d.ledToScore} onChange={(v) => onChange({ ledToScore: v })} label="We scored from it" />
      )}

      {statType === "tackle" && (
        <Check
          checked={d.frontEight}
          onChange={(v) => onChange({ frontEight: v })}
          label="Front eight — made by a forward or a midfielder"
        />
      )}

      {statType === "free_conceded" && (
        <Check
          checked={d.scorable}
          onChange={(v) => onChange({ scorable: v })}
          label="Scorable — within their free-taker's range"
        />
      )}

      {named && (
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            id={`${idPrefix}-player`}
            label={PLAYER_LABELS[statType] ?? "Player"}
            value={d.playerNumber}
            onChange={(v) => onChange({ playerNumber: v })}
            sheet={sheet}
          />
          {statType === "delivery" && (
            <NumberField
              id={`${idPrefix}-target`}
              label={d.outcome === "negative" ? "Aimed at, and lost" : "Aimed at"}
              value={d.targetNumber}
              onChange={(v) => onChange({ targetNumber: v })}
              sheet={sheet}
            />
          )}
        </div>
      )}
      {!named && statType === "puckout" && (
        <p className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          A poc amach names the receiver, so only one we won takes a player.
        </p>
      )}
    </>
  );
}

/**
 * A jersey number, typed, with whoever wore it said beside it. The list under
 * the box offers the numbers already on the sheet for anyone who would rather
 * pick, but typing is the point: a number the sheet does not have yet is
 * still logged, and gets its name when the sheet does.
 */
function NumberField({
  id,
  label,
  value,
  onChange,
  sheet,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  sheet: NumberSheet;
}) {
  const n = typedNumber(value);
  const who = n != null ? sheet.get(n) : undefined;
  const note = !value.trim()
    ? "Nobody named"
    : n == null
      ? `Jersey numbers run from 1 to ${MAX_JERSEY}`
      : who
        ? who.displayName
        : "No name on this number yet";

  return (
    <div>
      <label className="label mb-1.5 block" htmlFor={id}>
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 2))}
          inputMode="numeric"
          autoComplete="off"
          placeholder="No."
          list={`${id}-numbers`}
          aria-describedby={`${id}-who`}
          className="field tabular w-16 text-center font-bold"
        />
        <span
          id={`${id}-who`}
          className="min-w-0 truncate text-[14px]"
          style={{ color: who ? "var(--color-ink)" : "var(--color-ink-faint)" }}
        >
          {note}
        </span>
      </div>
      <datalist id={`${id}-numbers`}>
        {[...sheet.values()].map((e) => (
          <option key={e.number} value={e.number}>
            {e.displayName}
          </option>
        ))}
      </datalist>
    </div>
  );
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex w-fit items-center gap-2.5 text-[14px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[var(--color-brand)]"
      />
      {label}
    </label>
  );
}

/**
 * A row of mutually exclusive choices — faster to hit than a dropdown. An
 * optional question can be cleared by pressing the chosen answer again.
 */
export function Choice({
  label,
  options,
  value,
  onChange,
  note,
  clearable = false,
  onClear,
}: {
  label: string;
  options: { value: string; label: string; colour?: string }[];
  value: string | null;
  onChange: (value: string) => void;
  note?: string;
  clearable?: boolean;
  onClear?: () => void;
}) {
  return (
    <div>
      <span className="label mb-1.5 block">
        {label}
        {clearable && (
          <span className="ml-1.5 normal-case" style={{ color: "var(--color-ink-faint)" }}>
            (optional)
          </span>
        )}
      </span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = o.value === value;
          const accent = o.colour ?? "var(--color-ash)";
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => (active && clearable && onClear ? onClear() : onChange(o.value))}
              aria-pressed={active}
              className="inline-flex items-center gap-2 rounded px-3 py-2 text-[14px] transition-colors"
              style={{
                border: `1px solid ${active ? accent : "var(--color-line-strong)"}`,
                background: active ? `color-mix(in oklab, ${accent} 16%, transparent)` : "transparent",
                color: active ? "var(--color-ink)" : "var(--color-ink-dim)",
              }}
            >
              {o.colour && (
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: o.colour }}
                />
              )}
              {o.label}
            </button>
          );
        })}
      </div>
      {note && (
        <p className="mt-1.5 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          {note}
        </p>
      )}
    </div>
  );
}
