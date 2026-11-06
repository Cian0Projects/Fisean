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
 *
 * The halves are set once, on the strip under the video (HalvesBar), rather
 * than picked per entry. The map then follows the playhead: it shows one half at a time, the
 * way round the camera sees that half, and only the kind of stat being
 * logged, since every kind on one map is a mess nobody can place a dot in.
 * Entries logged live on the line appear on it beside the ones logged here,
 * and a mark on it opens to be watched, edited or deleted.
 */
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { PlayerEngine } from "@/components/player/engine";
import { PitchMap, type PitchMark } from "@/components/pitch/PitchMap";
import { ChevronIcon } from "@/components/ui/Icon";
import { deleteMatchStat, logMatchStat, updateMatchStat } from "@/lib/actions/stats";
import { formatClock, toGameTime, type GamePhase, type Markers } from "@/lib/hurling/notation";
import { ourEndIn, type End } from "@/lib/hurling/pitch";
import type { GameCode } from "@/lib/hurling/codes";
import {
  STAT_TYPE_SHAPE,
  statVocabulary,
  describeStat,
  effectiveOutcome,
  resultFromWhere,
  statColour,
  statShape,
  stepToStat,
  type StatType,
} from "@/lib/hurling/stats";
import { followOn, followOnDetail } from "@/lib/hurling/follow-on";
import { openRestart, type RestartLine } from "@/lib/hurling/restart-line";
import { RestartSettle } from "./RestartSettle";
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
import { withoutStats } from "@/lib/hurling/custom-stats";
import { statMarks, whoLabel, type NumberSheet, type StatRow } from "./types";
import { VoiceBar, useVoiceEntry } from "./VoiceEntry";

const LIST_OPEN_KEY = "fisean.statpad.listOpen";
const subscribeNothing = () => () => {};
const readListOpen = () => {
  try {
    return window.localStorage.getItem(LIST_OPEN_KEY) === "1";
  } catch {
    return false;
  }
};

