/**
 * Emailing what was shared, once a minute, from inside the app's own server.
 *
 * No queue service and no cron: the instance is one process beside one SQLite
 * file, so a timer started from src/instrumentation.ts is the whole job. A
 * send that fails leaves its rows unsent and is tried again on the next tick;
 * a restart loses nothing, because the queue is a table.
 *
 * Each share is looked up again at send time, not trusted from when it was
 * queued. A clip deleted, made private or untagged in the ten quiet minutes
 * is simply left out, and an email with nothing left in it is not sent.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clipPlayers, clips, matches, notifications, playlists, teams, users, videos } from "@/lib/db/schema";
import { matchDate } from "@/lib/format";
import { sendMail } from "@/lib/mail";
import { digestMail } from "@/lib/mail/templates";
import { appUrl } from "@/lib/url";
import { digestLines, dueUsers, type DigestItem, type NotificationKind } from "./digest";
import { unsubscribePath } from "./unsubscribe";

type Pending = { id: string; userId: string; kind: NotificationKind; subjectId: string; createdAt: number };

export async function sendDueDigests(now = Date.now()): Promise<number> {
  const pending: Pending[] = await db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      kind: notifications.kind,
      subjectId: notifications.subjectId,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(isNull(notifications.sentAt));

  const due = dueUsers(pending, now);
  if (!due.length) return 0;
  const base = await appUrl();

  let sent = 0;
  for (const userId of due) {
    const mine = pending.filter((p) => p.userId === userId);
    const ids = mine.map((p) => p.id);

    const [person] = await db
      .select({
        email: users.email,
        displayName: users.displayName,
        on: users.emailNotifications,
        teamName: teams.name,
      })
      .from(users)
      .innerJoin(teams, eq(teams.id, users.teamId))
      .where(eq(users.id, userId))
      .limit(1);

    const lines = person?.email && person.on ? digestLines(await describe(userId, mine)) : [];
    if (!person?.email || !lines.length) {
      // Nowhere to send it, or nothing left to say: done with, not retried.
      await markSent(ids);
      continue;
    }

    const unsubscribeUrl = base + unsubscribePath(userId);
    try {
      await sendMail({
        to: person.email,
        toName: person.displayName,
        unsubscribeUrl,
        ...digestMail({
          name: person.displayName,
          teamName: person.teamName,
          lines,
          appUrl: base,
          unsubscribeUrl,
          settingsUrl: `${base}/account`,
        }),
      });
      await markSent(ids);
      sent++;
    } catch (err) {
      console.error(`Could not email shares to ${userId}; will try again:`, err);
    }
  }
  return sent;
}

async function markSent(ids: string[]): Promise<void> {
  if (ids.length) await db.update(notifications).set({ sentAt: Date.now() }).where(inArray(notifications.id, ids));
}

/** What each share is now, with a title and a link, or nothing if it is gone. */
async function describe(userId: string, rows: Pending[]): Promise<DigestItem[]> {
  const of = (kind: NotificationKind) => rows.filter((r) => r.kind === kind).map((r) => r.subjectId);
  const items: DigestItem[] = [];

  const footageIds = of("match-footage");
  if (footageIds.length) {
    const found = await db
      .select({
        id: videos.id,
        status: videos.status,
        file: videos.originalFilename,
        opponent: matches.opponent,
        playedOn: matches.playedOn,
      })
      .from(videos)
      .leftJoin(matches, eq(matches.id, videos.matchId))
      .where(inArray(videos.id, footageIds));
    for (const v of found) {
      if (v.status !== "ready") continue;
      const title = v.opponent ? `v ${v.opponent}, ${matchDate(v.playedOn ?? "")}` : v.file;
      items.push({ kind: "match-footage", title, href: `/review/${v.id}` });
    }
  }

  for (const kind of ["playlist-assigned", "team-playlist"] as const) {
    const ids = of(kind);
    if (!ids.length) continue;
    const found = await db
      .select({ id: playlists.id, title: playlists.title })
      .from(playlists)
      .where(inArray(playlists.id, ids));
    for (const p of found) items.push({ kind, title: p.title, href: `/playlists/${p.id}` });
  }

  const clipIds = of("clip-tagged");
  if (clipIds.length) {
    // Joined to clip_players for this person, so a clip they were taken out
    // of since does not come through.
    const found = await db
      .select({ id: clips.id, title: clips.title, visibility: clips.visibility, opponent: matches.opponent })
      .from(clips)
      .innerJoin(clipPlayers, and(eq(clipPlayers.clipId, clips.id), eq(clipPlayers.userId, userId)))
      .innerJoin(videos, eq(videos.id, clips.videoId))
      .leftJoin(matches, eq(matches.id, videos.matchId))
      .where(inArray(clips.id, clipIds));
    for (const c of found) {
      if (c.visibility !== "team") continue;
      const title = c.title || (c.opponent ? `v ${c.opponent}` : "a new clip");
      // The home page leads with a player's own clips.
      items.push({ kind: "clip-tagged", title, href: "/" });
    }
  }

  return items;
}

const TICK_MS = 60_000;

/** Started once per server process; the dev server re-runs modules, hence the flag. */
export function startDigestTimer(): void {
  const g = globalThis as unknown as { __ardawnDigestTimer?: boolean };
  if (g.__ardawnDigestTimer) return;
  g.__ardawnDigestTimer = true;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await sendDueDigests();
    } catch (err) {
      console.error("Share emails failed this round:", err);
    } finally {
      running = false;
    }
  };
  setInterval(() => void tick(), TICK_MS).unref();
}
