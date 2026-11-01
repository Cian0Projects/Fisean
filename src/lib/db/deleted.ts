/**
 * Recently deleted, the part that touches the database: removing for good
 * what an admin deleted, either when they ask ("Delete now") or when its
 * twenty days are up (scripts/purge-deleted.ts, nightly). The rules are in
 * src/lib/media/deleted.ts.
 *
 * Every delete here names `deleted_at IS NOT NULL` in its own WHERE, so
 * nothing on this path can remove a match or a video that is not already in
 * recently deleted, whatever it is passed. Rows go first and files second,
 * as everywhere else: a file whose removal fails is left for the nightly
 * bucket sweep (scripts/reconcile-storage.ts) rather than a row pointing at
 * nothing.
 *
 * Plain functions with relative imports, like clubs.ts, so the script can
 * call them outside Next.
 */
import { and, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { db } from "./client";
import { matches, videos } from "./schema";
import { daysLeftLabel, purgeCutoff } from "../media/deleted";
import { matchDate } from "../format";

type Footage = { storageKey: string; uploadId: string | null };

async function removeFiles(footage: Footage[]): Promise<void> {
  if (footage.length === 0) return;
  // Loaded only here, so the actions that never purge do not pull in the drivers.
  const { removeFootage } = await import("../storage");
  await removeFootage(footage);
}

/**
 * A deleted match, its videos and everything that hangs off them. Refuses,
 * and removes nothing, if the match is not deleted or still has a video that
 * is not: putting a single video back is blocked while its match is deleted,
 * so this should never happen, and if it does the footage is worth more than
 * the tidy-up.
 */
export async function purgeMatch(matchId: string): Promise<{ files: number }> {
  const [match] = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(eq(matches.id, matchId), isNotNull(matches.deletedAt)))
    .limit(1);
  if (!match) return { files: 0 };

  const footage = await db
    .select({ storageKey: videos.storageKey, uploadId: videos.uploadId, deletedAt: videos.deletedAt })
    .from(videos)
    .where(eq(videos.matchId, matchId));
  if (footage.some((v) => v.deletedAt === null)) {
    console.error(`Not purging match ${matchId}: it still has footage that is not deleted.`);
    return { files: 0 };
  }

  // The video rows, and the clips, stats and sheets, go by cascade.
  await db.delete(matches).where(and(eq(matches.id, matchId), isNotNull(matches.deletedAt)));
  await removeFiles(footage);
  return { files: footage.length };
}

/** A deleted video and its clips, on its own. */
export async function purgeVideo(videoId: string): Promise<{ files: number }> {
  const [video] = await db
    .select({ storageKey: videos.storageKey, uploadId: videos.uploadId })
    .from(videos)
    .where(and(eq(videos.id, videoId), isNotNull(videos.deletedAt)))
    .limit(1);
  if (!video) return { files: 0 };

  await db.delete(videos).where(and(eq(videos.id, videoId), isNotNull(videos.deletedAt)));
  await removeFiles([video]);
  return { files: 1 };
}

/**
 * Everything deleted at least twenty days before `now`, across every club.
 * Matches first, which takes the videos deleted with them; then any video
 * deleted on its own, whose match is still listed.
 */
export async function purgeDue(now: number): Promise<{ matches: number; videos: number; files: number }> {
  const cutoff = purgeCutoff(now);
  let files = 0;

  const dueMatches = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(isNotNull(matches.deletedAt), lte(matches.deletedAt, cutoff)));
  for (const m of dueMatches) files += (await purgeMatch(m.id)).files;

  // A video deleted on its own inside a match deleted later is due by its own
  // stamp, so it is taken here even though its match is not yet.
  const dueVideos = await db
    .select({ id: videos.id })
    .from(videos)
    .where(and(isNotNull(videos.deletedAt), lte(videos.deletedAt, cutoff)));
  for (const v of dueVideos) files += (await purgeVideo(v.id)).files;

  return { matches: dueMatches.length, videos: dueVideos.length, files };
}

export type DeletedItem = { id: string; title: string; sizeBytes: number; deletedAt: number; left: string };
export type DeletedForTeam = { matches: DeletedItem[]; videos: DeletedItem[] };

/** What is in recently deleted for one team, for the squad page. */
export async function deletedForTeam(teamId: string): Promise<DeletedForTeam> {
  const now = Date.now();
  const deletedMatches = await db
    .select({ id: matches.id, opponent: matches.opponent, playedOn: matches.playedOn, deletedAt: matches.deletedAt })
    .from(matches)
    .where(and(eq(matches.teamId, teamId), isNotNull(matches.deletedAt)));
  const ids = deletedMatches.map((m) => m.id);
  const theirFootage = ids.length
    ? await db
        .select({ matchId: videos.matchId, sizeBytes: videos.sizeBytes })
        .from(videos)
        .where(inArray(videos.matchId, ids))
    : [];

  // Videos deleted on their own: their match, if they have one, is still
  // listed. One inside a deleted match is shown as part of that match.
  const deletedVideos = await db
    .select({
      id: videos.id,
      originalFilename: videos.originalFilename,
      deletedAt: videos.deletedAt,
      sizeBytes: videos.sizeBytes,
    })
    .from(videos)
    .leftJoin(matches, eq(matches.id, videos.matchId))
    .where(and(eq(videos.teamId, teamId), isNotNull(videos.deletedAt), isNull(matches.deletedAt)));

  return {
    matches: deletedMatches
      .map((m) => ({
        id: m.id,
        title: `v ${m.opponent}, ${matchDate(m.playedOn)}`,
        deletedAt: m.deletedAt!,
        left: daysLeftLabel(m.deletedAt!, now),
        sizeBytes: theirFootage.filter((v) => v.matchId === m.id).reduce((n, v) => n + v.sizeBytes, 0),
      }))
      .sort((a, b) => b.deletedAt - a.deletedAt),
    videos: deletedVideos
      .map((v) => ({
        id: v.id,
        title: v.originalFilename,
        deletedAt: v.deletedAt!,
        left: daysLeftLabel(v.deletedAt!, now),
        sizeBytes: v.sizeBytes,
      }))
      .sort((a, b) => b.deletedAt - a.deletedAt),
  };
}
