import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { drills } from "@/lib/db/schema";
import { isCoach, requireUser } from "@/lib/auth/guard";
import { parseDrill } from "@/lib/hurling/drill";
import { visiblePlaylists } from "@/lib/queries/playlists";
import { Nav } from "@/components/ui/Nav";
import { DrillEditor } from "@/components/drills/DrillEditor";

export default async function DrillPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!isCoach(user)) redirect("/");
  const { id } = await params;

  const [drill] = await db.select().from(drills).where(eq(drills.id, id)).limit(1);
  if (!drill || drill.teamId !== user.teamId) notFound();

  // The attached playlist's name, if this coach can still open it.
  const data = parseDrill(JSON.parse(drill.data));
  const footageTitle = data.footage
    ? ((await visiblePlaylists(user)).find((p) => p.id === data.footage!.playlistId)?.title ?? null)
    : null;

  return (
    <>
      <Nav user={user} />
      {/* Keyed on the drill, so moving from a drill to its duplicate starts
          the editor afresh rather than carrying the old one's state over. */}
      <DrillEditor
        key={drill.id}
        id={drill.id}
        teamName={user.teamName}
        code={user.teamCode}
        badgeVersion={user.badgeVersion}
        footageTitle={footageTitle}
        initial={{ title: drill.title, notes: drill.notes, data }}
      />
    </>
  );
}
