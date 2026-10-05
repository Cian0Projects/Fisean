"use client";

/**
 * Watching and clipping a match on a phone.
 *
 * The desktop workspace is keyboard-first and wide; a phone is neither. So
 * this is a different screen over the same engine and the same server
 * actions, not the desktop one squeezed. Held upright, the video and its
 * controls stay pinned at the top while the clip list scrolls beneath them.
 * Turned sideways, the video takes the whole screen.
 *
 * Clipping keeps both of the desktop's ways in, each as one big button:
 *
 *  - "Clip that" is quick-clip. Tap it *after* you see something and it
 *    takes the eight seconds you just watched plus three after, the same
 *    as the `C` key.
 *  - "Mark start", then "End clip", for a passage whose length you choose.
 *
 * Either way the video pauses and the clip sheet rises to trim, tag and
 * credit it. Saves are optimistic, as on the desktop: the clip is in the list
 * before the server has answered, and taken back out if it refuses.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlayerEngine } from "@/components/player/engine";
import { Timecode, VideoStage } from "@/components/player/VideoStage";
import { createClip, deleteClip, setClipPlayers, setClipTags, updateClip } from "@/lib/actions/clips";
import { formatClock, markersFromRows, toGameTime } from "@/lib/hurling/notation";
import { MIN_CLIP_MS } from "@/lib/hurling/clip-rules";
import { matchDate } from "@/lib/format";
import {
  clipColour,
  eventLabelOf,
  type ClipRow,
  type EventTypeRow,
  type MatchInfo,
  type SquadMember,
  type VideoInfo,
  type Viewer,
} from "@/components/review/types";
import { PhoneScrubber } from "./PhoneScrubber";
import { ClipSheet, type ClipDraft } from "./ClipSheet";
import { ChevronIcon, PauseIcon, PlayIcon } from "@/components/ui/Icon";

/** The same pre- and post-roll as the desktop's quick-clip key. */
const PRE_ROLL_MS = 8000;
const POST_ROLL_MS = 3000;
const SKIP_MS = 10_000;
/** Slow motion is the one speed change worth a button on a phone. */
const RATES = [1, 0.5, 0.25] as const;

type Filter = "all" | "mine" | "me";

type Sheet =
  | { mode: "new"; draft: ClipDraft }
  | { mode: "edit"; clipId: string; draft: ClipDraft };

type Props = {
  video: VideoInfo;
  match: MatchInfo;
  eventTypes: EventTypeRow[];
  squad: SquadMember[];
  initialClips: ClipRow[];
  markerRows: { kind: string; atMs: number }[];
  viewer: Viewer;
  openClipId: string | null;
};

