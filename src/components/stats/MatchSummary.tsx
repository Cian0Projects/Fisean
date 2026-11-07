/**
 * The match summary page: every stat on one screen, for two audiences.
 *
 * The player view is for the dressing room at half time and the review
 * after: a landscape laptop or tablet held up or passed round, read from a
 * metre or three. So it carries little: the score, the timeline, the two
 * tiles the squad always shows, and the one or two the analyst confirmed.
 * Four numbers a room can take in while management talks over them.
 *
 * The management view is the one read up close: a compact tile for every
 * stat the squad logs, coloured against its target, each opening the full
 * report. It answers "where are we off target?" in a few seconds, which is
 * the question management has before deciding what to tell the room.
 *
 * The judging is in src/lib/hurling/summary.ts; this only lays it out.
 */
import Link from "next/link";
import { PitchMap, type PitchMark } from "@/components/pitch/PitchMap";
import { ScoreWorm } from "./ScoreWorm";
import { SummaryTile } from "./SummaryTile";
import { SummaryPicker, type PickOption } from "./SummaryPicker";
import { AutoRefresh } from "./AutoRefresh";
import { PrintButton } from "./PrintButton";
import {
  STAGE_LABELS,
  SUMMARY_STAGES,
  describeJudgement,
  type ScoreTimeline,
  type SummaryStage,
  type TileKey,
  type TileResult,
} from "@/lib/hurling/summary";
import type { GameCode } from "@/lib/hurling/codes";
import { matchDateLong } from "@/lib/format";
import type { StatMatchInfo } from "./types";

export type SummaryView = "players" | "management";

