"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clips, matchStats, matches, statClocks, videos } from "@/lib/db/schema";
import { assertSameTeam, requireCoach } from "@/lib/auth/guard";
import { normaliseEntry, type StatDraft } from "@/lib/hurling/stats";
import { LAST_WHISTLE, NEXT_WHISTLE, clockShift, livePhase, type Whistle } from "@/lib/hurling/live-clock";
import { clockOf, loadStatClock } from "@/lib/queries/stats";
import type { Markers } from "@/lib/hurling/notation";
import type { GameCode } from "@/lib/hurling/codes";
import type { StatRow } from "@/components/stats/types";

export type StatInput = StatDraft & {
  matchId: string;
  clipId?: string | null;
  /** Set by the live logging pad, off the video's own clock. Never typed. */
  videoId?: string | null;
  atMs?: number | null;
  /** Carried through on entries logged against the match's old shared clock. */
  seenAt?: number | null;
  /** How far into its half, off the logger's own clock on the line. */
  halfMs?: number | null;
  /** What the speech engine wrote, when the entry was said. See the schema. */
  voiceHeard?: string | null;
};

/** Long enough for any stat said in one go, short enough that a mic left open cannot fill the row. */
const VOICE_HEARD_MAX = 500;

function voiceHeardOf(input: { voiceHeard?: string | null }): string | null {
  const heard = typeof input.voiceHeard === "string" ? input.voiceHeard.trim() : "";
  return heard ? heard.slice(0, VOICE_HEARD_MAX) : null;
}

/** What the logging form keeps in its list. Names come from the match's number sheet. */
export type SavedStat = StatRow;

type StatValues = Omit<SavedStat, "id" | "createdAt" | "gameMs" | "draft">;

/**
 * The rules live in src/lib/hurling/stats.ts, where they are unit tested; a
 * server action is reachable by POST whatever the form does, so they are
 * applied here rather than trusted from the client.
 */
function normalise(input: StatInput | Omit<StatInput, "matchId">, code: GameCode): StatValues {
  const videoId = input.videoId?.trim() || null;
  const entry = normaliseEntry(input, code);
  return {
    ...entry,
    clipId: input.clipId?.trim() || null,
    videoId,
    // A timestamp only means anything alongside the video it was read from.
    atMs: videoId && Number.isFinite(input.atMs) ? Math.max(0, Math.trunc(input.atMs!)) : null,
    seenAt: Number.isFinite(input.seenAt) && input.seenAt! > 0 ? Math.trunc(input.seenAt!) : null,
    // And a time into a half only alongside the half.
    halfMs: entry.half && Number.isFinite(input.halfMs) ? Math.max(0, Math.trunc(input.halfMs!)) : null,
  };
}

/**
 * Everything a stat points at has to belong to the same squad. Players are
 * not among them: a stat names a jersey number, and a number is only a
 * number until this match's own sheet puts a name to it.
 */
async function assertReferencesAreOurs(
  user: Awaited<ReturnType<typeof requireCoach>>,
  values: StatValues,
): Promise<void> {
  if (values.clipId) {
    const [clip] = await db
      .select({ id: clips.id, teamId: clips.teamId })
      .from(clips)
      .where(eq(clips.id, values.clipId))
      .limit(1);
    if (!clip) throw new Error("That clip no longer exists.");
    assertSameTeam(user, clip);
  }

  if (values.videoId) {
    const [video] = await db
      .select({ id: videos.id, teamId: videos.teamId, durationMs: videos.durationMs })
      .from(videos)
      .where(eq(videos.id, values.videoId))
      .limit(1);
    if (!video) throw new Error("That video no longer exists.");
    assertSameTeam(user, video);
    if (values.atMs != null && video.durationMs > 0) {
      values.atMs = Math.min(values.atMs, video.durationMs);
    }
  }
}

/**
 * Another logger's unsubmitted entry is theirs alone: nobody else sees it, so
 * nobody else may change or delete it either, whatever reaches this by POST.
 */
function assertNotSomeoneElsesDraft(user: { id: string }, row: { draft: boolean; createdBy: string | null }): void {
  if (row.draft && row.createdBy !== user.id) throw new Error("That entry no longer exists.");
}

function revalidateStats(matchId: string): void {
  revalidatePath(`/matches/${matchId}/stats`);
  revalidatePath(`/matches/${matchId}/stats/log`);
}

/** The row as the forms hold it — the stored columns, less the bookkeeping. */
function toSaved(row: typeof matchStats.$inferSelect): SavedStat {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { matchId, teamId, createdBy, updatedAt, voiceHeard, ...saved } = row;
  return saved;
}

