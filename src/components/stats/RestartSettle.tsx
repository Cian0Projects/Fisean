"use client";

/**
 * The open restart, held at the top of a logging screen until it is settled.
 *
 * Advanced puckout analysis asks how a short restart went once its taker won
 * it, and that answer comes ten or twenty seconds after the puck. So the
 * restart is logged at once and waits here, one line with three buttons. The
 * next entry usually settles it by itself (a shot of ours, a ball we lost;
 * see `settleFrom`), and the line goes. Logging the next restart closes it
 * unsettled. Nothing here blocks the pad: a logger can ignore it entirely.
 *
 * A lost one then asks, once and optionally, who was on the ball.
 */
import { useState, useTransition } from "react";
import { settleRestart } from "@/lib/actions/stats";
import { termsFor, type GameCode } from "@/lib/hurling/codes";
import { endChoices, lineName, stageLabel, type RestartEnd } from "@/lib/hurling/restart-line";
import { NumberField, typedNumber } from "./StatFields";
import type { NumberSheet, StatRow } from "./types";
import { errorText } from "@/lib/user-error";

const NO_SHEET: NumberSheet = new Map();

export function RestartSettle({
  open,
  code,
  sheet,
  onSettled,
  compact = false,
  className = "",
}: {
  /** The restart waiting on an answer (`openRestart`), or null. */
  open: StatRow | null;
  code: GameCode;
  sheet: NumberSheet;
  onSettled: (row: StatRow) => void;
  compact?: boolean;
  /** Spacing from what sits above, only when there is something to show. */
  className?: string;
}) {
  // A lost one just settled, waiting on who lost it. Kept here because the
  // restart is no longer open once it is settled.
  const [asking, setAsking] = useState<StatRow | null>(null);
  const [number, setNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const row = asking ?? open;
  if (!row || !row.restartLine || !row.puckoutTakenBy) return null;
  const ours = row.puckoutTakenBy === "us";
  const restart = termsFor(code).restart;
  const said = restart.charAt(0).toLowerCase() + restart.slice(1);
  const at = lineName(row.restartLine, row.puckoutTakenBy);

  const settle = (end: RestartEnd) =>
    startTransition(async () => {
      try {
        const saved = await settleRestart(row.id, end);
        onSettled(saved);
        setError(null);
        if (end !== "worked_through") {
          setNumber("");
          setAsking(saved);
        }
      } catch (err) {
        setError(errorText(err, "That could not be saved."));
      }
    });

  const saveNumber = () =>
    startTransition(async () => {
      if (!asking) return;
      try {
        const saved = await settleRestart(asking.id, asking.restartEnd, typedNumber(number));
        onSettled(saved);
        setAsking(null);
        setError(null);
      } catch (err) {
        setError(errorText(err, "That could not be saved."));
      }
    });

  const text = compact ? "text-[13px]" : "text-[14px]";
  const button = compact ? "px-2.5 py-1 text-[13px]" : "px-3 py-2 text-[14px]";

  return (
    <div
      className={`rounded border px-3 py-2 ${className}`}
      style={{ borderColor: "var(--color-line-strong)", background: "var(--color-surface-2)" }}
      role="group"
      aria-label={`How the ${said} ended`}
    >
      {asking ? (
        <>
          <p className={text}>
            {stageLabel(asking.restartEnd!, asking.puckoutTakenBy!, asking.restartLine)}.{" "}
            <span style={{ color: "var(--color-ink-dim)" }}>Who was on the ball? Optional.</span>
          </p>
          <div className="mt-1.5 flex flex-wrap items-end gap-2">
            <NumberField
              id="restart-lost-by"
              label={ours ? "Lost by" : "Their player"}
              value={number}
              onChange={setNumber}
              sheet={ours ? sheet : NO_SHEET}
              theirs={!ours}
              compact
              inline
            />
            <button
              onClick={saveNumber}
              disabled={pending || (number.trim() !== "" && typedNumber(number) == null)}
              className={`btn-outline ${button}`}
            >
              Save
            </button>
            <button onClick={() => setAsking(null)} className={`btn-ghost ${button}`}>
              Skip
            </button>
          </div>
        </>
      ) : (
        <>
          <p className={text}>
            {ours ? `Our ${said}, won short of ${at}.` : `Their ${said}, they won it short of ${at}.`}{" "}
            <span style={{ color: "var(--color-ink-dim)" }}>How did it end?</span>
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {endChoices(row.puckoutTakenBy, row.restartLine).map((c) => (
              <button
                key={c.value}
                onClick={() => settle(c.value)}
                disabled={pending}
                className={`rounded border transition-colors ${button}`}
                style={{ borderColor: "var(--color-line-strong)", color: "var(--color-ink)" }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </>
      )}
      {error && (
        <p className="mt-1.5 text-[12px]" style={{ color: "var(--color-danger-ink)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
