"use server";

/**
 * Training drills: create, save, duplicate, delete, file into groups, and copy
 * a ready-made one into the club's book.
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
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { drillGroups, drills, playlistItems, teams } from "@/lib/db/schema";
import { assertSameTeam, requireCoach } from "@/lib/auth/guard";
import { DRILL_LIMITS, parseDrill, starterDrill, type DrillData } from "@/lib/hurling/drill";
import { readyDrill } from "@/lib/hurling/drill-library";
import { cleanGroupName, sameGroupName } from "@/lib/hurling/drill-groups";
import { ballFor } from "@/lib/hurling/codes";
import { playlistFootage, visiblePlaylists, type FootageClip } from "@/lib/queries/playlists";

async function loadOwnDrill(id: string) {
  const user = await requireCoach();
  const [drill] = await db
    .select({ id: drills.id, teamId: drills.teamId, groupId: drills.groupId, title: drills.title, notes: drills.notes, data: drills.data })
    .from(drills)
    .where(eq(drills.id, id))
    .limit(1);
  if (!drill) throw new Error("That drill no longer exists.");
  assertSameTeam(user, drill);
  return { user, drill };
}

/**
 * A group id from a form, kept only if it is one of this club's. Anything else
 * (a stale tab, a forged id, "none") means "not in a group" rather than an
 * error, so the drill still gets made.
 */
async function ownGroupId(teamId: string, raw: FormDataEntryValue | null): Promise<string | null> {
  if (typeof raw !== "string" || !raw || raw === "none") return null;
  const [g] = await db
    .select({ id: drillGroups.id })
    .from(drillGroups)
    .where(and(eq(drillGroups.id, raw), eq(drillGroups.teamId, teamId)))
    .limit(1);
  return g?.id ?? null;
}

/**
 * A new drill opens on a four-on-three starter, with the ball the team plays
 * with, then straight into the editor. Made from inside a group, it starts in
 * that group.
 */
export async function createDrill(form: FormData): Promise<void> {
  const user = await requireCoach();
  const [team] = await db.select({ code: teams.code }).from(teams).where(eq(teams.id, user.teamId)).limit(1);
  const [drill] = await db
    .insert(drills)
    .values({
      teamId: user.teamId,
      groupId: await ownGroupId(user.teamId, form.get("groupId")),
      createdBy: user.id,
      title: "Untitled drill",
      data: JSON.stringify(starterDrill(ballFor(team?.code ?? "hurling"))),
    })
    .returning({ id: drills.id });
  revalidatePath("/drills");
  redirect(`/drills/${drill.id}`);
}

/**
 * Copy a ready-made drill (src/lib/hurling/drill-library.ts) into the club's
 * own book and open it. The copy is an ordinary drill from then on, in the
 * team's own ball, so nothing a coach changes touches the library.
 */
export async function copyReadyDrill(form: FormData): Promise<void> {
  const user = await requireCoach();
  const ready = readyDrill(String(form.get("readyId") ?? ""));
  if (!ready) throw new Error("That ready-made drill no longer exists.");
  const [team] = await db.select({ code: teams.code }).from(teams).where(eq(teams.id, user.teamId)).limit(1);
  const [drill] = await db
    .insert(drills)
    .values({
      teamId: user.teamId,
      groupId: await ownGroupId(user.teamId, form.get("groupId")),
      createdBy: user.id,
      title: ready.title,
      notes: ready.notes,
      data: JSON.stringify(ready.build(ballFor(team?.code ?? "hurling"))),
    })
    .returning({ id: drills.id });
  revalidatePath("/drills");
  redirect(`/drills/${drill.id}`);
}

/* ------------------------------------------------------------- groups */

const GROUP_CAP = 30;

async function loadOwnGroup(id: string) {
  const user = await requireCoach();
  const [group] = await db
    .select({ id: drillGroups.id, teamId: drillGroups.teamId, name: drillGroups.name })
    .from(drillGroups)
    .where(eq(drillGroups.id, id))
    .limit(1);
  if (!group) throw new Error("That group no longer exists.");
  assertSameTeam(user, group);
  return { user, group };
}

