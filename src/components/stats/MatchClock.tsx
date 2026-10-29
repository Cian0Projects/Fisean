"use client";

/**
 * The logger's own match clock, for logging on the line or off a stream.
 *
 * One button at a time: Throw-in, then Half time, Second half and Full time,
 * each tapped as this logger sees it happen. The clock is theirs alone (see
 * src/lib/hurling/live-clock.ts): no other phone moves it, and it moves no
 * other phone. Watching a stream, the logger taps each whistle when the
 * stream shows it, so the delay is already in the clock.
 *
 * Only the game clock is ever shown. A logger who joined late, or tapped
 * throw-in late, sets it by what the game clock reads ("15:30, 1st half"),
 * and their entries in that half move with it.
 *
 * Once full time is tapped the strip offers Submit, which puts this logger's
 * entries on the match's sheet for the other coaches.
 */
import { useEffect, useState, useTransition } from "react";
import { setMyClock, setMyWhistle, submitMyStats } from "@/lib/actions/stats";
import { formatGameClock, parseClock, type Markers } from "@/lib/hurling/notation";
import {
  LAST_WHISTLE,
  NEXT_WHISTLE,
  WHISTLE_LABELS,
  canLog,
  clockFromReading,
  clockOf,
  halfForReading,
  liveMoment,
  livePhase,
  type LivePhase,
} from "@/lib/hurling/live-clock";

export type LoggerClock = { whistles: Markers; submittedAt: number | null };

export type MatchClockState = ReturnType<typeof useMatchClock>;

export function useMatchClock(initial: LoggerClock, halfLengthMin: number) {
  const [saved, setSaved] = useState<LoggerClock>(initial);
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const phase = livePhase(saved.whistles);
  const moment = liveMoment(tick, saved.whistles);
  return {
    ...saved,
    setSaved,
    phase,
    halfLengthMin,
    /** Stats can be logged now: a half is on. */
    open: canLog(phase),
    /** Where an entry started now sits: its half and how far into it. */
    momentNow: () => liveMoment(Date.now(), saved.whistles),
    /** What the clock reads this second. */
    clockMs:
      moment != null
        ? clockOf(moment.half, moment.halfMs, halfLengthMin)
        : phase === "half_time"
          ? halfLengthMin * 60_000
          : phase === "full_time"
            ? halfLengthMin * 120_000
            : 0,
  };
}

const STATUS: Record<LivePhase, string> = {
  not_started: "Not started",
  first_half: "1st half",
  half_time: "Half time",
  second_half: "2nd half",
  full_time: "Full time",
};