export function StatPad({
  engine,
  matchId,
  videoId,
  code,
  restartLine,
  removed,
  sheet,
  rows,
  setRows,
  statType,
  setStatType,
  onJump,
  markers,
  halfLengthMin,
  firstHalfEnd,
}: {
  engine: PlayerEngine;
  matchId: string;
  videoId: string;
  /** The club's code, for its words and its scores. */
  code: GameCode;
  /** The line short restarts are judged at, or null with advanced puckout analysis off. */
  restartLine: RestartLine | null;
  /** Standard stats the squad has removed from logging. */
  removed: StatType[];
  /** Who wore what in this match, so far. */
  sheet: NumberSheet;
  /** Held by the workspace, because the timeline draws them too. */
  rows: StatRow[];
  setRows: Dispatch<SetStateAction<StatRow[]>>;
  /** Shared as well: it decides which ticks the timeline brings forward. */
  statType: StatType;
  setStatType: Dispatch<SetStateAction<StatType>>;
  onJump: (row: StatRow) => void;
  /** The video's throw-in and half-time, when marked: they settle the half. */
  markers: Markers;
  halfLengthMin: number;
  /** Our end in the first half, as the camera sees it. */
  firstHalfEnd: End;
}) {
  const [detail, setDetail] = useState<StatDetail>(EMPTY_DETAIL);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [dest, setDest] = useState<{ x: number; y: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [entryClipId, setEntryClipId] = useState<string | null>(null);
  // An entry first logged on the line keeps the moment it was seen when it
  // is edited here; the pad itself times entries off the video instead.
  const [entrySeenAt, setEntrySeenAt] = useState<number | null>(null);
  // The moment this entry was opened, off the transport's own clock. Null
  // until the first real interaction stamps it — see the file note above.
  const [stampMs, setStampMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // A mark clicked on the map, and whether its delete is waiting on a yes.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Whether "Logged so far" is open, remembered on this browser only: some
  // loggers like the list in view, most want the room for the map.
  // Read through useSyncExternalStore so the server render (closed) and the
  // browser's remembered choice never disagree during hydration.
  const storedOpen = useSyncExternalStore(subscribeNothing, readListOpen, () => false);
  const [chosenOpen, setChosenOpen] = useState<boolean | null>(null);
  const listOpen = chosenOpen ?? storedOpen;
  const setListOpen = (open: boolean) => {
    setChosenOpen(open);
    try {
      window.localStorage.setItem(LIST_OPEN_KEY, open ? "1" : "0");
    } catch {}
  };
  // When the last entry was saved, to say so for a moment.
  const [savedAt, setSavedAt] = useState<number | null>(null);
  useEffect(() => {
    if (savedAt == null) return;
    const t = window.setTimeout(() => setSavedAt(null), 2500);
    return () => window.clearTimeout(t);
  }, [savedAt]);
  // Where the playhead is on the game clock. Only the phase is kept, so the
  // pad re-renders when the half changes, not on every frame.
  const [phase, setPhase] = useState<GamePhase>(
    () => toGameTime(engine.snapshot.positionMs, markers, halfLengthMin).phase,
  );
  useEffect(
    () => engine.subscribe((t) => setPhase(toGameTime(t.positionMs, markers, halfLengthMin).phase)),
    [engine, markers, halfLengthMin],
  );

  const vocabulary = useMemo(() => withoutStats(statVocabulary(code), removed), [code, removed]);
  const meta = vocabulary.meta[statType];
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
  const halvesMarked = markers.throwIn != null;

  /**
   * The half at a moment in the file, when the markers can say. The picker
   * stays for footage with no markers yet, and the report re-reads the half
   * from the markers anyway — so marking them later still sorts every entry.
   */
  const halfAt = (ms: number) => toGameTime(ms, markers, halfLengthMin).half;

  /**
   * The half an entry belongs to: from the markers where it has a place in
   * this file (logged here, or logged live and found on the footage), else
   * the half it was saved with.
   */
  const rowHalf = (r: StatRow) => (r.atMs != null ? halfAt(r.atMs) : null) ?? r.half;

  const playHalf = phase === "first_half" && halvesMarked ? 1 : phase === "second_half" ? 2 : null;
  // The entry in hand decides the half while there is one: an entry started
  // just before the restart stays a first-half entry while it is finished.
  const entryHalf = stampMs != null ? halfAt(stampMs) : null;
  // A new entry's stamp that falls in neither half (before the throw-in, at
  // half time, after full time) is stale, not a moment: nobody logs a shot
  // in the warm-up. It comes from picking a stat type before pressing play,
  // and kept, it both asked which half and timed the entry at 0:00. So it
  // counts for nothing, and the next touch, or Log, times the entry afresh
  // off the video. An entry being edited keeps the time it was logged at.
  const liveStamp = editingId || !halvesMarked || entryHalf != null ? stampMs : null;
  const mapHalf: 1 | 2 | null =
    (liveStamp != null ? entryHalf : null) ??
    (liveStamp == null && !editingId ? playHalf : null) ??
    detail.half ??
    null;
  const ourEnd = ourEndIn(mapHalf, firstHalfEnd);
  // With halves marked and the entry inside one, its half is not a question.
  const halfFixed = halvesMarked && (liveStamp != null ? entryHalf : playHalf) != null;

  /** The instant an entry starts, captured once and then left alone. */
  const stamp = (ms: number) => {
    setStampMs(ms);
    const half = halfAt(ms);
    if (half) patch({ half });
  };
  const stampIfFresh = () => {
    if (!editingId && liveStamp === null) stamp(engine.snapshot.positionMs);
  };

  // Pressing play after picking a type, with nothing placed yet, means the
  // moment has not happened: the coach is playing on to find it. The stamp
  // goes, and the mark (or Log) takes the time when it does happen. Once a
  // point is on the map the entry is real, and playing on to check it
  // leaves its time alone.
  useEffect(() => {
    if (editingId || origin) return;
    let wasPlaying = engine.snapshot.playing;
    return engine.subscribe((t) => {
      if (t.playing && !wasPlaying) setStampMs(null);
      wasPlaying = t.playing;
    });
  }, [engine, editingId, origin]);

  const ofThisType = rows.filter((r) => r.statType === statType);
  const timedOfThisType = ofThisType.filter((r) => r.atMs != null);

  /** Walk through this kind of stat, one incident at a time. */
  const step = (direction: 1 | -1) => {
    const found = stepToStat(timedOfThisType, engine.snapshot.positionMs, direction);
    if (found) onJump(found);
  };

  const resetEntry = () => {
    setDetail(nextDetail);
    setOrigin(null);
    setDest(null);
    setEditingId(null);
    setEntryClipId(null);
    setEntrySeenAt(null);
    setStampMs(null);
    setError(null);
  };

  const chooseType = (next: StatType) => {
    setStatType(next);
    setDetail(detailForType);
    setDest(null);
    if (STAT_TYPE_SHAPE[next].points === 0) setOrigin(null);
    stampIfFresh();
  };

  // Opening the mic is the moment the coach saw it, so it stamps the time the
  // way switching type or placing a point does.
  const voice = useVoiceEntry({
    statTypes: vocabulary.statTypes,
    statType,
    detail,
    chooseType,
    setDetail,
    onStart: stampIfFresh,
    onRetake: () => {
      setOrigin(null);
      setDest(null);
    },
  });

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
      const found = vocabulary.statTypes.find((t) => STAT_TYPE_SHAPE[t].hotkey === e.key);
      if (found) {
        e.preventDefault();
        chooseType(found);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editingId, stampMs, markers, halfLengthMin, vocabulary]);

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

  // This half's entries of the kind being logged: the second half starts on
  // a clear map. One with no half to go on is shown on both, faintly, rather
  // than lost.
  const onMap = rows.filter((r) => {
    if (r.id === editingId || r.statType !== statType) return false;
    const h = rowHalf(r);
    return mapHalf == null || h == null || h === mapHalf;
  });
  const picked = onMap.find((r) => r.id === pickedId) ?? null;

  const marks: PitchMark[] = (() => {
    const existing = onMap.flatMap((r) =>
      statMarks([r], sheet, code, {
        muted: mapHalf != null && rowHalf(r) == null,
        selectedId: pickedId,
      }),
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
        colour: statColour(entry),
        shape: statShape(entry),
        label: named ? (typedNumber(detail.playerNumber)?.toString() ?? null) : null,
        title: "This entry",
        selected: true,
        passive: true,
      },
    ];
  })();

  const submit = () => {
    if (!ready || pending) return;
    voice.stop();
    // A tally logged without ever placing a point or switching type (the
    // default tab, hit straight away) still deserves a real timestamp.
    const atMs = liveStamp ?? engine.snapshot.positionMs;
    const input = {
      ...detailToDraft(statType, shown),
      half: halfAt(atMs) ?? detail.half,
      originX: origin?.x ?? null,
      originY: origin?.y ?? null,
      destX: dest?.x ?? null,
      destY: dest?.y ?? null,
      clipId: entryClipId,
      videoId,
      atMs,
      seenAt: entrySeenAt,
      voiceHeard: voice.heard || null,
    };

    startTransition(async () => {
      try {
        if (editingId) {
          const saved = await updateMatchStat(editingId, input);
          setRows((prev) => prev.map((r) => (r.id === editingId ? saved : r)));
        } else {
          const { row: saved, settled } = await logMatchStat({ ...input, matchId });
          setRows((prev) => [...prev.map((r) => (r.id === settled?.id ? settled : r)), saved]);
        }
        resetEntry();
        // A new shot is followed by the restart, and a free by the shot from
        // it: have that ready, for the team it belongs to. Fixing an old
        // entry stays where it is.
        const next = editingId ? null : followOn(statType, detail.side);
        if (next && vocabulary.statTypes.includes(next.statType)) {
          setStatType(next.statType);
          setDetail((d) => ({ ...d, ...followOnDetail(next) }));
        }
        voice.reset();
        setSavedAt(Date.now());
      } catch (err) {
        setError((err as Error).message || "That entry could not be saved.");
      }
    });
  };

  const edit = (row: StatRow) => {
    setPickedId(null);
    setEditingId(row.id);
    setStatType(row.statType);
    setDetail(detailFromRow(row));
    setEntryClipId(row.clipId);
    setEntrySeenAt(row.seenAt);
    setStampMs(row.atMs);
    setOrigin(row.originX != null && row.originY != null ? { x: row.originX, y: row.originY } : null);
    setDest(row.destX != null && row.destY != null ? { x: row.destX, y: row.destY } : null);
    setError(null);
  };

  const remove = (id: string) => {
    if (pickedId === id) setPickedId(null);
    setConfirming(false);
    setRows((prev) => prev.filter((r) => r.id !== id));
    if (editingId === id) resetEntry();
    startTransition(async () => {
      try {
        // A restart this entry settled is open again.
        const unsettled = await deleteMatchStat(id);
        if (unsettled.length) {
          const byId = new Map(unsettled.map((r) => [r.id, r]));
          setRows((prev) => prev.map((r) => byId.get(r.id) ?? r));
        }
      } catch (err) {
        setError((err as Error).message || "That entry could not be deleted.");
      }
    });
  };

  const newest = [...rows].sort((a, b) => b.createdAt - a.createdAt);
  const latest = newest[0];
  // A restart being edited keeps the line it was logged at.
  const judgedAt = (editingId ? rows.find((r) => r.id === editingId)?.restartLine : null) ?? restartLine;

  // The pad is three bands so the two things pressed most never scroll
  // away: the stat buttons pinned at the top, the entry in the middle (the
  // only part that scrolls, and on most screens it does not need to), and
  // the Log button pinned at the bottom with the running list folded under
  // it. The halves used to sit in here too; they are under the video now.
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b px-3 pb-1.5 pt-2" style={{ borderColor: "var(--color-line)" }}>
        <div className="flex flex-wrap gap-x-0.5 gap-y-1">
          {vocabulary.statTypes.map((t) => {
            const m = vocabulary.meta[t];
            const here = t === statType;
            return (
              <button
                key={t}
                onClick={() => chooseType(t)}
                aria-pressed={here}
                title={m.hint}
                className={`flex items-center gap-1 rounded px-1.5 py-1 text-[13px] transition-colors ${here ? "here" : ""}`}
                style={{ color: here ? "var(--color-ink)" : "var(--color-ink-dim)" }}
              >
                <span className="kbd">{m.hotkey}</span>
                {m.label}
              </button>
            );
          })}
        </div>

        {/* The mic, and watching one kind back, on one pinned line. The
            entries are timestamped, so stepping through every delivery is
            two buttons rather than a search. */}
        <div className="mt-1.5">
          <VoiceBar
            voice={voice}
            onDiscard={resetEntry}
            compact
            trailing={
              <>
                <span className="tabular text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                  {ofThisType.length} logged
                </span>
                <div className="flex-1" />
                <button
                  onClick={() => step(-1)}
                  disabled={!timedOfThisType.length}
                  title={`Previous ${meta.label.toLowerCase()}`}
                  aria-label={`Previous ${meta.label.toLowerCase()}`}
                  className="btn-ghost px-1.5 py-0.5 text-xs disabled:opacity-35"
                >
                  <ChevronIcon direction="left" size={11} />
                </button>
                <span className="whitespace-nowrap text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                  Watch {meta.plural.toLowerCase()}
                </span>
                <button
                  onClick={() => step(1)}
                  disabled={!timedOfThisType.length}
                  title={`Next ${meta.label.toLowerCase()}`}
                  aria-label={`Next ${meta.label.toLowerCase()}`}
                  className="btn-ghost px-1.5 py-0.5 text-xs disabled:opacity-35"
                >
                  <ChevronIcon direction="right" size={11} />
                </button>
              </>
            }
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
      <div className="space-y-2.5">

        <RestartSettle
          open={editingId ? null : openRestart(rows)}
          code={code}
          sheet={sheet}
          onSettled={(saved) => setRows((prev) => prev.map((r) => (r.id === saved.id ? saved : r)))}
          compact
        />

        <StatFields
          vocabulary={vocabulary}
          statType={statType}
          detail={shown}
          onChange={patch}
          sheet={sheet}
          idPrefix="pad"
          halfNote={
            halvesMarked
              ? "Set from the halves under the video, once the playhead is in one."
              : "Or set the halves under the video, and every entry takes its half by itself."
          }
          halfFixed={halfFixed}
          resultNote={shown !== detail ? ARC_NOTE : undefined}
          judging={judgedAt ? { line: judgedAt, origin } : null}
          compact
        />

        {meta.points > 0 && (
          <div>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="label">
                {mapHalf ? `${mapHalf === 1 ? "1st" : "2nd"} half, our end on the ${ourEnd}` : "Where on the pitch"}
              </span>
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
            <PitchMap
              marks={marks}
              onPlace={placePoint}
              onSelect={(id) => {
                setPickedId(id === pickedId ? null : id);
                setConfirming(false);
              }}
              turned={ourEnd === "right"}
              code={code}
            />
  
            {picked && (
              <div
                className="mt-2 rounded border px-3 py-2"
                style={{ borderColor: "var(--color-line-strong)", background: "var(--color-surface-2)" }}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px]">{describeStat(picked, code)}</div>
                    <div className="text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
                      {whoLabel(picked, sheet)}
                      {picked.atMs != null && `, ${toGameTime(picked.atMs, markers, halfLengthMin).label}`}
                    </div>
                  </div>
                  <button
                    onClick={() => setPickedId(null)}
                    aria-label="Close"
                    className="px-1 text-[13px]"
                    style={{ color: "var(--color-ink-faint)" }}
                  >
                    ×
                  </button>
                </div>
                {confirming ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-[12px]">Delete this entry?</span>
                    <button
                      onClick={() => remove(picked.id)}
                      className="rounded px-2 py-1 text-[12px] font-semibold"
                      style={{ background: "var(--color-danger)", color: "#fff" }}
                    >
                      Yes, delete it
                    </button>
                    <button onClick={() => setConfirming(false)} className="btn-ghost px-2 py-1 text-[12px]">
                      Keep it
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {picked.atMs != null && (
                      <button onClick={() => onJump(picked)} className="btn-outline px-2 py-1 text-[12px]">
                        Watch
                      </button>
                    )}
                    <button onClick={() => edit(picked)} className="btn-outline px-2 py-1 text-[12px]">
                      Edit
                    </button>
                    <button
                      onClick={() => setConfirming(true)}
                      className="btn-ghost px-2 py-1 text-[12px]"
                      style={{ color: "var(--color-danger-ink)" }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
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

        {/* What this kind of stat is for, under everything that is pressed:
            a new logger reads it once, and it costs the regulars no room.
            It is also each stat button's tooltip. */}
        <p className="text-[12px] leading-snug" style={{ color: "var(--color-ink-faint)" }}>
          {meta.hint}
        </p>
      </div>
      </div>

      {/* Pinned: the press that ends every entry, and when it was timed. */}
      <div
        className="flex shrink-0 items-center gap-2 border-t px-3 py-2"
        style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}
      >
        <button onClick={submit} disabled={!ready || pending} className="btn-primary text-sm">
          {editingId ? "Save changes" : `Log ${meta.label.toLowerCase()}`}
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
        <span
          className="ml-auto truncate text-right text-[12px]"
          style={{ color: "var(--color-ink-faint)" }}
          aria-live="polite"
        >
          {pending
            ? "Saving…"
            : savedAt && liveStamp == null
              ? "Saved."
              : liveStamp != null
                ? `Timed at ${formatClock(liveStamp)}`
                : "Timed when you start"}
        </span>
        <button
          onClick={() => stamp(engine.snapshot.positionMs)}
          title="Time this entry at the playhead instead"
          className="btn-ghost shrink-0 px-1.5 py-0.5 text-[12px]"
        >
          Use now
        </button>
      </div>

      {/* Folded by default: the last entry is shown, which is what a logger
          glances at to check it went in, and the full list opens over the
          bottom of the pad when it is wanted. */}
      <div className="flex shrink-0 flex-col border-t" style={{ borderColor: "var(--color-line-strong)" }}>
        <button
          type="button"
          onClick={() => setListOpen(!listOpen)}
          aria-expanded={listOpen}
          className="flex items-baseline gap-2 px-3 py-2 text-left"
        >
          <span className="title shrink-0 text-[13px]">Logged so far</span>
          <span className="tabular shrink-0 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            {rows.length}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: "var(--color-ink-dim)" }}>
            {!listOpen && latest
              ? `Last: ${describeStat(latest, code)}, ${whoLabel(latest, sheet)}${
                  latest.atMs != null ? `, ${toGameTime(latest.atMs, markers, halfLengthMin).label}` : ""
                }`
              : ""}
          </span>
          <span className="shrink-0 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            {listOpen ? "Hide" : "Show"}
          </span>
        </button>

        {!listOpen ? null : newest.length === 0 ? (
          <p className="px-3 pb-3 text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
            Nothing yet. Watch, then press <span className="kbd">1</span> to <span className="kbd">7</span>.
          </p>
        ) : (
          <ul className="max-h-[30vh] overflow-y-auto px-3">
            {newest.map((r) => {
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
                    <div className="text-[13px]">{describeStat(r, code)}</div>
                    <div className="text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
                      {whoLabel(r, sheet)}
                      {r.atMs != null && `, ${toGameTime(r.atMs, markers, halfLengthMin).label}`}
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
