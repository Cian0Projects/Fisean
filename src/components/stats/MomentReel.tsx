"use client";

/**
 * Stat moments played back to back: the player, its controls and the list
 * beside it. Shared by one match's "Watch it back" (StatMoments) and a
 * player's season (SeasonMoments), which differ only in their filters and in
 * what each line of the list says under the stat.
 *
 * The moments come in already placed and filtered, in playing order, and can
 * run across any number of files: a match filmed one file per half, or a
 * season of matches. A new filter is a new reel, so the parent gives this a
 * new `key` when its filter changes, and whatever was playing stops.
 *
 * Nothing plays until it is asked to: a video starting on its own as the
 * page loads would be the first thing anyone turned off.
 *
 * A passage is a guess at where the moment is, from when it was logged. When
 * the guess is short (logged late, or the build-up started earlier), "5 s
 * back" and "5 s on" widen it past either end instead of stopping there.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { PlayerEngine } from "@/components/player/engine";
import { VideoStage } from "@/components/player/VideoStage";
import { ChevronIcon, PauseIcon, PlayIcon } from "@/components/ui/Icon";
import type { StatRow } from "./types";
import { OUTCOME_COLOURS, describeStat, statColour, statShape, type StatOutcome } from "@/lib/hurling/stats";
import { reelOf, type Footage, type Moment } from "@/lib/hurling/moments";
import { formatClock, formatGameClock } from "@/lib/hurling/notation";
import type { GameCode } from "@/lib/hurling/codes";

export type MomentFootage = Footage & { src: string };

type Cue = { passage: number; startMs: number };

/** How far each press of "5 s back" or "5 s on" reaches past the passage. */
const NUDGE_MS = 5_000;

