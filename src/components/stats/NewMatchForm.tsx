"use client";

/**
 * Starting a match from the stats page: who, when, and how long a half is,
 * which is all the match clock needs. Competition and venue are optional and
 * stay out of the way. On saving it goes straight to logging, because the
 * reason to start one here is that the game is about to throw in.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMatch } from "@/lib/actions/admin";
import { Choice } from "./StatFields";

/** Today in the browser's own time zone, as the date input wants it. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function NewMatchForm() {
  const router = useRouter();
  const [opponent, setOpponent] = useState("");
  const [playedOn, setPlayedOn] = useState(today);
  const [competition, setCompetition] = useState("");
  const [halfLengthMin, setHalfLengthMin] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!opponent.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const { id } = await createMatch({
          opponent,
          playedOn,
          competition: competition || undefined,
          halfLengthMin,
        });
        router.push(`/matches/${id}/stats/log`);
      } catch (err) {
        setError((err as Error).message || "That match could not be started.");
      }
    });
  };

  return (
    <form
      onSubmit={submit}
      className="mt-6 rounded p-4"
      style={{ border: "1px solid var(--color-line-strong)", background: "var(--color-surface)" }}
    >
      <h2 className="title text-base">Start a match</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <div>
          <label className="label mb-1.5 block" htmlFor="new-opponent">
            Opponent
          </label>
          <input
            id="new-opponent"
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            placeholder="Who are you playing?"
            autoComplete="off"
            required
            className="field"
          />
        </div>
        <div>
          <label className="label mb-1.5 block" htmlFor="new-date">
            Date
          </label>
          <input
            id="new-date"
            type="date"
            value={playedOn}
            onChange={(e) => setPlayedOn(e.target.value)}
            required
            className="field tabular"
          />
        </div>
        <div>
          <label className="label mb-1.5 block" htmlFor="new-competition">
            Competition <span style={{ color: "var(--color-ink-faint)" }}>(optional)</span>
          </label>
          <input
            id="new-competition"
            value={competition}
            onChange={(e) => setCompetition(e.target.value)}
            placeholder="League, championship, challenge"
            autoComplete="off"
            className="field"
          />
        </div>
        <Choice
          label="Halves"
          options={[
            { value: "30", label: "30 min" },
            { value: "35", label: "35 min" },
          ]}
          value={String(halfLengthMin)}
          onChange={(v) => setHalfLengthMin(Number(v))}
        />
      </div>

      {error && (
        <p className="mt-3 text-[13px]" style={{ color: "var(--color-danger-ink)" }}>
          {error}
        </p>
      )}

      <button type="submit" disabled={!opponent.trim() || pending} className="btn-primary mt-4">
        {pending ? "Starting…" : "Start and log stats"}
      </button>
    </form>
  );
}
