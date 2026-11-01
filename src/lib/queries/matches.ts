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
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matches, oppositions, type MatchKind } from "@/lib/db/schema";
import type { Side } from "@/lib/hurling/stats";

export const isOurMatch = eq(matches.kind, "ours");
export const isOppositionGame = eq(matches.kind, "opposition");

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
