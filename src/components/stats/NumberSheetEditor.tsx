"use client";

/**
 * Put names to one match's jersey numbers.
 *
 * Laid out like the team sheet handed to the referee: 1 to 15 down the page,
 * always there, then whichever sub numbers were used. Numbers already logged
 * against on the stat sheet show up even if nobody added them here, with how
 * many entries are waiting on a name — that is usually the job in hand.
 *
 * Each pick saves on its own. Picking someone already wearing another number
 * moves them, because one player wears one jersey in a match.
 */
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { setMatchNumber } from "@/lib/actions/numbers";
import { positionByNumber } from "@/lib/hurling/positions";
import { MAX_JERSEY } from "@/lib/hurling/stats";
import { matchDateLong } from "@/lib/format";
import { typedNumber } from "./StatFields";
import { numberSheet, type SheetEntry, type StatMatchInfo } from "./types";

type Player = { id: string; displayName: string };

const STARTING_FIFTEEN = Array.from({ length: 15 }, (_, i) => i + 1);

export function NumberSheetEditor({
  match,
  initialNumbers,
  players,
  logged,
}: {
  match: StatMatchInfo;
  initialNumbers: SheetEntry[];
  players: Player[];
  /** Stat entries already logged against each number. */
  logged: Record<number, number>;
}) {
  const [numbers, setNumbers] = useState(initialNumbers);
  const [added, setAdded] = useState<number[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sheet = useMemo(() => numberSheet(numbers), [numbers]);
  const wearing = useMemo(() => new Map(numbers.map((e) => [e.userId, e.number])), [numbers]);

  const rows = useMemo(
    () =>
      [
        ...new Set([
          ...STARTING_FIFTEEN,
          ...numbers.map((e) => e.number),
          ...Object.keys(logged).map(Number),
          ...added,
        ]),
      ].sort((a, b) => a - b),
    [numbers, logged, added],
  );

  const withoutNumber = players.filter((p) => !wearing.has(p.id));

  const assign = (number: number, userId: string | null) => {
    setError(null);
    const before = numbers;
    const player = userId ? players.find((p) => p.id === userId) : undefined;
    // Show the move straight away; the server's copy replaces it when it lands.
    setNumbers((prev) => {
      const rest = prev.filter((e) => e.number !== number && e.userId !== userId);
      return player
        ? [...rest, { number, userId: player.id, displayName: player.displayName }]
        : rest;
    });
    startTransition(async () => {
      try {
        setNumbers(await setMatchNumber(match.id, number, userId));
      } catch (err) {
        setNumbers(before);
        setError((err as Error).message || "That could not be saved.");
      }
    });
  };

  const addNumber = () => {
    const n = typedNumber(draft);
    if (n == null) {
      setError(`Jersey numbers run from 1 to ${MAX_JERSEY}.`);
      return;
    }
    setError(null);
    setAdded((prev) => (prev.includes(n) ? prev : [...prev, n]));
    setDraft("");
  };

  return (
    <main className="mx-auto max-w-3xl px-4 pt-8 pb-16">
      <header
        className="flex flex-wrap items-end justify-between gap-4 border-b pb-5"
        style={{ borderColor: "var(--color-line-strong)" }}
      >
        <div>
          <p className="text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
            Who wore what — {matchDateLong(match.playedOn)}
          </p>
          <h1 className="display mt-1.5 text-[clamp(2rem,5vw,3rem)]">{match.opponent}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/matches/${match.id}/stats/log`} className="btn-outline text-xs">
            Log stats
          </Link>
          <Link href={`/matches/${match.id}/stats`} className="btn-outline text-xs">
            See the report
          </Link>
        </div>
      </header>

      <p className="measure mt-5 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
        Stats are logged by the number on the jersey. Put a name to each number and every entry
        against it follows — before the game, after it, or halfway through the notebook.
      </p>

      {error && (
        <p role="alert" className="mt-4 text-[14px]" style={{ color: "var(--color-danger-ink)" }}>
          {error}
        </p>
      )}

      <ol className="mt-6">
        {rows.map((n) => {
          const who = sheet.get(n);
          const entries = logged[n] ?? 0;
          const id = `number-${n}`;
          return (
            <li
              key={n}
              className="fixture grid grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 py-2.5 sm:grid-cols-[2.25rem_9rem_minmax(0,1fr)_7rem]"
            >
              <span className="jersey">{n}</span>
              <label
                htmlFor={id}
                className="text-[13px]"
                style={{ color: "var(--color-ink-faint)" }}
              >
                {positionByNumber(n)?.name ?? "Sub"}
              </label>
              <select
                id={id}
                value={who?.userId ?? ""}
                onChange={(e) => assign(n, e.target.value || null)}
                className="field col-span-2 sm:col-span-1"
              >
                <option value="">No name yet</option>
                {players.map((p) => {
                  const other = wearing.get(p.id);
                  return (
                    <option key={p.id} value={p.id}>
                      {other != null && other !== n ? `${p.displayName} (wearing ${other})` : p.displayName}
                    </option>
                  );
                })}
              </select>
              <span
                className="tabular col-span-2 text-[13px] sm:col-span-1 sm:text-right"
                style={{ color: entries && !who ? "var(--color-ink)" : "var(--color-ink-faint)" }}
              >
                {entries === 0 ? "" : `${entries} ${entries === 1 ? "entry" : "entries"}`}
              </span>
            </li>
          );
        })}
      </ol>

      <form
        className="mt-5 flex items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          addNumber();
        }}
      >
        <div>
          <label htmlFor="add-number" className="label mb-1.5 block">
            Another number
          </label>
          <input
            id="add-number"
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 2))}
            inputMode="numeric"
            autoComplete="off"
            placeholder="No."
            className="field tabular w-20 text-center font-bold"
          />
        </div>
        <button type="submit" className="btn-outline">
          Add
        </button>
      </form>

      {withoutNumber.length > 0 && (
        <section className="mt-10">
          <h2 className="title text-base">Without a number in this match</h2>
          <p className="mt-2 text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
            {withoutNumber.map((p) => p.displayName).join(", ")}
          </p>
        </section>
      )}
    </main>
  );
}