export function PhoneWatch({
  video,
  match,
  eventTypes,
  squad,
  initialClips,
  markerRows,
  viewer,
  openClipId,
}: Props) {
  const [engine] = useState(() => new PlayerEngine());
  const markers = useMemo(() => markersFromRows(markerRows), [markerRows]);
  const stageRef = useRef<HTMLDivElement>(null);

  const [clips, setClips] = useState(initialClips);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [inMs, setInMs] = useState<number | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [rateIdx, setRateIdx] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const playing = usePlaying(engine);

  const flash = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const focused = clips.find((c) => c.id === focusedId) ?? null;
  const canEdit = (c: ClipRow) => !c.pending && (viewer.role !== "player" || c.createdBy === viewer.id);
  const labelOf = (c: ClipRow) => {
    if (c.title) return c.title;
    const first = eventTypes.find((e) => e.id === c.eventTypeIds[0]);
    return first ? eventLabelOf(first) : "Untitled clip";
  };

  const playClip = useCallback(
    (c: ClipRow) => {
      setFocusedId(c.id);
      engine.playRange(c.startMs, c.endMs);
    },
    [engine],
  );

  const backToMatch = useCallback(() => {
    engine.clearBounds();
    setFocusedId(null);
  }, [engine]);

  // Arriving from "Clips you are in": park on that clip once the file has
  // loaded far enough to seek. It waits for a tap to play, because phones
  // refuse to start video with sound before the user has touched the page.
  useEffect(() => {
    const target = initialClips.find((c) => c.id === openClipId);
    if (!target) return;
    let done = false;
    const unsubscribe = engine.subscribe((t) => {
      if (done || t.durationMs <= 0) return;
      done = true;
      setFocusedId(target.id);
      engine.setBounds(target.startMs, target.endMs);
      engine.seek(target.startMs, { exact: true });
    });
    return unsubscribe;
  }, [engine, initialClips, openClipId]);

  /* ------------------------------------------------------------ clipping */

  const openNew = (startMs: number, endMs: number) => {
    engine.pause();
    setSheet({
      mode: "new",
      draft: { startMs, endMs, title: "", eventTypeIds: [], playerIds: [], visibility: "team" },
    });
  };

  const clipThat = () => {
    const at = engine.snapshot.positionMs;
    const end = video.durationMs ? Math.min(video.durationMs, at + POST_ROLL_MS) : at + POST_ROLL_MS;
    openNew(Math.max(0, at - PRE_ROLL_MS), end);
  };

  const markStart = () => {
    backToMatch();
    setInMs(engine.snapshot.positionMs);
  };

  const endClip = () => {
    if (inMs == null) return;
    const end = engine.snapshot.positionMs;
    if (end - inMs < MIN_CLIP_MS) {
      flash("Let it play a moment longer, then end the clip.");
      return;
    }
    setInMs(null);
    openNew(inMs, end);
  };

  const closeSheet = () => {
    setSheet(null);
    // Trimming pinned playback to the draft; let go of it unless a saved
    // clip is still the one being watched.
    if (focused) engine.setBounds(focused.startMs, focused.endMs);
    else engine.clearBounds();
  };

  const saveNew = async (draft: ClipDraft) => {
    setSheet(null);
    backToMatch();
    const tempId = `pending-${Date.now()}`;
    const optimistic: ClipRow = {
      id: tempId,
      ...draft,
      title: draft.title.trim(),
      createdBy: viewer.id,
      authorName: viewer.displayName,
      commentCount: 0,
      annotationCount: 0,
      pending: true,
    };
    setClips((prev) => [...prev, optimistic].sort((a, b) => a.startMs - b.startMs));
    flash("Clip saved");

    try {
      const saved = await createClip({ videoId: video.id, ...draft });
      setClips((prev) =>
        prev.map((c) => (c.id === tempId ? { ...optimistic, id: saved.id, pending: false } : c)),
      );
    } catch (err) {
      setClips((prev) => prev.filter((c) => c.id !== tempId));
      flash((err as Error).message || "That clip could not be saved.");
    }
  };

  const saveEdit = async (clipId: string, draft: ClipDraft) => {
    const before = clips.find((c) => c.id === clipId);
    if (!before) return;
    setSheet(null);
    const after: ClipRow = { ...before, ...draft, title: draft.title.trim() };
    setClips((prev) => prev.map((c) => (c.id === clipId ? after : c)).sort((a, b) => a.startMs - b.startMs));
    if (focusedId === clipId) engine.setBounds(after.startMs, after.endMs);
    else engine.clearBounds();

    const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
    try {
      await updateClip(clipId, {
        title: draft.title,
        startMs: draft.startMs,
        endMs: draft.endMs,
        visibility: draft.visibility,
      });
      if (!same(before.eventTypeIds, draft.eventTypeIds)) await setClipTags(clipId, draft.eventTypeIds);
      if (!same(before.playerIds, draft.playerIds)) await setClipPlayers(clipId, draft.playerIds);
      flash("Clip updated");
    } catch (err) {
      setClips((prev) => prev.map((c) => (c.id === clipId ? before : c)));
      flash((err as Error).message || "That change could not be saved.");
    }
  };

  const remove = async (clipId: string) => {
    const before = clips.find((c) => c.id === clipId);
    if (!before || !window.confirm("Delete this clip? This cannot be undone.")) return;
    setSheet(null);
    if (focusedId === clipId) backToMatch();
    else engine.clearBounds();
    setClips((prev) => prev.filter((c) => c.id !== clipId));
    try {
      await deleteClip(clipId);
      flash("Clip deleted");
    } catch (err) {
      setClips((prev) => [...prev, before].sort((a, b) => a.startMs - b.startMs));
      flash((err as Error).message || "That clip could not be deleted.");
    }
  };

  /* ----------------------------------------------------------- transport */

  const cycleRate = () => {
    const next = (rateIdx + 1) % RATES.length;
    setRateIdx(next);
    engine.setRate(RATES[next]);
  };

  /**
   * Full screen for the picture alone. Android and iPad can put any element
   * full screen; an iPhone can only hand the <video> to its own player,
   * which brings its own controls and is fine for watching.
   */
  const fullScreen = () => {
    const stage = stageRef.current;
    const el = stage?.querySelector("video") as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;
    if (stage && document.fullscreenEnabled) {
      void stage
        .requestFullscreen()
        .then(() => {
          const orientation = screen.orientation as ScreenOrientation & {
            lock?: (o: "landscape") => Promise<void>;
          };
          return orientation.lock?.("landscape");
        })
        .catch(() => {});
    } else {
      el?.webkitEnterFullscreen?.();
    }
  };

  const shown = clips.filter((c) =>
    filter === "mine" ? c.createdBy === viewer.id : filter === "me" ? c.playerIds.includes(viewer.id) : true,
  );

  const ticks = useMemo(
    () =>
      clips.map((c) => ({
        id: c.id,
        startMs: c.startMs,
        endMs: c.endMs,
        colour: clipColour(c, eventTypes),
      })),
    [clips, eventTypes],
  );

  return (
    <div className="mx-auto min-h-dvh max-w-xl landscape:max-w-none">
      {/* Pinned while upright; sideways the video is the whole screen and the
          controls scroll into view beneath it. */}
      <div
        className="portrait:sticky portrait:top-0 z-20"
        style={{ background: "var(--color-stage)", paddingTop: "env(safe-area-inset-top)" }}
      >
        <header className="flex h-11 items-center gap-2 px-2 landscape:hidden">
          <Link href="/m" aria-label="Back to matches" className="flex h-11 w-11 items-center justify-center">
            <ChevronIcon direction="left" size={18} />
          </Link>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="title truncate text-[16px]">
              {match.id ? `v ${match.opponent}` : match.opponent}
            </div>
            {match.playedOn && (
              <div className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                {matchDate(match.playedOn)}
              </div>
            )}
          </div>
        </header>

        <div ref={stageRef} className="relative flex aspect-video max-h-dvh w-full bg-black">
          <VideoStage engine={engine} src={video.src} fps={video.fps ?? undefined} />
        </div>

        {video.codecWarning && (
          <p className="px-4 py-2 text-[12px]" style={{ color: "var(--color-mark)" }}>
            {video.codecWarning}
          </p>
        )}

        <div className="px-4">
          <PhoneScrubber
            engine={engine}
            durationMs={video.durationMs}
            ticks={ticks}
            focus={focused}
            inMs={inMs}
            onScrubStart={() => focusedId && backToMatch()}
          />
          <div className="-mt-1 flex items-baseline justify-between">
            <Timecode engine={engine} markers={markers} halfLengthMin={match.halfLengthMin} />
            <span className="tabular text-xs" style={{ color: "var(--color-ink-faint)" }}>
              {formatClock(video.durationMs)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between px-2 py-1">
          <RoundButton label="Back 10 seconds" onClick={() => engine.nudge(-SKIP_MS)}>
            −10
          </RoundButton>
          <RoundButton label={playing ? "Pause" : "Play"} onClick={() => engine.toggle()} big>
            {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
          </RoundButton>
          <RoundButton label="Forward 10 seconds" onClick={() => engine.nudge(SKIP_MS)}>
            +10
          </RoundButton>
          <RoundButton label="Playback speed" onClick={cycleRate}>
            {RATES[rateIdx] === 1 ? "1×" : RATES[rateIdx] === 0.5 ? "½×" : "¼×"}
          </RoundButton>
          <RoundButton label="Full screen" onClick={fullScreen}>
            ⛶
          </RoundButton>
        </div>

        <div className="flex gap-2 border-b px-4 pb-3" style={{ borderColor: "var(--color-line)" }}>
          {inMs == null ? (
            <>
              <button className="btn-primary min-h-12 flex-1 text-[16px]" onClick={clipThat}>
                Clip that
              </button>
              <button className="btn-outline min-h-12 flex-1 text-[16px]" onClick={markStart}>
                Mark start
              </button>
            </>
          ) : (
            <>
              <button className="btn-ghost min-h-12 px-4 text-[16px]" onClick={() => setInMs(null)}>
                Cancel
              </button>
              <button className="btn-primary min-h-12 flex-1 text-[16px]" onClick={endClip}>
                End clip <RunningLength engine={engine} fromMs={inMs} />
              </button>
            </>
          )}
        </div>

        {focused && (
          <div
            className="flex items-center gap-2 border-b px-4 py-2"
            style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}
          >
            <span className="min-w-0 flex-1 truncate text-[14px]">
              <span style={{ color: "var(--color-ink-faint)" }}>Watching </span>
              {labelOf(focused)}
            </span>
            <button className="btn-ghost min-h-10 text-[14px]" onClick={backToMatch}>
              Back to the match
            </button>
          </div>
        )}
      </div>

      <section className="pb-24">
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <h2 className="title flex-1 text-lg">
            Clips <span className="tabular" style={{ color: "var(--color-ash-dim)" }}>{shown.length}</span>
          </h2>
          {(
            [
              ["all", "All"],
              ["mine", "Mine"],
              ["me", "I'm in"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={`min-h-10 px-2.5 text-[14px] ${filter === key ? "here" : ""}`}
              style={{ color: filter === key ? "var(--color-ink)" : "var(--color-ink-dim)" }}
            >
              {label}
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="px-4 py-6 text-[14px]" style={{ color: "var(--color-ink-faint)" }}>
            {filter === "all"
              ? "No clips yet. Tap “Clip that” when you see something worth keeping."
              : "Nothing here yet."}
          </p>
        ) : (
          <ul>
            {shown.map((c) => {
              const here = c.id === focusedId;
              return (
                <li
                  key={c.id}
                  className="fixture flex items-stretch"
                  style={here ? { background: "var(--color-surface-2)" } : undefined}
                >
                  <button
                    className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pl-4 text-left"
                    onClick={() => playClip(c)}
                    disabled={c.pending}
                  >
                    <span aria-hidden className="h-9 w-1 shrink-0 rounded-full" style={{ background: clipColour(c, eventTypes) }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px]">{labelOf(c)}</span>
                      <span className="block truncate text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                        {toGameTime(c.startMs, markers, match.halfLengthMin).label}
                        {", "}
                        {Math.round((c.endMs - c.startMs) / 1000)} s
                        {c.createdBy !== viewer.id && `, ${c.authorName}`}
                        {c.visibility === "private" && ", only you"}
                        {c.pending && ", saving"}
                      </span>
                    </span>
                  </button>
                  {canEdit(c) && (
                    <button
                      className="min-h-14 px-4 text-[14px]"
                      style={{ color: "var(--color-ink-dim)" }}
                      onClick={() => {
                        engine.pause();
                        setSheet({
                          mode: "edit",
                          clipId: c.id,
                          draft: {
                            startMs: c.startMs,
                            endMs: c.endMs,
                            title: c.title,
                            eventTypeIds: c.eventTypeIds,
                            playerIds: c.playerIds,
                            visibility: c.visibility,
                          },
                        });
                      }}
                    >
                      Edit
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {sheet && (
        <ClipSheet
          key={sheet.mode === "edit" ? sheet.clipId : "new"}
          heading={sheet.mode === "edit" ? "Edit clip" : "New clip"}
          initial={sheet.draft}
          engine={engine}
          durationMs={video.durationMs}
          markers={markers}
          halfLengthMin={match.halfLengthMin}
          eventTypes={eventTypes}
          squad={squad}
          onClose={closeSheet}
          onSave={(draft) => (sheet.mode === "edit" ? saveEdit(sheet.clipId, draft) : saveNew(draft))}
          onDelete={sheet.mode === "edit" ? () => remove(sheet.clipId) : undefined}
        />
      )}

      {toast && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          <span
            className="rounded px-4 py-2.5 text-[14px]"
            style={{ background: "var(--color-surface-3)", border: "1px solid var(--color-line-strong)" }}
          >
            {toast}
          </span>
        </div>
      )}
    </div>
  );
}

function RoundButton({
  label,
  onClick,
  big = false,
  children,
}: {
  label: string;
  onClick: () => void;
  big?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`tabular flex items-center justify-center rounded-full transition-colors active:bg-[var(--color-surface-3)] ${
        big ? "h-14 w-14 text-[18px]" : "h-12 w-12 text-[15px]"
      }`}
      style={big ? { background: "var(--color-surface-2)", border: "1px solid var(--color-line-strong)" } : undefined}
    >
      {children}
    </button>
  );
}

/** Play state at human speed, without re-rendering on every frame. */
function usePlaying(engine: PlayerEngine): boolean {
  const [playing, setPlaying] = useState(false);
  useEffect(
    () => engine.subscribe((t) => setPlaying((was) => (was === t.playing ? was : t.playing))),
    [engine],
  );
  return playing;
}

/** How long the clip being marked has run, ticking without React. */
function RunningLength({ engine, fromMs }: { engine: PlayerEngine; fromMs: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(
    () =>
      engine.subscribe((t) => {
        if (ref.current) ref.current.textContent = `${Math.max(0, Math.round((t.positionMs - fromMs) / 1000))} s`;
      }),
    [engine, fromMs],
  );
  return <span ref={ref} className="tabular opacity-75" />;
}
