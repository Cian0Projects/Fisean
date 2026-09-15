"use client";

import Link from "next/link";

/**
 * The review workspace.
 *
 * This is the screen the product lives or dies on: a selector should be able
 * to open a 70-minute match and have it fully tagged in about 70 minutes,
 * without touching the mouse.
 *
 * Three things make that possible, and they are all visible in here:
 *
 *  - Quick-clip (`C`). You press it *after* seeing the incident and the clip
 *    covers the pre-roll seconds you just watched. No pausing, no scrubbing
 *    back, no dragging handles.
 *  - Optimistic saves. A clip appears in the list on the keypress and is
 *    persisted behind the scenes, so tagging never waits on the network.
 *  - Number-key tagging straight from the hurling taxonomy, which is loaded
 *    from the database rather than hardcoded.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlayerEngine } from "@/components/player/engine";
import { RateBadge, Timecode, VideoStage } from "@/components/player/VideoStage";
import { Timeline, type TimelineClip } from "@/components/player/Timeline";
import { CheatSheet } from "@/components/player/CheatSheet";
import { TOOLS, COLOURS, type Tool } from "@/components/player/AnnotationLayer";
import { useHotkeys } from "@/lib/keyboard/useHotkeys";
import type { Command, Mode } from "@/lib/keyboard/keymap";
import { formatClock, markersFromRows, tallyScore, formatScore } from "@/lib/hurling/notation";
import { createClip, deleteClip, setClipTags } from "@/lib/actions/clips";
import { saveAnnotation } from "@/lib/actions/review";
import type { Shape } from "@/lib/db/schema";
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

type Props = {
  video: VideoInfo;
  match: MatchInfo;
  eventTypes: EventTypeRow[];
  squad: SquadMember[];
  initialClips: ClipRow[];
  markerRows: { kind: string; atMs: number }[];
  viewer: Viewer;
};

export function ReviewWorkspace({
  video,
  match,
  eventTypes,
  squad,
  initialClips,
  markerRows,
  viewer,
}: Props) {
  const engine = useMemo(() => new PlayerEngine(), []);
  const markers = useMemo(() => markersFromRows(markerRows), [markerRows]);

  const [clips, setClips] = useState<ClipRow[]>(initialClips);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inMs, setInMs] = useState<number | null>(null);
  const [outMs, setOutMs] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("transport");
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [preRoll, setPreRoll] = useState(DEFAULT_PRE_ROLL);

  // Drawing state.
  const [tool, setTool] = useState<Tool>("arrow");
  const [colour, setColour] = useState(COLOURS[0]);
  const [draftShapes, setDraftShapes] = useState<Shape[]>([]);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoStack = useRef<string[]>([]);

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
    if (selectedId === id) setSelectedId(null);
    try {
      await deleteClip(id);
      flash("Clip removed");
    } catch (err) {
      flash((err as Error).message);
    }
  }, [selectedId, flash]);

  /* -------------------------------------------------------- clip playback */

  const playClip = useCallback(
    (clip: ClipRow) => {
      setSelectedId(clip.id);
      engine.playRange(clip.startMs, clip.endMs);
    },
    [engine],
  );

  const stepClip = useCallback(
    (delta: 1 | -1) => {
      if (!clips.length) return;
      const idx = clips.findIndex((c) => c.id === selectedId);
      const next = clips[Math.min(clips.length - 1, Math.max(0, (idx === -1 ? 0 : idx) + delta))];
      if (next) playClip(next);
    },
    [clips, selectedId, playClip],
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
      flash,
    ],
  );

  useHotkeys(mode, onCommand);

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

  return (
    <div className="flex h-dvh flex-col overflow-hidden" style={{ background: "var(--color-stage)" }}>
      {/* ------------------------------------------------------------ header */}
      <header
        className="flex shrink-0 items-center gap-4 border-b px-4 py-2"
        style={{ borderColor: "var(--color-line)" }}
      >
        <Link href="/" className="text-sm font-semibold" style={{ color: "var(--color-brand)" }}>
          Físeán
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {match.opponent}
            {match.competition && (
              <span style={{ color: "var(--color-ink-faint)" }}> · {match.competition}</span>
            )}
          </div>
          <div className="text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
            {match.playedOn} · {clips.length} clip{clips.length === 1 ? "" : "s"}
            {scoreline.cul + scoreline.cuilin > 0 && (
              <> · tagged scores {formatScore(scoreline)}</>
            )}
          </div>
        </div>

        <Timecode engine={engine} markers={markers} halfLengthMin={match.halfLengthMin} precise />
        <RateBadge engine={engine} />
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

          <Timeline
            engine={engine}
            durationMs={video.durationMs}
            clips={timelineClips}
            markers={markers}
            halfLengthMin={match.halfLengthMin}
            selectedClipId={selectedId}
            inMs={inMs}
            outMs={outMs}
            onSelectClip={(id) => {
              const clip = clips.find((c) => c.id === id);
              if (clip) playClip(clip);
            }}
          />

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
        </main>

        {/* ------------------------------------------------------------ side */}
        <aside
          className="flex w-[340px] shrink-0 flex-col border-l"
          style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}
        >
          <ClipList
            clips={clips}
            eventTypes={eventTypes}
            selectedId={selectedId}
            markers={markers}
            halfLengthMin={match.halfLengthMin}
            onSelect={playClip}
            onDelete={async (id) => {
              setClips((prev) => prev.filter((c) => c.id !== id));
              if (selectedId === id) setSelectedId(null);
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
