"use server";

/**
 * Training drills: create, save, duplicate, delete.
 *
 * Coaches only. A drill is the coaches' plan for the session, drawn before
 * anyone is on the field — the same reason squad management is restricted,
 * and the opposite of clips, where a player's own review is the point.
 *
 * The editor saves the whole drill each time, a second after the coach stops
 * dragging. One row, one UPDATE: there is nothing to merge, and a coach on
 * the sideline with patchy signal loses at most the last second's move.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { drills, teams } from "@/lib/db/schema";
import { assertSameTeam, requireCoach } from "@/lib/auth/guard";
import { DRILL_LIMITS, parseDrill, starterDrill, type DrillData } from "@/lib/hurling/drill";
import { ballFor } from "@/lib/hurling/codes";

async function loadOwnDrill(id: string) {
  const user = await requireCoach();
  const [drill] = await db
    .select({ id: drills.id, teamId: drills.teamId, title: drills.title, notes: drills.notes, data: drills.data })
    .from(drills)
    .where(eq(drills.id, id))
    .limit(1);
  if (!drill) throw new Error("That drill no longer exists.");
  assertSameTeam(user, drill);
  return { user, drill };
}

/**
 * A new drill opens on a four-on-three starter, with the ball the team plays
 * with, then straight into the editor.
 */
export async function createDrill(): Promise<void> {
  const user = await requireCoach();
  const [team] = await db.select({ code: teams.code }).from(teams).where(eq(teams.id, user.teamId)).limit(1);
  const [drill] = await db
    .insert(drills)
    .values({
      teamId: user.teamId,
      createdBy: user.id,
      title: "Untitled drill",
      data: JSON.stringify(starterDrill(ballFor(team?.code ?? "hurling"))),
    })
    .returning({ id: drills.id });
  revalidatePath("/drills");
  redirect(`/drills/${drill.id}`);
}

export type DrillSave = { title: string; notes: string; data: DrillData };

export async function saveDrill(
  id: string,
  input: DrillSave,
): Promise<{ updatedAt: number }> {
  const { drill } = await loadOwnDrill(id);

  const title = input.title.trim().slice(0, DRILL_LIMITS.title) || "Untitled drill";
  const notes = input.notes.slice(0, 2000);
  // Re-validated here whatever the editor already did: this is the line the
  // database is behind.
  const data = parseDrill(input.data);
  const updatedAt = Date.now();

  await db
    .update(drills)
    .set({ title, notes, data: JSON.stringify(data), updatedAt })
    .where(eq(drills.id, drill.id));

  revalidatePath("/drills");
  return { updatedAt };
}

/** A copy to vary — the same drill, one player more, is the usual next week. */
export async function duplicateDrill(id: string): Promise<void> {
  const { user, drill } = await loadOwnDrill(id);
  const [copy] = await db
    .insert(drills)
    .values({
      teamId: user.teamId,
      createdBy: user.id,
      title: `${drill.title} (copy)`.slice(0, DRILL_LIMITS.title),
      notes: drill.notes,
      data: drill.data,
    })
    .returning({ id: drills.id });
  revalidatePath("/drills");
  redirect(`/drills/${copy.id}`);
}

export async function deleteDrill(id: string): Promise<void> {
  const { drill } = await loadOwnDrill(id);
  await db.delete(drills).where(eq(drills.id, drill.id));
  revalidatePath("/drills");
  redirect("/drills");
}
