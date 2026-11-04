"use client";

/**
 * The questions one stat asks, shared by both ways of logging it.
 *
 * The standalone sheet (StatLogger) and the live pad in the review workspace
 * (StatPad) differ in everything around the form — clock, layout, clip
 * picker — but must ask exactly the same things of a shot or a restart, or
 * the two would log different sheets. So the fields live here once, driven
 * by one `StatDetail` value, and each form keeps only its own frame.
 *
 * Every follow-up question appears only once the answer before it makes it
 * meaningful: "worked past our 65" only for our short restart that we won,
 * "unforced" only for a ball we lost. A coach never sees a field that cannot
 * apply, which is most of what keeps a nine-column row quick to log.
 *
 * Every word that differs by code (poc amach or kick-out, 65 or 45, the
 * two-pointer) comes from the club's `statVocabulary`, never from here.
 *
 * Players are logged by the number on their back, typed. From the line a
 * number is what you can actually see, and two keystrokes beat finding a name
 * in a list of thirty. The match's number sheet puts names to them, whenever
 * someone gets round to it.
 */
import type { StatDraft, StatVocabulary } from "@/lib/hurling/stats";
import {
  ATTEMPT_SOURCES,
  MARK_KINDS,
  MAX_JERSEY,
  OUTCOME_COLOURS,
  POSSESSION_KINDS,
  POSSESSION_KIND_LABELS,
  SHOT_KINDS,
  STAT_TYPE_SHAPE,
  effectiveOutcome,
  oppositionNumberAllowed,
  outcomeLabel,
  puckoutOutcome,
  puckoutWinner,
  type AttemptSource,
  type Half,
  type MarkKind,
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
  /** Their player's number, typed like ours. */
  theirNumber: string;
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
  markKind: MarkKind | null;
};

export const EMPTY_DETAIL: StatDetail = {
  half: null,
  outcome: null,
  playerNumber: "",
  targetNumber: "",
  theirNumber: "",
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
  markKind: null,
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
  return { ...prev, outcome: null, shotResult: null, ledToScore: false, pastSixtyFive: false, markKind: null };
}

export function detailFromRow(row: StatRow): StatDetail {
  return {
    half: row.half,
    outcome: row.outcome,
    playerNumber: row.playerNumber != null ? String(row.playerNumber) : "",
    targetNumber: row.targetNumber != null ? String(row.targetNumber) : "",
    theirNumber: row.oppositionNumber != null ? String(row.oppositionNumber) : "",
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
    markKind: row.markKind,
  };
}

/**
 * Whether a player can be named at all. A restart names its receiver, so
 * only one we won; their shot or mark names nobody, because the panel list
 * is ours.
 */
export function playerAllowed(type: StatType, d: StatDetail): boolean {
  if (type === "puckout") return d.outcome === "positive";
  if (type === "shot" || type === "mark") return d.side === "us";
  return true;
}

/** Whether their player can be named: the rule is `oppositionNumberAllowed`, read off the form. */
export function theirsAllowed(type: StatType, d: StatDetail): boolean {
  return oppositionNumberAllowed({ statType: type, side: d.side, outcome: d.outcome });
}

/** A typed jersey number, or null for an empty box or one nobody could wear. */
export function typedNumber(value: string): number | null {
  const n = Number(value.trim());
  return value.trim() && Number.isInteger(n) && n >= 1 && n <= MAX_JERSEY ? n : null;
}

const numberOk = (value: string) => value.trim() === "" || typedNumber(value) !== null;

export function detailReady(type: StatType, d: StatDetail): boolean {
  const shape = STAT_TYPE_SHAPE[type];
  if (shape.outcomes.length > 0 && d.outcome === null) return false;
  if (type === "shot" && d.shotResult === null) return false;
  if (playerAllowed(type, d) && !numberOk(d.playerNumber)) return false;
  if (type === "delivery" && !numberOk(d.targetNumber)) return false;
  if (theirsAllowed(type, d) && !numberOk(d.theirNumber)) return false;
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
    oppositionNumber: theirsAllowed(type, d) ? typedNumber(d.theirNumber) : null,
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
    markKind: d.markKind,
  };
}

/** Under the result when a point's mark has made it a two-pointer (see `resultFromWhere`). */
export const ARC_NOTE = "Marked outside the arc, so it counts two.";

