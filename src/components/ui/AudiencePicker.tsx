"use client";

/**
 * Choosing who can see a clip or a playlist.
 *
 * One picker for both, so sharing reads the same wherever it is done: "Just
 * me", "Everyone", or any mix of all players, all coaches, all admins and
 * named people. The groups and the names add up rather than replacing each
 * other, so "all coaches and Seán" is two taps. Every group ticked is the
 * same as everyone, and the picker says so by lighting "Everyone"; nothing
 * ticked is "Just me". The rule is src/lib/auth/visibility.ts.
 *
 * Controlled: it reports each change and the caller decides when to save.
 */
import {
  ROLE_GROUP_LABELS,
  SHARE_ROLES,
  describeAudience,
  normaliseAudience,
  type Audience,
  type Role,
} from "@/lib/auth/visibility";

export type AudiencePerson = { id: string; displayName: string; role: Role };

const NOBODY: Audience = { visibility: "private", roles: [], userIds: [] };
const EVERYONE: Audience = { visibility: "team", roles: [], userIds: [] };

export function AudiencePicker({
  value,
  onChange,
  people,
  makerId,
  maker,
  compact = false,
}: {
  value: Audience;
  onChange: (next: Audience) => void;
  /** The team. The maker is left out of the names, since they always see it. */
  people: AudiencePerson[];
  makerId: string | null;
  /** How the maker is named in the summary: "you" when it is the viewer. */
  maker: string;
  /** Smaller type, for the side panel. */
  compact?: boolean;
}) {
  const size = compact ? "text-[12px] px-1.5 py-0.5" : "text-[13px] px-2 py-1";
  const others = people.filter((p) => p.id !== makerId);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.displayName;

  // Ticking a group or a name builds on whatever is chosen so far; starting
  // from "Everyone" starts afresh, since everyone already includes them.
  const base = value.visibility === "assigned" ? value : NOBODY;
  const set = (next: Audience) => onChange(normaliseAudience(next, makerId));
  const toggleRole = (r: Role) =>
    set({
      visibility: "assigned",
      roles: base.roles.includes(r) ? base.roles.filter((x) => x !== r) : [...base.roles, r],
      userIds: base.userIds,
    });
  const togglePerson = (id: string) =>
    set({
      visibility: "assigned",
      roles: base.roles,
      userIds: base.userIds.includes(id) ? base.userIds.filter((x) => x !== id) : [...base.userIds, id],
    });

  return (
    <div>
      <div className="flex flex-wrap gap-1">
        <Choice on={value.visibility === "private"} onClick={() => onChange(NOBODY)} size={size}>
          Just me
        </Choice>
        <Choice on={value.visibility === "team"} onClick={() => onChange(EVERYONE)} size={size}>
          Everyone
        </Choice>
        {SHARE_ROLES.map((r) => (
          <Choice key={r} on={base.roles.includes(r)} onClick={() => toggleRole(r)} size={size}>
            {ROLE_GROUP_LABELS[r][0].toUpperCase() + ROLE_GROUP_LABELS[r].slice(1)}
          </Choice>
        ))}
      </div>

      {others.length > 0 && (
        <>
          <span className="mt-2.5 mb-1 block text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            Or pick people
          </span>
          <div className="flex flex-wrap gap-1">
            {others.map((p) => (
              <Choice key={p.id} on={base.userIds.includes(p.id)} onClick={() => togglePerson(p.id)} size={size}>
                {p.displayName}
                {p.role !== "player" && (
                  <span style={{ color: "var(--color-ink-faint)" }}>{p.role === "coach" ? ", coach" : ", admin"}</span>
                )}
              </Choice>
            ))}
          </div>
        </>
      )}

      <p className="mt-2 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
        {describeAudience(value, nameOf, maker)}
      </p>
    </div>
  );
}

function Choice({
  on,
  onClick,
  size,
  children,
}: {
  on: boolean;
  onClick: () => void;
  size: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-[2px] border ${size}`}
      style={{
        borderColor: on ? "var(--color-ink)" : "var(--color-line-strong)",
        background: on ? "var(--color-surface-3)" : "transparent",
        color: on ? "var(--color-ink)" : "var(--color-ink-dim)",
      }}
    >
      {children}
    </button>
  );
}
