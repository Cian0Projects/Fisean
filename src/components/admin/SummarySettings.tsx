"use client";

/**
 * Stats settings for the match summary: the two tiles the players always
 * see, and a target for every stat.
 *
 * One row per stat the squad logs, standard and its own, each with count or
 * rate (only where the stat can be either), at least or at most, and the
 * number. Every row starts on a default for the game, so a squad that never
 * opens this still gets colours that mean something; an empty number means
 * no target, and that stat's tile stays uncoloured. The rules are in
 * src/lib/hurling/summary.ts.
 */
import { useState, useTransition } from "react";
import { resetStatTarget, setStatTarget, setSummaryPins } from "@/lib/actions/summary";
import {
  TARGET_DIRECTIONS,
  TARGET_DIRECTION_LABELS,
  TARGET_MEASURE_LABELS,
  defaultTarget,
  type Target,
  type TargetDirection,
  type TargetMeasure,
  type TileKey,
} from "@/lib/hurling/summary";
import type { GameCode } from "@/lib/hurling/codes";
import { errorText } from "@/lib/user-error";

export type TargetRow = {
  key: TileKey;
  title: string;
  measures: TargetMeasure[];
  target: Target;
  /** Set by a coach rather than the default. */
  custom: boolean;
};

export function SummarySettings({
  rows,
  pins,
  code,
}: {
  rows: TargetRow[];
  pins: TileKey[];
  code: GameCode;
}) {
  const [first, setFirst] = useState(pins[0] ?? "");
  const [second, setSecond] = useState(pins[1] ?? "");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSaved, setPinSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const savePins = (a: TileKey, b: TileKey) => {
    setPinError(null);
    setPinSaved(false);
    startTransition(async () => {
      try {
        await setSummaryPins(a, b);
        setPinSaved(true);
      } catch (err) {
        setPinError(errorText(err, "Those could not be saved."));
      }
    });
  };

  return (
    <section>
      <div className="section-head mb-4">
        <h2 className="title text-xl">Match summary</h2>
        <p className="caption measure mt-1">
          The one page shown at half time and after the match. Each stat is judged against its target here: green on
          target, amber close, red off it. Leave a number empty for no target.
        </p>
      </div>

      <div className="mb-6">
        <p className="label mb-2">Always shown to the players</p>
        <div className="flex flex-wrap items-center gap-2">
          <PinSelect
            label="First fixed tile"
            value={first}
            other={second}
            rows={rows}
            disabled={pending}
            onChange={(v) => {
              setFirst(v);
              savePins(v, second);
            }}
          />
          <PinSelect
            label="Second fixed tile"
            value={second}
            other={first}
            rows={rows}
            disabled={pending}
            onChange={(v) => {
              setSecond(v);
              savePins(first, v);
            }}
          />
          {pinSaved && (
            <span className="text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
              Saved
            </span>
          )}
        </div>
        <p className="caption mt-1.5">The app suggests one or two more each time, and whoever is logging confirms them.</p>
        {pinError && (
          <p className="mt-1 text-[13px]" style={{ color: "var(--color-danger-ink)" }}>
            {pinError}
          </p>
        )}
      </div>

      <p className="label mb-1">Targets for the whole match</p>
      <p className="caption mb-2">A count is halved at half time. A rate is a percentage and stays the same.</p>
      <ul>
        {rows.map((r) => (
          <TargetEditor key={r.key} row={r} code={code} />
        ))}
      </ul>
    </section>
  );
}

function PinSelect({
  label,
  value,
  other,
  rows,
  disabled,
  onChange,
}: {
  label: string;
  value: TileKey;
  /** The other fixed tile, which this one cannot also be. */
  other: TileKey;
  rows: TargetRow[];
  disabled: boolean;
  onChange: (key: TileKey) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="field w-auto"
      disabled={disabled}
    >
      {rows.map((r) => (
        <option key={r.key} value={r.key} disabled={r.key === other}>
          {r.title}
        </option>
      ))}
    </select>
  );
}

function TargetEditor({ row, code }: { row: TargetRow; code: GameCode }) {
  const [measure, setMeasure] = useState<TargetMeasure>(row.target.measure);
  const [direction, setDirection] = useState<TargetDirection>(row.target.direction);
  const [value, setValue] = useState(row.target.value == null ? "" : String(row.target.value));
  const [saved, setSaved] = useState<Target>(row.target);
  const [custom, setCustom] = useState(row.custom);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty =
    measure !== saved.measure || direction !== saved.direction || value.trim() !== (saved.value == null ? "" : String(saved.value));

  const save = () => {
    setError(null);
    startTransition(async () => {
      try {
        const next = await setStatTarget(row.key, { measure, direction, value: value.trim() === "" ? null : value });
        setSaved(next);
        setValue(next.value == null ? "" : String(next.value));
        setCustom(true);
      } catch (err) {
        setError(errorText(err, "That target could not be saved."));
      }
    });
  };

  const reset = () => {
    setError(null);
    startTransition(async () => {
      try {
        await resetStatTarget(row.key);
        const d = defaultTarget(row.key, code);
        const next = row.measures.includes(d.measure) ? d : { ...d, measure: row.measures[0], value: null };
        setSaved(next);
        setMeasure(next.measure);
        setDirection(next.direction);
        setValue(next.value == null ? "" : String(next.value));
        setCustom(false);
      } catch (err) {
        setError(errorText(err, "That target could not be reset."));
      }
    });
  };

  return (
    <li className="border-b py-2.5" style={{ borderColor: "var(--color-line)" }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex flex-wrap items-center gap-2 text-[14px]"
      >
        <span className="min-w-[8rem] flex-1 font-semibold">{row.title}</span>
        {row.measures.length > 1 ? (
          <select
            value={measure}
            onChange={(e) => setMeasure(e.target.value as TargetMeasure)}
            aria-label={`${row.title}: count or rate`}
            className="field w-auto py-1"
          >
            {row.measures.map((m) => (
              <option key={m} value={m}>
                {TARGET_MEASURE_LABELS[m]}
              </option>
            ))}
          </select>
        ) : (
          <span className="w-[4.5rem] text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
            {TARGET_MEASURE_LABELS[measure]}
          </span>
        )}
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as TargetDirection)}
          aria-label={`${row.title}: at least or at most`}
          className="field w-auto py-1"
        >
          {TARGET_DIRECTIONS.map((d) => (
            <option key={d} value={d}>
              {TARGET_DIRECTION_LABELS[d]}
            </option>
          ))}
        </select>
        <span className="flex items-center gap-1">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="numeric"
            placeholder="None"
            aria-label={`${row.title}: target`}
            className="field tabular w-16 py-1"
          />
          <span className="w-4 text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
            {measure === "rate" ? "%" : ""}
          </span>
        </span>
        {dirty ? (
          <button type="submit" disabled={pending} className="btn-primary text-xs">
            Save
          </button>
        ) : custom ? (
          <button type="button" onClick={reset} disabled={pending} className="btn-ghost text-xs">
            Use default
          </button>
        ) : (
          <span className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            Default
          </span>
        )}
      </form>
      {error && (
        <p className="mt-1 text-[13px]" style={{ color: "var(--color-danger-ink)" }}>
          {error}
        </p>
      )}
    </li>
  );
}
