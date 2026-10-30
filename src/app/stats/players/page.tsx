import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { loadSeason } from "@/lib/queries/trends";
import {
  competitionsOf,
  readScope,
  scoped,
  scoresPerMatch,
  seasonShots,
  seasonsOf,
  squadSeason,
  unnamed,
  type SeasonLine,
} from "@/lib/hurling/trends";
import { formatScorerTally, statVocabulary } from "@/lib/hurling/stats";
import { scoreTotal } from "@/lib/hurling/notation";
import { Nav } from "@/components/ui/Nav";
import { Cell, ScopeBar, SeasonTabs, scopeHref, scopeTitle } from "@/components/stats/Season";

/**
 * The panel's season, a line each: everyone who appeared in a submitted
 * sheet in scope, sortable by any column.
 *
 * The whole panel reads it, as it reads every match's sheet: the numbers are
 * the same ones each match already shows, added up. Sorting is a link, not
 * script, so a sorted table can be sent to someone as it stands.
 */

type SortKey = "name" | "played" | "scored" | "per_match" | "efficiency" | "won" | "lost" | "tackles" | "received";

type Column = {
  key: SortKey;
  label: string;
  value: (l: SeasonLine) => number;
  /** Lower is better, so the table sorts it the other way up. */
  ascending?: boolean;
};

const COLUMNS: Column[] = [
  { key: "played", label: "Played", value: (l) => l.appearances },
  { key: "scored", label: "Scored", value: (l) => scoreTotal(l.score) },
  { key: "per_match", label: "Per match", value: (l) => scoresPerMatch(l) ?? -1 },
  { key: "efficiency", label: "Efficiency", value: (l) => (seasonShots(l).total ? seasonShots(l).percent : -1) },
  { key: "won", label: "Possession won", value: (l) => l.totals.turnoversWon },
  { key: "lost", label: "Possession lost", value: (l) => l.totals.turnoversConceded, ascending: true },
  { key: "tackles", label: "Tackles", value: (l) => l.totals.tackles },
  { key: "received", label: "Received", value: (l) => l.received },
];

export default async function SquadSeasonPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; competition?: string; sort?: string }>;
}) {
  const user = await requireUser();
  const asked = await searchParams;
  const { terms } = statVocabulary(user.teamCode);

  const { matches, sheets, names } = await loadSeason(user.teamId);
  const scope = readScope(matches, asked);
  const inScope = scoped(sheets, scope);
  const gaps = unnamed(inScope);
  const sort: SortKey = COLUMNS.some((c) => c.key === asked.sort) || asked.sort === "name" ? (asked.sort as SortKey) : "scored";
  const nameOf = (l: SeasonLine) => names.get(l.userId) ?? "Former player";

  const column = COLUMNS.find((c) => c.key === sort);
  const lines = [...squadSeason(inScope).values()].sort((a, b) => {
    if (column) {
      const diff = column.value(b) - column.value(a);
      if (diff !== 0) return column.ascending ? -diff : diff;
    }
    return nameOf(a).localeCompare(nameOf(b));
  });

  return (
    <>
      <Nav user={user} />
      <main className="sheet pt-10 pb-16 print:pt-0">
        <header className="border-b-[3px] pb-5" style={{ borderColor: "var(--color-rule)" }}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="display text-[clamp(2.4rem,6vw,3.8rem)]">Players</h1>
              <p className="mt-3 text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
                {scopeTitle(scope)}, from {inScope.length} submitted stat {inScope.length === 1 ? "sheet" : "sheets"}
              </p>
            </div>
            <SeasonTabs current="players" scope={scope} />
          </div>
          <ScopeBar
            path="/stats/players"
            scope={scope}
            seasons={seasonsOf(matches)}
            competitions={competitionsOf(matches, scope.season)}
            extra={{ sort }}
          />
        </header>

        {lines.length === 0 ? (
          <section className="py-16">
            <h2 className="title text-xl">No named players yet</h2>
            <p className="measure mt-2 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
              A player shows up here once a submitted stat sheet puts their name to a number.
            </p>
          </section>
        ) : (
          <section className="mt-8">
            <p className="measure mb-4 text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
              Played counts the fifteen on each sheet, and subs with something logged. Per match is over the
              appearances on sheets that logged shots. Received is deliveries aimed at them that they won. Pick a
              heading to sort by it.
              {gaps.entries > 0 &&
                ` ${gaps.entries} ${gaps.entries === 1 ? "entry is" : "entries are"} on numbers with no name, and in nobody's line.`}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] border-collapse text-[14px]">
                <thead>
                  <tr style={{ color: "var(--color-ink-dim)", borderBottom: "1px solid var(--color-line-strong)" }}>
                    <th className="px-2 py-2 text-left font-medium">
                      <SortLink label="Player" k="name" sort={sort} scope={scope} />
                    </th>
                    {COLUMNS.map((c) => (
                      <th key={c.key} className="px-2 py-2 text-right font-medium whitespace-nowrap">
                        <SortLink label={c.label} k={c.key} sort={sort} scope={scope} />
                      </th>
                    ))}
                    <th className="px-2 py-2 text-right font-medium whitespace-nowrap">Frees won</th>
                    <th className="px-2 py-2 text-right font-medium whitespace-nowrap">Frees given</th>
                    <th className="px-2 py-2 text-right font-medium whitespace-nowrap">{terms.restarts}</th>
                    {terms.marks && <th className="px-2 py-2 text-right font-medium">Marks</th>}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const shots = seasonShots(l);
                    return (
                      <tr key={l.userId} style={{ borderBottom: "1px solid var(--color-line)" }}>
                        <td className="px-2 py-2">
                          <Link
                            href={scopeHref(`/stats/players/${l.userId}`, scope)}
                            className="font-semibold hover:underline"
                            style={l.userId === user.id ? { color: "var(--color-brand)" } : undefined}
                          >
                            {nameOf(l)}
                          </Link>
                        </td>
                        <Cell>{l.appearances}</Cell>
                        <Cell>
                          {scoreTotal(l.score) > 0
                            ? formatScorerTally({ playerNumber: null, score: l.score, fromFrees: l.fromFrees })
                            : null}
                        </Cell>
                        <Cell>{scoresPerMatch(l) || null}</Cell>
                        <Cell>{shots.total ? `${shots.percent}% of ${shots.total}` : null}</Cell>
                        <Cell>{l.totals.turnoversWon || null}</Cell>
                        <Cell negative>{l.totals.turnoversConceded || null}</Cell>
                        <Cell>{l.totals.tackles || null}</Cell>
                        <Cell>
                          {l.received + l.lostAsTarget > 0 ? `${l.received} of ${l.received + l.lostAsTarget}` : null}
                        </Cell>
                        <Cell>{l.totals.freesWon || null}</Cell>
                        <Cell negative>{l.totals.freesConceded || null}</Cell>
                        <Cell>{l.totals.puckoutsWon || null}</Cell>
                        {terms.marks && <Cell>{l.totals.marks || null}</Cell>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </>
  );
}

function SortLink({ label, k, sort, scope }: { label: string; k: SortKey; sort: SortKey; scope: Parameters<typeof scopeHref>[1] }) {
  return (
    <Link
      href={scopeHref("/stats/players", scope, { sort: k })}
      aria-current={k === sort ? "true" : undefined}
      className={k === sort ? "font-semibold" : "hover:underline"}
      style={k === sort ? { color: "var(--color-ink)" } : undefined}
    >
      {label}
    </Link>
  );
}
