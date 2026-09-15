"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  matches,
  teams,
  users,
  videoMarkers,
  videos,
  type Role,
  MARKER_KINDS,
} from "@/lib/db/schema";
import { generateJoinCode } from "@/lib/auth/password";
import {
  assertSameTeam,
  requireAdmin,
  requireCoach,
  requireUserOrThrow,
} from "@/lib/auth/guard";

/* --------------------------------------------------------------- matches */

export async function createMatch(input: {
  opponent: string;
  playedOn: string;
  competition?: string;
  venue?: string;
  homeAway?: "home" | "away" | "neutral";
  halfLengthMin?: number;
}): Promise<{ id: string }> {
  const user = await requireCoach();
  const opponent = input.opponent.trim();
  if (!opponent) throw new Error("Who were you playing?");

  const [match] = await db
    .insert(matches)
    .values({
      teamId: user.teamId,
      opponent,
      playedOn: input.playedOn,
      competition: input.competition?.trim() || null,
      venue: input.venue?.trim() || null,
      homeAway: input.homeAway ?? "home",
      // 35-minute halves at senior inter-county, 30 at most club grades.
      halfLengthMin: input.halfLengthMin ?? 30,
      createdBy: user.id,
    })
    .returning();

  revalidatePath("/");
  return { id: match.id };
}

export async function deleteMatch(matchId: string): Promise<void> {
  const user = await requireAdmin();
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) return;
  assertSameTeam(user, match);
  await db.delete(matches).where(eq(matches.id, matchId));
  revalidatePath("/");
}

/* ---------------------------------------------------------------- markers */

/**
 * Mark throw-in, half time, the restart and full time on a video.
 *
 * Set once, and every timestamp in the app can be shown as game clock —
 * "2nd 18:42" rather than "01:54:03". A coach talks in game minutes, so this
 * small piece of data is what makes the interface speak their language.
 */
export async function setVideoMarker(
  videoId: string,
  kind: (typeof MARKER_KINDS)[number],
  atMs: number | null,
): Promise<void> {
  const user = await requireCoach();
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video) throw new Error("That video no longer exists.");
  assertSameTeam(user, video);

  await db
    .delete(videoMarkers)
    .where(and(eq(videoMarkers.videoId, videoId), eq(videoMarkers.kind, kind)));

  if (atMs !== null) {
    await db.insert(videoMarkers).values({ videoId, kind, atMs: Math.max(0, Math.round(atMs)) });
  }
  revalidatePath(`/review/${videoId}`);
}

/* ----------------------------------------------------------------- videos */

export async function deleteVideo(videoId: string): Promise<void> {
  const user = await requireAdmin();
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video) return;
  assertSameTeam(user, video);

  // Remove the row first; if unlinking the file fails the app stays coherent
  // and the orphan can be cleaned up separately.
  await db.delete(videos).where(eq(videos.id, videoId));
  try {
    const { store } = await import("@/lib/storage");
    await (await store()).remove(video.storageKey);
  } catch {
    // Leave the file; the database is the source of truth.
  }
  revalidatePath("/");
}

/* ---------------------------------------------------------------- members */

export async function setMemberRole(userId: string, role: Role): Promise<void> {
  const admin = await requireAdmin();
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) throw new Error("That person is not on the panel.");
  assertSameTeam(admin, target);

  // Refuse to remove the last admin, which would lock everyone out of the
  // squad's own settings with no way back in.
  if (target.role === "admin" && role !== "admin") {
    const remaining = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.teamId, admin.teamId), eq(users.role, "admin")));
    if (remaining.length <= 1) throw new Error("The squad needs at least one admin.");
  }

  await db.update(users).set({ role }).where(eq(users.id, userId));
  revalidatePath("/admin/members");
}

export async function updateMember(
  userId: string,
  patch: { displayName?: string; jerseyNumber?: number | null; position?: number | null },
): Promise<void> {
  const user = await requireUserOrThrow();
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) throw new Error("That person is not on the panel.");
  assertSameTeam(user, target);

  // A player may edit their own details; a coach may edit anyone's.
  if (user.id !== userId && user.role === "player") {
    throw new Error("That is not yours to change.");
  }
  if (patch.position != null && (patch.position < 1 || patch.position > 15)) {
    throw new Error("Positions run from 1 to 15.");
  }

  await db
    .update(users)
    .set({
      ...(patch.displayName !== undefined ? { displayName: patch.displayName.trim() } : {}),
      ...(patch.jerseyNumber !== undefined ? { jerseyNumber: patch.jerseyNumber } : {}),
      ...(patch.position !== undefined ? { position: patch.position } : {}),
    })
    .where(eq(users.id, userId));
  revalidatePath("/admin/members");
}

export async function removeMember(userId: string): Promise<void> {
  const admin = await requireAdmin();
  if (admin.id === userId) throw new Error("You cannot remove yourself.");

  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) return;
  assertSameTeam(admin, target);

  // Deleting the user cascades their sessions, so access ends immediately.
  await db.delete(users).where(eq(users.id, userId));
  revalidatePath("/admin/members");
}

/** Rotate the join code — for when it has been shared beyond the panel. */
export async function rotateJoinCode(): Promise<{ joinCode: string }> {
  const admin = await requireAdmin();
  const joinCode = generateJoinCode();
  await db.update(teams).set({ joinCode }).where(eq(teams.id, admin.teamId));
  revalidatePath("/admin");
  return { joinCode };
}
