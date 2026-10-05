"use client";

/**
 * Logging the stat sheet after a match.
 *
 * The form follows how the notebook is actually read back: a type, an
 * outcome, sometimes a name, sometimes a place. A tackle is two clicks; a
 * shot carries the most, because the summary sheet asks the most of it —
 * whose, from play or a free, how it ended, what it came from. Number keys
 * switch type, so a whole sheet can be typed up without the mouse leaving the
 * pitch. The questions themselves live in StatFields, shared with the pad.
 *
 * Entries are listed, editable and deletable here, the same as clips are in
 * the review workspace — a stat sheet is typed up in one sitting and always
 * has a few corrections in it.
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { PitchMap, type PitchMark } from "@/components/pitch/PitchMap";
import { deleteMatchStat, logMatchStat, updateMatchStat } from "@/lib/actions/stats";
import {
  STAT_TYPES,
  STAT_TYPE_META,
  describeStat,
  effectiveOutcome,
  statColour,
  statShape,
  type StatType,
} from "@/lib/hurling/stats";
import {
  EMPTY_DETAIL,
  StatFields,
  detailForType,
  detailFromRow,
  detailReady,
  detailToDraft,
  nextDetail,
  playerAllowed,
  typedNumber,
  type StatDetail,
} from "./StatFields";
import {
  numberSheet,
  playerLabel,
  statMarks,
  type SheetEntry,
  type StatMatchInfo,
  type StatRow,
} from "./types";
import { matchDateLong } from "@/lib/format";
import { formatClock } from "@/lib/hurling/notation";

type ClipOption = { id: string; label: string };

export function StatLogger({
  match,
  numbers,
  initialRows,
  clips,
}: {
  match: StatMatchInfo;
  /** Who wore what in this match, so far. */
  numbers: SheetEntry[];
  initialRows: StatRow[];
  clips: ClipOption[];
}) {
  const [rows, setRows] = useState<StatRow[]>(initialRows);
  const [statType, setStatType] = useState<StatType>("tackle");
  const [detail, setDetail] = useState<StatDetail>(EMPTY_DETAIL);
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
  const sheet = useMemo(() => numberSheet(numbers), [numbers]);
  const named = playerAllowed(statType, detail);
  const ready = detailReady(statType, detail);
  const patch = (p: Partial<StatDetail>) => setDetail((d) => ({ ...d, ...p }));

  /** Keep the type and the context, drop the details — the next entry is a different moment. */
  const resetEntry = () => {
    setDetail(nextDetail);
    setClipId("");
    setEntryVideo({ videoId: null, atMs: null });
    setOrigin(null);
    setDest(null);
    setEditingId(null);
    setError(null);
  };

  const chooseType = (next: StatType) => {
    setStatType(next);
    setDetail(detailForType);
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
      sheet,
      { muted: true },
    );
    if (!origin) return existing;

    const draft = detailToDraft(statType, detail);
    const entry = { ...draft, outcome: draft.outcome ?? null };
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
        colour: statColour(entry),
        shape: statShape(entry),
        label: named ? (typedNumber(detail.playerNumber)?.toString() ?? null) : null,
        title: "This entry",
        selected: true,
      },
    ];
  }, [rows, statType, editingId, sheet, origin, dest, detail, named]);

  /* ---------------------------------------------------------- submitting */

  const submit = () => {
    if (!ready || pending) return;
    const input = {
      ...detailToDraft(statType, detail),
      originX: origin?.x ?? null,
      originY: origin?.y ?? null,
      destX: dest?.x ?? null,
      destY: dest?.y ?? null,
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
    setDetail(detailFromRow(row));
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
        <div className="flex items-center gap-2">
          <Link href={`/matches/${match.id}/numbers`} className="btn-outline text-xs">
            Put names to numbers
          </Link>
          <Link href={`/matches/${match.id}/stats`} className="btn-outline text-xs">
            See the report
          </Link>
        </div>
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
            <StatFields
              statType={statType}
              detail={detail}
              onChange={patch}
              sheet={sheet}
              idPrefix="stat"
              halfNote={detail.half ? undefined : "Pick it once; it stays set for the entries after."}
            />

            {clips.length > 0 && (
              <div className="sm:w-1/2 sm:pr-2">
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
              Nothing yet. Press <span className="kbd">1</span>–<span className="kbd">7</span> to
              pick what happened, then log it.
            </p>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {newest.map((r) => {
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
                        {playerLabel(r.playerNumber, sheet)}
                        {r.half && `, ${r.half === 1 ? "1st" : "2nd"} half`}
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
