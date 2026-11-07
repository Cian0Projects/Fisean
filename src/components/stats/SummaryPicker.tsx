"use client";

/**
 * The analyst's thirty seconds at the whistle: keep the tiles the app put
 * forward, or swap them, then confirm.
 *
 * Doing nothing still gives a good page, because the suggestions are already
 * on it. Each option says why it is there ("7, target at most 4 by half
 * time"), so swapping is a decision rather than a guess. The choice is saved
 * for the match and the stage, so the laptop in the dressing room shows what
 * the phone in the stand confirmed.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setSummaryPicks } from "@/lib/actions/summary";
import { MAX_PICKS, type SummaryStage, type TileKey, type Verdict } from "@/lib/hurling/summary";
import { errorText } from "@/lib/user-error";

export type PickOption = { key: TileKey; title: string; reason: string; verdict: Verdict };

const VERDICT_INK: Partial<Record<Verdict, string>> = {
  met: "var(--color-brand)",
  close: "var(--color-mark)",
  missed: "var(--color-danger-ink)",
};

export function SummaryPicker({
  matchId,
  stage,
  options,
  current,
  confirmed,
}: {
  matchId: string;
  stage: SummaryStage;
  /** Every tile that is not one of the fixed two, most off target first. */
  options: PickOption[];
  /** What the room sees now: the confirmed tiles, or the suggestions. */
  current: TileKey[];
  confirmed: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<TileKey[]>(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (key: TileKey) =>
    setChosen((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : prev.length >= MAX_PICKS ? [...prev.slice(1), key] : [...prev, key],
    );

  const save = (picks: TileKey[]) => {
    setError(null);
    startTransition(async () => {
      try {
        await setSummaryPicks(matchId, stage, picks);
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(errorText(err, "Those tiles could not be saved. Try again."));
      }
    });
  };

  const titleOf = (key: TileKey) => options.find((o) => o.key === key)?.title ?? key;

  return (
    <div className="no-print rounded px-4 py-3" style={{ border: "1px solid var(--color-line)", background: "var(--color-surface)" }}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-[14px]">
          <span className="font-semibold">{confirmed ? "Confirmed for the room: " : "Suggested for the room: "}</span>
          {current.length > 0 ? current.map(titleOf).join(" and ") : "nothing off target with enough logged yet"}
        </p>
        <div className="flex-1" />
        {!confirmed && current.length > 0 && (
          <button onClick={() => save(current)} disabled={pending} className="btn-primary text-sm">
            Keep these
          </button>
        )}
        <button
          onClick={() => {
            setChosen(current);
            setOpen(!open);
          }}
          aria-expanded={open}
          className="btn-outline text-sm"
        >
          {open ? "Close" : "Change"}
        </button>
      </div>

      {open && (
        <div className="mt-3">
          <p className="caption mb-2">Pick up to {MAX_PICKS}. Most off target first.</p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {options.map((o) => {
              const on = chosen.includes(o.key);
              return (
                <li key={o.key}>
                  <button
                    onClick={() => toggle(o.key)}
                    aria-pressed={on}
                    className="flex w-full items-start gap-2.5 rounded px-3 py-2 text-left"
                    style={{
                      border: `1px solid ${on ? "var(--color-ink)" : "var(--color-line)"}`,
                      background: on ? "var(--color-surface-2)" : "transparent",
                    }}
                  >
                    <span
                      aria-hidden
                      className="mt-1 inline-block h-3.5 w-3.5 shrink-0 rounded-sm"
                      style={{ border: "2px solid var(--color-ink)", background: on ? "var(--color-ink)" : "transparent" }}
                    />
                    <span>
                      <span className="block text-[14px] font-semibold">{o.title}</span>
                      <span className="block text-[13px]" style={{ color: VERDICT_INK[o.verdict] ?? "var(--color-ink-faint)" }}>
                        {o.reason}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-center gap-3">
            <button onClick={() => save(chosen)} disabled={pending} className="btn-primary text-sm">
              {pending ? "Saving…" : "Confirm"}
            </button>
            <span className="caption">The fixed two are set in stats settings on the squad page.</span>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-[13px]" style={{ color: "var(--color-danger-ink)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
