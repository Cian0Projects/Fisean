import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matches, statClocks, teams } from "@/lib/db/schema";
import { isCoach, requireUser } from "@/lib/auth/guard";
import { canReadStats } from "@/lib/auth/visibility";
import { Nav } from "@/components/ui/Nav";
import { MatchSummary, type SummaryView } from "@/components/stats/MatchSummary";
import type { PitchMark } from "@/components/pitch/PitchMap";
import { loadMatchMarkers, loadNumberSheet, loadStatRows } from "@/lib/queries/stats";
import { loadCustomEntries, loadCustomStats, loadHiddenStats } from "@/lib/queries/custom-stats";
import { loadPicks, loadPins, loadTargets, loadUnsent } from "@/lib/queries/summary";
import { numberSheet, statMarks } from "@/components/stats/types";
import { statTiming, whistlesOf, type StatType } from "@/lib/hurling/stats";
import { customColour, customShape } from "@/lib/hurling/custom-stats";
import { termsFor } from "@/lib/hurling/codes";
import { formatGameClock } from "@/lib/hurling/notation";
import {
  SUMMARY_STAGES,
  buildTiles,
  cleanPicks,
  customIdOf,
  defaultStage,
  inStage,
  resolvePins,
  scoreTimeline,
  stageScore,
  suggestTiles,
  summaryMenu,
  tileRows,
  type SummaryStage,
  type TileKey,
} from "@/lib/hurling/summary";
import { matchDateLong } from "@/lib/format";

/**
 * The match summary: every stat on one screen, at half time or full time,
 * for the players or for management. See src/components/stats/MatchSummary.tsx
 * for the two views and src/lib/hurling/summary.ts for the judging.
 *
 * The player view follows the stat sheet's own rule: coaches always, players
 * once the sheet is put out to the panel. The management view is for
 * coaches only, half-finished sheet and all.
 */

/** Where in the full report each standard stat's detail is. */
const REPORT_ANCHORS: Record<StatType, string> = {
  shot: "#shooting",
  puckout: "#restarts",
  delivery: "#delivery",
  tackle: "#turnovers",
  turnover: "#turnovers",
  free_conceded: "#discipline",
  free_won: "#discipline",
  mark: "#marks",
};