/**
 * Log one stat.
 *
 * Coach and admin only — the same tier that creates matches and uploads
 * footage. Reading the finished report is open to the whole squad.
 */
export async function logMatchStat(input: StatInput): Promise<SavedStat> {
  const user = await requireCoach();

  const [match] = await db
    .select({ id: matches.id, teamId: matches.teamId })
    .from(matches)
    .where(eq(matches.id, input.matchId))
    .limit(1);
  if (!match) throw new Error("That match no longer exists.");
  assertSameTeam(user, match);

  const values = normalise(input, user.teamCode);
  await assertReferencesAreOurs(user, values);
  // Logged on the line, it stays this logger's own until they submit. Off
  // footage there is no draft: the pad has always written to the sheet.
  const draft = !values.videoId && (await loadStatClock(match.id, user.id)).submittedAt == null;

  const [row] = await db
    .insert(matchStats)
    .values({
      ...values,
      draft,
      voiceHeard: voiceHeardOf(input),
      matchId: match.id,
      teamId: user.teamId,
      createdBy: user.id,
    })
    .returning();

  revalidateStats(match.id);
  return toSaved(row);
}

/**
 * Replace a stat entry outright rather than diffing it.
 *
 * Editing one means opening it back up in the same form, so the client
 * already holds every field — and a whole-row write cannot leave a shot
 * carrying a stale poc amach column from a previous edit.
 */
export async function updateMatchStat(
  statId: string,
  input: Omit<StatInput, "matchId">,
): Promise<SavedStat> {
  const user = await requireCoach();

  const [existing] = await db
    .select()
    .from(matchStats)
    .where(eq(matchStats.id, statId))
    .limit(1);
  if (!existing) throw new Error("That entry no longer exists.");
  assertSameTeam(user, existing);
  assertNotSomeoneElsesDraft(user, existing);

  const values = normalise(input, user.teamCode);
  await assertReferencesAreOurs(user, values);
  // An edit tapped by hand keeps what was heard the first time; one said
  // again replaces it.
  const heard = voiceHeardOf(input);

  const [row] = await db
    .update(matchStats)
    .set({ ...values, ...(heard ? { voiceHeard: heard } : {}), updatedAt: Date.now() })
    .where(eq(matchStats.id, statId))
    .returning();

  revalidateStats(existing.matchId);
  return toSaved(row);
}

export async function deleteMatchStat(statId: string): Promise<void> {
  const user = await requireCoach();

  const [existing] = await db
    .select({
      id: matchStats.id,
      teamId: matchStats.teamId,
      matchId: matchStats.matchId,
      createdBy: matchStats.createdBy,
      draft: matchStats.draft,
    })
    .from(matchStats)
    .where(eq(matchStats.id, statId))
    .limit(1);
  if (!existing) return;
  assertSameTeam(user, existing);
  assertNotSomeoneElsesDraft(user, existing);

  await db.delete(matchStats).where(eq(matchStats.id, statId));
  revalidateStats(existing.matchId);
}

/* ------------------------------------------------------ putting it out */

/**
 * Put the stat sheet out to the panel, or take it back.
 *
 * Any coach may, like keeping time: the one who logged most of it may not be
 * the one at the laptop on Monday. Taking it back is for corrections; the
 * entries stay as they are, and coaches can still edit a submitted sheet, so
 * a typo spotted afterwards does not need it taken back at all. Every page
 * that shows a scoreline or a link to the sheet is revalidated with it.
 */
export async function setStatsSubmitted(
  matchId: string,
  submitted: boolean,
): Promise<{ statsSubmittedAt: number | null }> {
  const user = await requireCoach();

  const [match] = await db
    .select({ id: matches.id, teamId: matches.teamId })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!match) throw new Error("That match no longer exists.");
  assertSameTeam(user, match);

  const [row] = await db
    .update(matches)
    .set(
      submitted
        ? { statsSubmittedAt: Date.now(), statsSubmittedBy: user.id }
        : { statsSubmittedAt: null, statsSubmittedBy: null },
    )
    .where(eq(matches.id, match.id))
    .returning({ statsSubmittedAt: matches.statsSubmittedAt });

  revalidateStats(match.id);
  revalidatePath("/");
  revalidatePath("/m");
  revalidatePath("/stats");
  return row;
}

/* --------------------------------------------------- each logger's clock */

/**
 * Each logger's own clock and their own submit. Everything here touches the
 * signed-in coach's clock and entries only: no other logger's whistles, and
 * none of their entries, can be moved or put out from here. The rules of the
 * clock are in src/lib/hurling/live-clock.ts.
 */

