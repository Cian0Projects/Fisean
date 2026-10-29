"use client";

/**
 * Attaching a GPS export to a match, and swapping or removing it afterwards.
 *
 * With nothing uploaded it is the whole page: what to export and where to
 * drop it. With a report showing it shrinks to a row of buttons above it. It
 * sits in the same place in both states, so the note about what was imported
 * survives the refresh that swaps one for the other.
 */
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { removeMatchGps, uploadMatchGps } from "@/lib/actions/gps";
import { decodeCsvBytes } from "@/lib/hurling/gps";
import { PrintButton } from "./PrintButton";

type Note = { tone: "ok" | "error"; text: string };

export function GpsUpload({
  matchId,
  hasData,
  matchLabel,
}: {
  matchId: string;
  hasData: boolean;
  matchLabel: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [pending, startTransition] = useTransition();

  const choose = (file: File | undefined) => {
    if (!file || pending) return;
    setNote(null);
    startTransition(async () => {
      try {
        const text = decodeCsvBytes(new Uint8Array(await file.arrayBuffer()));
        const r = await uploadMatchGps(matchId, text);
        const bits = [`${r.imported} ${r.imported === 1 ? "player" : "players"} imported.`];
        if (r.skipped > 0) bits.push(`${r.skipped} ${r.skipped === 1 ? "row was" : "rows were"} left out for missing a name or a distance.`);
        if (r.ignored.length > 0) bits.push(`Columns not used: ${r.ignored.join(", ")}.`);
        setNote({ tone: "ok", text: bits.join(" ") });
        router.refresh();
      } catch (err) {
        setNote({ tone: "error", text: (err as Error).message || "That file could not be imported." });
      } finally {
        if (input.current) input.current.value = "";
      }
    });
  };

  const remove = () => {
    if (pending || !window.confirm("Remove the GPS data from this match? You can upload it again afterwards.")) return;
    setNote(null);
    startTransition(async () => {
      try {
        await removeMatchGps(matchId);
        router.refresh();
      } catch (err) {
        setNote({ tone: "error", text: (err as Error).message || "That could not be removed." });
      }
    });
  };

  const picker = (
    <input
      ref={input}
      type="file"
      accept=".csv,text/csv"
      className="sr-only"
      onChange={(e) => choose(e.target.files?.[0])}
      aria-label="Choose a GPS export CSV"
    />
  );

  const message = note && (
    <p
      role={note.tone === "error" ? "alert" : "status"}
      className="mt-3 text-[14px]"
      style={{ color: note.tone === "error" ? "var(--color-danger-ink)" : "var(--color-ink-dim)" }}
    >
      {note.text}
    </p>
  );

  if (hasData) {
    return (
      <div className="no-print mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/stats" className="btn-ghost text-xs">
            Back to matches
          </Link>
          <span className="flex-1" />
          <PrintButton />
          {picker}
          <button onClick={() => input.current?.click()} disabled={pending} className="btn-outline text-xs">
            {pending ? "Importing" : "Replace file"}
          </button>
          <button onClick={remove} disabled={pending} className="btn-ghost text-xs">
            Remove
          </button>
        </div>
        {message}
      </div>
    );
  }

  return (
    <section className="no-print mx-auto max-w-2xl py-6">
      <Link href="/stats" className="btn-ghost -ml-3 text-xs">
        Back to matches
      </Link>
      <h1 className="display mt-4 text-[clamp(2rem,5vw,2.75rem)]">GPS data</h1>
      <p className="mt-2 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
        {matchLabel}
      </p>
      <p className="measure mt-5 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
        Export the player table from your GPS provider as a CSV and add it here. It becomes a two page report, one
        sheet each: workload, with every player ranked by total distance, then speed, ranked by high speed running
        with top speed beside it.
      </p>

      <div
        className="mt-6 rounded p-5"
        style={{ border: "1px dashed var(--color-line-strong)", background: "var(--color-surface)" }}
      >
        {picker}
        <button onClick={() => input.current?.click()} disabled={pending} className="btn-primary">
          {pending ? "Importing" : "Choose a CSV file"}
        </button>
        {message}
        <p className="caption mt-4">
          One row per player, with a header row. The columns are found by name, in any order: Name and Total Distance
          are needed, and HMLD, HSR, Max Speed, Percentage Speed, Accels and Decels are used when present. Anything
          else is ignored.
        </p>
      </div>
    </section>
  );
}