export function MatchClock({
  matchId,
  clock,
  onClockSet,
  onSubmitted,
}: {
  matchId: string;
  clock: MatchClockState;
  /** The clock was set by hand: the entries timed off it move too. */
  onClockSet: (before: Markers, after: Markers) => void;
  onSubmitted: () => void;
}) {
  const { phase, submittedAt } = clock;
  const [adjusting, setAdjusting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const next = NEXT_WHISTLE[phase];
  const last = LAST_WHISTLE[phase];

  const run = (work: () => Promise<void>, failed: string) => {
    setError(null);
    startTransition(async () => {
      try {
        await work();
      } catch (err) {
        setError((err as Error).message || failed);
      }
    });
  };

  const tap = (whistle: NonNullable<typeof next>, at: number | null) =>
    run(async () => clock.setSaved(await setMyWhistle(matchId, whistle, at)), "That did not save. Try again.");

  const submit = () =>
    run(async () => {
      clock.setSaved(await submitMyStats(matchId));
      onSubmitted();
    }, "Your stats could not be submitted. Try again.");

  // Joining late, or throw-in tapped late: the clock as it reads now. The
  // half is worked out from where the game is and the time typed.
  const [clockText, setClockText] = useState("");
  const setClock = () => {
    const gameMs = parseClock(clockText);
    if (gameMs === null) {
      setError("Type the clock as minutes and seconds, like 15:30.");
      return;
    }
    const half = halfForReading(gameMs, phase, clock.halfLengthMin);
    const plan = clockFromReading(gameMs, half, Date.now(), clock.whistles, clock.halfLengthMin);
    if ("error" in plan) {
      setError(plan.error);
      return;
    }
    const before = clock.whistles;
    run(async () => {
      clock.setSaved(await setMyClock(matchId, plan.whistles));
      onClockSet(before, plan.whistles);
      setClockText("");
      setAdjusting(false);
    }, "The clock could not be set.");
  };

  // What to do now, said out loud. Throw-in is the one that matters most:
  // nothing can be logged until it is tapped.
  const prompt =
    phase === "not_started"
      ? "Tap Throw-in at the first whistle. Watching a stream? Tap it when the stream shows it."
      : phase === "half_time"
        ? "Tap Second half when play restarts."
        : phase === "full_time" && submittedAt == null
          ? "Check your stats below, then submit them. The other coaches see them once you do."
          : null;
  const loud = prompt != null;

  return (
    <div
      className="rounded px-3 py-2.5"
      style={{
        border: `1px solid ${loud ? "var(--color-ink)" : "var(--color-line)"}`,
        background: loud ? "var(--color-surface-2)" : "transparent",
      }}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-2.5">
          <span className="display tabular text-[1.75rem] leading-none">{formatGameClock(clock.clockMs)}</span>
          <span className="text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
            {STATUS[phase]}
          </span>
        </div>
        {prompt && (
          <p className="flex min-w-0 items-center gap-2 text-[14px]" style={{ color: "var(--color-ink)" }}>
            <span
              aria-hidden
              className="inline-block h-2 w-2 shrink-0 rounded-full motion-safe:animate-pulse"
              style={{ background: "var(--color-ink)" }}
            />
            {prompt}
          </p>
        )}
        <div className="flex-1" />
        {last && (
          <button onClick={() => tap(last, null)} disabled={pending} className="btn-ghost text-xs">
            Undo {WHISTLE_LABELS[last].toLowerCase()}
          </button>
        )}
        <button
          onClick={() => setAdjusting(!adjusting)}
          aria-expanded={adjusting}
          className="btn-ghost text-xs"
        >
          {adjusting ? "Done" : phase === "not_started" ? "Joined late?" : "Clock wrong?"}
        </button>
        {next && (
          <button
            onClick={() => tap(next, Date.now())}
            disabled={pending}
            // The whistle that is due gets the weight. Half time and full
            // time sit quieter while a half is on, so a thumb going for a
            // stat does not end the half by mistake.
            className={clock.open ? "btn-outline text-sm" : "btn-primary"}
          >
            {WHISTLE_LABELS[next]}
          </button>
        )}
        {phase === "full_time" && submittedAt == null && (
          <button onClick={submit} disabled={pending} className="btn-primary">
            Submit my stats
          </button>
        )}
      </div>

      {submittedAt != null && (
        <p className="mt-1.5 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          Submitted. The other coaches can see your stats, and anything you fix shows up for them too.
        </p>
      )}

      {adjusting && (
        <div className="mt-3 space-y-2">
          <p className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            Type what the game clock reads right now, and yours runs on from there.{" "}
            {phase === "not_started" || phase === "half_time"
              ? `${clock.halfLengthMin}:00 or more starts you in the 2nd half. `
              : "Anything you logged this half moves with it. "}
            Only your clock changes.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setClock();
            }}
            className="flex flex-wrap items-end gap-3 text-[14px]"
          >
            <label className="block">
              <span className="label mb-1.5 block">Clock now</span>
              <input
                value={clockText}
                onChange={(e) => setClockText(e.target.value)}
                // A phone's decimal pad has a point but no colon; 15.30 reads the same.
                inputMode="decimal"
                autoComplete="off"
                placeholder="15:30"
                aria-label="What the game clock reads now, in minutes and seconds"
                className="field tabular w-24"
              />
            </label>
            <button type="submit" disabled={pending || !clockText.trim()} className="btn-primary text-sm">
              Set clock
            </button>
          </form>
        </div>
      )}

      {error && (
        <p className="mt-2 text-[12px]" style={{ color: "var(--color-danger-ink)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
