/**
 * Whether an organisation on Ardawn is a club or a county.
 *
 * A county board runs panels the way a club does (a senior team, minors, an
 * under 20 side), so it shares the whole product: the same `clubs` table, the
 * same teams, the same admin. The only thing that differs is what it is
 * called. A county admin who sees "Club colours" and "Teams in the club" is
 * being told this was built for someone else, so every word that names the
 * organisation reads from here.
 *
 * Pure and free of the database so the sign-up form, the server actions and
 * the emails can all import it, and a test can pin the wording.
 */

export const ORG_KINDS = ["club", "county"] as const;
export type OrgKind = (typeof ORG_KINDS)[number];

export function isOrgKind(value: unknown): value is OrgKind {
  return typeof value === "string" && (ORG_KINDS as readonly string[]).includes(value);
}

/** Anything unrecognised is a club: it is what every account before this was. */
export function orgKindOf(value: unknown): OrgKind {
  return isOrgKind(value) ? value : "club";
}

export type OrgTerms = {
  /** "club" or "county", for the middle of a sentence. */
  noun: OrgKind;
  /** The same with a capital, for the start of a label. */
  Noun: "Club" | "County";
  /** What a new organisation's name field suggests. */
  namePlaceholder: string;
};

const TERMS: Record<OrgKind, OrgTerms> = {
  club: { noun: "club", Noun: "Club", namePlaceholder: "St Brigid's GAA" },
  county: { noun: "county", Noun: "County", namePlaceholder: "Tipperary GAA" },
};

export function orgTerms(kind: OrgKind | null | undefined): OrgTerms {
  return TERMS[orgKindOf(kind)];
}
