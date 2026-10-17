/**
 * A club's footage on its way across from another app, as the squad page
 * shows it: what it is, which match, how much has arrived, and why it
 * stopped if it did. Read by the page and by the progress poll alike.
 */
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { footageImports, matches, videos } from "@/lib/db/schema";
import { SOURCE_LABELS, type SourceKind } from "@/lib/media/import";

export type ImportView = {
  id: string;
  videoId: string;
  filename: string;
  opponent: string;
  playedOn: string;
  sourceLabel: string;
  sizeBytes: number;
  receivedBytes: number;
  error: string | null;
};

export async function importsForTeam(teamId: string): Promise<ImportView[]> {
  const rows = await db
    .select({
      id: footageImports.id,
      videoId: videos.id,
      filename: videos.originalFilename,
      opponent: matches.opponent,
      playedOn: matches.playedOn,
      source: footageImports.source,
      sizeBytes: videos.sizeBytes,
      receivedBytes: footageImports.receivedBytes,
      error: footageImports.error,
    })
    .from(footageImports)
    .innerJoin(videos, eq(videos.id, footageImports.videoId))
    .innerJoin(matches, eq(matches.id, videos.matchId))
    .where(eq(footageImports.teamId, teamId))
    .orderBy(asc(footageImports.createdAt));

  return rows.map(({ source, ...r }) => ({ ...r, sourceLabel: SOURCE_LABELS[source as SourceKind] }));
}
