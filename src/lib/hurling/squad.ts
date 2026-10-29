/**
 * Players added to the panel by name, before they have an account.
 *
 * A selector logs stats against a squad, not against whoever has signed up, so
 * a coach can put a name on the panel straight away. That name is an ordinary
 * member with no email (users.email is nullable for exactly this): it can be
 * put to a jersey number and have stats read against it like anyone's. When
 * the player later signs in with an email an admin adds to the same row, the
 * history is already theirs, which is why this is a member and not a separate
 * kind of record that would have to be merged.
 *
 * Only the rules that need no database are here; src/lib/actions/admin.ts
 * does the scoping and the write.
 */

export const MAX_PLAYER_NAME = 60;

/**
 * A name as it will be stored: runs of spaces collapsed, ends trimmed. Fadas
 * and hyphens are left exactly as typed, since the name is read aloud and
 * printed on the report.
 */
export function tidyName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function playerNameProblem(raw: string): string | null {
  const name = tidyName(raw);
  if (!name) return "What is their name?";
  if (name.length > MAX_PLAYER_NAME) return `Keep the name to ${MAX_PLAYER_NAME} letters or fewer.`;
  return null;
}

/**
 * Whether two names would be told apart on the number sheet. Case and spacing
 * only: Seán and Sean can be two people, so accents count. Used to refuse a
 * second "Conor Walsh" that is almost certainly a double click, while a real
 * second one can still be added with an initial.
 */
export function sameName(a: string, b: string): boolean {
  return tidyName(a).toLocaleLowerCase("en-IE") === tidyName(b).toLocaleLowerCase("en-IE");
}
