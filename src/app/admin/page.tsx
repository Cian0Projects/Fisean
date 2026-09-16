import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matches, teams, users, videos } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/guard";
import { Nav } from "@/components/ui/Nav";
import { AdminPanels } from "@/components/admin/AdminPanels";

export default async function AdminPage() {
  const user = await requireUser();

  // Coaches manage matches and footage; only admins see squad management.
  if (user.role === "player") {
    return (
      <>
        <Nav user={user} />
        <main className="mx-auto max-w-2xl px-4 py-20">
          <h1 className="display text-3xl">Squad settings</h1>
          <p className="measure mt-3 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
            Matches, footage and the panel are looked after by the coaches and
            the team admin. Everything you can do is on the matches page.
          </p>
        </main>
      </>
    );
  }

  const [team] = await db.select().from(teams).where(eq(teams.id, user.teamId)).limit(1);

  const members = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      username: users.username,
      role: users.role,
      jerseyNumber: users.jerseyNumber,
      position: users.position,
      lastSeenAt: users.lastSeenAt,
    })
    .from(users)
    .where(eq(users.teamId, user.teamId))
    .orderBy(asc(users.jerseyNumber), asc(users.displayName));

  const matchRows = await db
    .select()
    .from(matches)
    .where(eq(matches.teamId, user.teamId))
    .orderBy(desc(matches.playedOn));

  const videoRows = await db
    .select()
    .from(videos)
    .where(eq(videos.teamId, user.teamId))
    .orderBy(desc(videos.createdAt));

  return (
    <>
      <Nav user={user} />
      <AdminPanels
        viewer={{ id: user.id, role: user.role }}
        joinCode={team?.joinCode ?? ""}
        teamName={team?.name ?? ""}
        members={members}
        matches={matchRows.map((m) => ({
          id: m.id,
          opponent: m.opponent,
          competition: m.competition,
          playedOn: m.playedOn,
          venue: m.venue,
        }))}
        videos={videoRows.map((v) => ({
          id: v.id,
          originalFilename: v.originalFilename,
          durationMs: v.durationMs,
          sizeBytes: v.sizeBytes,
          status: v.status,
          matchId: v.matchId,
          codec: v.codec,
          moovAtStart: v.moovAtStart,
        }))}
      />
    </>
  );
}
