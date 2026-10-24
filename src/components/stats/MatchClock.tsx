"use client";

/**
 * The match clock on the line, for logging with no footage.
 *
 * Every logger's entries are stamped with the moment they were seen, as a
 * real-world time. Whoever keeps time taps the whistles here, and every
 * entry's game minute is worked out from the two when the sheet is read. So
 * nothing has to agree in advance: a logger can start before throw-in is
 * tapped, and a whistle tapped late can be corrected afterwards, moving every
 * entry with it.
 *
 * Someone joining after throw-in does not know what time of day it went, but
 * can read the game clock off the scoreboard or the stream. So the clock can
 * also be set by its minute ("15:30, first half"), and the whistle it counts
 * from is worked out backwards (see `whistlesForClock`).
 *
 * Each phone asks for the whistles every 20 seconds, which is how a second
 * logger sees the clock start without anyone telling them. The same request
 * returns the server's time, and each phone keeps the difference from its own
 * clock: every stamp is then on the server's clock, so two phones a few
 * seconds apart still agree on the minute.
 *
 * A phone logging off a live stream also keeps a delay, its own and no one
 * else's (see `streamDelayFrom`). Everything it stamps, the whistles it taps
 * included, and the clock it shows, run that far behind, so the screen in
 * front of the logger and the minute on every entry agree.
 */
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { setMatchWhistle, type Whistle } from "@/lib/actions/stats";
import { readMatchClock } from "@/lib/actions/reads";
import { formatClock, parseClock, type Markers } from "@/lib/hurling/notation";
import {
  MAX_STREAM_DELAY_MS,
  latestWhistle,
  liveGameTime,
  streamDelayFrom,
  whistlesForClock,
  type Half,
} from "@/lib/hurling/stats";
import { Choice } from "./StatFields";

const POLL_MS = 20_000;

const WHISTLES: { key: Whistle; label: string }[] = [
  { key: "throwIn", label: "Throw-in" },
  { key: "halfTime", label: "Half time" },
  { key: "secondHalf", label: "Second half" },
  { key: "fullTime", label: "Full time" },
];

export type MatchClockState = ReturnType<typeof useMatchClock>;

export function useMatchClock(matchId: string, initial: Markers, halfLengthMin: number) {
  const [whistles, setWhistles] = useState<Markers>(initial);
  // Server time minus this phone's time, from the last round trip.
  const offset = useRef(0);
  // The same, as state, for drawing the clock; the ref is for stamping.
  const [skew, setSkew] = useState(0);
  const [tick, setTick] = useState(() => Date.now());
  const [delayMs, setDelayMs] = useStreamDelay(matchId);

  useEffect(() => {
    let live = true;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      const sent = Date.now();
      try {
        const res = await readMatchClock(matchId);
        if (!live || !res) return;
        const back = Date.now();
        // The server read its clock roughly halfway through the round trip.
        offset.current = res.serverNow - (sent + back) / 2;
        setSkew(offset.current);
        setWhistles(res.whistles);
      } catch {
        // No signal. The clock keeps running on what it last knew.
      }
    };
    void poll();
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [matchId]);

  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  /** Now, on the server's clock, less any stream delay. What every entry is stamped with. */
  const now = () => Date.now() + offset.current - delayMs;

  return {
    whistles,
    setWhistles,
    now,
    /** Now on the server's clock with no delay: what a delay is measured from. */
    serverNow: () => Date.now() + offset.current,
    delayMs,
    setDelayMs,
    halfLengthMin,
    /** The game clock this second, or null before throw-in or long after the last whistle. */
    game: liveGameTime(tick + skew - delayMs, whistles, halfLengthMin),
  };
}

/**
 * This phone's stream delay for a match, kept on the phone for the same
 * reason the logger keeps which way round it sees the pitch: it is about one
 * screen. Held in memory as well, so it still works where storage is blocked.
 */
const delayListeners = new Set<() => void>();
const delayInMemory = new Map<string, number>();
const delayKey = (matchId: string) => `ardawn:stream-delay:${matchId}`;

function subscribeDelay(listener: () => void) {
  delayListeners.add(listener);
  return () => {
    delayListeners.delete(listener);
  };
}

