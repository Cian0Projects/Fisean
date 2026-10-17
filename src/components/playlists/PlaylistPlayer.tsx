"use client";

/**
 * Playlist playback.
 *
 * This is the screen most of the panel will actually use, usually on a phone,
 * so it has to feel like watching a reel rather than clicking through a file
 * list. Clips advance automatically, and because the next clip's in point is
 * handed to the video stage as a preload target, the element beside the
 * visible one is already parked there when the current clip ends.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlayerEngine } from "@/components/player/engine";
import { VideoStage, Timecode } from "@/components/player/VideoStage";
import { AnnotationLayer } from "@/components/player/AnnotationLayer";
import { useHotkeys } from "@/lib/keyboard/useHotkeys";
import type { Command } from "@/lib/keyboard/keymap";
import { CommentItem } from "@/components/review/CommentItem";
import { markPlaylistViewed } from "@/lib/actions/playlists";
import { addComment } from "@/lib/actions/review";
import { listComments } from "@/lib/actions/reads";
import type { Shape } from "@/lib/db/schema";
import type { CommentRow } from "@/components/review/types";
import type { TagTone } from "@/lib/hurling/events";
import { TagMark } from "@/components/ui/TagMark";
import { ChevronIcon, PauseIcon, PlayIcon } from "@/components/ui/Icon";

export type PlaylistClip = {
  itemId: string;
  clipId: string;
  videoId: string;
  src: string;
  title: string;
  note: string | null;
  startMs: number;
  endMs: number;
  tags: { label: string; tone: TagTone }[];
  annotations: { atMs: number; durationMs: number; shapes: Shape[] }[];
};

export function PlaylistPlayer({
  playlistId,
  title,
  note,
  setBy,
  clips,
  viewerName,
  viewerId,
}: {
  playlistId: string;
  title: string;
  /** What the coach said when they set it: the reason to watch. */
  note: string | null;
  setBy: string | null;
  clips: PlaylistClip[];
  viewerName: string;
  viewerId: string;
}) {
  const engine = useMemo(() => new PlayerEngine(), []);
  const [index, setIndex] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [positionMs, setPositionMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [comments, setComments] = useState<CommentRow[] | null>(null);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);

  const current = clips[index];

  // Record that this player watched it. Coaches ask who has.
  useEffect(() => {
    void markPlaylistViewed(playlistId);
  }, [playlistId]);

  const goTo = useCallback(
    (i: number) => {
      if (i < 0 || i >= clips.length) return;
      setIndex(i);
      setComments(null);
    },
    [clips.length],
  );

  const next = useCallback(() => {
    if (index + 1 < clips.length) goTo(index + 1);
    else engine.pause();
  }, [index, clips.length, goTo, engine]);

  // Start the current clip, and hand the engine its out point so playback
  // stops cleanly at the boundary instead of running into the next passage.
  useEffect(() => {
    if (!current) return;
    engine.playRange(current.startMs, current.endMs, () => {
      if (autoAdvance) next();
    });
  }, [current, engine, autoAdvance, next]);

  useEffect(
    () =>
      engine.subscribe((t) => {
        setPositionMs(t.positionMs);
        setPlaying(t.playing);
      }),
    [engine],
  );

  useEffect(() => {
    if (!current || comments !== null) return;
    void listComments(current.clipId).then(setComments);
  }, [current, comments]);

  useHotkeys(
    typing ? "text" : "transport",
    useCallback(
      (command: Command) => {
        switch (command) {
          case "toggle_play":
            engine.toggle();
            break;
          case "next_clip":
            next();
            break;
          case "prev_clip":
            goTo(index - 1);
            break;
          case "nudge_back_1s":
            engine.nudge(-1000);
            break;
          case "nudge_fwd_1s":
            engine.nudge(1000);
            break;
          default:
            break;
        }
      },
      [engine, next, goTo, index],
    ),
  );

  if (!current) {
    return (
      <div className="p-8 text-center text-sm" style={{ color: "var(--color-ink-dim)" }}>
        This playlist has no clips yet.
      </div>
    );
  }

  // Only the drawings whose window covers the playhead are on screen.
  const clipOffset = positionMs - current.startMs;
  const visibleShapes: Shape[] = current.annotations
    .filter((a) => clipOffset >= a.atMs && clipOffset <= a.atMs + a.durationMs)
    .flatMap((a) => a.shapes);

  // Preload only works within one source file; a different match starts fresh.
  const upcoming = clips[index + 1];
  const preloadMs =
    upcoming && upcoming.videoId === current.videoId ? upcoming.startMs : null;

  const post = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    try {
      const posted = await addComment({
        clipId: current.clipId,
        body,
        atMs: Math.max(0, clipOffset),
      });
      setComments((prev) => [...(prev ?? []), posted]);
    } catch {
      setDraft(body);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col" style={{ background: "var(--color-stage)" }}>
      {/* The playlist as it was handed over: what it is, who set it, why. */}
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--color-line)" }}>
        <Link
          href="/playlists"
          className="inline-flex items-center gap-1 text-[13px]"
          style={{ color: "var(--color-ink-dim)" }}
        >
          <ChevronIcon direction="left" className="h-3.5 w-3.5" />
          Playlists
        </Link>
        <h1 className="title mt-1 text-[22px]">{title}</h1>
        {(setBy || note) && (
          <p className="measure mt-1 text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
            {setBy && <>Set by {setBy}.</>} {note}
          </p>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative aspect-video w-full bg-black">
            <VideoStage engine={engine} src={current.src} preloadMs={preloadMs} />
            {/* Saved drawings replay on top; they are never burned into the file. */}
            <div className="pointer-events-none absolute inset-0">
              <AnnotationLayer shapes={visibleShapes} />
            </div>
          </div>

          <div
            className="flex flex-wrap items-center gap-3 border-b px-4 py-3"
            style={{ borderColor: "var(--color-line)" }}
          >
            <button onClick={() => goTo(index - 1)} disabled={index === 0} className="btn-outline text-xs">
              <ChevronIcon direction="left" className="h-3.5 w-3.5" />
              Previous
            </button>
            <button onClick={() => engine.toggle()} className="btn-primary w-24 text-xs">
              {playing ? <PauseIcon className="h-3.5 w-3.5" /> : <PlayIcon className="h-3.5 w-3.5" />}
              {playing ? "Pause" : "Play"}
            </button>
            <button
              onClick={next}
              disabled={index + 1 >= clips.length}
              className="btn-outline text-xs"
            >
              Next
              <ChevronIcon direction="right" className="h-3.5 w-3.5" />
            </button>

            <Timecode engine={engine} markers={{}} halfLengthMin={30} />

            <div className="flex-1" />

            <label className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--color-ink-dim)" }}>
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={(e) => setAutoAdvance(e.target.checked)}
                className="accent-[var(--color-ink)]"
              />
              Play on to the next clip
            </label>
            <span className="tabular text-[13px]" style={{ color: "var(--color-ink-dim)" }}>
              Clip {index + 1} of {clips.length}
            </span>
          </div>

          <div className="space-y-4 p-4">
            <div>
              <h2 className="title text-[17px]">{current.title || "Untitled clip"}</h2>
              {current.note && (
                <p className="measure mt-1 text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
                  {current.note}
                </p>
              )}
              {current.tags.length > 0 && (
                <div
                  className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px]"
                  style={{ color: "var(--color-ink-dim)" }}
                >
                  {current.tags.map((t, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5">
                      <TagMark tone={t.tone} />
                      {t.label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h2 className="label mb-2">Comments</h2>
              {comments === null ? (
                <p className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                  Loading…
                </p>
              ) : comments.length === 0 ? (
                <p className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                  No comments on this clip yet.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {comments.map((c) => (
                    <CommentItem
                      key={c.id}
                      comment={c}
                      viewerId={viewerId}
                      underlineTime
                      onSeek={(atMs) => engine.seek(current.startMs + atMs, { exact: true })}
                      onSaved={(u) => setComments((prev) => prev?.map((x) => (x.id === u.id ? u : x)) ?? prev)}
                      onTextFocus={setTyping}
                    />
                  ))}
                </ul>
              )}

              <div className="mt-3 space-y-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onFocus={() => setTyping(true)}
                  onBlur={() => setTyping(false)}
                  rows={2}
                  placeholder={`Comment as ${viewerName}…`}
                  className="field resize-none"
                />
                <button onClick={() => void post()} className="btn-primary text-xs">
                  Post
                </button>
              </div>
            </div>
          </div>
        </div>

        <aside
          className="w-full shrink-0 border-t lg:w-80 lg:border-l lg:border-t-0"
          style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}
        >
          <h2 className="label border-b px-4 py-3" style={{ borderColor: "var(--color-line)" }}>
            Running order
          </h2>
          <ol>
            {clips.map((c, i) => (
              <li key={c.itemId}>
                <button
                  onClick={() => goTo(i)}
                  aria-current={i === index ? "true" : undefined}
                  className="flex w-full items-center gap-3 border-b px-4 py-2.5 text-left"
                  style={{
                    borderColor: "var(--color-line)",
                    background: i === index ? "var(--color-surface-2)" : "transparent",
                  }}
                >
                  <span className="jersey shrink-0">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">
                      {c.title || "Untitled clip"}
                    </span>
                    <span className="block tabular text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                      {((c.endMs - c.startMs) / 1000).toFixed(0)} s
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
