/**
 * Permission checks.
 *
 * The rule for this squad: everyone can clip. A player creating clips and
 * playlists is a feature, not a risk — self-review multiplies the analysis
 * without multiplying the coach's workload. What is restricted is editing
 * other people's work, uploading footage, and managing the squad.
 */
import "server-only";
import { redirect } from "next/navigation";
import { currentUser, type SessionUser } from "./session";

export class Forbidden extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "Forbidden";
  }
}

/** For pages: bounces to the sign-in screen when not authenticated. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** For server actions: throws rather than redirecting. */
export async function requireUserOrThrow(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new Forbidden("Please sign in.");
  return user;
}

export function isCoach(user: SessionUser): boolean {
  return user.role === "coach" || user.role === "admin";
}

export function isAdmin(user: SessionUser): boolean {
  return user.role === "admin";
}

export async function requireCoach(): Promise<SessionUser> {
  const user = await requireUserOrThrow();
  if (!isCoach(user)) throw new Forbidden("Only coaches and admins can do that.");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUserOrThrow();
  if (!isAdmin(user)) throw new Forbidden("Only a team admin can do that.");
  return user;
}

/**
 * A coach may edit anyone's clip; a player only their own. Used for clips,
 * playlists, comments and annotations alike.
 */
export function canEditOwned(
  user: SessionUser,
  owned: { createdBy?: string | null; userId?: string | null },
): boolean {
  if (isCoach(user)) return true;
  const owner = owned.createdBy ?? owned.userId ?? null;
  return owner !== null && owner === user.id;
}

export function assertCanEditOwned(
  user: SessionUser,
  owned: { createdBy?: string | null; userId?: string | null },
): void {
  if (!canEditOwned(user, owned)) throw new Forbidden("That is not yours to change.");
}

/** Everything is scoped to one squad; never leak across teams. */
export function assertSameTeam(user: SessionUser, row: { teamId: string }): void {
  if (row.teamId !== user.teamId) throw new Forbidden();
}