function storedDelay(matchId: string): number {
  const key = delayKey(matchId);
  if (delayInMemory.has(key)) return delayInMemory.get(key)!;
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) ? Math.min(MAX_STREAM_DELAY_MS, Math.max(0, n)) : 0;
  } catch {
    return 0;
  }
}

function useStreamDelay(matchId: string): [number, (ms: number) => void] {
  const delay = useSyncExternalStore(
    subscribeDelay,
    () => storedDelay(matchId),
    () => 0,
  );
  const set = (ms: number) => {
    const key = delayKey(matchId);
    const value = Math.min(MAX_STREAM_DELAY_MS, Math.max(0, Math.round(ms)));
    delayInMemory.set(key, value);
    try {
      if (value === 0) localStorage.removeItem(key);
      else localStorage.setItem(key, String(value));
    } catch {
      // Private window or blocked storage: it holds for this visit.
    }
    delayListeners.forEach((l) => l());
  };
  return [delay, set];
}

/** The next whistle to blow, given the ones already blown. */
function nextWhistle(w: Markers): (typeof WHISTLES)[number] | null {
  return WHISTLES.find((x) => w[x.key] == null) ?? null;
}

const timeOfDay = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function MatchClock({ matchId, clock }: { matchId: string; clock: MatchClockState }) {
  const { whistles, game } = clock;
  const [adjusting, setAdjusting] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const latest = latestWhistle(whistles);
  const delaySec = Math.round(clock.delayMs / 1000);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const next = nextWhistle(whistles);

  const blow = (key: Whistle, at: number | "now" | null) => {
    setError(null);
    startTransition(async () => {
      try {
        clock.setWhistles(await setMatchWhistle(matchId, key, at));
      } catch (err) {
        setError((err as Error).message || "That whistle could not be saved.");
      }
    });
  };

  // Joining late: the clock as it reads now, worked back to its whistles.
  const [clockText, setClockText] = useState("");
  const [clockHalf, setClockHalf] = useState<Half>(1);
  const setClock = () => {
    const gameMs = parseClock(clockText);
    if (gameMs === null) {
      setError("Type the clock as minutes and seconds, like 15:30.");
      return;
    }
    const plan = whistlesForClock(gameMs, clockHalf, clock.now(), whistles, clock.halfLengthMin);
    if ("error" in plan) {
      setError(plan.error);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        let saved = whistles;
        for (const [key, at] of Object.entries(plan.set) as [Whistle, number][]) {
          saved = await setMatchWhistle(matchId, key, at);
        }
        clock.setWhistles(saved);
        setClockText("");
        setAdjusting(false);
      } catch (err) {
        setError((err as Error).message || "The clock could not be set.");
      }
    });
  };

  const status =
    whistles.throwIn == null
      ? "Not started"
      : game?.phase === "first_half"
        ? "First half"
        : game?.phase === "half_time"
          ? "Half time"
          : game?.phase === "second_half"
            ? "Second half"
            : "Full time";

  // The whistle that is due now, said out loud. Before throw-in and over the
  // interval one is always due; once a half has run its length, its end is.
  // Forgetting throw-in is the one mistake that leaves every phone's clock
  // at 0:00, so that prompt is the loudest thing on the strip.
  const halfRunOut = game?.half != null && game.halfMs >= clock.halfLengthMin * 60_000;
  const prompt =
    whistles.throwIn == null
      ? "Tap Throw-in at the first whistle, or Set the clock if the game is already under way."
      : game?.phase === "half_time"
        ? "Tap Second half when play restarts."
        : halfRunOut && next
          ? `Tap ${next.label} at the whistle.`
          : null;

  return (
    <div
      className="rounded px-3 py-2.5"
      style={{
        border: `1px solid ${prompt ? "var(--color-ink)" : "var(--color-line)"}`,
        background: prompt ? "var(--color-surface-2)" : "transparent",
      }}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-2.5">
          <span className="display tabular text-[1.75rem] leading-none">
            {game?.half != null ? formatClock(game.gameMs) : "0:00"}
          </span>
          <span className="text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
            {status}
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
        {next && (
          <button
            // "now" is the server's own clock, which is right on the line; a
            // phone on a stream sends its delayed moment instead.
            onClick={() => blow(next.key, clock.delayMs > 0 ? clock.now() : "now")}
            disabled={pending}
            className={prompt ? "btn-primary" : "btn-outline text-sm"}
          >
            {next.label}
          </button>
        )}
        <button
          onClick={() => setStreaming((s) => !s)}
          aria-expanded={streaming}
          className="btn-ghost text-xs"
        >
          {streaming ? "Done" : delaySec > 0 ? `Stream, ${delaySec}s behind` : "On a stream?"}
        </button>
        <button
          onClick={() => {
            // Opened, it offers the half the game is in now.
            if (!adjusting) setClockHalf(game?.phase === "second_half" || game?.phase === "half_time" ? 2 : 1);
            setAdjusting(!adjusting);
          }}
          aria-expanded={adjusting}
          className="btn-ghost text-xs"
        >
          {adjusting ? "Done" : "Set the clock"}
        </button>
      </div>

      {streaming && (
        <div className="mt-3 space-y-2">
          <p className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            A live stream runs behind the pitch. Set how far, and this phone logs that far behind, so every
            stat gets the minute it happened. Only this phone changes.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-[14px]">
            {latest ? (
              <button
                onClick={() => clock.setDelayMs(streamDelayFrom(latest.at, clock.serverNow()))}
                className="btn-outline text-sm"
              >
                {WHISTLES.find((w) => w.key === latest.key)?.label} is on my screen now
              </button>
            ) : null}
            <label className="flex items-center gap-2">
              <input
                key={delaySec}
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_STREAM_DELAY_MS / 1000}
                defaultValue={delaySec}
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n !== delaySec) clock.setDelayMs(n * 1000);
                }}
                aria-label="Seconds behind the pitch"
                className="field tabular w-20"
              />
              seconds behind
            </label>
            {delaySec > 0 && (
              <button onClick={() => clock.setDelayMs(0)} className="btn-ghost text-xs">
                I am at the ground
              </button>
            )}
          </div>
          {!latest && (
            <p className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
              Nobody has tapped a whistle yet. If someone at the ground will, a button appears here once they
              do: tap it when that whistle shows on your stream. If nobody is there, tap the whistles yourself
              as they show and leave this at 0.
            </p>
          )}
        </div>
      )}

      {whistles.throwIn == null && !adjusting && (
        <p className="mt-1.5 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          Any coach logging this match can tap it. Stats logged before then are still timed once it is set.
        </p>
      )}

      {adjusting && (
        <div className="mt-3 space-y-2">
          <p className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            Joined late, or the clock is out? Type what the game clock reads right now, and it runs on from
            there for every phone logging this match.
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
            <Choice
              label="Half"
              options={[
                { value: "1", label: "1st half" },
                { value: "2", label: "2nd half" },
              ]}
              value={String(clockHalf)}
              onChange={(v) => setClockHalf(Number(v) as Half)}
            />
            <button type="submit" disabled={pending || !clockText.trim()} className="btn-primary text-sm">
              Set clock
            </button>
          </form>
          <p className="pt-2 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            Or set the time of day each whistle really went, if it was tapped late or by mistake. Every stat
            moves with it.
          </p>
          {WHISTLES.map((w) => {
            const at = whistles[w.key];
            return (
              <div key={w.key} className="flex flex-wrap items-center gap-2 text-[14px]">
                <span className="w-28">{w.label}</span>
                {/* Saved when the field is left, not on every keystroke, and
                    reset from the saved time whenever that changes. */}
                <input
                  key={at ?? "unset"}
                  type="time"
                  step={1}
                  defaultValue={at != null ? timeOfDay(at) : ""}
                  disabled={pending}
                  onBlur={(e) => {
                    const [h, m, s = "0"] = e.target.value.split(":");
                    if (h === undefined || m === undefined) return;
                    // Same day as the whistle it replaces, or today for a new one.
                    const d = new Date(at ?? clock.now());
                    d.setHours(Number(h), Number(m), Number(s), 0);
                    if (at == null || d.getTime() !== Math.floor(at / 1000) * 1000) blow(w.key, d.getTime());
                  }}
                  aria-label={`${w.label} time`}
                  className="field tabular w-36"
                />
                {at != null && (
                  <button onClick={() => blow(w.key, null)} disabled={pending} className="btn-ghost text-xs">
                    Clear
                  </button>
                )}
              </div>
            );
          })}
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
