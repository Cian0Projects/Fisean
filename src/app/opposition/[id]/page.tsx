import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import { isAdmin, isCoach, requireUser } from "@/lib/auth/guard";
import { loadOpposition, loadOppositionList } from "@/lib/queries/opposition";
import { formatClock } from "@/lib/hurling/notation";
import { matchDate } from "@/lib/format";
import { Nav } from "@/components/ui/Nav";
import { OppositionGameForm, OppositionTools } from "@/components/opposition/OppositionForms";
import { OppositionGames } from "@/components/opposition/OppositionGames";

/**
 * One club: their games, ours against them and theirs for analysis, and every
 * clip about them the viewer may see, from any of those games. A clip is
 * about them when whoever made it said so (clips.about_side); a clip of our
 * own wides in the league game against them stays with that match.
 */
export default async function OppositionTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const coach = isCoach(user);

  const opp = await loadOpposition(user.teamId, id, user);
  if (!opp) notFound();

  const [list, [team]] = await Promise.all([
    coach ? loadOppositionList(user.teamId) : Promise.resolve([]),
    coach
      ? db.select({ halfLengthMin: teams.halfLengthMin }).from(teams).where(eq(teams.id, user.teamId)).limit(1)
      : Promise.resolve([]),
  ]);

  const gameOf = new Map(opp.games.map((g) => [g.id, g]));
  const clipsBy = new Map<string, typeof opp.clips>();
  for (const c of opp.clips) clipsBy.set(c.matchId, [...(clipsBy.get(c.matchId) ?? []), c]);

  return (
    <>
      <Nav user={user} />

      <main className="sheet pt-10 pb-20 lg:pt-14">
        <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <header className="lg:sticky lg:top-24 lg:self-start">
            <Link href="/opposition" className="caption hover:underline">
              Opposition analysis
            </Link>
            <h1 className="display mt-2 text-[clamp(2.4rem,4.5vw,3.5rem)] text-balance break-words">{opp.name}</h1>
            <p className="mt-4 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
              {opp.games.length === 0
                ? "No games yet."
                : `${opp.games.length} ${opp.games.length === 1 ? "game" : "games"}, ${opp.clips.length} ${
                    opp.clips.length === 1 ? "clip" : "clips"
                  } about them.`}
            </p>
            {coach && (
              <div className="mt-8 border-t pt-6" style={{ borderColor: "var(--color-line)" }}>
                <OppositionTools
                  id={opp.id}
                  name={opp.name}
                  others={list.filter((o) => o.id !== opp.id).map((o) => ({ id: o.id, name: o.name }))}
                />
              </div>
            )}
          </header>

          <div className="space-y-14">
            <section>
              <div className="section-head flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="title text-xl">Games</h2>
                <span className="caption">Against us and against other clubs.</span>
              </div>
              {opp.games.length === 0 ? (
                <p className="py-4 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
                  {coach
                    ? `Add a game of ${opp.name}'s below, then upload the footage to it.`
                    : `No games of ${opp.name}'s yet. The coaches add them.`}
                </p>
              ) : (
                <OppositionGames name={opp.name} games={opp.games} canUpload={coach} canDelete={isAdmin(user)} />
              )}
            </section>

            <section>
              <div className="section-head flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="title text-xl">Clips about them</h2>
                <span className="caption">Newest game first.</span>
              </div>
              {opp.clips.length === 0 ? (
                <p className="py-4 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
                  None yet. A clip made on one of their games lands here; on one of ours against them, choose{" "}
                  {opp.name} under &ldquo;Who it is about&rdquo;.
                </p>
              ) : (
                <div className="mt-2 space-y-8">
                  {[...clipsBy.entries()].map(([matchId, list]) => {
                    const g = gameOf.get(matchId);
                    return (
                      <div key={matchId}>
                        <h3 className="caption tabular">
                          {g
                            ? `${g.kind === "ours" ? "v us" : `v ${g.vsName ?? "another team"}`}, ${matchDate(g.playedOn)}`
                            : null}
                        </h3>
                        <ul className="mt-1">
                          {list.map((c) => (
                            <li key={c.id} className="fixture">
                              <Link
                                href={`/review/${c.videoId}?clip=${c.id}`}
                                className="flex items-baseline gap-4 py-2.5 hover:underline"
                              >
                                <span className="tabular w-[4.5rem] shrink-0 text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
                                  {formatClock(c.startMs)}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-[15px]">
                                  {c.title || "Untitled clip"}
                                </span>
                                <span className="caption shrink-0">{c.authorName}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {coach && (
              <OppositionGameForm
                key={opp.id}
                names={list.map((o) => o.name)}
                team={opp.name}
                halfLengthMin={team?.halfLengthMin ?? 30}
              />
            )}
          </div>
        </div>
      </main>
    </>
  );
}
