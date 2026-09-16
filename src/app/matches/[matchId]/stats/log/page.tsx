import { notFound } from "next/navigation";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clips, matchStats, matches, users, videos } from "@/lib/db/schema";
import { isCoach, requireUser } from "@/lib/auth/guard";
import { Nav } from "@/components/ui/Nav";
import { StatLogger } from "@/components/stats/StatLogger";
import { formatClock } from "@/lib/hurling/notation";
import type { StatRow } from "@/components/stats/types";

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

  const rows: StatRow[] = await db
    .select({
      id: matchStats.id,
      statType: matchStats.statType,
      outcome: matchStats.outcome,
      playerId: matchStats.playerId,
      originX: matchStats.originX,
      originY: matchStats.originY,
      destX: matchStats.destX,
      destY: matchStats.destY,
      shotResult: matchStats.shotResult,
      ledToScore: matchStats.ledToScore,
      puckoutTakenBy: matchStats.puckoutTakenBy,
      clipId: matchStats.clipId,
      videoId: matchStats.videoId,
      atMs: matchStats.atMs,
      createdAt: matchStats.createdAt,
    })
    .from(matchStats)
    .where(and(eq(matchStats.matchId, matchId), eq(matchStats.teamId, user.teamId)))
    .orderBy(asc(matchStats.createdAt));

  const squad = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      jerseyNumber: users.jerseyNumber,
      position: users.position,
      role: users.role,
    })
    .from(users)
    .where(eq(users.teamId, user.teamId))
    .orderBy(asc(users.jerseyNumber), asc(users.displayName));

  // The same list the report's table shows: the panel, plus anyone already
  // credited with something — a coach who came on, say.
  const credited = new Set(rows.map((r) => r.playerId).filter((id): id is string => !!id));
  const panel = squad
    .filter((u) => u.role === "player" || credited.has(u.id))
    .map(({ id, displayName, jerseyNumber, position }) => ({
      id,
      displayName,
      jerseyNumber,
      position,
    }));

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
        panel={panel}
        initialRows={rows}
        clips={clipRows.map((c) => ({
          id: c.id,
          label: `${formatClock(c.startMs)} · ${c.title || "Untitled clip"}`,
        }))}
      />
    </>
  );
}
