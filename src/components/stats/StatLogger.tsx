"use client";

/**
 * Logging the stat sheet on the line, or off a stream.
 *
 * Each coach logging keeps their own clock (MatchClock) and their own
 * entries: nothing here shows or touches anyone else's. The form is locked
 * until throw-in is tapped, and again over half time and after full time, so
 * every entry has a half and a time from that clock, and the half is never
 * picked by hand. The entries stay this coach's own until they submit them
 * at full time; after that the other coaches see them, fixes included.
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
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { PitchMap, type PitchMark } from "@/components/pitch/PitchMap";
import { VIEW_W, pitchViewHeight } from "@/components/pitch/PitchMarkings";
import { deleteMatchStat, logMatchStat, updateMatchStat } from "@/lib/actions/stats";
import { setHalfLength } from "@/lib/actions/admin";
import {
  STAT_TYPE_SHAPE,
  statVocabulary,
  describeStat,
  effectiveOutcome,
  resultFromWhere,
  statColour,
  statShape,
  statTiming,
  type StatType,
} from "@/lib/hurling/stats";
import {
  ARC_NOTE,
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
  whoLabel,
  statMarks,
  type SheetEntry,
  type StatMatchInfo,
  type StatRow,
} from "./types";
import { matchDateLong } from "@/lib/format";
import { formatGameClock } from "@/lib/hurling/notation";
import type { GameCode } from "@/lib/hurling/codes";
import { clockOf, clockShift, shiftedHalfMs } from "@/lib/hurling/live-clock";
import { MatchClock, useMatchClock, type LoggerClock } from "./MatchClock";
import { HalfLength } from "./HalfLength";
import { VoiceBar, useVoiceEntry } from "./VoiceEntry";

type ClipOption = { id: string; label: string };

export function StatLogger({
  match,
  code,
  numbers,
  initialRows,
  clips,
  clock: initialClock,
  halfLengthMin: initialHalfLengthMin,
}: {
  match: StatMatchInfo;
  /** The club's code: it words the sheet, and decides whether a two-pointer can be logged. */
  code: GameCode;
  /** This logger's own clock as it stood when the page loaded. */
  clock: LoggerClock;
  halfLengthMin: number;
  /** Who wore what in this match, so far. */
  numbers: SheetEntry[];
  /** This logger's own entries: nobody else's are shown or touched here. */
  initialRows: StatRow[];
  clips: ClipOption[];
}) {
  const [rows, setRows] = useState<StatRow[]>(initialRows);
  // Changeable here, for the challenge game made on 30 that plays fifteens.
  const [halfLengthMin, setHalfLengthMinState] = useState(initialHalfLengthMin);
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
  // When this entry was seen, as its half and how far into it by this
  // logger's clock: stamped by the first thing the coach does towards it,
  // not when they press log, because describing it takes a few seconds and
  // the play has moved on by then.
  const [seen, setSeen] = useState<{ half: 1 | 2; halfMs: number } | null>(null);
  // An entry from before each logger kept their own clock carries the time
  // of day it was seen instead. Edited here, that is carried through as is.
  const [keptSeenAt, setKeptSeenAt] = useState<number | null>(null);
  const clock = useMatchClock(initialClock, halfLengthMin);
  const [swapped, turn] = useEndsSwapped(match.id);
  // The teams change ends at half time, so the pitch turns round by itself
  // for the second half. Swap ends is only for which side of the ground
  // this logger stands on.
  const turned = swapped !== (clock.whistles.secondHalf != null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [dest, setDest] = useState<{ x: number; y: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Nothing new can be logged until a half is on. Fixing an entry already
  // logged can happen any time.
  const locked = !editingId && !clock.open;

  const vocabulary = statVocabulary(code);
  const meta = vocabulary.meta[statType];
  const sheet = useMemo(() => numberSheet(numbers), [numbers]);
  const named = playerAllowed(statType, detail);
  const ready = detailReady(statType, detail);
  const patch = (p: Partial<StatDetail>) => {
    voice.pin(p);
    setDetail((d) => ({ ...d, ...p }));
  };
  // A point marked outside the arc is shown, and logged, as the two-pointer
  // it is. Derived rather than stored, so moving the mark back inside the arc
  // makes it a point again.
  const shotResult = resultFromWhere(detail.shotResult, origin, code);
  const shown = useMemo(
    () => (shotResult === detail.shotResult ? detail : { ...detail, shotResult }),
    [detail, shotResult],
  );

  /** Keep the type and the context, drop the details — the next entry is a different moment. */
  const resetEntry = () => {
    setDetail(nextDetail);
    setClipId("");
    setEntryVideo({ videoId: null, atMs: null });
    setSeen(null);
    setKeptSeenAt(null);
    setOrigin(null);
    setDest(null);
    setEditingId(null);
    setError(null);
  };

  const chooseType = (next: StatType) => {
    setStatType(next);
    setDetail(detailForType);
    setDest(null);
    if (STAT_TYPE_SHAPE[next].points === 0) setOrigin(null);
  };

  /**
   * Stamp the entry the first time the coach touches it. Left alone when
   * editing: an old entry keeps the moment it was seen.
   */
  const startEntry = () => {
    if (editingId || seen !== null) return;
    setSeen(clock.momentNow());
  };

  const voice = useVoiceEntry({
    statTypes: vocabulary.statTypes,
    statType,
    detail,
    chooseType,
    setDetail,
    onStart: startEntry,
    onRetake: () => {
      setOrigin(null);
      setDest(null);
    },
  });

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
      const found = vocabulary.statTypes.find((t) => STAT_TYPE_SHAPE[t].hotkey === e.key);
      if (found) {
        e.preventDefault();
        chooseType(found);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // Everything the handler calls only sets state, which React keeps stable,
    // so `editingId` is the one value it actually has to read back.
  }, [editingId, vocabulary]);

  /* ------------------------------------------------------------ the map */

  const placePoint = (p: { x: number; y: number }) => {
    if (meta.points === 0) return;
    startEntry();
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
      code,
      { muted: true },
    );
    if (!origin) return existing;

    const draft = detailToDraft(statType, shown);
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
  }, [rows, statType, editingId, sheet, code, origin, dest, detail, shown, named]);

  /* ---------------------------------------------------------- submitting */

  const submit = () => {
    if (!ready || pending) return;
    // Logged without touching anything first (the type already showing,
    // straight to log): now is the best there is.
    const when = editingId ? seen : (seen ?? clock.momentNow());
    if (!editingId && !when) {
      setError("Tap the next whistle first. Stats are logged while a half is on.");
      return;
    }
    voice.stop();
    const draft = detailToDraft(statType, shown);
    const input = {
      ...draft,
      // The half is the clock's, never picked: it was settled by the whistles.
      half: when?.half ?? draft.half,
      halfMs: when?.halfMs ?? null,
      originX: origin?.x ?? null,
      originY: origin?.y ?? null,
      destX: dest?.x ?? null,
      destY: dest?.y ?? null,
      clipId: clipId || null,
      videoId: entryVideo.videoId,
      atMs: entryVideo.atMs,
      seenAt: editingId ? keptSeenAt : null,
      voiceHeard: voice.heard || null,
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
        voice.reset();
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
    setSeen(row.half && row.halfMs != null ? { half: row.half, halfMs: row.halfMs } : null);
    setKeptSeenAt(row.seenAt);
    setOrigin(row.originX != null && row.originY != null ? { x: row.originX, y: row.originY } : null);
    setDest(row.destX != null && row.destY != null ? { x: row.destX, y: row.destY } : null);
    setError(null);
    // The list sits under the form now, so bring the form back into view.
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    <main className="px-4 pt-4 pb-12 lg:px-6">
      {/* One screen during a match: nothing a logger needs between seeing
          it and logging it may sit below the fold. So the header is a line,
          the pitch takes the width, every question sits in one panel beside
          it with the log button at its foot, and the running list waits
          underneath, where it is only needed for a correction. */}
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="title truncate text-xl">{match.opponent}</h1>
          <span className="text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
            {matchDateLong(match.playedOn)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/matches/${match.id}/numbers`} className="btn-ghost text-xs">
            Put names to numbers
          </Link>
          <Link href={`/matches/${match.id}/stats`} className="btn-ghost text-xs">
            See the report
          </Link>
        </div>
      </header>

      <div className="mt-3">
        <MatchClock
          matchId={match.id}
          clock={clock}
          onClockSet={(before, after) => {
            // The server moved the same entries by the same amount.
            const shift = clockShift(before, after);
            setRows((prev) =>
              prev.map((r) =>
                r.videoId == null && r.half && r.halfMs != null
                  ? { ...r, halfMs: shiftedHalfMs(r.halfMs, shift[r.half]) }
                  : r,
              ),
            );
          }}
          onSubmitted={() => setRows((prev) => prev.map((r) => ({ ...r, draft: false })))}
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[12px]" style={{ color: "var(--color-ink-dim)" }}>
            Halves of
          </span>
          <HalfLength
            compact
            value={halfLengthMin}
            onChange={(minutes) => {
              const before = halfLengthMin;
              setHalfLengthMinState(minutes);
              setHalfLength(match.id, minutes).catch((err) => {
                setHalfLengthMinState(before);
                setError((err as Error).message);
              });
            }}
          />
        </div>
      </div>

      {/* The pitch is as wide as the screen's height allows, so its bottom
          edge stays in sight, and it sits hard left. On a narrower screen
          (a tablet on its side) it also gives way to the panel, which keeps
          at least 30rem: enough to pack its questions a few to a row, which
          is what keeps a shot, the longest form, on the screen. The panel
          takes whatever is left beyond that. */}
      <div
        className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,max(26rem,min(calc((100dvh_-_19rem)_*_var(--pitch-ratio)),calc(100vw_-_34.5rem))))_minmax(23rem,1fr)]"
        style={{ "--pitch-ratio": String(VIEW_W / pitchViewHeight()) } as CSSProperties}
      >
        {/* ------------------------------------------------------ the pitch */}
        <section
          className="min-w-0 transition-opacity"
          // Faded and out of reach until a whistle starts a half.
          inert={locked}
          style={{ opacity: locked ? 0.35 : 1 }}
        >
          <div className="mb-1.5 flex items-center gap-3">
            <span className="label">Where on the pitch</span>
            <button
              onClick={turn}
              aria-pressed={turned}
              title="Standing on the other side of the ground? Turn the pitch round. It turns again by itself for the 2nd half."
              className="btn-ghost px-2 py-1 text-xs"
            >
              Swap ends
            </button>
            <span className="ml-auto text-right text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
              {meta.points === 2
                ? !origin
                  ? "Tap where it was struck from"
                  : !dest
                    ? "Now tap where it landed"
                    : "Tap again to start over"
                : origin
                  ? "Tap again to move it"
                  : "Tap the pitch, or leave it unplaced"}
            </span>
          </div>
          <PitchMap marks={marks} onPlace={placePoint} turned={turned} code={code} />
          <div className="mt-1.5 flex min-h-7 flex-wrap items-center justify-between gap-2">
            <p className="text-[13px]" style={{ color: "var(--color-ink-dim)" }}>
              {meta.hint}
            </p>
            {(origin || dest) && (
              <button
                onClick={() => {
                  setOrigin(null);
                  setDest(null);
                }}
                className="btn-ghost text-xs"
              >
                Clear the point{meta.points === 2 ? "s" : ""}
              </button>
            )}
          </div>
        </section>

        {/* ---------------------------------------------------- the details */}
        <section
          className="@container flex min-w-0 flex-col transition-opacity lg:border-l lg:pl-6"
          inert={locked}
          style={{ borderColor: "var(--color-line)", opacity: locked ? 0.35 : 1 }}
        >
          {/* Type first: it decides what the rest of the panel even asks.
              Each button only as wide as its name, so they share rows. */}
          <div className="flex flex-wrap gap-1.5">
            {vocabulary.statTypes.map((t) => {
              const m = vocabulary.meta[t];
              const here = t === statType;
              return (
                <button
                  key={t}
                  onClick={() => {
                    startEntry();
                    chooseType(t);
                  }}
                  aria-pressed={here}
                  className="flex items-center gap-1.5 rounded px-2 py-1.5 text-left text-[14px] transition-colors pointer-coarse:px-3 pointer-coarse:py-2.5"
                  style={{
                    border: `1px solid ${here ? "var(--color-ink)" : "var(--color-line-strong)"}`,
                    background: here ? "var(--color-surface-2)" : "transparent",
                    color: here ? "var(--color-ink)" : "var(--color-ink-dim)",
                  }}
                >
                  {/* No keys to press on a touch screen. */}
                  <span className="kbd pointer-coarse:hidden">{m.hotkey}</span>
                  {m.label}
                  {rows.some((r) => r.statType === t) && (
                    <span className="tabular text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                      {rows.filter((r) => r.statType === t).length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-3">
            <VoiceBar voice={voice} onDiscard={resetEntry} />
          </div>

          {/* The questions pack left to right, each as wide as its answers,
              rather than into equal columns that leave a short question
              stranded in a wide one. A long one (a shot's result) wraps
              onto its own row. */}
          <div className="mt-3 flex flex-wrap items-start gap-x-7 gap-y-3 *:max-w-full *:min-w-0">
            <StatFields
              vocabulary={vocabulary}
              statType={statType}
              detail={shown}
              onChange={patch}
              sheet={sheet}
              idPrefix="stat"
              resultNote={shown !== detail ? ARC_NOTE : undefined}
              // The whistles settle the half; there is nothing to pick.
              halfFixed
            />

            {clips.length > 0 && (
              <div className="basis-full">
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

            {error && (
              <p
                className="basis-full rounded px-3 py-2 text-[13px]"
                style={{
                  background: "color-mix(in oklab, var(--color-danger) 20%, transparent)",
                  color: "var(--color-ink)",
                }}
              >
                {error}
              </p>
            )}
          </div>

          {/* On a phone the column runs past the fold, so the log button
              stays pinned to the bottom of the screen, under the thumb,
              whichever question is in view. */}
          <div
            className="sticky bottom-0 z-10 -mx-4 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] lg:static lg:mx-0 lg:px-0 lg:pb-0"
            style={{ borderColor: "var(--color-line)", background: "var(--color-stage)" }}
          >
            <button onClick={submit} disabled={!ready || pending} className="btn-primary max-lg:min-h-12 max-lg:flex-1">
              {editingId ? "Save changes" : `Log this ${meta.label.toLowerCase()}`}
            </button>
            {editingId && (
              <button
                onClick={() => {
                  resetEntry();
                  voice.reset();
                }}
                className="btn-ghost text-xs"
              >
                Cancel
                <span className="kbd">Esc</span>
              </button>
            )}
            {!editingId && !ready && (
              <span className="text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
                Pick how it ended first
              </span>
            )}
            {seen != null && (
              <span className="tabular ml-auto text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
                {seenLabel(seen, halfLengthMin)}
              </span>
            )}
          </div>
        </section>
      </div>

      {/* ------------------------------------------------- logged so far */}
      <section className="mt-8">
        <div
          className="flex items-baseline justify-between border-b pb-2"
          style={{ borderColor: "var(--color-line-strong)" }}
        >
          <h2 className="title text-base">Your stats so far</h2>
          <span className="tabular text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
            {rows.length}
          </span>
        </div>
        {rows.some((r) => r.draft) && (
          <p className="pt-2 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            Only you can see these until you submit them at full time.
          </p>
        )}

        {newest.length === 0 ? (
          <p className="py-6 text-[14px]" style={{ color: "var(--color-ink-faint)" }}>
            Nothing yet. Pick what happened, tap where, then log it.
          </p>
        ) : (
          <ul className="grid gap-x-8 sm:grid-cols-2 xl:grid-cols-3">
            {newest.map((r) => {
              const timing = statTiming(r, undefined, halfLengthMin);
              const half = timing.half ?? r.half;
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
                    <div className="text-[14px]">{describeStat(r, code)}</div>
                    <div className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                      {whoLabel(r, sheet)}
                      {half && `, ${half === 1 ? "1st" : "2nd"} half`}
                      {timing.gameMs != null && ` at ${formatGameClock(timing.gameMs)}`}
                      {r.originX != null && ", on the map"}
                    </div>
                  </div>
                  {/* Shown on hover with a mouse; always there on a touch
                      screen, which has no hover to reveal them. */}
                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
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
    </main>
  );
}

/**
 * Which way round this logger sees the pitch, for this match. Kept on the
 * phone, not the server: it is about where one person is standing, and two
 * loggers on opposite sides of the ground want opposite answers. Held in
 * memory as well, so the button still works where storage is blocked.
 */
const endsListeners = new Set<() => void>();
const endsInMemory = new Map<string, boolean>();
const endsKey = (matchId: string) => `ardawn:ends-swapped:${matchId}`;

function subscribeEnds(listener: () => void) {
  endsListeners.add(listener);
  return () => {
    endsListeners.delete(listener);
  };
}

function endsSwapped(matchId: string): boolean {
  const key = endsKey(matchId);
  if (endsInMemory.has(key)) return endsInMemory.get(key)!;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function useEndsSwapped(matchId: string): [boolean, () => void] {
  const swapped = useSyncExternalStore(
    subscribeEnds,
    () => endsSwapped(matchId),
    () => false,
  );
  const toggle = () => {
    const key = endsKey(matchId);
    endsInMemory.set(key, !swapped);
    try {
      localStorage.setItem(key, swapped ? "0" : "1");
    } catch {
      // Private window or blocked storage: it holds for this visit.
    }
    endsListeners.forEach((l) => l());
  };
  return [swapped, toggle];
}

/** When the entry being logged was seen, on the logger's game clock. */
function seenLabel(seen: { half: 1 | 2; halfMs: number }, halfLengthMin: number): string {
  return `Seen at ${formatGameClock(clockOf(seen.half, seen.halfMs, halfLengthMin))}, ${seen.half === 1 ? "1st" : "2nd"} half`;
}
