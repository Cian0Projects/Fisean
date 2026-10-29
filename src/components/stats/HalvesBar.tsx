"use client";

/**
 * The halves, set once at the top of the stat pad.
 *
 * Logging off footage used to mean picking the half on every entry. Instead
 * the coach plays to the throw-in and presses one button, does the same at
 * the restart, and says which end is ours in the first half. From then on
 * every entry takes its half from where it sits in the file, and the map
 * turns round for the second half by itself.
 *
 * The two starts are the video's own throw-in and second-half markers, so
 * they are shared with every coach logging this footage, and they put the
 * whole workspace on the game clock as well. Marking them late, or moving
 * one, re-sorts every entry already logged: the half is read from the
 * markers when the sheet is read, never trusted from the moment it was saved.
 *
 * How long a half is sits here too. The second half's clock starts from it,
 * so a challenge game of twelve-minute halves made on the usual 30 shows its
 * restart as 30:00, and this is where that gets noticed.
 */
import { useState } from "react";
import type { PlayerEngine } from "@/components/player/engine";
import { formatClock, type GamePhase, type Markers } from "@/lib/hurling/notation";
import type { End } from "@/lib/hurling/pitch";
import { HalfLength } from "./HalfLength";

export type HalfKind = "throw_in" | "second_half";

const PHASE_LABELS: Record<GamePhase, string> = {
  pre_match: "Before throw-in",
  first_half: "1st half",
  half_time: "Half time",
  second_half: "2nd half",
  post_match: "After full time",
};

export function HalvesBar({
  engine,
  markers,
  phase,
  onSetHalf,
  firstHalfEnd,
  onFirstHalfEnd,
  halfLengthMin,
  onHalfLength,
}: {
  engine: PlayerEngine;
  markers: Markers;
  /** Where the playhead is now, on the game clock. */
  phase: GamePhase;
  onSetHalf: (kind: HalfKind, atMs: number | null) => void;
  firstHalfEnd: End;
  onFirstHalfEnd: (end: End) => void;
  halfLengthMin: number;
  onHalfLength: (minutes: number) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const marked = markers.throwIn != null;

  const setHere = (kind: HalfKind) => {
    const at = engine.snapshot.positionMs;
    if (kind === "second_half" && markers.throwIn != null && at <= markers.throwIn) {
      setError("The 2nd half has to start after the 1st. Play on to the restart first.");
      return;
    }
    if (kind === "throw_in" && markers.secondHalf != null && at >= markers.secondHalf) {
      setError("The 1st half has to start before the 2nd.");
      return;
    }
    setError(null);
    onSetHalf(kind, at);
  };

  return (
    <section className="rounded border p-2.5" style={{ borderColor: "var(--color-line-strong)" }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="label">Halves</span>
        <span className="text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
          {marked ? `Playhead: ${PHASE_LABELS[phase].toLowerCase()}` : "Not marked yet"}
        </span>
      </div>

      <div className="mt-2 space-y-1.5">
        <Start
          label="1st half starts"
          at={markers.throwIn}
          onSeek={(ms) => engine.seek(ms, { exact: true })}
          onSet={() => setHere("throw_in")}
          onClear={() => onSetHalf("throw_in", null)}
        />
        <Start
          label="2nd half starts"
          at={markers.secondHalf}
          onSeek={(ms) => engine.seek(ms, { exact: true })}
          onSet={() => setHere("second_half")}
          onClear={() => onSetHalf("second_half", null)}
        />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="w-[6.5rem] shrink-0 text-[12px]" style={{ color: "var(--color-ink-dim)" }}>
          Minutes a half
        </span>
        <HalfLength compact value={halfLengthMin} onChange={onHalfLength} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-[12px]" style={{ color: "var(--color-ink-dim)" }}>
          Our end in the 1st half
        </span>
        <div role="group" aria-label="Our end in the 1st half" className="flex gap-1">
          {(["left", "right"] as const).map((end) => {
            const on = firstHalfEnd === end;
            return (
              <button
                key={end}
                type="button"
                onClick={() => onFirstHalfEnd(end)}
                aria-pressed={on}
                className="rounded-[2px] border px-2 py-0.5 text-[12px] font-semibold"
                style={{
                  borderColor: on ? "var(--color-ash)" : "var(--color-line)",
                  background: on ? "var(--color-spot-tint)" : "transparent",
                  color: on ? "var(--color-ash)" : "var(--color-ink-dim)",
                }}
              >
                {end === "left" ? "Left" : "Right"}
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-2 text-[11px]" style={{ color: error ? "var(--color-danger-ink)" : "var(--color-ink-faint)" }}>
        {error ??
          (marked
            ? "Every entry takes its half from here. The map shows one half at a time and swaps ends for the 2nd."
            : "Play to the throw-in and press Set here. Every entry then takes its half by itself.")}
      </p>
    </section>
  );
}

function Start({
  label,
  at,
  onSeek,
  onSet,
  onClear,
}: {
  label: string;
  at: number | null | undefined;
  onSeek: (ms: number) => void;
  onSet: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[6.5rem] shrink-0 text-[12px]" style={{ color: "var(--color-ink-dim)" }}>
        {label}
      </span>
      {at != null ? (
        <>
          <button
            onClick={() => onSeek(at)}
            title="Go to it"
            className="tabular text-[13px] font-semibold underline decoration-dotted underline-offset-2"
          >
            {formatClock(at)}
          </button>
          <div className="flex-1" />
          <button onClick={onSet} className="btn-ghost px-1.5 py-0.5 text-[11px]">
            Move here
          </button>
          <button
            onClick={onClear}
            className="px-1 text-[11px]"
            style={{ color: "var(--color-danger-ink)" }}
          >
            Clear
          </button>
        </>
      ) : (
        <>
          <span className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            Not set
          </span>
          <div className="flex-1" />
          <button onClick={onSet} className="btn-outline px-2 py-0.5 text-[11px]">
            Set here
          </button>
        </>
      )}
    </div>
  );
}
