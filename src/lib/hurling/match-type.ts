/**
 * What kind of game a match was: a championship tie, a league round, a friendly.
 *
 * It is stored in `matches.competition`, the column the season pages already
 * filter by, so choosing a type here is what makes "Championship" a scope on
 * the stats pages. The column is free text because the stat sheet's own form
 * lets a coach type anything ("Féile", "Division 2 final"), so a match can
 * hold a value that is not in this list. Those are kept and shown; they are
 * simply not offered to a new match.
 *
 * Pure, so the upload route, the actions and the tests share one list.
 */

export const MATCH_TYPES = ["Championship", "League", "Friendly", "Challenge", "Tournament"] as const;

export type MatchType = (typeof MATCH_TYPES)[number];

/** What a new match starts as when nobody picks: what an unset match already reads as. */
export const DEFAULT_MATCH_TYPE: MatchType = "Friendly";

const LONGEST = 60;

/**
 * The type to store for what the browser sent. A blank means "none" (null);
 * a listed type is stored as written in the list whatever its case. Anything
 * else is refused unless it is `keep`, the value the match already holds,
 * so editing a match with a typed-in competition does not force a change.
 */
export function readMatchType(input: unknown, keep?: string | null): { type: string | null } | { error: string } {
  if (input == null) return { type: null };
  if (typeof input !== "string") return { error: "Choose what kind of match it was." };
  const text = input.replace(/\s+/g, " ").trim();
  if (!text) return { type: null };

  const listed = MATCH_TYPES.find((t) => t.toLowerCase() === text.toLowerCase());
  if (listed) return { type: listed };
  if (keep && text === keep.trim() && text.length <= LONGEST) return { type: text };
  return { error: "Choose what kind of match it was." };
}

/**
 * The types to offer for a match that holds `current`: the list, plus that
 * value first if it is not on the list, so it can be seen and kept.
 */
export function typesFor(current: string | null | undefined): string[] {
  const value = current?.trim();
  if (!value || MATCH_TYPES.some((t) => t.toLowerCase() === value.toLowerCase())) return [...MATCH_TYPES];
  return [value, ...MATCH_TYPES];
}
