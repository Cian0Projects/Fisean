/**
 * Names for a coach's drill groups. Pure, so the one rule is tested rather than
 * left in an action: a name is what a coach would write on a folder, so spaces
 * are tidied and it is cut short rather than refused.
 */
export const GROUP_NAME_MAX = 40;

export function cleanGroupName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, GROUP_NAME_MAX).trim();
}

/** Two names are the same group if only case and spacing differ. */
export function sameGroupName(a: string, b: string): boolean {
  return cleanGroupName(a).toLowerCase() === cleanGroupName(b).toLowerCase();
}
