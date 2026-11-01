import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import { isCoach, requireUser } from "@/lib/auth/guard";
import { loadOppositionList } from "@/lib/queries/opposition";
import { matchDate } from "@/lib/format";
import { Nav } from "@/components/ui/Nav";
import { AddOpposition, OppositionGameForm } from "@/components/opposition/OppositionForms";

/**
 * Opposition analysis: every club this team has played or studied, most
 * recent first. Each opens on everything known about them. Coaches add the
 * games; the whole panel watches and clips them.
 */
export default async function OppositionPage() {
  const user = await requireUser();
  const coach = isCoach(user);

  const list = await loadOppositionList(user.teamId);
  const [team] = coach
    ? await db.select({ halfLengthMin: teams.halfLengthMin }).from(teams).where(eq(teams.id, user.teamId)).limit(1)
    : [];

  // Most recent first; clubs with no games yet (next week's opponent, added
  // by hand) lead, since they are the ones about to matter.
  const ordered = [...list].sort((a, b) => {
    if (!a.lastOn !== !b.lastOn) return a.lastOn ? 1 : -1;
    return (b.lastOn ?? "").localeCompare(a.lastOn ?? "") || a.name.localeCompare(b.name);
  });

  return (
    <>
      <Nav user={user} />

      <main className="sheet pt-10 pb-20 lg:pt-14">
        <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <header className="lg:sticky lg:top-24 lg:self-start">
            <h1 className="display text-[clamp(2.75rem,5vw,3.75rem)]">Opposition</h1>
            <p className="mt-4 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
              Everything on the clubs you play: our games against them, and their own games brought in to study.
            </p>
            <p className="caption mt-3 max-w-[30ch]">
              {coach
                ? "Add a game of theirs, upload the footage, and the whole panel can watch it and clip it."
                : "Open a game to watch it and clip it. A clip of yours is yours until you share it."}
            </p>
            {coach && (
              <div className="mt-6">
                <AddOpposition />
              </div>
            )}
          </header>

          <div className="space-y-12">
            {coach && (
              <OppositionGameForm names={list.map((o) => o.name)} halfLengthMin={team?.halfLengthMin ?? 30} />
            )}

            {ordered.length === 0 ? (
              <div className="section-head">
                <p className="py-4 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
                  No clubs yet. Every team you play joins this list, and so does every team in a game added to
                  study.
                </p>
              </div>
            ) : (
              <section>
                <div className="section-head flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 className="title text-xl">Clubs</h2>
                  <span className="caption">Most recent first.</span>
                </div>
                <ul className="mt-2">
                  {ordered.map((o) => (
                    <li key={o.id} className="fixture">
                      <Link
                        href={`/opposition/${o.id}`}
                        className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3 hover:underline"
                      >
                        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{o.name}</span>
                        <span className="caption tabular">{describe(o)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

/** "Played twice, 1 game studied, last 13 Sep." in the list's own words. */
function describe(o: { played: number; studied: number; lastOn: string | null }): string {
  if (!o.lastOn) return "No games yet";
  const parts = [
    o.played ? (o.played === 1 ? "Played once" : `Played ${o.played} times`) : null,
    o.studied ? `${o.studied} ${o.studied === 1 ? "game" : "games"} studied` : null,
  ].filter(Boolean);
  return `${parts.join(", ")}, last ${matchDate(o.lastOn)}`;
}
