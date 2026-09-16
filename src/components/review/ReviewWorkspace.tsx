"use client";

import Link from "next/link";

/**
 * The review workspace.
 *
 * This is the screen the product lives or dies on: a selector should be able
 * to open a 70-minute match and have it fully tagged in about 70 minutes,
 * without touching the mouse.
 *
 * Four things make that possible, and they are all visible in here:
 *
 *  - Quick-clip (`C`). You press it *after* seeing the incident and the clip
 *    covers the pre-roll seconds you just watched, and playback keeps
 *    running live — no pausing, no scrubbing back.
 *  - Optimistic saves. A clip appears in the list on the keypress and is
 *    persisted behind the scenes, so tagging never waits on the network.
 *  - Number-key tagging straight from the hurling taxonomy, which is loaded
 *    from the database rather than hardcoded.
 *  - Selecting a clip focuses playback on just that range — the main
 *    timeline, shuttle and nudges all pin inside it — and shows drag
 *    handles to resize it. That's a deliberate split from quick-clip: you
 *    tag fast without stopping, then come back later to adjust the ones
 *    that weren't quite right.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlayerEngine } from "@/components/player/engine";
import { PlayToggle, RateBadge, Timecode, VideoStage } from "@/components/player/VideoStage";
import { Timeline, type TimelineClip } from "@/components/player/Timeline";
import { ClipTrimmer } from "@/components/player/ClipTrimmer";
import { CheatSheet } from "@/components/player/CheatSheet";
import { TOOLS, COLOURS, type Tool } from "@/components/player/AnnotationLayer";
import { useHotkeys } from "@/lib/keyboard/useHotkeys";
import type { Command, Mode } from "@/lib/keyboard/keymap";
import { formatClock, markersFromRows, tallyScore, formatScore } from "@/lib/hurling/notation";
import { createClip, deleteClip, setClipTags, updateClip } from "@/lib/actions/clips";
import { saveAnnotation } from "@/lib/actions/review";
import type { Shape } from "@/lib/db/schema";
import { StatPad } from "@/components/stats/StatPad";
import { StatLanes } from "@/components/stats/StatLanes";
import type { StatPlayer, StatRow } from "@/components/stats/types";
import { STAT_LEAD_IN_MS, type StatType } from "@/lib/hurling/stats";
import { ClipList } from "./ClipList";
import { ClipInspector } from "./ClipInspector";
import {
  clipColour,
  type ClipRow,
  type EventTypeRow,
  type MatchInfo,
  type SquadMember,
  type VideoInfo,
  type Viewer,
} from "./types";

/**
 * How much of what you just watched a quick-clip keeps.
 *
 * Eight seconds is deliberate: it comfortably covers a puckout and the
 * contest that followed it, which is the most common thing anyone reaches for
 * the key to capture.
 */
const DEFAULT_PRE_ROLL = 8000;
const DEFAULT_POST_ROLL = 3000;

/**
 * The label column beside the stat lanes. The scrub bar takes the same
 * padding while they are showing, so both share one time axis.
 */
const LANE_GUTTER_PX = 120;

type Props = {
  video: VideoInfo;
  match: MatchInfo;
  eventTypes: EventTypeRow[];
  squad: SquadMember[];
  initialClips: ClipRow[];
  markerRows: { kind: string; atMs: number }[];
  viewer: Viewer;
  /** Only present when the match has a stat sheet to log against. */
  statPanel?: StatPlayer[];
  initialStatRows?: StatRow[];
};

