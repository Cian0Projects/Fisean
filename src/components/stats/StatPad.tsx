"use client";

/**
 * The stat pad — logging embedded in the review workspace itself.
 *
 * The standalone form at /stats/log is for typing up a notebook after the
 * final whistle; this is for logging live, alongside the footage, without
 * ever touching a clock by hand. A stat's timestamp is read straight off the
 * player: the moment a coach starts a fresh entry — switches type, or places
 * the first point on the map — that instant is stamped and carried through,
 * even if filling in the rest (who, how it ended) takes a few more seconds.
 * That mirrors quick-clip's own rule in ReviewWorkspace: press after you see
 * it, don't pause to describe it first.
 *
 * Deliberately narrower than StatLogger: no clip picker (the video itself is
 * the record now), no page chrome, one column instead of two. The pitch map
 * still needs both hands' width, so it comes first and the log stacks below.
 */
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { PlayerEngine } from "@/components/player/engine";
import { PitchMap, type PitchMark } from "@/components/pitch/PitchMap";
import {
  deleteMatchStat,
  logMatchStat,
  updateMatchStat,
  type StatInput,
} from "@/lib/actions/stats";
import { formatClock } from "@/lib/hurling/notation";
import {
  OUTCOME_COLOURS,
  SHOT_RESULTS,
  SHOT_RESULT_LABELS,
  STAT_TYPES,
  STAT_TYPE_META,
  describeStat,
  effectiveOutcome,
  outcomeLabel,
  puckoutOutcome,
  puckoutWinner,
  statColour,
  statShape,
  stepToStat,
  type PuckoutSide,
  type PuckoutWinner,
  type ShotResult,
  type StatOutcome,
  type StatType,
} from "@/lib/hurling/stats";
import { Choice } from "./StatLogger";
import {
  jerseyLabel,
  playerLabel,
  statMarks,
  type StatPlayer,
  type StatRow,
} from "./types";

const PUCKOUT_WINNERS: { value: PuckoutWinner; label: string }[] = [
  { value: "us", label: "We won it" },
  { value: "opposition", label: "They won it" },
  { value: "unclear", label: "Broke unclear" },
];

