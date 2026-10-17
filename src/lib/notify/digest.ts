/**
 * When to email someone about what was shared with them, and what to say.
 *
 * Nothing is emailed the moment it happens. A coach tagging after training
 * makes fifteen clips in ten minutes, and fifteen emails would teach the
 * panel to ignore every one of them. So a person's pending shares wait until
 * ten quiet minutes have passed since the last one, then go as one email. An
 * hour is the longest anything waits, so a coach who tags all evening does
 * not hold the first clip back until midnight.
 *
 * Pure, so the rules can be tested without a database or a mail server.
 */

export const NOTIFICATION_KINDS = [
  "playlist-assigned",
  "match-footage",
  "team-playlist",
  "clip-tagged",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const QUIET_MS = 10 * 60_000;
export const MAX_WAIT_MS = 60 * 60_000;

/** The people whose pending shares should go out now. */
export function dueUsers(pending: { userId: string; createdAt: number }[], now: number): string[] {
  const span = new Map<string, { first: number; last: number }>();
  for (const p of pending) {
    const s = span.get(p.userId);
    if (!s) span.set(p.userId, { first: p.createdAt, last: p.createdAt });
    else {
      s.first = Math.min(s.first, p.createdAt);
      s.last = Math.max(s.last, p.createdAt);
    }
  }
  return [...span.entries()]
    .filter(([, s]) => now - s.last >= QUIET_MS || now - s.first >= MAX_WAIT_MS)
    .map(([userId]) => userId);
}

/** One share, with what the email needs to name it and link to it. */
export type DigestItem = { kind: NotificationKind; title: string; href: string };

export type DigestLine = { text: string; href: string };

/**
 * The lines of one email, most pressing first: a playlist assigned to you is
 * homework, new footage is the match, and clips you are in are collapsed to a
 * count because ten lines of "you are in a clip" say less than one.
 */
export function digestLines(items: DigestItem[]): DigestLine[] {
  const lines: DigestLine[] = [];
  for (const i of items.filter((i) => i.kind === "playlist-assigned")) {
    lines.push({ text: `A playlist for you to watch: ${i.title}`, href: i.href });
  }
  for (const i of items.filter((i) => i.kind === "match-footage")) {
    lines.push({ text: `New footage: ${i.title}`, href: i.href });
  }
  for (const i of items.filter((i) => i.kind === "team-playlist")) {
    lines.push({ text: `New playlist for the panel: ${i.title}`, href: i.href });
  }
  const clips = items.filter((i) => i.kind === "clip-tagged");
  if (clips.length) {
    lines.push({
      text: clips.length === 1 ? `You are in a new clip: ${clips[0].title}` : `You are in ${clips.length} new clips`,
      href: clips[0].href,
    });
  }
  return lines;
}

export function digestSubject(lines: DigestLine[]): string {
  if (lines.length === 1) return lines[0].text;
  return `${lines.length} new things to watch on Ardawn`;
}