export default async function MatchSummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ view?: string; stage?: string }>;
}) {
  const user = await requireUser();
  const [{ matchId }, asked] = await Promise.all([params, searchParams]);

  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match || match.teamId !== user.teamId || match.deletedAt !== null) notFound();

  if (!canReadStats(user, match)) {
    return (
      <>
        <Nav user={user} />
        <main className="sheet pt-10 pb-16">
          <h1 className="display text-[clamp(2.4rem,6vw,3.8rem)]">{match.opponent}</h1>
          <p className="measure mt-4 text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
            The summary for {matchDateLong(match.playedOn)} is not out yet. It shows up here once the coaches put
            the stat sheet out to the panel.
          </p>
          <Link href="/" className="btn-outline mt-6">
            Back to matches
          </Link>
        </main>
      </>
    );
  }

  const coach = isCoach(user);
  const view: SummaryView = coach && asked.view === "management" ? "management" : "players";
  const code = user.teamCode;

  const [[team], stored, markers, numbers, customDefs, customStored, hidden, targets, pins, picks, unsent, secondHalfClocks] =
    await Promise.all([
      db.select({ name: teams.name }).from(teams).where(eq(teams.id, user.teamId)).limit(1),
      loadStatRows(matchId, user.teamId, user.id),
      loadMatchMarkers(matchId),
      loadNumberSheet(matchId, user.teamId),
      loadCustomStats(user.teamId, { withRetired: true }),
      loadCustomEntries(matchId, user.teamId, user.id),
      loadHiddenStats(user.teamId),
      loadTargets(user.teamId),
      loadPins(user.teamId),
      loadPicks(matchId, user.teamId),
      coach ? loadUnsent(matchId, user.teamId, user.id) : Promise.resolve({ loggers: [], byTile: new Map() }),
      db
        .select({ at: statClocks.secondHalfAt })
        .from(statClocks)
        .where(and(eq(statClocks.matchId, matchId), isNotNull(statClocks.secondHalfAt)))
        .limit(1),
    ]);

  // Each row's half and game clock, settled as the report settles them.
  const whistles = whistlesOf(match);
  const rows = stored.map((r) => ({
    ...r,
    ...statTiming(r, r.videoId ? markers.get(r.videoId) : undefined, match.halfLengthMin, whistles),
  }));
  const customRows = customStored.map((r) => {
    const t = statTiming(r, r.videoId ? markers.get(r.videoId) : undefined, match.halfLengthMin, whistles);
    return { ...r, half: t.half ?? r.half, gameMs: t.gameMs };
  });

  const secondHalfStarted =
    secondHalfClocks.length > 0 || match.secondHalfAt != null || match.statsSubmittedAt != null;
  const stage: SummaryStage = SUMMARY_STAGES.includes(asked.stage as SummaryStage)
    ? (asked.stage as SummaryStage)
    : defaultStage(rows, secondHalfStarted);

  const menu = summaryMenu(code, hidden, customDefs, {
    types: new Set(rows.map((r) => r.statType)),
    customIds: new Set(customRows.map((r) => r.statId)),
  });
  const input = {
    code,
    rows,
    custom: customDefs.map((def) => ({ def, entries: customRows.filter((e) => e.statId === def.id) })),
  };
  const tiles = buildTiles(input, menu, targets, stage, unsent.byTile);
  const pinned = resolvePins(pins, menu);
  const saved = picks[stage];
  const shownPicks = saved ? cleanPicks(saved, menu, pinned) : suggestTiles(tiles, pinned, stage);

  // Maps for the tiles the room sees.
  const sheet = numberSheet(numbers);
  const stageRows = inStage(rows, stage);
  const marks: Record<TileKey, PitchMark[]> = {};
  for (const key of [...pinned, ...shownPicks]) {
    const id = customIdOf(key);
    if (id) {
      marks[key] = inStage(customRows, stage)
        .filter((e) => e.statId === id && e.originX != null && e.originY != null)
        .map((e) => ({
          id: e.id,
          x: e.originX!,
          y: e.originY!,
          toX: e.destX,
          toY: e.destY,
          colour: customColour(e),
          shape: customShape(e),
          label: e.playerNumber != null ? String(e.playerNumber) : null,
        }));
    } else {
      marks[key] = statMarks(tileRows(key as StatType, stageRows), sheet, code);
    }
  }

  const anchors: Record<TileKey, string> = {};
  for (const t of menu) anchors[t.key] = customIdOf(t.key) ? "#own-stats" : REPORT_ANCHORS[t.key as StatType];

  const maps =
    view === "management"
      ? [
          menu.some((t) => t.key === "shot") && {
            title: "Where our shots came from",
            marks: statMarks(tileRows("shot", stageRows), sheet, code),
          },
          menu.some((t) => t.key === "turnover") && {
            title: "Turnovers won and lost",
            marks: statMarks(tileRows("turnover", stageRows), sheet, code),
          },
        ].filter((m): m is { title: string; marks: PitchMark[] } => Boolean(m))
      : [];

  const clocked = [...stageRows, ...inStage(customRows, stage)].map((r) => r.gameMs).filter((ms): ms is number => ms != null);
  const latestClock = clocked.length ? formatGameClock(Math.max(...clocked)) : null;

  return (
    <>
      <Nav user={user} />
      <MatchSummary
        view={view}
        stage={stage}
        coach={coach}
        live={match.statsSubmittedAt == null}
        teamName={team?.name ?? "Us"}
        code={code}
        twoPointers={termsFor(code).twoPointArc}
        match={{
          id: match.id,
          opponent: match.opponent,
          competition: match.competition,
          venue: match.venue,
          playedOn: match.playedOn,
        }}
        score={stageScore(rows, stage, code)}
        timeline={scoreTimeline(rows, match.halfLengthMin, stage)}
        tiles={tiles}
        pinned={pinned}
        picks={shownPicks}
        confirmed={saved != null}
        marks={marks}
        anchors={anchors}
        unsent={unsent.loggers}
        latestClock={latestClock}
        maps={maps}
      />
    </>
  );
}