const PUCKOUT_WINNERS: { value: PuckoutWinner; label: string }[] = [
  { value: "us", label: "We won it" },
  { value: "opposition", label: "They won it" },
  { value: "unclear", label: "Broke unclear" },
];

/** Their player, said for what they did in it. Anything else is "Their player". */
const THEIR_LABELS: Partial<Record<StatType, string>> = {
  shot: "Their shooter",
  mark: "Their catcher",
  delivery: "Their player who won it",
  puckout: "Their player who won it",
  tackle: "Their player tackled",
  free_won: "Their player who fouled",
  free_conceded: "Their player fouled",
};

/** Their numbers have no sheet to be named from. */
const NO_SHEET: NumberSheet = new Map();

const PLAYER_LABELS: Partial<Record<StatType, string>> = {
  delivery: "Struck by",
  puckout: "Won by",
  tackle: "Tackle by",
  free_won: "Fouled",
  free_conceded: "Conceded by",
  mark: "Caught by",
};

export function StatFields({
  vocabulary,
  statType,
  detail,
  onChange,
  sheet,
  idPrefix,
  halfNote,
  halfFixed = false,
  resultNote,
  puckoutLength = null,
  compact = false,
}: {
  /** The club's words for this sheet. */
  vocabulary: StatVocabulary;
  statType: StatType;
  detail: StatDetail;
  onChange: (patch: Partial<StatDetail>) => void;
  /** This match's numbers, to show who a typed number is. */
  sheet: NumberSheet;
  /** Keeps label ids unique when two forms could share a page. */
  idPrefix: string;
  /** Said under the half picker, e.g. that the video's markers set it. */
  halfNote?: string;
  /**
   * The half is settled elsewhere, so there is nothing to pick: the stat
   * pad reads it off the video once its halves are marked.
   */
  halfFixed?: boolean;
  /** Said under a shot's result, e.g. that the mark made a point worth two. */
  resultNote?: string;
  /**
   * How far the restart went, worked out from where it was marked. Never
   * asked for: it is here only because a short one we won asks one more
   * question.
   */
  puckoutLength?: PuckoutLength | null;
  /**
   * Tighter buttons and boxes, for the stat pad beside the video, where the
   * whole entry and the map have to fit one screen. Still big enough to hit
   * without looking twice: 30px high, the same as the transport's buttons.
   */
  compact?: boolean;
}) {
  const meta = vocabulary.meta[statType];
  const { terms } = vocabulary;
  const restart = terms.restart.charAt(0).toLowerCase() + terms.restart.slice(1);
  const d = detail;
  const named = playerAllowed(statType, d);
  // Every Choice, Check and number box below takes the same size.
  const Choice = compact ? CompactChoice : FullChoice;
  const Check = compact ? CompactCheck : FullCheck;
  const NumberField = compact ? CompactNumberField : FullNumberField;
  // One number box on its own (a shot's player) takes one line in the pad.
  const boxes = (named ? 1 : 0) + (named && statType === "delivery" ? 1 : 0) + (theirsAllowed(statType, d) ? 1 : 0);
  const lone = compact && boxes === 1;

  return (
    <>
      {!halfFixed && (
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
      )}

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
            options={SHOT_KINDS.map((k) => ({ value: k, label: vocabulary.shotKindLabels[k] }))}
            value={d.shotKind}
            onChange={(v) => onChange({ shotKind: v as ShotKind })}
          />
          <Choice
            label="Result"
            options={vocabulary.shotResults.map((r) => {
              const outcome = effectiveOutcome({ statType: "shot", outcome: null, shotResult: r, side: d.side });
              return {
                value: r,
                label: vocabulary.shotResultLabels[r],
                colour: outcome ? OUTCOME_COLOURS[outcome] : undefined,
              };
            })}
            value={d.shotResult}
            onChange={(v) => onChange({ shotResult: v as ShotResult })}
            note={resultNote}
          />
          <Choice
            label="Came from"
            options={ATTEMPT_SOURCES.map((s) => ({ value: s, label: vocabulary.attemptSourceLabels[s] }))}
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
            label={`Whose ${restart}`}
            options={[
              { value: "us", label: "Ours" },
              { value: "opposition", label: "Theirs" },
            ]}
            value={d.puckoutTakenBy}
            onChange={(v) => onChange({ puckoutTakenBy: v as PuckoutSide })}
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
          {d.puckoutTakenBy === "us" && puckoutLength === "short" && d.outcome === "positive" && (
            <Check
              checked={d.pastSixtyFive}
              onChange={(v) => onChange({ pastSixtyFive: v })}
              label={`Worked out past our ${terms.line}`}
            />
          )}
        </>
      )}

      {statType === "mark" && (
        <>
          <Choice
            label="Whose mark"
            options={[
              { value: "us", label: "Ours", colour: OUTCOME_COLOURS.positive },
              { value: "opposition", label: "Theirs", colour: OUTCOME_COLOURS.negative },
            ]}
            value={d.side}
            onChange={(v) => onChange({ side: v as Side })}
          />
          <Choice
            label="Kind"
            options={MARK_KINDS.map((k) => ({ value: k, label: vocabulary.markKindLabels[k] }))}
            value={d.markKind}
            onChange={(v) => onChange({ markKind: v as MarkKind })}
            clearable
            onClear={() => onChange({ markKind: null })}
          />
          <Check
            checked={d.ledToScore}
            onChange={(v) => onChange({ ledToScore: v })}
            label={d.side === "us" ? "We scored from it" : "They scored from it"}
          />
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
          label="Made by the front eight, a forward or a midfielder"
        />
      )}

      {statType === "free_conceded" && (
        <Check
          checked={d.scorable}
          onChange={(v) => onChange({ scorable: v })}
          label="Scorable, within their free-taker's range"
        />
      )}

      {/* Every number box sits in one grid with two columns that never take
          their width from what is typed, and each box keeps its name on a
          line of its own beneath it. Typing a number changes a word, never a
          size, so nothing moves while a logger is working down the boxes. */}
      {(named || theirsAllowed(statType, d)) && (
        <div className={`grid gap-x-4 ${lone ? "grid-cols-1" : "grid-cols-2"} ${compact ? "gap-y-2.5" : "gap-y-4"}`}>
          {named && (
            <NumberField
              inline={lone}
              id={`${idPrefix}-player`}
              label={PLAYER_LABELS[statType] ?? "Player"}
              value={d.playerNumber}
              onChange={(v) => onChange({ playerNumber: v })}
              sheet={sheet}
            />
          )}
          {named && statType === "delivery" && (
            <NumberField
              inline={lone}
              id={`${idPrefix}-target`}
              label={d.outcome === "negative" ? "Aimed at, and lost" : "Aimed at"}
              value={d.targetNumber}
              onChange={(v) => onChange({ targetNumber: v })}
              sheet={sheet}
            />
          )}
          {theirsAllowed(statType, d) && (
            <NumberField
              inline={lone}
              id={`${idPrefix}-theirs`}
              label={
                statType === "turnover"
                  ? d.outcome === "positive"
                    ? "Their player who lost it"
                    : "Their player who won it"
                  : (THEIR_LABELS[statType] ?? "Their player")
              }
              value={d.theirNumber}
              onChange={(v) => onChange({ theirNumber: v })}
              sheet={NO_SHEET}
              theirs
            />
          )}
        </div>
      )}
      {!named && statType === "puckout" && (
        <p className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          A {restart} names the receiver, so only one we won takes a player.
        </p>
      )}
    </>
  );
}

