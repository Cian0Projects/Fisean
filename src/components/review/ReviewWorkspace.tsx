"use client";

import Link from "next/link";

/**
 * The review workspace.
 *
 * This is the screen the product lives or dies on: a coach should be able to
 * open a 70-minute match and clip what matters in about 70 minutes, without
 * touching the mouse.
 *
 * Three things make that possible, and they are all visible in here:
 *
 *  - Quick-clip (`C`). You press it *after* seeing the incident and the clip
 *    covers the pre-roll seconds you just watched, and playback keeps
 *    running live — no pausing, no scrubbing back.
 *  - Optimistic saves. A clip appears in the list on the keypress and is
 *    persisted behind the scenes, so clipping never waits on the network.
 *  - Selecting a clip focuses playback on just that range — the main
 *    timeline, shuttle and nudges all pin inside it — and shows drag
 *    handles to resize it. That's a deliberate split from quick-clip: you
 *    clip fast without stopping, then come back to title it, comment on it,
 *    draw on it and share it.
 *
 * Clips carry no event tags: what a clip is goes in its title, in the
 * coach's own words. Counting the match is the stat sheet's job, in the
 * stats panel beside this one.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlayerEngine } from "@/components/player/engine";
import { Mark } from "@/components/ui/Mark";
import {
  PlayToggle,
  RateBadge,
  Timecode,
  VideoStage,
  toggleStageFullscreen,
} from "@/components/player/VideoStage";
import { Timeline, type TimelineClip } from "@/components/player/Timeline";
import { ClipTrimmer } from "@/components/player/ClipTrimmer";
import { CheatSheet } from "@/components/player/CheatSheet";
import { TOOLS, COLOURS, type Tool } from "@/components/player/AnnotationLayer";
import { useHotkeys } from "@/lib/keyboard/useHotkeys";
import type { Command, Mode } from "@/lib/keyboard/keymap";
import { formatClock, markersFromRows } from "@/lib/hurling/notation";
import { createClip, deleteClip, updateClip } from "@/lib/actions/clips";
import { setFirstHalfEnd, setHalfLength, setVideoMarker } from "@/lib/actions/admin";
import type { End } from "@/lib/hurling/pitch";
import { listComments } from "@/lib/actions/reads";
import { StopCard } from "@/components/player/StopCard";
import { shapesOf, useCommentStops } from "@/components/player/useCommentStops";
import { StatPad } from "@/components/stats/StatPad";
import { StatLanes } from "@/components/stats/StatLanes";
import { numberSheet, type SheetEntry, type StatRow } from "@/components/stats/types";
import { STAT_LEAD_IN_MS, footageMomentOf, type StatType } from "@/lib/hurling/stats";
import type { GameCode } from "@/lib/hurling/codes";
import { ClipList } from "./ClipList";
import { ClipInspector, type DrawingDraft } from "./ClipInspector";
import {
  clipColour,
  type ClipRow,
  type CommentRow,
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

/** Stands in for a drawing that has not been posted with its comment yet. */
const UNPOSTED = "unposted-drawing";

type Props = {
  video: VideoInfo;
  match: MatchInfo;
  /** Already fitted to the club's code where they were loaded (`tagsForCode`). */
  eventTypes: EventTypeRow[];
  /** The club's code, for the stat sheet's words. */
  code: GameCode;
  squad: SquadMember[];
  initialClips: ClipRow[];
  /** Arrive parked on this clip, from a link that named it. */
  openClipId?: string;
  markerRows: { kind: string; atMs: number }[];
  viewer: Viewer;
  /** Only present when the match has a stat sheet to log against: who wore what. */
  statNumbers?: SheetEntry[];
  initialStatRows?: StatRow[];
};