const WHISTLE_COLUMNS = {
  throwIn: "throwInAt",
  halfTime: "halfTimeAt",
  secondHalf: "secondHalfAt",
  fullTime: "fullTimeAt",
} as const;

async function ownClock(matchId: string) {
  const user = await requireCoach();
  const [match] = await db
    .select({ id: matches.id, teamId: matches.teamId })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!match) throw new Error("That match no longer exists.");
  assertSameTeam(user, match);
  const { whistles, submittedAt } = await loadStatClock(match.id, user.id);
  return { user, match, whistles, submittedAt };
}

/** Write this logger's clock, making the row the first time. */
function saveClock(
  run: Pick<typeof db, "insert">,
  user: { id: string; teamId: string },
  matchId: string,
  set: Partial<typeof statClocks.$inferInsert>,
) {
  const row = run
    .insert(statClocks)
    .values({ matchId, userId: user.id, teamId: user.teamId, ...set })
    .onConflictDoUpdate({ target: [statClocks.matchId, statClocks.userId], set: { ...set, updatedAt: Date.now() } })
    .returning()
    .get();
  return clockOf(row);
}

const timeOrNull = (at: number | null | undefined): number | null => {
  if (at == null) return null;
  if (!Number.isFinite(at) || at <= 0) throw new Error("That is not a time.");
  return Math.trunc(at);
};

/**
 * Tap the next whistle, or take back the last one.
 *
 * The time is the phone's own, sent with the tap: the clock only ever runs on
 * the one phone, so it is the only clock that has to agree with itself. Only
 * the whistle that comes next can be tapped, and only the last one taken
 * back, so the clock cannot get into an order the game never was in.
 */
export async function setMyWhistle(
  matchId: string,
  whistle: Whistle,
  at: number | null,
): Promise<{ whistles: Markers; submittedAt: number | null }> {
  const { user, match, whistles } = await ownClock(matchId);
  const phase = livePhase(whistles);
  if (at != null && NEXT_WHISTLE[phase] !== whistle) throw new Error("That whistle is not the next one.");
  if (at == null && LAST_WHISTLE[phase] !== whistle) throw new Error("Only the last whistle can be taken back.");
  const saved = saveClock(db, user, match.id, { [WHISTLE_COLUMNS[whistle]]: timeOrNull(at) });
  revalidateStats(match.id);
  return saved;
}

/**
 * Set this logger's clock outright: joining late, or a throw-in tapped late.
 *
 * Each half's entries were timed from that half's start, so when the start
 * moves they move with it, by the same amount (`clockShift`). Only this
 * logger's entries from the line, which are the only ones timed off this
 * clock.
 */
export async function setMyClock(
  matchId: string,
  next: Markers,
): Promise<{ whistles: Markers; submittedAt: number | null }> {
  const { user, match, whistles } = await ownClock(matchId);
  const shift = clockShift(whistles, next);

  const set = {
    throwInAt: timeOrNull(next.throwIn),
    halfTimeAt: timeOrNull(next.halfTime),
    secondHalfAt: timeOrNull(next.secondHalf),
    fullTimeAt: timeOrNull(next.fullTime),
  };
  if (set.throwInAt == null && set.secondHalfAt == null) throw new Error("That clock has no start.");

  const saved = db.transaction((tx) => {
    for (const half of [1, 2] as const) {
      if (shift[half] === 0) continue;
      tx.update(matchStats)
        .set({ halfMs: sql`max(0, ${matchStats.halfMs} - ${shift[half]})` })
        .where(
          and(
            eq(matchStats.matchId, match.id),
            eq(matchStats.createdBy, user.id),
            eq(matchStats.half, half),
            isNull(matchStats.videoId),
            isNotNull(matchStats.halfMs),
          ),
        )
        .run();
    }
    return saveClock(tx, user, match.id, set);
  });

  revalidateStats(match.id);
  return saved;
}

/**
 * Put this logger's entries on the match's sheet, where the other coaches
 * see them. Anything they log or fix afterwards goes straight on too. The
 * sheet only reaches the players when a coach submits it to the panel
 * (`setStatsSubmitted`), a separate step.
 */
export async function submitMyStats(matchId: string): Promise<{ whistles: Markers; submittedAt: number | null }> {
  const { user, match } = await ownClock(matchId);
  const saved = db.transaction((tx) => {
    tx.update(matchStats)
      .set({ draft: false })
      .where(and(eq(matchStats.matchId, match.id), eq(matchStats.createdBy, user.id), eq(matchStats.draft, true)))
      .run();
    return saveClock(tx, user, match.id, { submittedAt: Date.now() });
  });
  revalidateStats(match.id);
  revalidatePath("/");
  revalidatePath("/m");
  revalidatePath("/stats");
  return saved;
}