/**
 * A jersey number, typed or spoken, with whoever wore it said beside it. There
 * is no pick-list under the box: the browser's drop-down covered the pitch and
 * the stat buttons mid-entry, and a logger who knows the number does not need
 * it. A number the sheet does not have yet is still logged, and gets its name
 * when the sheet does.
 */
type NumberFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  sheet: NumberSheet;
  /** One of theirs: there is no sheet to name them from, and that is fine. */
  theirs?: boolean;
  compact?: boolean;
  /** Label, box and name on one line: for a box on its own, compact only. */
  inline?: boolean;
};

const FullNumberField = (p: NumberFieldProps) => <NumberField {...p} />;
const CompactNumberField = (p: NumberFieldProps) => <NumberField {...p} compact />;

export function NumberField({
  id,
  label,
  value,
  onChange,
  sheet,
  theirs = false,
  compact = false,
  inline = false,
}: NumberFieldProps) {
  const n = typedNumber(value);
  const who = n != null ? sheet.get(n) : undefined;
  const note = !value.trim()
    ? theirs
      ? "Optional"
      : "Nobody named"
    : n == null
      ? `Jersey numbers run from 1 to ${MAX_JERSEY}`
      : theirs
        ? `Their ${n}`
        : who
          ? who.displayName
          : "No name on this number yet";

  if (inline && compact) {
    // The name sits in a box of fixed position beside the input, so typing
    // still changes a word and never moves anything.
    return (
      <div className="grid min-w-0 grid-cols-[5.25rem_minmax(0,1fr)] items-center gap-x-2">
        <label className="text-[12px] font-medium leading-tight" style={{ color: "var(--color-ink-dim)" }} htmlFor={id}>
          {label}
        </label>
        <div className="flex min-w-0 items-center gap-2.5">
          <input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 2))}
            inputMode="numeric"
            autoComplete="off"
            placeholder="No."
            aria-describedby={`${id}-who`}
            className="field tabular w-16 shrink-0 py-1 text-center font-bold"
          />
          <p
            id={`${id}-who`}
            className="min-w-0 truncate text-[12px]"
            style={{ color: who ? "var(--color-ink)" : "var(--color-ink-faint)" }}
          >
            {note}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <label className={`label block ${compact ? "mb-1" : "mb-1.5"}`} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 2))}
        inputMode="numeric"
        autoComplete="off"
        placeholder="No."
        aria-describedby={`${id}-who`}
        className={`field tabular w-16 text-center font-bold ${compact ? "py-1" : ""}`}
      />
      <p
        id={`${id}-who`}
        className={`truncate ${compact ? "mt-1 text-[12px] leading-4" : "mt-1.5 text-[13px] leading-5"}`}
        style={{ color: who ? "var(--color-ink)" : "var(--color-ink-faint)" }}
      >
        {note}
      </p>
    </div>
  );
}

