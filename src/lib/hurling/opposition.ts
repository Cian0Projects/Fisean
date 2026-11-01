/**
 * Opposition analysis: the rules that need no database.
 *
 * A team keeps one list of the clubs it plays or studies (the `oppositions`
 * table). Matches used to name their opponent in free text, so the one club
 * turned up as "St Finbarr's", "St. Finbarrs" and "st finbarrs"; nothing could
 * gather what was known about it. A name's key is what decides whether two
 * spellings are the one club, and it is deliberately loose about the things
 * people type differently and strict about everything else. Anything looser
 * ("Barrs" for St Finbarr's) is a coach merging the two by hand.
 *
 * src/lib/db/oppositions.ts and src/lib/actions/opposition.ts do the
 * scoping and the writes.
 */
import { tidyName } from "./squad";

export const MAX_OPPOSITION_NAME = 60;

/**
 * The key two spellings of a club share. Case, spacing, punctuation and
 * fadas go, because "Éire Óg" and "Eire Og" are typed for the same club far
 * more often than they name two. A leading "Saint" reads as "St", the way
 * nearly every club writes it.
 */
export function oppositionKey(name: string): string {
  return tidyName(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^saint\b/, "st")
    .replace(/[^a-z0-9]/g, "");
}

export function oppositionNameProblem(raw: string): string | null {
  const name = tidyName(raw);
  if (!name) return "Which team?";
  if (name.length > MAX_OPPOSITION_NAME) return `Keep the name to ${MAX_OPPOSITION_NAME} letters or fewer.`;
  if (!oppositionKey(name)) return "That name needs a letter or a number in it.";
  return null;
}

/**
 * What a match is called on screen. Our games are named by who we played,
 * as they always have been; an opposition game names both sides, the one
 * being studied first.
 */
export function matchName(match: { kind: "ours" | "opposition"; opponent: string }, vsName?: string | null): string {
  if (match.kind === "ours" || !vsName) return match.opponent;
  return `${match.opponent} v ${vsName}`;
}
