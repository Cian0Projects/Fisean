/**
 * Who may see a clip or a playlist.
 *
 * One file, pure, because every screen and every email that shows a clip or
 * a playlist has to apply the same rule. Two copies would drift, and the one
 * that drifted would show somebody's private notes to the panel.
 *
 * Clips and playlists share one rule, so sharing works the same way for both:
 *
 *  - "team": everyone on the team.
 *  - "private": its maker alone. Coaches included: a player's own review is
 *    theirs until they choose to show it to someone.
 *  - "assigned": its maker, plus any mix of whole groups (all players, all
 *    coaches, all admins) and named people.
 *
 * Its maker always sees it. Nobody else does by rank.
 */

export type Role = "admin" | "coach" | "player";
export type Viewer = { id: string; role: Role };
export type Visibility = "team" | "private" | "assigned";

/** The groups something can be shared with as a whole, in the order offered. */
export const SHARE_ROLES: Role[] = ["player", "coach", "admin"];

export const ROLE_GROUP_LABELS: Record<Role, string> = {
  player: "all players",
  coach: "all coaches",
  admin: "all admins",
};

/** Who something is shared with, as the picker and the actions pass it around. */
export type Audience = { visibility: Visibility; roles: Role[]; userIds: string[] };

/** What a clip or playlist row carries about its audience. */
export type Shared = { visibility: Visibility; createdBy: string | null; shareRoles: Role[] | null };

/**
 * `chosen` is whether the viewer is one of the people it was shared with by
 * name: the caller looks that up, since it lives in its own table.
 */
export function canSee(viewer: Viewer, item: Shared, chosen: boolean): boolean {
  if (item.createdBy === viewer.id) return true;
  switch (item.visibility) {
    case "team":
      return true;
    case "private":
      return false;
    case "assigned":
      return chosen || (item.shareRoles ?? []).includes(viewer.role);
  }
}

export const canSeeClip = canSee;
export const canSeePlaylist = canSee;

/**
 * Only the maker says who sees their work. A coach may edit a player's clip,
 * but widening who sees it would undo the player's choice. Something whose
 * maker has left the club falls to the coaches.
 */
export function canShare(viewer: Viewer, item: { createdBy: string | null }): boolean {
  return item.createdBy === viewer.id || (item.createdBy == null && viewer.role !== "player");
}

/**
 * One shape for each audience, whatever was clicked to get there: every group
 * ticked is everyone, nothing ticked is private, and the maker is never on
 * their own list. Unknown roles and repeats are dropped, since this is what
 * the actions apply to input from a client.
 */
export function normaliseAudience(input: Audience, makerId: string | null): Audience {
  if (input.visibility === "team") return { visibility: "team", roles: [], userIds: [] };
  if (input.visibility !== "assigned") return { visibility: "private", roles: [], userIds: [] };

  const roles = SHARE_ROLES.filter((r) => input.roles.includes(r));
  if (roles.length === SHARE_ROLES.length) return { visibility: "team", roles: [], userIds: [] };
  const userIds = [...new Set(input.userIds)].filter((id) => id !== makerId);
  if (!roles.length && !userIds.length) return { visibility: "private", roles: [], userIds: [] };
  return { visibility: "assigned", roles, userIds };
}

/**
 * The people who can see something, out of `people`. Comparing this before
 * and after a change is how the actions find who to email: only those it has
 * newly reached.
 */
export function reachOf(people: Viewer[], item: Shared, chosen: string[]): string[] {
  return people.filter((p) => canSee(p, item, chosen.includes(p.id))).map((p) => p.id);
}

/** "Shared with all coaches, Seán and Aoife." in the picker's own words. */
export function describeAudience(
  audience: Audience,
  nameOf: (id: string) => string | undefined,
  maker: string,
): string {
  if (audience.visibility === "team") return "Everyone on the team can see it.";
  if (audience.visibility === "private") return `Only ${maker} can see it.`;
  const names = audience.userIds.map(nameOf).filter((n): n is string => !!n);
  const parts = [...audience.roles.map((r) => ROLE_GROUP_LABELS[r]), ...names];
  const list = parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `Shared with ${list}.`;
}