/**
 * Make a group and land on it. A name the club already has opens that group
 * instead of making a second one with the same name.
 */
export async function createDrillGroup(form: FormData): Promise<void> {
  const user = await requireCoach();
  const name = cleanGroupName(String(form.get("name") ?? ""));
  if (!name) redirect("/drills");

  const existing = await db
    .select({ id: drillGroups.id, name: drillGroups.name })
    .from(drillGroups)
    .where(eq(drillGroups.teamId, user.teamId));
  const same = existing.find((g) => sameGroupName(g.name, name));
  if (same) redirect(`/drills?group=${same.id}`);
  if (existing.length >= GROUP_CAP) throw new Error(`A club can have up to ${GROUP_CAP} groups.`);

  const [group] = await db
    .insert(drillGroups)
    .values({ teamId: user.teamId, name })
    .returning({ id: drillGroups.id });
  revalidatePath("/drills");
  redirect(`/drills?group=${group.id}`);
}

export async function renameDrillGroup(id: string, rawName: string): Promise<{ name: string }> {
  const { user, group } = await loadOwnGroup(id);
  const name = cleanGroupName(rawName);
  if (!name) throw new Error("A group needs a name.");
  const others = await db
    .select({ id: drillGroups.id, name: drillGroups.name })
    .from(drillGroups)
    .where(eq(drillGroups.teamId, user.teamId));
  if (others.some((g) => g.id !== group.id && sameGroupName(g.name, name))) {
    throw new Error("You already have a group with that name.");
  }
  await db.update(drillGroups).set({ name }).where(eq(drillGroups.id, group.id));
  revalidatePath("/drills");
  return { name };
}

/** Drills in the group are kept, just no longer filed anywhere. */
export async function deleteDrillGroup(id: string): Promise<void> {
  const { group } = await loadOwnGroup(id);
  // Cleared by hand rather than left to the foreign key's ON DELETE, so it
  // does not matter whether the column was added with one.
  await db.update(drills).set({ groupId: null }).where(eq(drills.groupId, group.id));
  await db.delete(drillGroups).where(eq(drillGroups.id, group.id));
  revalidatePath("/drills");
  redirect("/drills");
}

/** File a drill in a group, or take it out of one (null). */
export async function moveDrill(id: string, groupId: string | null): Promise<void> {
  const { user, drill } = await loadOwnDrill(id);
  const target = groupId === null ? null : await ownGroupId(user.teamId, groupId);
  if (groupId !== null && !target) throw new Error("That group no longer exists.");
  await db.update(drills).set({ groupId: target }).where(eq(drills.id, drill.id));
  revalidatePath("/drills");
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
      groupId: drill.groupId,
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

/* ------------------------------------------------------------ footage */

export type FootagePlaylist = { id: string; title: string; clips: number; isOfficial: boolean };

/** The playlists this coach may open, for choosing a drill's "what happened". */
export async function listFootagePlaylists(): Promise<FootagePlaylist[]> {
  const user = await requireCoach();
  const rows = await visiblePlaylists(user);
  if (rows.length === 0) return [];
  const counts = await db
    .select({ playlistId: playlistItems.playlistId, n: sql<number>`count(*)` })
    .from(playlistItems)
    .where(inArray(playlistItems.playlistId, rows.map((r) => r.id)))
    .groupBy(playlistItems.playlistId);
  const byId = new Map(counts.map((c) => [c.playlistId, Number(c.n)]));
  return rows.map((r) => ({ id: r.id, title: r.title, clips: byId.get(r.id) ?? 0, isOfficial: r.isOfficial }));
}

export type DrillFootage = { title: string; clips: FootageClip[] };

/**
 * The clips to play before a drill in its exported video. Looked up when the
 * video is made rather than saved with the drill, so what a coach may see
 * today decides what goes in, and a deleted clip simply is not there.
 */
export async function loadDrillFootage(playlistId: string): Promise<DrillFootage> {
  const user = await requireCoach();
  const footage = await playlistFootage(user, playlistId);
  if (!footage) throw new Error("That playlist is no longer available.");
  if (footage.clips.length === 0) throw new Error("That playlist has no clips you can play.");
  return footage;
}
