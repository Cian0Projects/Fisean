"use client";

/**
 * Logging the stat sheet after a match.
 *
 * The form follows how the notebook is actually read back: a type, an
 * outcome, sometimes a name, sometimes a place. A tackle is two clicks; a
 * delivery is the slowest at five, because it genuinely carries five pieces
 * of information. Number keys switch type, so a whole sheet can be typed up
 * without the mouse leaving the pitch.
 *
 * Entries are listed, editable and deletable here, the same as clips are in
 * the review workspace — a stat sheet is typed up in one sitting and always
 * has a few corrections in it.
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { PitchMap, type PitchMark } from "@/components/pitch/PitchMap";
import {
  deleteMatchStat,
  logMatchStat,
  updateMatchStat,
  type StatInput,
} from "@/lib/actions/stats";
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
  type PuckoutSide,
  type PuckoutWinner,
  type ShotResult,
  type StatOutcome,
  type StatType,
} from "@/lib/hurling/stats";
import {
  jerseyLabel,
  playerLabel,
  statMarks,
  type StatMatchInfo,
  type StatPlayer,
  type StatRow,
} from "./types";
import { matchDateLong } from "@/lib/format";
import { formatClock } from "@/lib/hurling/notation";

type ClipOption = { id: string; label: string };

const PUCKOUT_WINNERS: { value: PuckoutWinner; label: string }[] = [
  { value: "us", label: "We won it" },
  { value: "opposition", label: "They won it" },
  { value: "unclear", label: "Broke unclear" },
];

export function StatLogger({
  match,
  panel,
  initialRows,
  clips,
}: {
  match: StatMatchInfo;
  panel: StatPlayer[];
  initialRows: StatRow[];
  clips: ClipOption[];
}) {
  const [rows, setRows] = useState<StatRow[]>(initialRows);
  const [statType, setStatType] = useState<StatType>("tackle");
  const [outcome, setOutcome] = useState<StatOutcome | null>(null);
  const [shotResult, setShotResult] = useState<ShotResult | null>(null);
  const [puckoutTakenBy, setPuckoutTakenBy] = useState<PuckoutSide>("us");
  const [ledToScore, setLedToScore] = useState(false);
  const [playerId, setPlayerId] = useState("");
  const [clipId, setClipId] = useState("");
  // A timestamp set by the live logging pad in the review workspace. This
  // page has no video open to read one from, so it only ever carries one
  // through unchanged from an entry being edited — never sets one itself.
  const [entryVideo, setEntryVideo] = useState<{ videoId: string | null; atMs: number | null }>({
    videoId: null,
    atMs: null,
  });
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [dest, setDest] = useState<{ x: number; y: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const meta = STAT_TYPE_META[statType];
  const players = useMemo(() => new Map(panel.map((p) => [p.id, p])), [panel]);

  /** A poc amach names the receiver, so only one we won takes a player. */
  const playerAllowed = statType !== "puckout" || outcome === "positive";

  const ready =
    (meta.outcomes.length === 0 || outcome !== null) &&
    (statType !== "shot" || shotResult !== null);

  /** Keep the type, drop the details — the next entry is a different moment. */
  const resetEntry = () => {
    setOutcome(null);
    setShotResult(null);
    setLedToScore(false);
    setPlayerId("");
    setClipId("");
    setEntryVideo({ videoId: null, atMs: null });
    setOrigin(null);
    setDest(null);
    setEditingId(null);
    setError(null);
  };

  const chooseType = (next: StatType) => {
    setStatType(next);
    setOutcome(null);
    setShotResult(null);
    setLedToScore(false);
    setDest(null);
    if (STAT_TYPE_META[next].points === 0) setOrigin(null);
  };

  /**
   * Number keys pick the stat type. One listener, and it stands down whenever
   * the keyboard belongs to a field — the same rule the review workspace uses.
   */
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
    // Everything the handler calls only sets state, which React keeps stable,
    // so `editingId` is the one value it actually has to read back.
  }, [editingId]);

  /* ------------------------------------------------------------ the map */

  const placePoint = (p: { x: number; y: number }) => {
    if (meta.points === 0) return;
    if (meta.points === 1) {
      setOrigin(p);
      return;
    }
    // Two points: struck from, then landed. A third click starts again.
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
        // The entry being built is coloured and shaped by the same rules as a
        // saved one, so the mark settles as the outcome is picked.
        colour: statColour(draft),
        shape: statShape(draft),
        label: playerAllowed ? jerseyLabel(players.get(playerId)) : null,
        title: "This entry",
        selected: true,
      },
    ];
  }, [
    rows,
    statType,
    editingId,
    players,
    origin,
    dest,
    playerId,
    outcome,
    shotResult,
    playerAllowed,
  ]);

  /* ---------------------------------------------------------- submitting */

  const submit = () => {
    if (!ready || pending) return;
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
      clipId: clipId || null,
      videoId: entryVideo.videoId,
      atMs: entryVideo.atMs,
    };

    startTransition(async () => {
      try {
        if (editingId) {
          const saved = await updateMatchStat(editingId, input);
          setRows((prev) => prev.map((r) => (r.id === editingId ? saved : r)));
        } else {
          const saved = await logMatchStat({ ...input, matchId: match.id });
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
    setClipId(row.clipId ?? "");
    setEntryVideo({ videoId: row.videoId, atMs: row.atMs });
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
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-16">
      <header
        className="flex flex-wrap items-end justify-between gap-4 border-b pb-5"
        style={{ borderColor: "var(--color-line-strong)" }}
      >
        <div>
          <p className="text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
            Logging the stat sheet — {matchDateLong(match.playedOn)}
          </p>
          <h1 className="display mt-1.5 text-[clamp(2rem,5vw,3rem)]">{match.opponent}</h1>
        </div>
        <Link href={`/matches/${match.id}/stats`} className="btn-outline text-xs">
          See the report
        </Link>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section>
          {/* Type first: it decides what the rest of the form even asks. */}
          <div
            className="flex flex-wrap items-stretch border-b"
            style={{ borderColor: "var(--color-line)" }}
          >
            {STAT_TYPES.map((t) => {
              const m = STAT_TYPE_META[t];
              const here = t === statType;
              return (
                <button
                  key={t}
                  onClick={() => chooseType(t)}
                  aria-pressed={here}
                  className={`flex items-center gap-2 px-3 py-2.5 text-[14px] transition-colors ${here ? "here" : ""}`}
                  style={{ color: here ? "var(--color-ink)" : "var(--color-ink-dim)" }}
                >
                  <span className="kbd">{m.hotkey}</span>
                  {m.label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
              {meta.hint}
            </p>
            <p className="tabular text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
              {rows.filter((r) => r.statType === statType).length} logged
            </p>
          </div>

          <div className="mt-6 space-y-6">
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
              <label className="flex w-fit items-center gap-2.5 text-[14px]">
                <input
                  type="checkbox"
                  checked={ledToScore}
                  onChange={(e) => setLedToScore(e.target.checked)}
                  className="h-4 w-4 accent-[var(--color-brand)]"
                />
                We scored from it
              </label>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label mb-1.5 block" htmlFor="stat-player">
                  Player
                </label>
                <select
                  id="stat-player"
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
                {!playerAllowed && (
                  <p className="mt-1.5 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                    A poc amach names the receiver, so only one we won takes a player.
                  </p>
                )}
              </div>

              {clips.length > 0 && (
                <div>
                  <label className="label mb-1.5 block" htmlFor="stat-clip">
                    Clip of the moment
                  </label>
                  <select
                    id="stat-clip"
                    value={clipId}
                    onChange={(e) => setClipId(e.target.value)}
                    className="field"
                  >
                    <option value="">None</option>
                    {clips.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {meta.points > 0 && (
              <div>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="label">Where on the pitch</span>
                  <span className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                    {meta.points === 2
                      ? !origin
                        ? "Click where it was struck from"
                        : !dest
                          ? "Now click where it landed"
                          : "Click again to start over"
                      : origin
                        ? "Click again to move it"
                        : "Click the pitch, or leave it unplaced"}
                  </span>
                </div>
                <PitchMap marks={marks} onPlace={placePoint} />
                {(origin || dest) && (
                  <button
                    onClick={() => {
                      setOrigin(null);
                      setDest(null);
                    }}
                    className="btn-ghost mt-1.5 text-xs"
                  >
                    Clear the point{meta.points === 2 ? "s" : ""}
                  </button>
                )}
              </div>
            )}

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

            <div
              className="flex items-center gap-3 border-t pt-5"
              style={{ borderColor: "var(--color-line)" }}
            >
              <button onClick={submit} disabled={!ready || pending} className="btn-primary">
                {editingId ? "Save changes" : `Log this ${meta.label.toLowerCase()}`}
              </button>
              {editingId && (
                <button onClick={resetEntry} className="btn-ghost text-xs">
                  Cancel
                  <span className="kbd">Esc</span>
                </button>
              )}
              {!editingId && !ready && (
                <span className="text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
                  Pick how it ended first
                </span>
              )}
            </div>
          </div>
        </section>

        <section className="flex max-h-[44rem] min-h-0 flex-col">
          <div
            className="flex shrink-0 items-baseline justify-between border-b pb-2"
            style={{ borderColor: "var(--color-line-strong)" }}
          >
            <h2 className="title text-base">Logged so far</h2>
            <span className="tabular text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
              {rows.length}
            </span>
          </div>

          {newest.length === 0 ? (
            <p className="py-8 text-[14px]" style={{ color: "var(--color-ink-faint)" }}>
              Nothing yet. Press <span className="kbd">1</span>–<span className="kbd">6</span> to
              pick what happened, then log it.
            </p>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {newest.map((r) => {
                const player = r.playerId ? players.get(r.playerId) : undefined;
                // A tackle has no outcome axis, so it gets a plain mark rather
                // than borrowing the one that means "unclear".
                const outcome = effectiveOutcome(r);
                const shape = outcome ? statShape(r) : "filled";
                const colour = outcome ? statColour(r) : "var(--color-line-strong)";
                return (
                  <li
                    key={r.id}
                    className="fixture group flex items-start gap-2.5 py-2.5"
                    style={{
                      background: r.id === editingId ? "var(--color-surface-2)" : undefined,
                    }}
                  >
                    <span
                      aria-hidden
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        background: shape === "filled" ? colour : "transparent",
                        border:
                          shape === "filled"
                            ? "none"
                            : `2px ${shape === "dashed" ? "dashed" : "solid"} ${colour}`,
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px]">{describeStat(r)}</div>
                      <div className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                        {player ? playerLabel(player) : "Nobody named"}
                        {r.originX != null && ", placed"}
                        {r.atMs != null && `, ${formatClock(r.atMs)}`}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        onClick={() => edit(r)}
                        className="px-1 text-[12px]"
                        style={{ color: "var(--color-ink-dim)" }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => remove(r.id)}
                        className="px-1 text-[12px]"
                        style={{ color: "var(--color-danger-ink)" }}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

/**
 * A row of mutually exclusive choices — faster to hit than a dropdown.
 * Shared with `StatPad`, the compact form embedded in the review workspace.
 */
export function Choice({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string; colour?: string }[];
  value: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <span className="label mb-1.5 block">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = o.value === value;
          const accent = o.colour ?? "var(--color-ash)";
          return (
            <button
              key={o.value}
              onClick={() => onChange(o.value)}
              aria-pressed={active}
              className="inline-flex items-center gap-2 rounded px-3 py-2 text-[14px] transition-colors"
              style={{
                border: `1px solid ${active ? accent : "var(--color-line-strong)"}`,
                background: active
                  ? `color-mix(in oklab, ${accent} 16%, transparent)`
                  : "transparent",
                color: active ? "var(--color-ink)" : "var(--color-ink-dim)",
              }}
            >
              {o.colour && (
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: o.colour }}
                />
              )}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
