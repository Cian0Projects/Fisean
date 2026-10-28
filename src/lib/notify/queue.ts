/**
 * Recording that something was shared, for src/lib/notify/sender.ts to email
 * later. Called from the actions that share, after their own write, and never
 * allowed to fail them: a coach's clip matters more than the email about it.
 */
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notifications, users } from "@/lib/db/schema";
import { reachOf, type Shared } from "@/lib/auth/visibility";
import type { NotificationKind } from "./digest";

type Share = { teamId: string; kind: NotificationKind; subjectId: string; actorId: string | null };

/** Named people on the team, never the person who did the sharing. */
export async function notifyUsers(share: Share, userIds: string[]): Promise<void> {
  const wanted = [...new Set(userIds)].filter((id) => id !== share.actorId);
  if (!wanted.length) return;
  try {
    // Only people actually on this team: the ids came from a client.
    const onTeam = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.teamId, share.teamId), inArray(users.id, wanted)));
    await insert(share, onTeam.map((u) => u.id));
  } catch (err) {
    console.error("Could not queue a notification:", err);
  }
}

/** Everyone on the team but the person who did the sharing. */
export async function notifyPanel(share: Share): Promise<void> {
  try {
    const everyone = await db
      .select({ id: users.id })
      .from(users)
      .where(
        share.actorId
          ? and(eq(users.teamId, share.teamId), ne(users.id, share.actorId))
          : eq(users.teamId, share.teamId),
      );
    await insert(share, everyone.map((u) => u.id));
  } catch (err) {
    console.error("Could not queue a notification:", err);
  }
}

/**
 * Everyone a clip or playlist can be seen by now and could not before, never
 * the person who shared it, nor anyone in `skip` who has heard another way.
 * Groups are worked out against the team as it is, so "all coaches" emails
 * the coaches there are today.
 */
export async function notifyNewlyReached(
  share: Share,
  before: Shared,
  namedBefore: string[],
  after: Shared,
  namedAfter: string[],
  skip: string[] = [],
): Promise<void> {
  try {
    const people = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.teamId, share.teamId));
    const had = new Set(reachOf(people, before, namedBefore));
    const reached = reachOf(people, after, namedAfter).filter(
      (id) => !had.has(id) && id !== share.actorId && !skip.includes(id),
    );
    await insert(share, reached);
  } catch (err) {
    console.error("Could not queue a notification:", err);
  }
}

async function insert(share: Share, userIds: string[]): Promise<void> {
  if (!userIds.length) return;
  await db
    .insert(notifications)
    .values(userIds.map((userId) => ({ ...share, userId })))
    // Shared the same thing with the same person before: they have heard.
    .onConflictDoNothing();
}