export function StatPad({
  engine,
  matchId,
  videoId,
  panel,
  rows,
  setRows,
  statType,
  setStatType,
  onJump,
}: {
  engine: PlayerEngine;
  matchId: string;
  videoId: string;
  panel: StatPlayer[];
  /** Held by the workspace, because the timeline draws them too. */
  rows: StatRow[];
  setRows: Dispatch<SetStateAction<StatRow[]>>;
  /** Shared as well: it decides which ticks the timeline brings forward. */
  statType: StatType;
  setStatType: Dispatch<SetStateAction<StatType>>;
  onJump: (row: StatRow) => void;
}) {
  const [outcome, setOutcome] = useState<StatOutcome | null>(null);
  const [shotResult, setShotResult] = useState<ShotResult | null>(null);
  const [puckoutTakenBy, setPuckoutTakenBy] = useState<PuckoutSide>("us");
  const [ledToScore, setLedToScore] = useState(false);
  const [playerId, setPlayerId] = useState("");
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [dest, setDest] = useState<{ x: number; y: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [entryClipId, setEntryClipId] = useState<string | null>(null);
  // The moment this entry was opened, off the transport's own clock. Null
  // until the first real interaction stamps it — see the file note above.
  const [stampMs, setStampMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const meta = STAT_TYPE_META[statType];
  const players = useMemo(() => new Map(panel.map((p) => [p.id, p])), [panel]);
  const playerAllowed = statType !== "puckout" || outcome === "positive";

  const ready =
    (meta.outcomes.length === 0 || outcome !== null) &&
    (statType !== "shot" || shotResult !== null);

  /** The instant an entry starts, captured once and then left alone. */
  const stampIfFresh = () => {
    if (!editingId && stampMs === null) setStampMs(engine.snapshot.positionMs);
  };

  const ofThisType = rows.filter((r) => r.statType === statType);
  const timedOfThisType = ofThisType.filter((r) => r.atMs != null);

  /** Walk through this kind of stat, one incident at a time. */
  const step = (direction: 1 | -1) => {
    const found = stepToStat(timedOfThisType, engine.snapshot.positionMs, direction);
    if (found) onJump(found);
  };

  const resetEntry = () => {
    setOutcome(null);
    setShotResult(null);
    setLedToScore(false);
    setPlayerId("");
    setOrigin(null);
    setDest(null);
    setEditingId(null);
    setEntryClipId(null);
    setStampMs(null);
    setError(null);
  };

  const chooseType = (next: StatType) => {
    setStatType(next);
    setOutcome(null);
    setShotResult(null);
    setLedToScore(false);
    setDest(null);
    if (STAT_TYPE_META[next].points === 0) setOrigin(null);
    stampIfFresh();
  };

  /** Number keys pick the stat type, exactly as the full stat sheet does. */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          return;
        }
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Escape" && editingId) {
        resetEntry();
        return;
      }
      const found = STAT_TYPES.find((t) => STAT_TYPE_META[t].hotkey === e.key);
      if (found) {
        e.preventDefault();
        chooseType(found);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editingId, stampMs]);

  const placePoint = (p: { x: number; y: number }) => {
    if (meta.points === 0) return;
    stampIfFresh();
    if (meta.points === 1) {
      setOrigin(p);
      return;
    }
    if (!origin || dest) {
      setOrigin(p);
      setDest(null);
    } else {
      setDest(p);
    }
  };

  const marks: PitchMark[] = useMemo(() => {
    const existing = statMarks(
      rows.filter((r) => r.statType === statType && r.id !== editingId),
      players,
      { muted: true },
    );
    if (!origin) return existing;

    const draft = { statType, outcome, shotResult };
    return [
      ...existing,
      {
        id: "draft",
        x: origin.x,
        y: origin.y,
        toX: dest?.x ?? null,
        toY: dest?.y ?? null,
        colour: statColour(draft),
        shape: statShape(draft),
        label: playerAllowed ? jerseyLabel(players.get(playerId)) : null,
        title: "This entry",
        selected: true,
      },
    ];
  }, [rows, statType, editingId, players, origin, dest, playerId, outcome, shotResult, playerAllowed]);

  const submit = () => {
    if (!ready || pending) return;
    // A tally logged without ever placing a point or switching type (the
    // default tab, hit straight away) still deserves a real timestamp.
    const atMs = stampMs ?? engine.snapshot.positionMs;
    const input: Omit<StatInput, "matchId"> = {
      statType,
      outcome,
      playerId: playerAllowed ? playerId || null : null,
      originX: origin?.x ?? null,
      originY: origin?.y ?? null,
      destX: dest?.x ?? null,
      destY: dest?.y ?? null,
      shotResult,
      ledToScore: statType === "turnover" && outcome === "positive" ? ledToScore : null,
      puckoutTakenBy: statType === "puckout" ? puckoutTakenBy : null,
      clipId: entryClipId,
      videoId,
      atMs,
    };

    startTransition(async () => {
      try {
        if (editingId) {
          const saved = await updateMatchStat(editingId, input);
          setRows((prev) => prev.map((r) => (r.id === editingId ? saved : r)));
        } else {
          const saved = await logMatchStat({ ...input, matchId });
          setRows((prev) => [...prev, saved]);
        }
        resetEntry();
      } catch (err) {
        setError((err as Error).message || "That entry could not be saved.");
      }
    });
  };

  const edit = (row: StatRow) => {
    setEditingId(row.id);
    setStatType(row.statType);
    setOutcome(row.outcome);
    setShotResult(row.shotResult);
    setLedToScore(Boolean(row.ledToScore));
    setPuckoutTakenBy(row.puckoutTakenBy ?? "us");
    setPlayerId(row.playerId ?? "");
    setEntryClipId(row.clipId);
    setStampMs(row.atMs);
    setOrigin(row.originX != null && row.originY != null ? { x: row.originX, y: row.originY } : null);
    setDest(row.destX != null && row.destY != null ? { x: row.destX, y: row.destY } : null);
    setError(null);
  };

  const remove = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    if (editingId === id) resetEntry();
    startTransition(async () => {
      try {
        await deleteMatchStat(id);
      } catch (err) {
        setError((err as Error).message || "That entry could not be deleted.");
      }
    });
  };

  const newest = [...rows].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
      <div className="flex flex-wrap gap-1 border-b pb-2" style={{ borderColor: "var(--color-line)" }}>
        {STAT_TYPES.map((t) => {
          const m = STAT_TYPE_META[t];
          const here = t === statType;
          return (
            <button
              key={t}
              onClick={() => chooseType(t)}
              aria-pressed={here}
              className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-[13px] transition-colors ${here ? "here" : ""}`}
              style={{ color: here ? "var(--color-ink)" : "var(--color-ink-dim)" }}
            >
              <span className="kbd">{m.hotkey}</span>
              {m.label}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-[13px]" style={{ color: "var(--color-ink-dim)" }}>
        {meta.hint}
      </p>

      {/* Watching one kind back. The entries are timestamped, so stepping
          through every delivery is two buttons rather than a search. */}
      <div className="mt-2 flex items-center gap-2">
        <span className="tabular text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          {ofThisType.length} logged
        </span>
        <div className="flex-1" />
        <button
          onClick={() => step(-1)}
          disabled={!timedOfThisType.length}
          title={`Previous ${meta.label.toLowerCase()}`}
          className="btn-ghost px-1.5 py-0.5 text-xs disabled:opacity-35"
        >
          ◀
        </button>
        <span className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          Watch {meta.plural.toLowerCase()}
        </span>
        <button
          onClick={() => step(1)}
          disabled={!timedOfThisType.length}
          title={`Next ${meta.label.toLowerCase()}`}
          className="btn-ghost px-1.5 py-0.5 text-xs disabled:opacity-35"
        >
          ▶
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {statType === "puckout" && (
          <Choice
            label="Whose poc amach"
            options={[
              { value: "us", label: "Ours" },
              { value: "opposition", label: "Theirs" },
            ]}
            value={puckoutTakenBy}
            onChange={(v) => setPuckoutTakenBy(v as PuckoutSide)}
          />
        )}

        {statType === "puckout" ? (
          <Choice
            label="Who won the break"
            options={PUCKOUT_WINNERS.map((w) => ({
              value: w.value,
              label: w.label,
              colour: OUTCOME_COLOURS[puckoutOutcome(w.value)],
            }))}
            value={outcome ? puckoutWinner(outcome) : null}
            onChange={(v) => setOutcome(puckoutOutcome(v as PuckoutWinner))}
          />
        ) : statType === "shot" ? (
          <Choice
            label="Result"
            options={SHOT_RESULTS.map((r) => ({
              value: r,
              label: SHOT_RESULT_LABELS[r],
              colour: r === "wide" ? OUTCOME_COLOURS.negative : OUTCOME_COLOURS.positive,
            }))}
            value={shotResult}
            onChange={(v) => setShotResult(v as ShotResult)}
          />
        ) : meta.outcomes.length > 0 ? (
          <Choice
            label="How it ended"
            options={meta.outcomes.map((o) => ({
              value: o,
              label: outcomeLabel(statType, o),
              colour: OUTCOME_COLOURS[o],
            }))}
            value={outcome}
            onChange={(v) => setOutcome(v as StatOutcome)}
          />
        ) : null}

        {statType === "turnover" && outcome === "positive" && (
          <label className="flex w-fit items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={ledToScore}
              onChange={(e) => setLedToScore(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-brand)]"
            />
            We scored from it
          </label>
        )}

        <div>
          <label className="label mb-1.5 block" htmlFor="pad-player">
            Player
          </label>
          <select
            id="pad-player"
            value={playerId}
            disabled={!playerAllowed}
            onChange={(e) => setPlayerId(e.target.value)}
            className="field"
          >
            <option value="">Nobody named</option>
            {panel.map((p) => (
              <option key={p.id} value={p.id}>
                {playerLabel(p)}
              </option>
            ))}
          </select>
        </div>

        {meta.points > 0 && (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="label">Where on the pitch</span>
              <span className="text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
                {meta.points === 2
                  ? !origin
                    ? "Struck from…"
                    : !dest
                      ? "…landed"
                      : "Click to start over"
                  : origin
                    ? "Click to move it"
                    : "Click to place"}
              </span>
            </div>
            <PitchMap marks={marks} onPlace={placePoint} />
          </div>
        )}

        <div className="flex items-center justify-between gap-2 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          <span>{stampMs != null ? `Timed at ${formatClock(stampMs)}` : "Timed when you start"}</span>
          <button onClick={() => setStampMs(engine.snapshot.positionMs)} className="btn-ghost px-1.5 py-0.5">
            Use now
          </button>
        </div>

        {error && (
          <p
            className="rounded px-3 py-2 text-[13px]"
            style={{
              background: "color-mix(in oklab, var(--color-danger) 20%, transparent)",
              color: "var(--color-ink)",
            }}
          >
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 border-t pt-4" style={{ borderColor: "var(--color-line)" }}>
          <button onClick={submit} disabled={!ready || pending} className="btn-primary text-sm">
            {editingId ? "Save changes" : `Log ${meta.label.toLowerCase()}`}
          </button>
          {editingId && (
            <button onClick={resetEntry} className="btn-ghost text-xs">
              Cancel
              <span className="kbd">Esc</span>
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 flex min-h-0 flex-1 flex-col border-t pt-3" style={{ borderColor: "var(--color-line-strong)" }}>
        <div className="flex shrink-0 items-baseline justify-between">
          <h2 className="title text-sm">Logged so far</h2>
          <span className="tabular text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            {rows.length}
          </span>
        </div>

        {newest.length === 0 ? (
          <p className="py-4 text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
            Nothing yet. Watch, then press <span className="kbd">1</span>–<span className="kbd">6</span>.
          </p>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {newest.map((r) => {
              const player = r.playerId ? players.get(r.playerId) : undefined;
              const rowOutcome = effectiveOutcome(r);
              const shape = rowOutcome ? statShape(r) : "filled";
              const colour = rowOutcome ? statColour(r) : "var(--color-line-strong)";
              return (
                <li
                  key={r.id}
                  className="fixture group flex items-start gap-2 py-2"
                  style={{ background: r.id === editingId ? "var(--color-surface-2)" : undefined }}
                >
                  <span
                    aria-hidden
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{
                      background: shape === "filled" ? colour : "transparent",
                      border: shape === "filled" ? "none" : `2px ${shape === "dashed" ? "dashed" : "solid"} ${colour}`,
                    }}
                  />
                  <button
                    onClick={() => r.atMs != null && onJump(r)}
                    disabled={r.atMs == null}
                    title={r.atMs != null ? "Watch this back" : "Logged without footage open"}
                    className="min-w-0 flex-1 text-left disabled:cursor-default"
                  >
                    <div className="text-[13px]">{describeStat(r)}</div>
                    <div className="text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
                      {player ? playerLabel(player) : "Nobody named"}
                      {r.atMs != null && `, ${formatClock(r.atMs)}`}
                    </div>
                  </button>
                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <button onClick={() => edit(r)} className="px-1 text-[11px]" style={{ color: "var(--color-ink-dim)" }}>
                      Edit
                    </button>
                    <button onClick={() => remove(r.id)} className="px-1 text-[11px]" style={{ color: "var(--color-danger-ink)" }}>
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