export function MomentReel<T extends StatRow>({
  code,
  moments,
  footage,
  missing,
  subtitle,
}: {
  code: GameCode;
  /** Placed and filtered, in playing order. */
  moments: Moment<T>[];
  footage: MomentFootage[];
  /** How many more match the filter but cannot be found on the footage. */
  missing: number;
  /** The second line of each moment in the list: who, or which match. */
  subtitle: (row: T) => string;
}) {
  const engine = useMemo(() => new PlayerEngine(), []);
  const [cue, setCue] = useState<Cue | null>(null);
  const [playOn, setPlayOn] = useState(true);
  const [positionMs, setPositionMs] = useState(0);
  const [playing, setPlaying] = useState(false);

  const reel = useMemo(() => reelOf(moments), [moments]);
  const passageOf = useMemo(
    () => new Map(reel.flatMap((p, i) => p.moments.map((m) => [m.row.id, i] as const))),
    [reel],
  );

  // Read when a passage ends, not when it starts, so ticking the box while
  // one plays does not restart it.
  // The stretch the player is held to now: the passage, widened by any
  // presses of "5 s back" or "5 s on".
  const boundsRef = useRef<{ startMs: number; endMs: number } | null>(null);
  const playOnRef = useRef(playOn);
  useEffect(() => {
    playOnRef.current = playOn;
  }, [playOn]);

  useEffect(() => {
    if (!cue) return;
    const passage = reel[cue.passage];
    if (!passage) return;
    boundsRef.current = { startMs: cue.startMs, endMs: passage.endMs };
    engine.playRange(cue.startMs, passage.endMs, () => {
      const next = reel[cue.passage + 1];
      if (playOnRef.current && next) setCue({ passage: cue.passage + 1, startMs: next.startMs });
      else engine.pause();
    });
  }, [cue, reel, engine]);

  useEffect(
    () =>
      engine.subscribe((t) => {
        setPositionMs(t.positionMs);
        setPlaying(t.playing);
      }),
    [engine],
  );

  const current = cue ? reel[cue.passage] : null;
  const src = (footage.find((f) => f.id === (current?.videoId ?? reel[0]?.videoId)) ?? footage[0]).src;
  const upcoming = cue ? reel[cue.passage + 1] : reel[0];
  const preloadMs = upcoming && upcoming.videoId === (current?.videoId ?? upcoming.videoId) ? upcoming.startMs : null;

  /**
   * Step back or on past the passage's own ends. The player is held to the
   * passage, so the hold is widened first, then the step taken: back moves
   * the start to wherever the step lands, on lets it run a few seconds past
   * there. Within the file, always.
   */
  const widen = (ms: number) => {
    const b = boundsRef.current;
    if (!b || !current) return;
    const duration = footage.find((f) => f.id === current.videoId)?.durationMs || Infinity;
    const at = Math.min(duration, Math.max(0, engine.snapshot.positionMs + ms));
    const next =
      ms < 0
        ? { startMs: Math.min(b.startMs, at), endMs: b.endMs }
        : { startMs: b.startMs, endMs: Math.min(duration, Math.max(b.endMs, at + NUDGE_MS)) };
    boundsRef.current = next;
    engine.setBounds(next.startMs, next.endMs);
    engine.seek(at, { exact: true });
  };

  const go = (passage: number) => {
    const p = reel[passage];
    if (p) setCue({ passage, startMs: p.startMs });
  };

  // The moment being watched is the one whose ten seconds the playhead is in;
  // where two overlap, the later one, since that is the one coming.
  const nowId = current
    ? [...current.moments].reverse().find((m) => positionMs >= m.startMs && positionMs <= m.endMs)?.row.id ?? null
    : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div>
        <div className="relative flex aspect-video w-full flex-col bg-black">
          <VideoStage
            engine={engine}
            src={src}
            preloadMs={preloadMs}
            overlay={
              !cue && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-6 text-center">
                  {reel.length > 0 ? (
                    <button onClick={() => go(0)} className="btn-primary">
                      <PlayIcon className="h-4 w-4" />
                      Play all {moments.length} {moments.length === 1 ? "moment" : "moments"}
                    </button>
                  ) : (
                    <p className="text-[14px] text-white/80">Nothing matches those filters.</p>
                  )}
                </div>
              )
            }
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-3">
          <button
            onClick={() => cue && go(cue.passage - 1)}
            disabled={!cue || cue.passage === 0}
            className="btn-outline text-xs"
          >
            <ChevronIcon direction="left" className="h-3.5 w-3.5" />
            Previous
          </button>
          <button
            onClick={() => (cue ? engine.toggle() : go(0))}
            disabled={reel.length === 0}
            className="btn-primary w-24 text-xs"
          >
            {playing ? <PauseIcon className="h-3.5 w-3.5" /> : <PlayIcon className="h-3.5 w-3.5" />}
            {playing ? "Pause" : "Play"}
          </button>
          <button
            onClick={() => go(cue ? cue.passage + 1 : 0)}
            disabled={reel.length === 0 || (cue != null && cue.passage + 1 >= reel.length)}
            className="btn-outline text-xs"
          >
            Next
            <ChevronIcon direction="right" className="h-3.5 w-3.5" />
          </button>
          <span className="flex gap-1" role="group" aria-label="See more either side">
            <button
              onClick={() => widen(-NUDGE_MS)}
              disabled={!cue}
              title="Go back further than the moment's start"
              className="btn-ghost text-xs"
            >
              5 s back
            </button>
            <button
              onClick={() => widen(NUDGE_MS)}
              disabled={!cue}
              title="Keep watching past the moment's end"
              className="btn-ghost text-xs"
            >
              5 s on
            </button>
          </span>
          <div className="flex-1" />
          <label className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--color-ink-dim)" }}>
            <input
              type="checkbox"
              checked={playOn}
              onChange={(e) => setPlayOn(e.target.checked)}
              className="accent-[var(--color-ink)]"
            />
            Play on to the next moment
          </label>
        </div>
      </div>

      <div>
        <p className="caption mb-2">
          {moments.length} {moments.length === 1 ? "moment" : "moments"}
          {missing > 0 &&
            `. ${missing} more cannot be found on the footage yet: they were logged on the line, and the footage needs its throw-in and second half marked`}
          .
        </p>
        <ol className="border-t lg:max-h-[30rem] lg:overflow-y-auto" style={{ borderColor: "var(--color-line)" }}>
          {moments.map((m) => {
            const r = m.row;
            const on = nowId === r.id;
            return (
              <li key={r.id}>
                <button
                  onClick={() => setCue({ passage: passageOf.get(r.id)!, startMs: m.startMs })}
                  aria-current={on ? "true" : undefined}
                  className="flex w-full items-start gap-3 border-b px-2 py-2.5 text-left"
                  style={{
                    borderColor: "var(--color-line)",
                    background: on ? "var(--color-surface-2)" : "transparent",
                  }}
                >
                  <Swatch row={r} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px]">{describeStat(r, code)}</span>
                    <span className="block truncate text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                      {subtitle(r)}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-right text-[12px]" style={{ color: "var(--color-ink-dim)" }}>
                    {r.gameMs != null ? formatGameClock(r.gameMs) : formatClock(m.atMs)}
                    <span className="block" style={{ color: "var(--color-ink-faint)" }}>
                      {r.half === 1 ? "1st half" : r.half === 2 ? "2nd half" : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/** The pitch map's mark for the entry, in colour and in shape. */
function Swatch({ row }: { row: StatRow }) {
  const colour = statColour(row);
  const shape = statShape(row);
  return (
    <span
      aria-hidden
      className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full"
      style={{
        background: shape === "filled" ? colour : "transparent",
        border: shape === "filled" ? "none" : `2px ${shape === "dashed" ? "dashed" : "solid"} ${colour}`,
      }}
    />
  );
}

/* ---------------------------------------------------------------- filters */

export function Toggles<T extends string | number | null>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <span className="label mb-1.5 block">{label}</span>
      <div role="group" aria-label={label} className="flex gap-1">
        {options.map((o) => (
          <Chip key={String(o.value)} on={value === o.value} onClick={() => onChange(o.value)}>
            {o.value != null && typeof o.value === "string" && o.value in OUTCOME_COLOURS && (
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: OUTCOME_COLOURS[o.value as StatOutcome] }}
              />
            )}
            {o.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="inline-flex items-center gap-1.5 rounded-[2px] border px-2.5 py-1.5 text-[12px] font-semibold"
      style={{
        borderColor: on ? "var(--color-ash)" : "var(--color-line)",
        background: on ? "var(--color-spot-tint)" : "transparent",
        color: on ? "var(--color-ash)" : "var(--color-ink-dim)",
      }}
    >
      {children}
    </button>
  );
}

export const OUTCOME_FILTERS: { value: StatOutcome; label: string }[] = [
  { value: "positive", label: "Our way" },
  { value: "negative", label: "Against us" },
  { value: "unclear", label: "Unclear" },
];