type CheckProps = {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  compact?: boolean;
};

const FullCheck = (p: CheckProps) => <Check {...p} />;
const CompactCheck = (p: CheckProps) => <Check {...p} compact />;

export function Check({ checked, onChange, label, compact = false }: CheckProps) {
  return (
    <label className={`flex w-fit items-center gap-2.5 ${compact ? "text-[13px]" : "text-[14px]"}`}>
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
type ChoiceProps = {
  label: string;
  options: { value: string; label: string; colour?: string }[];
  value: string | null;
  onChange: (value: string) => void;
  note?: string;
  clearable?: boolean;
  onClear?: () => void;
  compact?: boolean;
};

const FullChoice = (p: ChoiceProps) => <Choice {...p} />;
const CompactChoice = (p: ChoiceProps) => <Choice {...p} compact />;

export function Choice({
  label,
  options,
  value,
  onChange,
  note,
  clearable = false,
  onClear,
  compact = false,
}: ChoiceProps) {
  // Compact puts a short question in a narrow column beside its answers
  // rather than on a line above them: a shot asks five questions, and the
  // line each saves is what lets the map share the screen with them. A long
  // list of answers keeps its label above, because squeezed beside one it
  // wraps to more lines than the label saved.
  const beside = compact && options.length <= 4;
  return (
    <div className={beside ? "grid grid-cols-[5.25rem_minmax(0,1fr)] items-start gap-x-2" : undefined}>
      <span
        className={
          beside
            ? "pt-[5px] text-[12px] font-medium leading-tight"
            : compact
              ? "mb-1 block text-[12px] font-medium"
              : "label mb-1.5 block"
        }
        style={compact ? { color: "var(--color-ink-dim)" } : undefined}
      >
        {label}
        {clearable && (
          <span
            className={beside ? "block font-normal" : "ml-1.5 font-normal normal-case"}
            style={{ color: "var(--color-ink-faint)" }}
          >
            {beside ? "optional" : "(optional)"}
          </span>
        )}
      </span>
      <div className={`flex flex-wrap ${compact ? "gap-1.5" : "gap-2"}`}>
        {options.map((o) => {
          const active = o.value === value;
          const accent = o.colour ?? "var(--color-ash)";
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => (active && clearable && onClear ? onClear() : onChange(o.value))}
              aria-pressed={active}
              className={`inline-flex items-center rounded transition-colors ${
                compact ? "gap-1.5 px-2.5 py-1 text-[13px]" : "gap-2 px-3 py-2 text-[14px]"
              }`}
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
        <p
          className={beside ? "col-start-2 mt-1 text-[11px]" : compact ? "mt-1 text-[11px]" : "mt-1.5 text-[12px]"}
          style={{ color: "var(--color-ink-faint)" }}
        >
          {note}
        </p>
      )}
    </div>
  );
}
