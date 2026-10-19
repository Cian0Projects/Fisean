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
 * Each phone asks for the whistles every 20 seconds, which is how a second
 * logger sees the clock start without anyone telling them. The same request
 * returns the server's time, and each phone keeps the difference from its own
 * clock: every stamp is then on the server's clock, so two phones a few
 * seconds apart still agree on the minute.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { setMatchWhistle, type Whistle } from "@/lib/actions/stats";
import { readMatchClock } from "@/lib/actions/reads";
import { formatClock, type Markers } from "@/lib/hurling/notation";
import { liveGameTime } from "@/lib/hurling/stats";

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

  /** Now, on the server's clock. What every entry is stamped with. */
  const now = () => Date.now() + offset.current;

  return {
    whistles,
    setWhistles,
    now,
    halfLengthMin,
    /** The game clock this second, or null before throw-in or long after the last whistle. */
    game: liveGameTime(tick + skew, whistles, halfLengthMin),
  };
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

  return (
    <div className="border-b pb-4" style={{ borderColor: "var(--color-line)" }}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-2.5">
          <span className="display tabular text-[1.75rem] leading-none">
            {game?.half != null ? formatClock(game.gameMs) : "0:00"}
          </span>
          <span className="text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
            {status}
          </span>
        </div>
        <div className="flex-1" />
        {next && (
          <button onClick={() => blow(next.key, "now")} disabled={pending} className="btn-outline text-sm">
            {next.label}
          </button>
        )}
        <button
          onClick={() => setAdjusting((a) => !a)}
          aria-expanded={adjusting}
          className="btn-ghost text-xs"
        >
          {adjusting ? "Done" : "Adjust"}
        </button>
      </div>

      {whistles.throwIn == null && !adjusting && (
        <p className="mt-2 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          Whoever keeps time taps each whistle. Stats logged before then are still timed once it is set.
        </p>
      )}

      {adjusting && (
        <div className="mt-3 space-y-2">
          <p className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            Tapped late, or by mistake? Set the time it really went, and every stat moves with it.
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
