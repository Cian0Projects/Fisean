"use client";

/**
 * How long a half is: 30 or 35 in one press, any other length typed.
 *
 * The second half's clock starts from this, so a challenge game of
 * twelve-minute halves left on 30 reads its restart as 30:00. Used when a
 * match is made, and again beside the halves and the match clock, because
 * that is where a wrong length shows itself and where it gets put right.
 * A typed length is kept only once it is whole and in range, on Enter or
 * on leaving the box, so half-typed digits never reach the clock.
 */
import { useState } from "react";
import { HALF_LENGTHS, LONGEST_HALF_MIN, SHORTEST_HALF_MIN, halfLengthProblem } from "@/lib/hurling/notation";

export function HalfLength({
  value,
  onChange,
  compact = false,
}: {
  value: number;
  onChange: (minutes: number) => void;
  /** Smaller, on one line, for the halves box and the clock. */
  compact?: boolean;
}) {
  const preset = (HALF_LENGTHS as readonly number[]).includes(value);
  const [other, setOther] = useState(!preset);
  const [typed, setTyped] = useState(preset ? "" : String(value));
  const [error, setError] = useState<string | null>(null);

  const keep = () => {
    if (typed.trim() === "") return;
    const minutes = Number(typed);
    const problem = halfLengthProblem(minutes);
    setError(problem);
    if (!problem && minutes !== value) onChange(minutes);
  };

  const size = compact ? "px-2 py-0.5 text-[12px]" : "px-3 py-2 text-[14px]";
  const button = (on: boolean) => ({
    className: `rounded-[2px] border font-semibold ${size}`,
    style: {
      borderColor: on ? "var(--color-ash)" : "var(--color-line-strong)",
      background: on ? "var(--color-spot-tint)" : "transparent",
      color: on ? "var(--color-ash)" : "var(--color-ink-dim)",
    },
  });

  return (
    <div>
      <div role="group" aria-label="Minutes a half" className="flex flex-wrap items-center gap-1.5">
        {HALF_LENGTHS.map((m) => {
          const on = !other && value === m;
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setOther(false);
                setError(null);
                if (m !== value) onChange(m);
              }}
              {...button(on)}
            >
              {m} min
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={other}
          onClick={() => {
            setOther(true);
            if (!typed) setTyped(String(value));
          }}
          {...button(other)}
        >
          Other
        </button>
        {other && (
          <label className="flex items-center gap-1.5">
            <input
              type="number"
              inputMode="numeric"
              min={SHORTEST_HALF_MIN}
              max={LONGEST_HALF_MIN}
              step={1}
              value={typed}
              autoFocus
              onChange={(e) => setTyped(e.target.value)}
              onBlur={keep}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  keep();
                }
              }}
              aria-label="Minutes a half"
              className={`field tabular ${compact ? "w-14 px-1.5 py-0.5 text-[12px]" : "w-20"}`}
            />
            <span className="text-[12px]" style={{ color: "var(--color-ink-dim)" }}>
              min
            </span>
          </label>
        )}
      </div>
      {error && (
        <p className="mt-1 text-[11px]" style={{ color: "var(--color-danger-ink)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
