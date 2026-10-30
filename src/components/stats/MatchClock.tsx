"use client";

/**
 * The logger's own match clock, for logging on the line, off a stream, or
 * watching it back later on the television.
 *
 * One button at a time: Throw-in, then Half time, Second half and Full time,
 * each tapped as this logger sees it happen. The clock is theirs alone (see
 * src/lib/hurling/live-clock.ts): no other phone moves it, and it moves no
 * other phone. Watching a stream, the logger taps each whistle when the
 * stream shows it, so the delay is already in the clock.
 *
 * Only the game clock is ever shown. While a half is on it can be paused and
 * skipped 15 seconds either way, so it keeps with footage that is paused and
 * rewound; and "Update time" sets it to whatever the game clock reads. None
 * of these move what is already logged.
 *
 * Once full time is tapped the strip offers Submit, which puts this logger's
 * entries on the match's sheet for the other coaches.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { setMyClock, setMyWhistle, submitMyStats } from "@/lib/actions/stats";
import { formatGameClock, parseClock, type Markers } from "@/lib/hurling/notation";
import {
  LAST_WHISTLE,
  NEXT_WHISTLE,
  SKIP_MS,
  WHISTLE_LABELS,
  canLog,
  clockFromReading,
  clockOf,
  halfForReading,
  liveMoment,
  livePhase,
  resumeClock,
  skipClock,
  type LivePhase,
  type Whistle,
} from "@/lib/hurling/live-clock";

export type LoggerClock = { whistles: Markers; pausedAt: number | null; submittedAt: number | null };

export type MatchClockState = ReturnType<typeof useMatchClock>;

export function useMatchClock(initial: LoggerClock, halfLengthMin: number) {
  const [saved, setSaved] = useState<LoggerClock>(initial);
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const phase = livePhase(saved.whistles);
  // A paused clock reads the moment it was paused at, for showing and for
  // timing an entry alike.
  const reading = (now: number) => saved.pausedAt ?? now;
  const moment = liveMoment(reading(tick), saved.whistles);
  return {
    ...saved,
    setSaved,
    phase,
    halfLengthMin,
    paused: saved.pausedAt != null,
    /** Stats can be logged now: a half is on, paused or not. */
    open: canLog(phase),
    /** Where an entry started now sits: its half and how far into it. */
    momentNow: () => liveMoment(reading(Date.now()), saved.whistles),
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
  onSubmitted,
}: {
  matchId: string;
  clock: MatchClockState;
  onSubmitted: () => void;
}) {
  const { phase, submittedAt, paused } = clock;
  const [adjusting, setAdjusting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const next = NEXT_WHISTLE[phase];
  const last = LAST_WHISTLE[phase];

  // Pause and skip answer at once and save behind, so a run of taps on
  // Forward 15s never waits on the network. Their saves queue up in order,
  // and anything else that writes the clock waits for them to land first.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const run = (work: () => Promise<void>, failed: string) => {
    setError(null);
    startTransition(async () => {
      try {
        await queue.current;
        await work();
      } catch (err) {
        setError((err as Error).message || failed);
      }
    });
  };

  const move = (whistles: Markers, pausedAt: number | null) => {
    setError(null);
    clock.setSaved({ whistles, pausedAt, submittedAt });
    queue.current = queue.current
      .then(() => setMyClock(matchId, { whistles, pausedAt }))
      .catch(() => setError("The clock did not save. Check your connection and try again."));
  };

  const skip = (byMs: number) => move(skipClock(clock.whistles, byMs, clock.pausedAt ?? Date.now()), clock.pausedAt);
  const pause = () => move(clock.whistles, Date.now());
  const resume = () => move(resumeClock(clock.whistles, clock.pausedAt!, Date.now()), null);

  const tap = (whistle: Whistle, action: "tap" | "undo") => {
    const now = Date.now();
    run(async () => clock.setSaved(await setMyWhistle(matchId, whistle, action, now)), "That did not save. Try again.");
  };

  const submit = () =>
    run(async () => {
      clock.setSaved(await submitMyStats(matchId));
      onSubmitted();
    }, "Your stats could not be submitted. Try again.");

  // Joining late, a whistle tapped late, or jumping about in a recording:
  // the clock as it reads now. The half is worked out from where the game is
  // and the time typed.
  const [clockText, setClockText] = useState("");
  const setClock = () => {
    const gameMs = parseClock(clockText);
    if (gameMs === null) {
      setError("Type the clock as minutes and seconds, like 15:30.");
      return;
    }
    const half = halfForReading(gameMs, phase, clock.halfLengthMin);
    const plan = clockFromReading(gameMs, half, clock.pausedAt ?? Date.now(), clock.whistles, clock.halfLengthMin);
    if ("error" in plan) {
      setError(plan.error);
      return;
    }
    run(async () => {
      clock.setSaved(await setMyClock(matchId, { whistles: plan.whistles, pausedAt: clock.pausedAt }));
      setClockText("");
      setAdjusting(false);
    }, "The time could not be set.");
  };

  // What to do now, said out loud. Throw-in is the one that matters most:
  // nothing can be logged until it is tapped.
  const prompt =
    phase === "not_started"
      ? "Tap Throw-in at the first whistle. Watching a stream or a recording? Tap it when the screen shows it."
      : phase === "half_time"
        ? "Tap Second half when play restarts."
        : paused
          ? "Paused. Tap Resume when the footage plays again."
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
          <span
            className="display tabular text-[1.75rem] leading-none"
            style={{ color: paused ? "var(--color-ink-dim)" : undefined }}
          >
            {formatGameClock(clock.clockMs)}
          </span>
          <span className="text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
            {STATUS[phase]}
            {paused && ", paused"}
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
          <button onClick={() => tap(last, "undo")} disabled={pending} className="btn-ghost text-xs">
            Undo {WHISTLE_LABELS[last].toLowerCase()}
          </button>
        )}
        <button
          onClick={() => setAdjusting(!adjusting)}
          aria-expanded={adjusting}
          className="btn-ghost text-xs"
        >
          {adjusting ? "Done" : phase === "not_started" ? "Joined late?" : "Update time"}
        </button>
        {next && (
          <button
            onClick={() => tap(next, "tap")}
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

      {clock.open && (
        // Keeping the clock with the footage, for anyone watching it back.
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <button
            onClick={() => skip(-SKIP_MS)}
            disabled={pending}
            aria-label="Back 15 seconds"
            className="btn-outline text-sm"
          >
            Back 15s
          </button>
          <button
            onClick={paused ? resume : pause}
            disabled={pending}
            className={paused ? "btn-primary text-sm" : "btn-outline text-sm"}
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            onClick={() => skip(SKIP_MS)}
            disabled={pending}
            aria-label="Forward 15 seconds"
            className="btn-outline text-sm"
          >
            Forward 15s
          </button>
          {!paused && (
            <span className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
              Watching it back? Pause and skip with the footage.
            </span>
          )}
        </div>
      )}

      {submittedAt != null && (
        <p className="mt-1.5 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          Submitted. The other coaches can see your stats, and anything you fix shows up for them too.
        </p>
      )}

      {adjusting && (
        <div className="mt-3 space-y-2">
          <p className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            Type what the game clock reads right now, at the ground or on the screen, and yours runs on from
            there.{" "}
            {phase === "not_started" || phase === "half_time"
              ? `${clock.halfLengthMin}:00 or more starts you in the 2nd half. `
              : "What you have logged keeps its time. "}
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
              Set time
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
