import { asc, count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubs, matches, teams, users, videos } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/guard";
import { Nav } from "@/components/ui/Nav";
import { AdminPanels } from "@/components/admin/AdminPanels";
import { importsForTeam } from "@/lib/queries/imports";

export default async function AdminPage() {
  const user = await requireUser();

  // Coaches manage matches and footage; only admins see squad management.
  if (user.role === "player") {
    return (
      <>
        <Nav user={user} />
        <main className="sheet py-16">
          <h1 className="display text-5xl">Squad settings</h1>
          <p className="measure mt-4 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
            Matches, footage and the panel are looked after by the coaches and
            the club admin. Everything you can do is on the matches page.
          </p>
        </main>
      </>
    );
  }

  const [team] = await db.select().from(teams).where(eq(teams.id, user.teamId)).limit(1);
  const [club] = await db.select().from(clubs).where(eq(clubs.id, user.clubId)).limit(1);

  // The club's teams, for the admin alone: where they can go, and where they
  // can move someone. A coach sees only their own team, as a player does.
  const clubTeams =
    user.role === "admin"
      ? await db
          .select({
            id: teams.id,
            name: teams.name,
            code: teams.code,
            // A join and a count rather than a subquery: in a query from one
            // table, Drizzle leaves column names unqualified, so a subquery's
            // `team_id = id` read both from users and counted nobody.
            people: count(users.id),
          })
          .from(teams)
          .leftJoin(users, eq(users.teamId, teams.id))
          .where(eq(teams.clubId, user.clubId))
          .groupBy(teams.id)
          .orderBy(asc(teams.createdAt))
      : [];

  const members = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      role: users.role,
      lastSeenAt: users.lastSeenAt,
    })
    .from(users)
    .where(eq(users.teamId, user.teamId))
    .orderBy(asc(users.displayName));

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
        teamId={user.teamId}
        clubName={club?.name ?? team?.name ?? ""}
        clubTeams={clubTeams}
        joinCode={team?.joinCode ?? ""}
        teamName={team?.name ?? ""}
        code={team?.code ?? user.teamCode}
        badgeVersion={team?.badgeUpdatedAt ?? null}
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
        imports={await importsForTeam(user.teamId)}
      />
    </>
  );
}
