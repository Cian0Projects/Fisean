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
import {
  clipPlayers,
  clips,
  matches,
  notifications,
  playlistViewers,
  playlists,
  teams,
  users,
  videos,
} from "@/lib/db/schema";
import { canSeePlaylist } from "@/lib/auth/visibility";
import { visibleClipIds } from "@/lib/queries/clips";
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

const clipFields = {
  id: clips.id,
  videoId: clips.videoId,
  title: clips.title,
  visibility: clips.visibility,
  shareRoles: clips.shareRoles,
  createdBy: clips.createdBy,
  opponent: matches.opponent,
};

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
    // Joined to this person's place on the list, and checked again here,
    // because a playlist can be made private or unshared before the email
    // goes, and the email must not show what the page would not.
    const found = await db
      .select({
        id: playlists.id,
        title: playlists.title,
        visibility: playlists.visibility,
        shareRoles: playlists.shareRoles,
        createdBy: playlists.createdBy,
        chosen: playlistViewers.userId,
        role: users.role,
      })
      .from(playlists)
      .innerJoin(users, eq(users.id, userId))
      .leftJoin(
        playlistViewers,
        and(eq(playlistViewers.playlistId, playlists.id), eq(playlistViewers.userId, userId)),
      )
      .where(inArray(playlists.id, ids));
    for (const p of found) {
      if (!canSeePlaylist({ id: userId, role: p.role }, p, p.chosen != null)) continue;
      items.push({ kind, title: p.title, href: `/playlists/${p.id}` });
    }
  }

  const taggedIds = of("clip-tagged");
  const sharedIds = of("clip-shared");
  if (taggedIds.length || sharedIds.length) {
    const [me] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, userId));
    // Joined to clip_players for this person, so a clip they were taken out
    // of since does not come through.
    const tagged = taggedIds.length
      ? await db
          .select(clipFields)
          .from(clips)
          .innerJoin(clipPlayers, and(eq(clipPlayers.clipId, clips.id), eq(clipPlayers.userId, userId)))
          .innerJoin(videos, eq(videos.id, clips.videoId))
          .leftJoin(matches, eq(matches.id, videos.matchId))
          .where(inArray(clips.id, taggedIds))
      : [];
    const shared = sharedIds.length
      ? await db
          .select(clipFields)
          .from(clips)
          .innerJoin(videos, eq(videos.id, clips.videoId))
          .leftJoin(matches, eq(matches.id, videos.matchId))
          .where(inArray(clips.id, sharedIds))
      : [];
    // Made private, or unshared, since: left out, as the page would.
    const seen = me ? await visibleClipIds(me, [...tagged, ...shared]) : new Set<string>();
    const titleOf = (c: (typeof tagged)[number]) => c.title || (c.opponent ? `v ${c.opponent}` : "a new clip");
    for (const c of tagged) {
      // The home page leads with a player's own clips.
      if (seen.has(c.id)) items.push({ kind: "clip-tagged", title: titleOf(c), href: "/" });
    }
    for (const c of shared) {
      if (seen.has(c.id)) {
        items.push({ kind: "clip-shared", title: titleOf(c), href: `/review/${c.videoId}?clip=${c.id}` });
      }
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
