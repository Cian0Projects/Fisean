/**
 * Which matches are ours, and what each side of one is called.
 *
 * An opposition game is a match, so that clipping and logging work on it
 * unchanged, but it is two other clubs playing. Every list, total and season
 * roll-up about this team reads through `isOurMatch`, rather than each screen
 * remembering the rule; the one that forgot would put another club's scores
 * in our season. Opposition games are listed on /opposition instead.
 */
import "server-only";
import { and, eq, isNull, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matches, oppositions, videos, type MatchKind } from "@/lib/db/schema";
import type { Side } from "@/lib/hurling/stats";

/**
 * Not in recently deleted (src/lib/media/deleted.ts). A deleted match or
 * video keeps its row for twenty days, so every list, total and lookup that
 * a viewer reaches reads through these; one that forgot would show footage
 * the admin has deleted. Both kinds of match below already include it.
 */
export const liveMatch = isNull(matches.deletedAt);
export const liveVideo = isNull(videos.deletedAt);

export const isOurMatch = and(eq(matches.kind, "ours"), liveMatch) as SQL;
export const isOppositionGame = and(eq(matches.kind, "opposition"), liveMatch) as SQL;

/**
 * The names on each side of the sheet. In our games, us and who we played;
 * in an opposition game, who the studied team was playing and the studied
 * team. A video with no match is training, named as it always was.
 */
export async function sidesOf(
  match: { kind: MatchKind; opponent: string; vsOppositionId: string | null } | null | undefined,
  teamName: string,
): Promise<Record<Side, string>> {
  if (!match) return { us: teamName, opposition: "Training" };
  if (match.kind === "ours") return { us: teamName, opposition: match.opponent };
  const [vs] = match.vsOppositionId
    ? await db.select({ name: oppositions.name }).from(oppositions).where(eq(oppositions.id, match.vsOppositionId)).limit(1)
    : [];
  return { us: vs?.name ?? "The other team", opposition: match.opponent };
}