export function MatchSummary({
  view,
  stage,
  coach,
  live,
  teamName,
  code,
  twoPointers,
  match,
  score,
  timeline,
  tiles,
  pinned,
  picks,
  confirmed,
  marks,
  anchors,
  unsent,
  latestClock,
  maps,
}: {
  view: SummaryView;
  stage: SummaryStage;
  coach: boolean;
  /** Still being logged: the page keeps itself current. */
  live: boolean;
  teamName: string;
  code: GameCode;
  twoPointers: boolean;
  match: StatMatchInfo;
  score: { us: string; them: string | null };
  timeline: ScoreTimeline;
  tiles: TileResult[];
  pinned: TileKey[];
  /** The tiles beside the fixed two: confirmed, or suggested until someone confirms. */
  picks: TileKey[];
  confirmed: boolean;
  /** Each large tile's map. */
  marks: Record<TileKey, PitchMark[]>;
  /** Where in the full report each tile's detail is. */
  anchors: Record<TileKey, string>;
  unsent: { name: string; entries: number }[];
  /** The latest game clock on anything shown, "31:20". */
  latestClock: string | null;
  /** Management only: the two maps a manager looks at first. */
  maps: { title: string; marks: PitchMark[] }[];
}) {
  const base = `/matches/${match.id}/stats/summary`;
  const href = (v: SummaryView, s: SummaryStage) => `${base}?view=${v}&stage=${s}`;
  const byKey = new Map(tiles.map((t) => [t.key, t]));
  const room = [...pinned, ...picks].map((k) => byKey.get(k)).filter((t): t is TileResult => t != null);

  const options: PickOption[] = tiles
    .filter((t) => !pinned.includes(t.key))
    .sort((a, b) => (a.headline.gap ?? Infinity) - (b.headline.gap ?? Infinity))
    .map((t) => ({ key: t.key, title: t.title, reason: describeJudgement(t, stage), verdict: t.headline.verdict }));

  return (
    <main className="sheet pt-8 pb-16 print:pt-0">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b-[3px] pb-4" style={{ borderColor: "var(--color-rule)" }}>
        <div className="min-w-0">
          <p className="text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
            {STAGE_LABELS[stage]} summary, {matchDateLong(match.playedOn)}
            {match.competition ? `, ${match.competition}` : ""}
          </p>
          <h1 className="display mt-2 text-[clamp(2rem,4.5vw,3.4rem)]">
            {teamName} <span className="tabular">{score.us}</span>
            <span className="mx-3 text-[0.55em] font-normal" style={{ color: "var(--color-ink-faint)" }}>
              to
            </span>
            {match.opponent} {score.them && <span className="tabular">{score.them}</span>}
          </h1>
          <p className="mt-2 flex flex-wrap gap-x-4 text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
            {latestClock && <span>Latest entry at {latestClock}</span>}
            {live && <AutoRefresh />}
          </p>
        </div>
        <nav className="no-print flex flex-wrap items-center gap-2" aria-label="Summary views">
          {coach && (
            <Segmented
              items={[
                { label: "For the players", href: href("players", stage), on: view === "players" },
                { label: "For management", href: href("management", stage), on: view === "management" },
              ]}
            />
          )}
          <Segmented items={SUMMARY_STAGES.map((s) => ({ label: STAGE_LABELS[s], href: href(view, s), on: stage === s }))} />
          <Link href={`/matches/${match.id}/stats`} className="btn-outline text-xs">
            Full report
          </Link>
          {view === "management" && <PrintButton />}
        </nav>
      </header>

      {coach && unsent.length > 0 && (
        <p className="no-print mt-4 rounded px-4 py-3 text-[14px]" style={{ border: "1px solid var(--color-mark)", color: "var(--color-ink)" }}>
          <span className="font-semibold">Not sent yet: </span>
          {unsent.map((u) => `${u.name} has ${u.entries} ${u.entries === 1 ? "stat" : "stats"}`).join(", ")}. Everything
          else is in. Tiles their stats would change say who they are waiting on.
        </p>
      )}

      <section className="mt-6">
        <ScoreWorm
          timeline={timeline}
          teamName={teamName}
          opponent={match.opponent}
          twoPointers={twoPointers}
          height={view === "players" ? 230 : 190}
        />
      </section>

      {view === "players" ? (
        <>
          {coach && (
            <div className="mt-6">
              <SummaryPicker
                key={`${stage}-${picks.join(",")}`}
                matchId={match.id}
                stage={stage}
                options={options}
                current={picks}
                confirmed={confirmed}
              />
            </div>
          )}
          <section className="mt-6 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))" }}>
            {room.map((tile) => (
              <SummaryTile key={tile.key} tile={tile} stage={stage} size="large" marks={marks[tile.key]} code={code} />
            ))}
          </section>
        </>
      ) : (
        <>
          <section className="mt-6 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(13.5rem, 1fr))" }}>
            {tiles.map((tile) => (
              <SummaryTile
                key={tile.key}
                tile={tile}
                stage={stage}
                size="compact"
                href={`/matches/${match.id}/stats${anchors[tile.key] ?? ""}`}
              />
            ))}
          </section>
          {maps.length > 0 && (
            <section className="mt-8 grid gap-6 md:grid-cols-2">
              {maps.map((m) => (
                <MapPanel key={m.title} title={m.title} marks={m.marks} code={code} />
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}

function Segmented({ items }: { items: { label: string; href: string; on: boolean }[] }) {
  return (
    <span className="inline-flex rounded" style={{ border: "1px solid var(--color-line-strong)" }}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.on ? "page" : undefined}
          className="px-3 py-1.5 text-[13px] font-semibold"
          style={{
            background: item.on ? "var(--color-ink)" : "transparent",
            color: item.on ? "var(--color-stage)" : "var(--color-ink-dim)",
          }}
        >
          {item.label}
        </Link>
      ))}
    </span>
  );
}

function MapPanel({ title, marks, code }: { title: string; marks: PitchMark[]; code: GameCode }) {
  return (
    <div>
      <h2 className="title mb-2 text-[15px]">{title}</h2>
      {marks.length > 0 ? (
        <PitchMap marks={marks} code={code} />
      ) : (
        <p className="text-[14px]" style={{ color: "var(--color-ink-faint)" }}>
          Nothing placed on the pitch yet.
        </p>
      )}
    </div>
  );
}