export function ReviewWorkspace({
  video,
  match,
  eventTypes,
  code,
  squad,
  initialClips,
  openClipId,
  markerRows,
  viewer,
  statNumbers,
  initialStatRows,
}: Props) {
  const engine = useMemo(() => new PlayerEngine(), []);
  // Held here rather than read once from the page: the stat pad sets the
  // halves while the footage plays, and the timecode, the lanes and every
  // entry's half follow at once.
  const [markerList, setMarkerList] = useState(markerRows);
  const markers = useMemo(() => markersFromRows(markerList), [markerList]);
  const [firstHalfEnd, setFirstHalfEndState] = useState<End>(video.ourEndFirstHalf ?? "left");
  // The match's, but changeable from the halves box: everything on the game
  // clock reads it, so it is held here rather than read off the match.
  const [halfLengthMin, setHalfLengthMinState] = useState(match.halfLengthMin);

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
  // Stats logged on the line, before this video existed, carry the moment
  // they were seen rather than a place in the file. Once the video's
  // throw-in is marked, the match whistles put them on it, so they tick on
  // the timeline and play back like any other. Worked out, never stored:
  // moving a marker moves them. Editing one in the pad does pin it to its
  // place in this file, which by then is the right place.
  const placedStatRows = useMemo(
    () =>
      statRows.map((r) => {
        if (r.atMs != null || r.seenAt == null) return r;
        const atMs = footageMomentOf(r.seenAt, match.whistles ?? {}, markers, halfLengthMin, video.durationMs);
        return atMs == null ? r : { ...r, atMs };
      }),
    [statRows, match.whistles, markers, halfLengthMin, video.durationMs],
  );
  const statsOpen = viewMode === "stats" && canLogStats;
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [preRoll, setPreRoll] = useState(DEFAULT_PRE_ROLL);

  // Drawing state. A drawing is made on one frame of one clip and posted
  // with a comment, so it remembers both until then.
  const [tool, setTool] = useState<Tool>("arrow");
  const [colour, setColour] = useState(COLOURS[0]);
  const [drawingDraft, setDrawingDraft] = useState<(DrawingDraft & { clipId: string }) | null>(null);
  // The selected clip's comments: the panel lists them, and the picture
  // stops on them, so they are loaded here for both.
  const [clipComments, setClipComments] = useState<{ clipId: string; rows: CommentRow[] } | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoStack = useRef<string[]>([]);
  // Where playback was before a clip was selected, so leaving the clip
  // (Escape, or the "Back to live" button) returns you to the match instead
  // of stranding you at the clip's out point.
  const resumeMsRef = useRef<number | null>(null);


  const selected = clips.find((c) => c.id === selectedId) ?? null;
  const draftHere = selected && drawingDraft?.clipId === selected.id ? drawingDraft : null;
  const commentsHere = selected && clipComments?.clipId === selected.id ? clipComments.rows : null;
  const selectedSaved = selected && !selected.pending ? selected.id : null;

  useEffect(() => {
    if (!selectedSaved) return;
    let live = true;
    void listComments(selectedSaved).then((rows) => {
      if (live) setClipComments({ clipId: selectedSaved, rows });
    });
    return () => {
      live = false;
    };
  }, [selectedSaved]);

  // Playing a selected clip back stops on its comments, as it will for
  // whoever watches it later. A drawing not yet posted rides along as one
  // more stop, so it obeys the same rule as a posted one: on its frame
  // while paused there, gone the moment the clip plays.
  const stopComments = useMemo(() => {
    if (!commentsHere || !draftHere?.shapes.length) return commentsHere;
    const unposted: CommentRow = {
      id: UNPOSTED,
      body: "",
      atMs: draftHere.atMs,
      shapes: draftHere.shapes,
      parentId: null,
      createdAt: 0,
      authorName: viewer.displayName,
      userId: viewer.id,
      editedAt: null,
    };
    return [...commentsHere, unposted];
  }, [commentsHere, draftHere, viewer]);
  const stop = useCommentStops(
    engine,
    selected && !selected.pending ? selected : null,
    stopComments,
    mode !== "annotate",
  );
  // The card is for what was said; the unposted drawing has no words yet.
  const said = stop && { ...stop, comments: stop.comments.filter((c) => c.id !== UNPOSTED) };

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

  // Arriving from a link to one clip: park on its first frame once the file
  // has loaded far enough to seek, without playing, so a comment on that
  // frame is up before anything moves.
  useEffect(() => {
    const target = initialClips.find((c) => c.id === openClipId);
    if (!target) return;
    let done = false;
    return engine.subscribe((t) => {
      if (done || t.durationMs <= 0) return;
      done = true;
      setSelectedId(target.id);
      engine.setBounds(target.startMs, target.endMs);
      engine.seek(target.startMs, { exact: true });
    });
  }, [engine, initialClips, openClipId]);

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
   * the coach is told, rather than silently losing the clip.
   *
   * A new clip is its maker's alone until they share it, so a clip cut to
   * think about never lands in front of the panel by accident.
   */
  const saveClip = useCallback(
    async (startMs: number, endMs: number) => {
      const tempId = `pending-${crypto.randomUUID()}`;
      const optimistic: ClipRow = {
        id: tempId,
        startMs: Math.max(0, startMs),
        endMs,
        title: "",
        audience: { visibility: "private", roles: [], userIds: [] },
        createdBy: viewer.id,
        authorName: viewer.displayName,
        eventTypeIds: [],
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
          audience: optimistic.audience,
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
  const quickClip = useCallback(async () => {
    const at = engine.snapshot.positionMs;
    const start = Math.max(0, at - preRoll);
    const end = Math.min(video.durationMs || at + DEFAULT_POST_ROLL, at + DEFAULT_POST_ROLL);
    await saveClip(start, end);
    flash("Clip saved");
  }, [engine, preRoll, video.durationMs, saveClip, flash]);

  const commitInOut = useCallback(async () => {
    if (inMs == null) {
      flash("Set an in point first. Press I.");
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

  /* --------------------------------------------------------------- drawing */

  /**
   * Draw on the frame in front of you. The drawing is kept against that
   * frame (relative to the clip's in point, so it survives the clip's edges
   * being nudged later) until it is posted with its comment. Coming back to
   * an unposted drawing returns to its frame, since that is the picture it
   * was drawn on.
   */
  const toggleDrawing = useCallback(() => {
    if (!selected || selected.pending) {
      flash("Select a clip to draw on it.");
      return;
    }
    if (mode === "annotate") {
      setMode("transport");
      return;
    }
    engine.pause();
    if (draftHere?.shapes.length) {
      engine.seek(selected.startMs + draftHere.atMs, { exact: true });
    } else {
      const atMs = Math.max(0, Math.round(engine.snapshot.positionMs - selected.startMs));
      setDrawingDraft({ clipId: selected.id, atMs, shapes: [] });
    }
    setMode("annotate");
  }, [selected, mode, draftHere, engine, flash]);

  const discardDrawing = useCallback(() => {
    setDrawingDraft(null);
    setMode("transport");
  }, []);

  /* -------------------------------------------------------------- keyboard */

  const onCommand = useCallback(
    (command: Command) => {
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
            discardDrawing();
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
          toggleDrawing();
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
          // The picture alone, not the whole workspace with its side panels.
          toggleStageFullscreen(document.querySelector<HTMLElement>("[data-video-stage]"));
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
      toggleDrawing,
      discardDrawing,
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

  const nextClipStart = useMemo(() => {
    const idx = clips.findIndex((c) => c.id === selectedId);
    return idx >= 0 && idx + 1 < clips.length ? clips[idx + 1].startMs : null;
  }, [clips, selectedId]);

  /* ------------------------------------------------------- stats on the bar */

  const statSheet = useMemo(() => numberSheet(statNumbers ?? []), [statNumbers]);

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
        <Link href="/" className="flex items-center gap-2" title="Back to the matches">
          <Mark className="h-[17px]" />
          <span className="wordmark text-[17px]">Ardawn</span>
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
            {clips.length} clip{clips.length === 1 ? "" : "s"}
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
            // While drawing, the pen's own work; otherwise whatever was drawn
            // on the frame playback is stopped at, and nothing while it plays.
            shapes={mode === "annotate" ? (draftHere?.shapes ?? []) : shapesOf(stop)}
            onShapesChange={(shapes) => setDrawingDraft((d) => (d ? { ...d, shapes } : d))}
            drawing={mode === "annotate"}
            tool={tool}
            colour={colour}
            preloadMs={nextClipStart}
            overlay={said && said.comments.length > 0 && <StopCard stop={said} onPlay={() => void engine.play()} />}
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
              <span className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                Then say what it shows in the comments, and post it.
              </span>
              <div className="flex-1" />
              <button
                onClick={() => setDrawingDraft((d) => (d ? { ...d, shapes: d.shapes.slice(0, -1) } : d))}
                disabled={!draftHere?.shapes.length}
                className="btn-ghost text-xs"
              >
                Undo
              </button>
              <button
                onClick={() => setDrawingDraft((d) => (d ? { ...d, shapes: [] } : d))}
                disabled={!draftHere?.shapes.length}
                className="btn-ghost text-xs"
              >
                Clear
              </button>
              <button onClick={toggleDrawing} className="btn-primary text-xs">
                Done
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
            <Timecode engine={engine} markers={markers} halfLengthMin={halfLengthMin} precise />
            <RateBadge engine={engine} />
          </div>

          <Timeline
            engine={engine}
            durationMs={video.durationMs}
            // Stats mode is about the sheet, not the clip list: the lanes
            // below carry the marks and the bar stays a plain scrubber.
            clips={statsOpen ? [] : timelineClips}
            markers={markers}
            halfLengthMin={halfLengthMin}
            selectedClipId={selectedId}
            inMs={inMs}
            outMs={outMs}
            onSelectClip={(id) => {
              const clip = clips.find((c) => c.id === id);
              if (clip) focusClip(clip);
            }}
            labelGutterPx={statsOpen ? LANE_GUTTER_PX : 0}
            compact={statsOpen}
          />

          {statsOpen && (
            <StatLanes
              engine={engine}
              durationMs={video.durationMs}
              rows={placedStatRows}
              sheet={statSheet}
              focusType={statType}
              onFocusType={setStatType}
              onSelectStat={jumpToStat}
              gutterPx={LANE_GUTTER_PX}
              code={code}
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
            <ClipBar
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
              code={code}
              sheet={statSheet}
              rows={placedStatRows}
              setRows={setStatRows}
              statType={statType}
              setStatType={setStatType}
              onJump={jumpToStat}
              markers={markers}
              halfLengthMin={halfLengthMin}
              onSetHalf={(kind, atMs) => {
                setMarkerList((prev) => [
                  ...prev.filter((m) => m.kind !== kind),
                  ...(atMs == null ? [] : [{ kind, atMs: Math.round(atMs) }]),
                ]);
                setVideoMarker(video.id, kind, atMs).catch((err) => flash((err as Error).message));
              }}
              firstHalfEnd={firstHalfEnd}
              onFirstHalfEnd={(end) => {
                setFirstHalfEndState(end);
                setFirstHalfEnd(video.id, end).catch((err) => flash((err as Error).message));
              }}
              onHalfLength={(minutes) => {
                if (!match.id) return;
                const before = halfLengthMin;
                setHalfLengthMinState(minutes);
                setHalfLength(match.id, minutes).catch((err) => {
                  setHalfLengthMinState(before);
                  flash((err as Error).message);
                });
              }}
            />
          ) : (
            <>
              <ClipList
                clips={clips}
                selectedId={selectedId}
                markers={markers}
                halfLengthMin={halfLengthMin}
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
                  squad={squad}
                  viewer={viewer}
                  engine={engine}
                  comments={commentsHere}
                  onCommentsChange={(rows) => setClipComments({ clipId: selected.id, rows })}
                  drawing={mode === "annotate"}
                  drawingDraft={draftHere}
                  onDraw={toggleDrawing}
                  onDrawingPosted={() => {
                    setDrawingDraft(null);
                    if (mode === "annotate") setMode("transport");
                  }}
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
          role="status"
          className="pointer-events-none fixed bottom-6 left-1/2 z-40 -translate-x-1/2 border border-t-[3px] px-4 py-2 text-[13px] font-medium"
          style={{
            background: "var(--color-surface-2)",
            borderColor: "var(--color-line-strong)",
            borderTopColor: "var(--color-rule)",
            borderRadius: 2,
            color: "var(--color-ink)",
          }}
        >
          {toast}
        </div>
      )}

      <CheatSheet open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

/* ----------------------------------------------------------------- clip bar */

/** Making clips: quick clip with its pre-roll, and a saved in and out. */
function ClipBar({
  preRoll,
  onPreRollChange,
  onQuickClip,
  inMs,
  outMs,
  onCommit,
}: {
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
      <div className="flex items-center gap-3">
        <button onClick={onQuickClip} className="btn-primary text-xs">
          <span className="kbd" style={{ background: "transparent", borderColor: "currentColor", color: "inherit" }}>
            C
          </span>
          Quick clip
        </button>

        <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          Pre-roll
          <input
            type="range"
            min={2}
            max={20}
            step={1}
            value={preRoll / 1000}
            onChange={(e) => onPreRollChange(Number(e.target.value) * 1000)}
            className="w-24 accent-[var(--color-ink)]"
          />
          <span className="tabular w-6">{preRoll / 1000}s</span>
        </label>

        <div className="flex-1" />

        {inMs != null && (
          <div className="tabular flex items-center gap-2 text-[12px]">
            <span style={{ color: "var(--color-mark)" }}>
              In {formatClock(inMs)}
              {outMs != null && ` to ${formatClock(outMs)}`}
            </span>
            <button onClick={onCommit} className="btn-outline px-2 py-1 text-[11px]">
              Save <span className="kbd ml-1">Enter</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
