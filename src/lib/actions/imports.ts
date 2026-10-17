"use server";

/**
 * Bringing a club's old footage across from another app.
 *
 * Two steps, so the coach is never left guessing. `checkFootageLink` looks at
 * a pasted link and says what is behind it, with the match it seems to be
 * filled in from the file's name. `importFootage` then makes the match and
 * sets the server fetching, and the coach can close the page. Anything wrong
 * with a link, an expired export or a page instead of a file, is said at the
 * first step, in words, while the coach is still there to fix it.
 *
 * Coaches and admins only, as with uploading. The rules are in
 * src/lib/media/import.ts, the fetching in source.ts and importer.ts.
 */
import { revalidatePath } from "next/cache";
import { and, eq, ne, sum } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { footageImports, matches, teams, videos } from "@/lib/db/schema";
import { assertSameTeam, requireCoach } from "@/lib/auth/guard";
import { contentTypeFor, store } from "@/lib/storage";
import { SOURCE_LABELS, readSourceLink, suggestMatch, type SourceKind } from "@/lib/media/import";
import { checkSource, SourceError, type SourceInfo } from "@/lib/media/source";
import { queueImport } from "@/lib/media/importer";
import { localDay, quotaProblem, readNewMatch, teamQuotaBytes, uploadKey } from "@/lib/media/upload";
import { importsForTeam, type ImportView } from "@/lib/queries/imports";

export type LinkCheck =
  | {
      ok: true;
      link: string;
      sourceLabel: string;
      filename: string;
      sizeBytes: number;
      title: string;
      playedOn: string;
    }
  | { ok: false; link: string; error: string };

/** Read and look at a pasted link: an error in words, or what is behind it. */
async function inspect(link: string): Promise<{ info: SourceInfo; source: SourceKind } | { error: string }> {
  const read = readSourceLink(link);
  if ("error" in read) return read;
  try {
    return { info: await checkSource(read.url, read.source), source: read.source };
  } catch (err) {
    if (err instanceof SourceError) return { error: err.message };
    console.error("Checking a footage link failed:", err);
    return { error: "Ardawn could not open that link. Check it opens in your browser, then try again." };
  }
}

export async function checkFootageLink(link: string): Promise<LinkCheck> {
  await requireCoach();
  const found = await inspect(link);
  if ("error" in found) return { ok: false, link, error: found.error };

  const { info, source } = found;
  const guess = suggestMatch(info.filename, info.lastModified, localDay(new Date()));
  return {
    ok: true,
    link,
    sourceLabel: SOURCE_LABELS[source],
    filename: info.filename,
    sizeBytes: info.sizeBytes,
    ...guess,
  };
}

/**
 * Make the match and start fetching its footage. The match exists from now,
 * with its video arriving, exactly as when a file is dropped on the page.
 */
export async function importFootage(input: {
  link: string;
  title: string;
  playedOn: string;
}): Promise<{ ok: true; import: ImportView } | { ok: false; error: string }> {
  const user = await requireCoach();

  const named = readNewMatch({ title: input.title, playedOn: input.playedOn });
  if ("error" in named) return { ok: false, error: named.error };

  const found = await inspect(input.link);
  if ("error" in found) return { ok: false, error: found.error };
  const { info, source } = found;

  const [already] = await db
    .select({ id: footageImports.id })
    .from(footageImports)
    .where(and(eq(footageImports.teamId, user.teamId), eq(footageImports.sourceUrl, info.url.href)))
    .limit(1);
  if (already) return { ok: false, error: "That link is already on its way in." };

  const [{ used }] = await db
    .select({ used: sum(videos.sizeBytes) })
    .from(videos)
    .where(and(eq(videos.teamId, user.teamId), ne(videos.status, "failed")));
  const tooBig = quotaProblem(Number(used ?? 0), info.sizeBytes, teamQuotaBytes(process.env.TEAM_STORAGE_GB));
  if (tooBig) return { ok: false, error: tooBig };

  const [team] = await db
    .select({ halfLengthMin: teams.halfLengthMin })
    .from(teams)
    .where(eq(teams.id, user.teamId))
    .limit(1);

  const media = await store();
  const storageKey = uploadKey(user.teamId, info.filename, crypto.randomUUID());
  const uploadId = await media.createMultipart(storageKey, contentTypeFor(info.filename));

  let jobId: string;
  try {
    // The match, its video and the import land together or not at all.
    jobId = db.transaction((tx) => {
      const match = tx
        .insert(matches)
        .values({
          teamId: user.teamId,
          opponent: named.opponent,
          playedOn: named.playedOn,
          halfLengthMin: team?.halfLengthMin ?? 30,
          createdBy: user.id,
        })
        .returning()
        .get();
      const video = tx
        .insert(videos)
        .values({
          matchId: match.id,
          teamId: user.teamId,
          originalFilename: info.filename,
          storageKey,
          uploadId,
          sizeBytes: info.sizeBytes,
          status: "uploading",
          uploadedBy: user.id,
        })
        .returning()
        .get();
      return tx
        .insert(footageImports)
        .values({
          teamId: user.teamId,
          videoId: video.id,
          sourceUrl: info.url.href,
          source,
          ranges: info.ranges,
          createdBy: user.id,
        })
        .returning()
        .get().id;
    });
  } catch (err) {
    await media.abortMultipart(storageKey, uploadId).catch(() => {});
    throw err;
  }

  queueImport(jobId);
  revalidatePath("/");
  revalidatePath("/admin");
  const saved = (await importsForTeam(user.teamId)).find((i) => i.id === jobId)!;
  return { ok: true, import: saved };
}

async function loadOwnImport(id: string) {
  const user = await requireCoach();
  const [job] = await db.select().from(footageImports).where(eq(footageImports.id, id)).limit(1);
  if (!job) throw new Error("That import has already finished or been removed.");
  assertSameTeam(user, job);
  return { user, job };
}

/**
 * Start a stopped import again, from where it stopped. With a fresh link, for
 * when the old one ran out, it must be the same file: same size, or the parts
 * already held would be stitched to a different match.
 */
export async function retryImport(
  id: string,
  link?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { job } = await loadOwnImport(id);

  if (link?.trim()) {
    const found = await inspect(link);
    if ("error" in found) return { ok: false, error: found.error };
    const [video] = await db
      .select({ sizeBytes: videos.sizeBytes })
      .from(videos)
      .where(eq(videos.id, job.videoId))
      .limit(1);
    if (video && video.sizeBytes !== found.info.sizeBytes) {
      return { ok: false, error: "That link is to a different file. Paste the link for the same match." };
    }
    await db
      .update(footageImports)
      .set({ sourceUrl: found.info.url.href, source: found.source, ranges: found.info.ranges, error: null })
      .where(eq(footageImports.id, id));
  } else {
    await db.update(footageImports).set({ error: null }).where(eq(footageImports.id, id));
  }

  queueImport(id);
  return { ok: true };
}

/** Stop an import and drop what arrived. The match stays, for another try or a dropped file. */
export async function removeImport(id: string): Promise<void> {
  const { job } = await loadOwnImport(id);
  const [video] = await db.select().from(videos).where(eq(videos.id, job.videoId)).limit(1);
  // Deleting the video takes the import row with it, and the importer,
  // finding the video gone, stops at its next part.
  await db.delete(videos).where(eq(videos.id, job.videoId));
  if (video?.uploadId) {
    const media = await store();
    await media.abortMultipart(video.storageKey, video.uploadId).catch(() => {});
  }
  revalidatePath("/");
  revalidatePath("/admin");
}
