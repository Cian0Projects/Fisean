import { notFound } from "next/navigation";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matches, users } from "@/lib/db/schema";
import { isCoach, requireUser } from "@/lib/auth/guard";
import { Nav } from "@/components/ui/Nav";
import { NumberSheetEditor } from "@/components/stats/NumberSheetEditor";
import { loadNumberSheet, loadStatRows } from "@/lib/queries/stats";

/**
 * Who wore which number in one match.
 *
 * Coach and admin only, like logging: this is what decides whose name every
 * stat carries.
 */
export default async function MatchNumbersPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const user = await requireUser();
  const { matchId } = await params;

  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match || match.teamId !== user.teamId) notFound();

  if (!isCoach(user)) {
    return (
      <>
        <Nav user={user} />
        <main className="mx-auto max-w-2xl px-4 py-20">
          <h1 className="display text-3xl">The coaches put names to the numbers</h1>
          <p className="measure mt-3 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
            Your line on the stat sheet shows up once they have.
          </p>
          <Link href={`/matches/${matchId}/stats`} className="btn-primary mt-6">
            Read the stat sheet
          </Link>
        </main>
      </>
    );
  }

  const [numbers, rows, panel] = await Promise.all([
    loadNumberSheet(matchId, user.teamId),
    loadStatRows(matchId, user.teamId),
    db
      .select({ id: users.id, displayName: users.displayName, role: users.role })
      .from(users)
      .where(eq(users.teamId, user.teamId))
      .orderBy(asc(users.displayName)),
  ]);

  // How many entries each number already carries — an unnamed number with
  // entries against it is the one worth filling in first.
  const logged: Record<number, number> = {};
  for (const r of rows) {
    for (const n of [r.playerNumber, r.targetNumber]) {
      if (n != null) logged[n] = (logged[n] ?? 0) + 1;
    }
  }

  // The panel is the players; a coach who lined out is offered too, but only
  // once they are on a sheet — otherwise management would crowd the list.
  const onSheet = new Set(numbers.map((e) => e.userId));
  const players = panel
    .filter((u) => u.role === "player" || onSheet.has(u.id))
    .map(({ id, displayName }) => ({ id, displayName }));

  return (
    <>
      <Nav user={user} />
      <NumberSheetEditor
        match={{
          id: match.id,
          opponent: match.opponent,
          competition: match.competition,
          venue: match.venue,
          playedOn: match.playedOn,
        }}
        initialNumbers={numbers}
        players={players}
        logged={logged}
      />
    </>
  );
}
