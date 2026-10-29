"use client";

import { useState, useTransition } from "react";
import { setStatsSubmitted } from "@/lib/actions/stats";

/**
 * The coaches' bar at the top of a stat sheet: whether the panel can see it
 * yet, and the control that changes that.
 *
 * Before it goes out it says who has logged what, because a game is often
 * logged by two or three people (one on shots, one on restarts, one off the
 * stream) and the one submitting wants to know the others are finished.
 */
export function SubmitStats({
  matchId,
  submittedAt,
  submittedBy,
  loggers,
}: {
  matchId: string;
  submittedAt: number | null;
  /** Who submitted it, when that person is still on the team. */
  submittedBy: string | null;
  /** Everyone who logged on this sheet, most entries first, with how many they have not submitted yet. */
  loggers: { name: string; n: number; drafts: number | null }[];
}) {
  const [at, setAt] = useState(submittedAt);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const change = (submit: boolean) =>
    startTransition(async () => {
      setError(null);
      try {
        setAt((await setStatsSubmitted(matchId, submit)).statsSubmittedAt);
      } catch (e) {
        setError(e instanceof Error ? e.message : "That did not save. Try again.");
      }
    });

  const by = loggers.map((l) => `${l.name} (${l.n}${l.drafts ? ", still logging" : ""})`);
  const loggedBy =
    by.length === 0 ? null : by.length === 1 ? by[0] : `${by.slice(0, -1).join(", ")} and ${by[by.length - 1]}`;
  // Entries only reach this sheet when their logger submits them, so the
  // panel would get a sheet missing whatever is still on someone's phone.
  const waiting = loggers.filter((l) => l.drafts).map((l) => l.name);

  return (
    <section
      className="no-print mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 border px-4 py-3"
      style={{ borderColor: "var(--color-line-strong)", background: "var(--color-surface)", borderRadius: 2 }}
      aria-live="polite"
    >
      <div className="min-w-0 flex-1">
        {at ? (
          <>
            <p className="text-[14px] font-semibold">The panel can see this sheet</p>
            <p className="caption mt-0.5">
              Submitted {new Date(at).toLocaleDateString("en-IE", { day: "numeric", month: "long" })}
              {submittedBy && at === submittedAt ? ` by ${submittedBy}` : ""}. Corrections still show up straight
              away.
            </p>
          </>
        ) : (
          <>
            <p className="text-[14px] font-semibold">Only coaches can see this sheet so far</p>
            <p className="caption mt-0.5">
              {loggedBy ? `Logged by ${loggedBy}. ` : ""}Submit it when everyone logging this game is finished, and
              every player can read it and watch their moments back.
            </p>
            {waiting.length > 0 && (
              <p className="caption mt-0.5">
                {waiting.join(" and ")} {waiting.length === 1 ? "has" : "have"} not submitted yet, so{" "}
                {waiting.length === 1 ? "their" : "those"} stats are not on this sheet.
              </p>
            )}
          </>
        )}
        {error && (
          <p className="mt-1 text-[13px]" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        )}
      </div>
      {at ? (
        <button onClick={() => change(false)} disabled={pending} className="btn-ghost text-xs">
          {pending ? "Taking it back…" : "Take it back"}
        </button>
      ) : (
        <button onClick={() => change(true)} disabled={pending} className="btn-primary text-xs">
          {pending ? "Submitting…" : "Submit to the panel"}
        </button>
      )}
    </section>
  );
}
