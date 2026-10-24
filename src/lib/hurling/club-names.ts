/**
 * Does a new club's name look like one already on Ardawn?
 *
 * The host checks every new club by hand before it can be used, and the
 * question that matters most is whether the club is already here: a second
 * secretary signing up the same club, or a dual club making a second club
 * for its footballers when it should have added a team. Emails are unique,
 * so the same person cannot sign up twice; the same club under a different
 * person is what this catches.
 *
 * Names are compared on the words that identify a club, not the words every
 * club shares. "St Brigid's GAA" and "Naomh Bríd Camogie" share nothing
 * that survives, which is right: that is a guess for a person, not this.
 * But "Kilmacud Crokes" and "Kilmacud Crokes Hurling" share "kilmacud" and
 * "crokes", and "St. Brigid's" matches "St Brigids GAA Club". A false match
 * costs the host a glance; a missed one costs a club its footage split in
 * two, so it errs towards listing.
 */

/** Words that say what a club is rather than which one. */
const COMMON = new Set([
  "gaa", "glc", "lgfa", "cumann", "luthchleas", "gael", "club", "clg", "cpg", "the", "and", "of",
  "hurling", "camogie", "football", "gaelic", "ladies", "lgfc", "gfc", "hc", "hurlers",
  "senior", "seniors", "junior", "juniors", "intermediate", "minor", "minors", "under",
  "u", "boys", "girls", "men", "mens", "women", "womens", "na", "an", "st", "saint",
  "naomh", "team", "squad", "panel", "development", "juvenile",
]);

/** Lower case, accents off, apostrophes dropped, everything else a space. */
export function clubWords(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length >= 3 && !COMMON.has(w) && !/^\d+$/.test(w));
}

/** Existing clubs whose names share an identifying word with `name`. */
export function similarClubs<T extends { name: string }>(name: string, existing: T[]): T[] {
  const words = new Set(clubWords(name));
  if (words.size === 0) return [];
  return existing.filter((club) => clubWords(club.name).some((w) => words.has(w)));
}
