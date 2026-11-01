/**
 * What the team knows about each club it plays or studies.
 *
 * A club turns up on either side of a match: the opposition side of our own
 * games against them and of opposition games where they are the team being
 * studied, and the other side when they were the ones being played. A clip is
 * about them when it is about whichever side they were on (clips.about_side).
 */
import "server-only";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/lib/db/client";
import { clips, matches, oppositions, users, videos, type MatchKind } from "@/lib/db/schema";
import type { Viewer } from "@/lib/auth/visibility";
import { visibleClipIds } from "@/lib/queries/clips";

export type OppositionSummary = {
  id: string;
  name: string;
  /** Our own games against them. */
  played: number;
  /** Their games brought in to study. */
  studied: number;
  /** The most recent of either, as an ISO date. */
  lastOn: string | null;
};

export async function loadOppositionList(teamId: string): Promise<OppositionSummary[]> {
  const [teams, games] = await Promise.all([
    db
      .select({ id: oppositions.id, name: oppositions.name })
      .from(oppositions)
      .where(eq(oppositions.teamId, teamId))
      .orderBy(asc(oppositions.name)),
    db
      .select({
        kind: matches.kind,
        oppositionId: matches.oppositionId,
        vsOppositionId: matches.vsOppositionId,
        playedOn: matches.playedOn,
      })
      .from(matches)
      .where(eq(matches.teamId, teamId)),
  ]);

  const byId = new Map<string, OppositionSummary>(
    teams.map((t) => [t.id, { ...t, played: 0, studied: 0, lastOn: null }]),
  );
  for (const g of games) {
    for (const id of [g.oppositionId, g.vsOppositionId]) {
      const s = id ? byId.get(id) : undefined;
      if (!s) continue;
      if (g.kind === "ours") s.played++;
      else s.studied++;
      if (!s.lastOn || g.playedOn > s.lastOn) s.lastOn = g.playedOn;
    }
  }
  return [...byId.values()];
}

export type OppositionGame = {
  id: string;
  kind: MatchKind;
  playedOn: string;
  competition: string | null;
  /** Who they were playing: blank in our games, where it was us. */
  vsName: string | null;
  vsId: string | null;
  /** The first ready file, which is what Watch opens. */
  videoId: string | null;
  /** Footage still on its way up. */
  arriving: boolean;
  createdBy: string | null;
};

export type OppositionClip = {
  id: string;
  videoId: string;
  title: string;
  startMs: number;
  endMs: number;
  matchId: string;
  authorName: string;
};

export async function loadOpposition(
  teamId: string,
  oppositionId: string,
  viewer: Viewer,
): Promise<{ id: string; name: string; games: OppositionGame[]; clips: OppositionClip[] } | null> {
  const [opp] = await db.select().from(oppositions).where(eq(oppositions.id, oppositionId)).limit(1);
  if (!opp || opp.teamId !== teamId) return null;

  const theirs = or(eq(matches.oppositionId, opp.id), eq(matches.vsOppositionId, opp.id));
  const other = alias(oppositions, "other");
  const gameRows = await db
    .select({
      id: matches.id,
      kind: matches.kind,
      playedOn: matches.playedOn,
      competition: matches.competition,
      oppositionId: matches.oppositionId,
      vsOppositionId: matches.vsOppositionId,
      opponent: matches.opponent,
      vsName: other.name,
      createdBy: matches.createdBy,
    })
    .from(matches)
    .leftJoin(other, eq(other.id, matches.vsOppositionId))
    .where(and(eq(matches.teamId, teamId), theirs))
    .orderBy(desc(matches.playedOn), desc(matches.createdAt));

  const ids = gameRows.map((g) => g.id);
  const footage = ids.length
    ? await db
        .select({ id: videos.id, matchId: videos.matchId, status: videos.status })
        .from(videos)
        .where(inArray(videos.matchId, ids))
        .orderBy(asc(videos.createdAt))
    : [];

  const games: OppositionGame[] = gameRows.map((g) => {
    const files = footage.filter((v) => v.matchId === g.id);
    // In an opposition game they may be either side; whoever else is named
    // is who they played.
    const studied = g.oppositionId === opp.id;
    return {
      id: g.id,
      kind: g.kind,
      playedOn: g.playedOn,
      competition: g.competition,
      vsName: g.kind === "ours" ? null : studied ? g.vsName : g.opponent,
      vsId: g.kind === "ours" ? null : studied ? g.vsOppositionId : g.oppositionId,
      videoId: files.find((v) => v.status === "ready")?.id ?? null,
      arriving: !files.some((v) => v.status === "ready") && files.some((v) => v.status === "uploading"),
      createdBy: g.createdBy,
    };
  });

  const clipRows = ids.length
    ? await db
        .select({
          id: clips.id,
          videoId: clips.videoId,
          title: clips.title,
          startMs: clips.startMs,
          endMs: clips.endMs,
          matchId: matches.id,
          visibility: clips.visibility,
          shareRoles: clips.shareRoles,
          createdBy: clips.createdBy,
          authorName: users.displayName,
        })
        .from(clips)
        .innerJoin(videos, eq(videos.id, clips.videoId))
        .innerJoin(matches, eq(matches.id, videos.matchId))
        .leftJoin(users, eq(users.id, clips.createdBy))
        .where(
          and(
            eq(clips.teamId, teamId),
            or(
              and(eq(matches.oppositionId, opp.id), eq(clips.aboutSide, "opposition")),
              and(eq(matches.vsOppositionId, opp.id), eq(clips.aboutSide, "us")),
            ),
          ),
        )
        .orderBy(desc(matches.playedOn), asc(clips.startMs))
    : [];
  const seen = await visibleClipIds(viewer, clipRows);

  return {
    id: opp.id,
    name: opp.name,
    games,
    clips: clipRows
      .filter((c) => seen.has(c.id))
      .map((c) => ({
        id: c.id,
        videoId: c.videoId,
        title: c.title,
        startMs: c.startMs,
        endMs: c.endMs,
        matchId: c.matchId,
        authorName: c.authorName ?? "Removed",
      })),
  };
}
