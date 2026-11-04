"use client";

/**
 * The halves, set once, on the transport strip under the video.
 *
 * Logging off footage used to mean picking the half on every entry. Instead
 * the coach plays to the throw-in and presses one button, does the same at
 * the restart, and says which end is ours in the first half. From then on
 * every entry takes its half from where it sits in the file, and the map
 * turns round for the second half by itself.
 *
 * It lives beside the play button and the clock rather than in the stat pad
 * because both of its buttons mean "here, where the video is", and because
 * the pad's height belongs to the entry being logged. In the pad it took a
 * fifth of the column and scrolled away just when the restart came round.
 * So the strip shows only what is needed next (a Set here for whichever
 * start is missing, then the two times and the half the playhead is in),
 * and everything else (moving a start, clearing it, minutes a half, our
 * end) sits one press away in a small panel that opens over the video.
 *
 * The two starts are the video's own throw-in and second-half markers, so
 * they are shared with every coach logging this footage, and they put the
 * whole workspace on the game clock as well. Marking them late, or moving
 * one, re-sorts every entry already logged: the half is read from the
 * markers when the sheet is read, never trusted from the moment it was saved.
 *
 * How long a half is sits in the panel too. The second half's clock starts
 * from it, so a challenge game of twelve-minute halves made on the usual 30
 * shows its restart as 30:00, and this is where that gets put right.
 */
import { useEffect, useRef, useState } from "react";
import type { PlayerEngine } from "@/components/player/engine";
import { formatClock, toGameTime, type GamePhase, type Markers } from "@/lib/hurling/notation";
import type { End } from "@/lib/hurling/pitch";
import { HalfLength } from "./HalfLength";

export type HalfKind = "throw_in" | "second_half";

const PHASE_LABELS: Record<GamePhase, string> = {
  pre_match: "Before throw-in",
  first_half: "In the 1st half",
  half_time: "Half time",
  second_half: "In the 2nd half",
  post_match: "After full time",
};

export function HalvesBar({
  engine,
  markers,
  halfLengthMin,
  onSetHalf,
  firstHalfEnd,
  onFirstHalfEnd,
  onHalfLength,
}: {
  engine: PlayerEngine;
  markers: Markers;
  halfLengthMin: number;
  onSetHalf: (kind: HalfKind, atMs: number | null) => void;
  firstHalfEnd: End;
  onFirstHalfEnd: (end: End) => void;
  onHalfLength: (minutes: number) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Only the phase is kept, so this re-renders when the half changes, not
  // on every frame.
  const [phase, setPhase] = useState<GamePhase>(
    () => toGameTime(engine.snapshot.positionMs, markers, halfLengthMin).phase,
  );
  useEffect(
    () => engine.subscribe((t) => setPhase(toGameTime(t.positionMs, markers, halfLengthMin).phase)),
    [engine, markers, halfLengthMin],
  );

  // A refusal says why for a few seconds, then gets out of the way.
  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(t);
  }, [error]);

  // The panel closes on a press anywhere else, or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

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

  const seek = (ms: number) => engine.seek(ms, { exact: true });
  const first = markers.throwIn;
  const second = markers.secondHalf;

  return (
    <div ref={wrap} className="relative flex min-w-0 flex-wrap items-center justify-end gap-x-2.5 gap-y-1">
      {error && (
        <span role="alert" className="text-[12px]" style={{ color: "var(--color-danger-ink)" }}>
          {error}
        </span>
      )}

      {first == null ? (
        <>
          {!error && (
            <span className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
              Play to the throw-in, then
            </span>
          )}
          <button type="button" onClick={() => setHere("throw_in")} className="btn-outline px-2.5 py-1 text-[12px]">
            Set 1st half start here
          </button>
        </>
      ) : (
        <>
          <Time label="1st" at={first} onSeek={seek} />
          {second != null ? (
            <Time label="2nd" at={second} onSeek={seek} />
          ) : (
            <button
              type="button"
              onClick={() => setHere("second_half")}
              className="btn-outline px-2.5 py-1 text-[12px]"
            >
              Set 2nd half start here
            </button>
          )}
          <span className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            {PHASE_LABELS[phase]}
          </span>
        </>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="btn-ghost px-2 py-1 text-[12px]"
      >
        Halves
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Halves"
          className="absolute bottom-full right-0 z-30 mb-2 w-[320px] rounded border p-3 shadow-lg"
          style={{ borderColor: "var(--color-line-strong)", background: "var(--color-surface)" }}
        >
          <div className="space-y-1.5">
            <Start label="1st half starts" at={first} onSeek={seek} onSet={() => setHere("throw_in")} onClear={() => onSetHalf("throw_in", null)} />
            <Start label="2nd half starts" at={second} onSeek={seek} onSet={() => setHere("second_half")} onClear={() => onSetHalf("second_half", null)} />
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="w-[6.5rem] shrink-0 text-[12px]" style={{ color: "var(--color-ink-dim)" }}>
              Minutes a half
            </span>
            <HalfLength compact value={halfLengthMin} onChange={onHalfLength} />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="w-[6.5rem] shrink-0 text-[12px]" style={{ color: "var(--color-ink-dim)" }}>
              Our end, 1st half
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

          <p className="mt-2.5 text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
            Every entry takes its half from these. The map shows one half at a time and swaps ends for the 2nd.
          </p>
        </div>
      )}
    </div>
  );
}

/** A start on the strip: its time, pressed to go there. */
function Time({ label, at, onSeek }: { label: string; at: number; onSeek: (ms: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSeek(at)}
      title={`Go to the ${label} half start`}
      className="text-[12px]"
      style={{ color: "var(--color-ink-dim)" }}
    >
      {label}{" "}
      <span className="tabular font-semibold underline decoration-dotted underline-offset-2" style={{ color: "var(--color-ink)" }}>
        {formatClock(at)}
      </span>
    </button>
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
            type="button"
            onClick={() => onSeek(at)}
            title="Go to it"
            className="tabular text-[13px] font-semibold underline decoration-dotted underline-offset-2"
          >
            {formatClock(at)}
          </button>
          <div className="flex-1" />
          <button type="button" onClick={onSet} className="btn-ghost px-1.5 py-0.5 text-[11px]">
            Move here
          </button>
          <button
            type="button"
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
          <button type="button" onClick={onSet} className="btn-outline px-2 py-0.5 text-[11px]">
            Set here
          </button>
        </>
      )}
    </div>
  );
}
