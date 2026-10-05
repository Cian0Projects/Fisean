import { notFound } from "next/navigation";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clips, matches, videos } from "@/lib/db/schema";
import { isCoach, requireUser } from "@/lib/auth/guard";
import { Nav } from "@/components/ui/Nav";
import { StatLogger } from "@/components/stats/StatLogger";
import { formatClock } from "@/lib/hurling/notation";
import { loadNumberSheet, loadStatRows } from "@/lib/queries/stats";

/**
 * Logging the stat sheet.
 *
 * Coach and admin only — the same tier that creates matches and uploads
 * footage. Reading the report next door is open to everyone.
 */
export default async function LogMatchStatsPage({
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
          <h1 className="display text-3xl">The stat sheet is filled in by the coaches</h1>
          <p className="measure mt-3 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
            Reading it is open to the whole panel, though — every number, every
            map, and your own line in the table.
          </p>
          <Link href={`/matches/${matchId}/stats`} className="btn-primary mt-6">
            Read the stat sheet
          </Link>
        </main>
      </>
    );
  }

  const [rows, numbers] = await Promise.all([
    loadStatRows(matchId, user.teamId),
    loadNumberSheet(matchId, user.teamId),
  ]);

  // A stat may point at a clip that already covers the moment. Optional, and
  // only ever in that direction — the stat sheet does not need footage.
  const clipRows = await db
    .select({
      id: clips.id,
      title: clips.title,
      startMs: clips.startMs,
    })
    .from(clips)
    .innerJoin(videos, eq(videos.id, clips.videoId))
    .where(and(eq(videos.matchId, matchId), eq(clips.teamId, user.teamId)))
    .orderBy(asc(clips.startMs));

  return (
    <>
      <Nav user={user} />
      <StatLogger
        match={{
          id: match.id,
          opponent: match.opponent,
          competition: match.competition,
          venue: match.venue,
          playedOn: match.playedOn,
        }}
        numbers={numbers}
        initialRows={rows}
        clips={clipRows.map((c) => ({
          id: c.id,
          label: `${formatClock(c.startMs)} · ${c.title || "Untitled clip"}`,
        }))}
      />
    </>
  );
}
