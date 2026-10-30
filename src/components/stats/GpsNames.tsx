"use client";

/**
 * Who is who in a GPS export: each name as the provider spelled it, put to a
 * member of the panel.
 *
 * A link is saved for the club team, not this match, so most weeks there is
 * nothing to do here: last week's names are already linked. A name not seen
 * before comes with a suggestion where one person clearly fits
 * (`suggestPlayer`), but a suggestion is only saved when a coach says so,
 * because one player's load on another's season is worse than a gap.
 *
 * Each pick saves on its own, like the number sheet.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { linkGpsNames, type GpsLink } from "@/lib/actions/gps";

type Person = { id: string; displayName: string };
export type GpsNameRow = { name: string; linked: string | null; suggested: string | null };

export function GpsNames({ matchId, rows, people }: { matchId: string; rows: GpsNameRow[]; people: Person[] }) {
  const router = useRouter();
  const [linked, setLinked] = useState(() => new Map(rows.map((r) => [r.name, r.linked])));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const waiting = rows.filter((r) => linked.get(r.name) == null && r.suggested);
  const unlinked = rows.filter((r) => linked.get(r.name) == null).length;

  const save = (links: GpsLink[]) => {
    setError(null);
    const before = linked;
    setLinked((prev) => {
      const next = new Map(prev);
      for (const l of links) next.set(l.name, l.userId);
      return next;
    });
    startTransition(async () => {
      try {
        await linkGpsNames(matchId, links);
        router.refresh();
      } catch (err) {
        setLinked(before);
        setError((err as Error).message || "That could not be saved.");
      }
    });
  };

  return (
    <details className="no-print mt-6 border-y py-3" style={{ borderColor: "var(--color-line)" }} open={unlinked > 0}>
      <summary className="cursor-pointer text-[14px] font-semibold">
        Who is who{" "}
        <span className="font-normal" style={{ color: "var(--color-ink-dim)" }}>
          {unlinked === 0 ? "every name is linked to a player" : `${unlinked} of ${rows.length} not linked to a player yet`}
        </span>
      </summary>
      <p className="measure mt-2 text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
        Linking a name puts that player&rsquo;s running on their season page, for this match and every other one
        uploaded with the name spelled the same way.
      </p>
      {waiting.length > 0 && (
        <button
          type="button"
          disabled={pending}
          onClick={() => save(waiting.map((r) => ({ name: r.name, userId: r.suggested })))}
          className="btn-outline mt-3 text-xs"
        >
          Link the {waiting.length} suggested
        </button>
      )}
      {error && (
        <p className="mt-2 text-[13px]" style={{ color: "var(--color-danger-ink)" }}>
          {error}
        </p>
      )}
      <ul className="mt-3 grid gap-x-8 sm:grid-cols-2">
        {rows.map((r) => {
          const value = linked.get(r.name) ?? null;
          const suggestion = value == null && r.suggested ? people.find((p) => p.id === r.suggested) : undefined;
          return (
            <li
              key={r.name}
              className="flex flex-wrap items-center justify-between gap-2 border-b py-2"
              style={{ borderColor: "var(--color-line)" }}
            >
              <span className="min-w-0 truncate text-[14px]">{r.name}</span>
              <span className="flex items-center gap-2">
                {suggestion && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => save([{ name: r.name, userId: suggestion.id }])}
                    className="btn-ghost text-xs"
                    title="Save this suggestion"
                  >
                    {suggestion.displayName}?
                  </button>
                )}
                <select
                  value={value ?? ""}
                  disabled={pending}
                  onChange={(e) => save([{ name: r.name, userId: e.target.value || null }])}
                  className="field w-48 text-[13px]"
                  aria-label={`Player for ${r.name}`}
                >
                  <option value="">Not linked</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