export function ReviewWorkspace({
  video,
  match,
  eventTypes,
  squad,
  initialClips,
  markerRows,
  viewer,
  statPanel,
  initialStatRows,
}: Props) {
  const engine = useMemo(() => new PlayerEngine(), []);
  const markers = useMemo(() => markersFromRows(markerRows), [markerRows]);

  const [clips, setClips] = useState<ClipRow[]>(initialClips);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inMs, setInMs] = useState<number | null>(null);
  const [outMs, setOutMs] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("transport");
  // Clips and stats are two different logging workflows sharing one video —
  // switching between them swaps the side panel and, while stats is up, hands
  // the number keys to the stat pad instead of clip tagging (see keymap.ts).
  const [viewMode, setViewMode] = useState<"clips" | "stats">("clips");
  const canLogStats = (viewer.role === "coach" || viewer.role === "admin") && !!match.id;
  // The sheet lives here rather than inside the pad: the timeline draws the
  // same entries as ticks, so both have to read from one list.
  const [statRows, setStatRows] = useState<StatRow[]>(initialStatRows ?? []);
  const [statType, setStatType] = useState<StatType>("tackle");
  const statsOpen = viewMode === "stats" && canLogStats;
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [preRoll, setPreRoll] = useState(DEFAULT_PRE_ROLL);

  // Drawing state.
  const [tool, setTool] = useState<Tool>("arrow");
  const [colour, setColour] = useState(COLOURS[0]);
  const [draftShapes, setDraftShapes] = useState<Shape[]>([]);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoStack = useRef<string[]>([]);
  // Where playback was before a clip was selected, so leaving the clip
  // (Escape, or the "Back to live" button) returns you to the match instead
  // of stranding you at the clip's out point.
  const resumeMsRef = useRef<number | null>(null);

  const hotkeyEvents = useMemo(
    () =>
      eventTypes
        .filter((e) => e.hotkey)
        .sort((a, b) => Number(a.hotkey === "0" ? 10 : a.hotkey) - Number(b.hotkey === "0" ? 10 : b.hotkey)),
    [eventTypes],
  );

  const selected = clips.find((c) => c.id === selectedId) ?? null;

  const flash = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  /* -------------------------------------------------------- clip playback */

  /**
   * Select a clip and play just its range — the main timeline, shuttle and
   * nudges all pin inside it from here (see `clamp()` in the engine).
   *
   * The first time this fires from a live, unselected state, the current
   * position is stashed so Escape or "Back to live" can return you to where
   * you actually were in the match, rather than to the clip's own start.
   */
  const focusClip = useCallback(
    (clip: ClipRow) => {
      if (selectedId === null) resumeMsRef.current = engine.snapshot.positionMs;
      setSelectedId(clip.id);
      engine.playRange(clip.startMs, clip.endMs);
    },
    [engine, selectedId],
  );

  const returnToLive = useCallback(() => {
    setSelectedId(null);
    engine.clearBounds();
    if (resumeMsRef.current != null) {
      engine.seek(resumeMsRef.current, { exact: true });
      resumeMsRef.current = null;
    }
  }, [engine]);

  /* ------------------------------------------------------- clip creation */

  /**
   * Save a clip without making the coach wait for it.
   *
   * The row goes into local state immediately with a temporary id so the
   * timeline updates on the keypress. The real id replaces it when the
   * server responds; if the save fails, the optimistic row is rolled back and
   * the coach is told, rather than silently losing the tag.
   */
  const saveClip = useCallback(
    async (startMs: number, endMs: number, eventTypeIds: string[] = [], title = "") => {
      const tempId = `pending-${crypto.randomUUID()}`;
      const optimistic: ClipRow = {
        id: tempId,
        startMs: Math.max(0, startMs),
        endMs,
        title,
        visibility: "team",
        createdBy: viewer.id,
        authorName: viewer.displayName,
        eventTypeIds,
        playerIds: [],
        commentCount: 0,
        annotationCount: 0,
        pending: true,
      };
      setClips((prev) => [...prev, optimistic].sort((a, b) => a.startMs - b.startMs));

      try {
        const saved = await createClip({
          videoId: video.id,
          startMs: optimistic.startMs,
          endMs,
          title,
          eventTypeIds,
        });
        setClips((prev) =>
          prev.map((c) => (c.id === tempId ? { ...optimistic, id: saved.id, pending: false } : c)),
        );
        undoStack.current.push(saved.id);
        return saved.id;
      } catch (err) {
        setClips((prev) => prev.filter((c) => c.id !== tempId));
        flash((err as Error).message || "That clip could not be saved.");
        return null;
      }
    },
    [video.id, viewer.id, viewer.displayName, flash],
  );

  /** The `C` key. Captures backwards from the playhead. */
  const quickClip = useCallback(
    async (eventTypeIds: string[] = []) => {
      const at = engine.snapshot.positionMs;
      const start = Math.max(0, at - preRoll);
      const end = Math.min(video.durationMs || at + DEFAULT_POST_ROLL, at + DEFAULT_POST_ROLL);
      const label = eventTypeIds.length
        ? (eventTypes.find((e) => e.id === eventTypeIds[0])?.labelGa ??
          eventTypes.find((e) => e.id === eventTypeIds[0])?.labelEn ??
          "")
        : "";
      await saveClip(start, end, eventTypeIds, label);
      flash(label ? `${label} — clip saved` : "Clip saved");
    },
    [engine, preRoll, video.durationMs, eventTypes, saveClip, flash],
  );

  const commitInOut = useCallback(async () => {
    if (inMs == null) {
      flash("Set an in point first — press I.");
      return;
    }
    const end = outMs ?? engine.snapshot.positionMs;
    if (end <= inMs) {
      flash("The out point has to come after the in point.");
      return;
    }
    await saveClip(inMs, end);
    setInMs(null);
    setOutMs(null);
    flash("Clip saved");
  }, [inMs, outMs, engine, saveClip, flash]);

  const tagSelectedOrQuickClip = useCallback(
    async (hotkey: string) => {
      const event = hotkeyEvents.find((e) => e.hotkey === hotkey);
      if (!event) return;

      // With a clip selected, the number key tags it. Otherwise it creates a
      // new quick-clip already tagged — which is the tagging loop proper.
      if (selected && !selected.pending) {
        const has = selected.eventTypeIds.includes(event.id);
        const next = has
          ? selected.eventTypeIds.filter((id) => id !== event.id)
          : [...selected.eventTypeIds, event.id];
        setClips((prev) =>
          prev.map((c) => (c.id === selected.id ? { ...c, eventTypeIds: next } : c)),
        );
        try {
          await setClipTags(selected.id, next);
        } catch (err) {
          flash((err as Error).message);
        }
        flash(`${event.labelGa ?? event.labelEn} ${has ? "removed" : "added"}`);
      } else {
        await quickClip([event.id]);
      }
    },
    [hotkeyEvents, selected, quickClip, flash],
  );

  const undoLast = useCallback(async () => {
    const id = undoStack.current.pop();
    if (!id) {
      flash("Nothing to undo.");
      return;
    }
    setClips((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) returnToLive();
    try {
      await deleteClip(id);
      flash("Clip removed");
    } catch (err) {
      flash((err as Error).message);
    }
  }, [selectedId, returnToLive, flash]);

  const stepClip = useCallback(
    (delta: 1 | -1) => {
      if (!clips.length) return;
      const idx = clips.findIndex((c) => c.id === selectedId);
      const next = clips[Math.min(clips.length - 1, Math.max(0, (idx === -1 ? 0 : idx) + delta))];
      if (next) focusClip(next);
    },
    [clips, selectedId, focusClip],
  );

  /**
   * Persist a trim drag. Local state updates immediately so the timeline and
   * the trimmer itself stay in sync with what was just dragged; the server
   * call runs behind that, same optimistic-then-reconcile shape as the rest
   * of the workspace.
   */
  const commitTrim = useCallback(
    async (clipId: string, startMs: number, endMs: number) => {
      setClips((prev) =>
        prev.map((c) => (c.id === clipId ? { ...c, startMs, endMs } : c)),
      );
      try {
        await updateClip(clipId, { startMs, endMs });
      } catch (err) {
        flash((err as Error).message);
      }
    },
    [flash],
  );

  /* ----------------------------------------------------------- annotations */

  const commitAnnotation = useCallback(async () => {
    if (!selected || !draftShapes.length) {
      setMode("transport");
      setDraftShapes([]);
      return;
    }
    // Annotations are stored relative to the clip's in point, so they survive
    // the clip's boundaries being nudged later.
    const atMs = Math.max(0, engine.snapshot.positionMs - selected.startMs);
    try {
      await saveAnnotation({ clipId: selected.id, atMs, shapes: draftShapes });
      setClips((prev) =>
        prev.map((c) =>
          c.id === selected.id ? { ...c, annotationCount: c.annotationCount + 1 } : c,
        ),
      );
      flash("Drawing saved");
    } catch (err) {
      flash((err as Error).message);
    }
    setDraftShapes([]);
    setMode("transport");
  }, [selected, draftShapes, engine, flash]);

  /* -------------------------------------------------------------- keyboard */

  const onCommand = useCallback(
    (command: Command) => {
      if (command.startsWith("tag_")) {
        void tagSelectedOrQuickClip(command.slice(4));
        return;
      }

      switch (command) {
        case "toggle_play":
          engine.toggle();
          break;
        case "shuttle_back":
          engine.shuttle(-1);
          break;
        case "shuttle_forward":
          engine.shuttle(1);
          break;
        case "shuttle_pause":
          engine.pause();
          break;
        case "nudge_back_1s":
          engine.nudge(-1000);
          break;
        case "nudge_fwd_1s":
          engine.nudge(1000);
          break;
        case "nudge_back_5s":
          engine.nudge(-5000);
          break;
        case "nudge_fwd_5s":
          engine.nudge(5000);
          break;
        case "nudge_back_10s":
          engine.nudge(-10_000);
          break;
        case "nudge_fwd_10s":
          engine.nudge(10_000);
          break;
        case "frame_back":
          engine.stepFrames(-1);
          break;
        case "frame_fwd":
          engine.stepFrames(1);
          break;
        case "quick_clip":
          void quickClip();
          break;
        case "set_in":
          setInMs(engine.snapshot.positionMs);
          flash("In point set");
          break;
        case "set_out":
          setOutMs(engine.snapshot.positionMs);
          flash("Out point set");
          break;
        case "trim_in":
          setInMs(engine.snapshot.positionMs);
          break;
        case "trim_out":
          setOutMs(engine.snapshot.positionMs);
          break;
        case "save_clip":
          void commitInOut();
          break;
        case "cancel":
          if (mode === "annotate") {
            setDraftShapes([]);
            setMode("transport");
          } else if (selected) {
            // Leaving a focused clip returns you to the match, not just to
            // an unfocused view of wherever the clip happened to end.
            returnToLive();
          } else {
            setInMs(null);
            setOutMs(null);
            engine.clearBounds();
          }
          break;
        case "undo":
          void undoLast();
          break;
        case "annotate":
          if (!selected) {
            flash("Select a clip to draw on it.");
            break;
          }
          if (mode === "annotate") void commitAnnotation();
          else {
            engine.pause();
            setMode("annotate");
          }
          break;
        case "prev_clip":
          stepClip(-1);
          break;
        case "next_clip":
          stepClip(1);
          break;
        case "speed_down":
          engine.setRate(Math.max(0.25, (engine.snapshot.rate || 1) / 2));
          break;
        case "speed_up":
          engine.setRate(Math.min(8, (engine.snapshot.rate || 1) * 2));
          break;
        case "fullscreen":
          void document.documentElement.requestFullscreen?.().catch(() => {});
          break;
        case "help":
          setHelpOpen((v) => !v);
          break;
        default:
          break;
      }
    },
    [
      engine,
      mode,
      selected,
      quickClip,
      commitInOut,
      commitAnnotation,
      tagSelectedOrQuickClip,
      undoLast,
      stepClip,
      returnToLive,
      flash,
    ],
  );

  useHotkeys(viewMode === "stats" ? "stats" : mode, onCommand);

  // Leaving a clip's bounds should not trap the playhead in it forever.
  useEffect(() => {
    if (!selected) engine.clearBounds();
  }, [selected, engine]);

  /* ----------------------------------------------------------------- view */

  const timelineClips: TimelineClip[] = useMemo(
    () =>
      clips.map((c) => ({
        id: c.id,
        startMs: c.startMs,
        endMs: c.endMs,
        colour: clipColour(c, eventTypes),
        title: c.title,
      })),
    [clips, eventTypes],
  );

  // The scoreline derives from the tags rather than being typed in twice.
  const scoreline = useMemo(() => {
    const scored = clips.flatMap((c) =>
      c.eventTypeIds
        .map((id) => eventTypes.find((e) => e.id === id))
        .filter((e): e is EventTypeRow => !!e && e.scoreValue > 0),
    );
    return tallyScore(scored);
  }, [clips, eventTypes]);

  const nextClipStart = useMemo(() => {
    const idx = clips.findIndex((c) => c.id === selectedId);
    return idx >= 0 && idx + 1 < clips.length ? clips[idx + 1].startMs : null;
  }, [clips, selectedId]);

  /* ------------------------------------------------------- stats on the bar */

  const statPlayers = useMemo(
    () => new Map((statPanel ?? []).map((p) => [p.id, p])),
    [statPanel],
  );

  /**
   * Watch a logged stat back. Any focused clip has to be let go of first, or
   * the engine's bounds would clamp the seek back inside it.
   */
  const jumpToStat = useCallback(
    (row: { atMs: number | null }) => {
      if (row.atMs == null) return;
      setSelectedId(null);
      engine.clearBounds();
      resumeMsRef.current = null;
      engine.seek(Math.max(0, row.atMs - STAT_LEAD_IN_MS), { exact: true });
      void engine.play();
    },
    [engine],
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden" style={{ background: "var(--color-stage)" }}>
      {/* ------------------------------------------------------------ header */}
      <header
        className="flex shrink-0 items-center gap-4 border-b px-4 py-2"
        style={{ borderColor: "var(--color-line)" }}
      >
        <Link href="/" className="wordmark text-[17px]" title="Back to the matches">
          Físeán
        </Link>
        <span
          aria-hidden
          className="h-4 w-px shrink-0"
          style={{ background: "var(--color-line-strong)" }}
        />
        <div className="min-w-0 flex-1">
          <div className="title truncate text-[15px]">
            {match.opponent}
            {match.competition && (
              <span className="ml-2 text-[12px] font-normal" style={{ color: "var(--color-ink-faint)" }}>
                {match.competition}
              </span>
            )}
          </div>
          <div className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            {clips.length} clip{clips.length === 1 ? "" : "s"} tagged
            {scoreline.cul + scoreline.cuilin > 0 && (
              <>
                , scores {formatScore(scoreline)}
              </>
            )}
          </div>
        </div>

        {match.id && (
          <Link href={`/matches/${match.id}/stats`} className="btn-ghost text-xs">
            Stat sheet
          </Link>
        )}

        {selected && (
          <button
            onClick={returnToLive}
            title="Deselect this clip and return to where you were in the match"
            className="btn-outline text-xs"
            style={{ borderColor: "var(--color-mark)", color: "var(--color-mark)" }}
          >
            <span className="kbd">Esc</span> Back to live match
          </button>
        )}

        <button onClick={() => setHelpOpen(true)} className="btn-ghost text-xs">
          <span className="kbd">?</span> Shortcuts
        </button>
      </header>

      {video.codecWarning && (
        <div
          className="shrink-0 px-4 py-2 text-[12px]"
          style={{ background: "color-mix(in oklab, var(--color-mark) 18%, transparent)" }}
        >
          {video.codecWarning}
        </div>
      )}

      {/* -------------------------------------------------------------- body */}
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <VideoStage
            engine={engine}
            src={video.src}
            fps={video.fps ?? undefined}
            shapes={draftShapes}
            onShapesChange={setDraftShapes}
            drawing={mode === "annotate"}
            tool={tool}
            colour={colour}
            preloadMs={nextClipStart}
          />

          {mode === "annotate" && (
            <div
              className="flex shrink-0 flex-wrap items-center gap-2 border-t px-3 py-2"
              style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}
            >
              <span className="label">Draw</span>
              {TOOLS.map((t) => (
                <button
                  key={t.tool}
                  onClick={() => setTool(t.tool)}
                  className="btn text-xs"
                  style={{
                    background: tool === t.tool ? "var(--color-surface-3)" : "transparent",
                    color: tool === t.tool ? "var(--color-ink)" : "var(--color-ink-dim)",
                  }}
                >
                  {t.label}
                </button>
              ))}
              <div className="mx-1 flex gap-1">
                {COLOURS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColour(c)}
                    aria-label={`Colour ${c}`}
                    className="h-5 w-5 rounded-full"
                    style={{
                      background: c,
                      outline: colour === c ? "2px solid var(--color-ink)" : "none",
                      outlineOffset: "1px",
                    }}
                  />
                ))}
              </div>
              <div className="flex-1" />
              <button onClick={() => setDraftShapes([])} className="btn-ghost text-xs">
                Clear
              </button>
              <button onClick={() => void commitAnnotation()} className="btn-primary text-xs">
                Save drawing
              </button>
            </div>
          )}

          {/* Transport, where the video is — the keyboard is faster, but it
              only reaches the player when nothing else holds focus. */}
          <div
            className="flex shrink-0 items-center gap-3 border-t px-3 py-2"
            style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}
          >
            <PlayToggle engine={engine} />
            <Timecode engine={engine} markers={markers} halfLengthMin={match.halfLengthMin} precise />
            <RateBadge engine={engine} />
          </div>

          <Timeline
            engine={engine}
            durationMs={video.durationMs}
            // Stats mode is about the sheet, not the clip list: the lanes
            // below carry the marks and the bar stays a plain scrubber.
            clips={statsOpen ? [] : timelineClips}
            markers={markers}
            halfLengthMin={match.halfLengthMin}
            selectedClipId={selectedId}
            inMs={inMs}
            outMs={outMs}
            onSelectClip={(id) => {
              const clip = clips.find((c) => c.id === id);
              if (clip) focusClip(clip);
            }}
            labelGutterPx={statsOpen ? LANE_GUTTER_PX : 0}
          />

          {statsOpen && (
            <StatLanes
              engine={engine}
              durationMs={video.durationMs}
              rows={statRows}
              players={statPlayers}
              focusType={statType}
              onFocusType={setStatType}
              onSelectStat={jumpToStat}
              gutterPx={LANE_GUTTER_PX}
            />
          )}

          {!statsOpen && selected && !selected.pending && (
            <ClipTrimmer
              key={selected.id}
              engine={engine}
              videoDurationMs={video.durationMs}
              clip={selected}
              onCommit={(startMs, endMs) => void commitTrim(selected.id, startMs, endMs)}
            />
          )}

          {viewMode === "clips" && (
            <TagBar
              events={hotkeyEvents}
              onTag={(hotkey) => void tagSelectedOrQuickClip(hotkey)}
              selectedTagIds={selected?.eventTypeIds ?? []}
              hasSelection={!!selected}
              preRoll={preRoll}
              onPreRollChange={setPreRoll}
              onQuickClip={() => void quickClip()}
              inMs={inMs}
              outMs={outMs}
              onCommit={() => void commitInOut()}
            />
          )}
        </main>

        {/* ------------------------------------------------------------ side */}
        <aside
          className={`flex ${viewMode === "stats" ? "w-[380px]" : "w-[340px]"} shrink-0 flex-col border-l`}
          style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}
        >
          {canLogStats && (
            <div
              className="flex shrink-0 gap-1 border-b p-2"
              style={{ borderColor: "var(--color-line)" }}
            >
              {(["clips", "stats"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setViewMode(m);
                    if (m === "stats") {
                      // Drawing belongs to the clip workflow, and a focused
                      // clip would pin every seek inside itself — which is
                      // exactly wrong when the next thing you do is jump to a
                      // stat somewhere else in the match.
                      setMode("transport");
                      setSelectedId(null);
                      engine.clearBounds();
                    }
                  }}
                  aria-pressed={viewMode === m}
                  className="flex-1 rounded px-3 py-1.5 text-[13px] capitalize transition-colors"
                  style={{
                    background: viewMode === m ? "var(--color-surface-3)" : "transparent",
                    color: viewMode === m ? "var(--color-ink)" : "var(--color-ink-dim)",
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          {viewMode === "stats" && canLogStats && match.id ? (
            <StatPad
              engine={engine}
              matchId={match.id}
              videoId={video.id}
              panel={statPanel ?? []}
              rows={statRows}
              setRows={setStatRows}
              statType={statType}
              setStatType={setStatType}
              onJump={jumpToStat}
            />
          ) : (
            <>
              <ClipList
                clips={clips}
                eventTypes={eventTypes}
                selectedId={selectedId}
                markers={markers}
                halfLengthMin={match.halfLengthMin}
                onSelect={focusClip}
                onDelete={async (id) => {
                  setClips((prev) => prev.filter((c) => c.id !== id));
                  if (selectedId === id) returnToLive();
                  try {
                    await deleteClip(id);
                  } catch (err) {
                    flash((err as Error).message);
                  }
                }}
                viewer={viewer}
              />

              {selected && (
                <ClipInspector
                  key={selected.id}
                  clip={selected}
                  eventTypes={eventTypes}
                  squad={squad}
                  viewer={viewer}
                  engine={engine}
                  onClipChange={(patch) =>
                    setClips((prev) =>
                      prev.map((c) => (c.id === selected.id ? { ...c, ...patch } : c)),
                    )
                  }
                  onTextFocus={(focused) => setMode(focused ? "text" : "transport")}
                />
              )}
            </>
          )}
        </aside>
      </div>

      {toast && (
        <div
          className="pointer-events-none fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-lg px-4 py-2 text-sm shadow-lg"
          style={{ background: "var(--color-surface-3)", color: "var(--color-ink)" }}
        >
          {toast}
        </div>
      )}

      <CheatSheet open={helpOpen} onClose={() => setHelpOpen(false)} hotkeyEvents={hotkeyEvents} />
    </div>
  );
}

/* ------------------------------------------------------------------ tag bar */

function TagBar({
  events,
  onTag,
  selectedTagIds,
  hasSelection,
  preRoll,
  onPreRollChange,
  onQuickClip,
  inMs,
  outMs,
  onCommit,
}: {
  events: EventTypeRow[];
  onTag: (hotkey: string) => void;
  selectedTagIds: string[];
  hasSelection: boolean;
  preRoll: number;
  onPreRollChange: (ms: number) => void;
  onQuickClip: () => void;
  inMs: number | null;
  outMs: number | null;
  onCommit: () => void;
}) {
  return (
    <div
      className="shrink-0 border-t px-3 py-2.5"
      style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}
    >
      <div className="mb-2 flex items-center gap-3">
        <button onClick={onQuickClip} className="btn-primary text-xs">
          <span className="kbd" style={{ background: "rgba(0,0,0,0.25)" }}>
            C
          </span>
          Quick clip
        </button>

        <label className="flex items-center gap-2 text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
          Pre-roll
          <input
            type="range"
            min={2}
            max={20}
            step={1}
            value={preRoll / 1000}
            onChange={(e) => onPreRollChange(Number(e.target.value) * 1000)}
            className="w-24 accent-[var(--color-brand)]"
          />
          <span className="tabular w-6">{preRoll / 1000}s</span>
        </label>

        <div className="flex-1" />

        {inMs != null && (
          <div className="tabular flex items-center gap-2 text-[11px]">
            <span style={{ color: "var(--color-mark)" }}>
              In {formatClock(inMs)}
              {outMs != null && ` → ${formatClock(outMs)}`}
            </span>
            <button onClick={onCommit} className="btn-outline px-2 py-1 text-[11px]">
              Save <span className="kbd ml-1">Enter</span>
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {events.map((e) => {
          const active = selectedTagIds.includes(e.id);
          return (
            <button
              key={e.id}
              onClick={() => onTag(e.hotkey!)}
              title={
                hasSelection
                  ? `${active ? "Remove" : "Add"} ${e.labelGa ?? e.labelEn}`
                  : `Quick clip tagged ${e.labelGa ?? e.labelEn}`
              }
              className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors"
              style={{
                borderColor: active ? e.colour : "var(--color-line-strong)",
                background: active
                  ? `color-mix(in oklab, ${e.colour} 26%, transparent)`
                  : "transparent",
                color: active ? "var(--color-ink)" : "var(--color-ink-dim)",
              }}
            >
              <span className="kbd">{e.hotkey}</span>
              <span className="h-2 w-2 rounded-full" style={{ background: e.colour }} />
              {e.labelGa ?? e.labelEn}
            </button>
          );
        })}
      </div>
    </div>
  );
}
