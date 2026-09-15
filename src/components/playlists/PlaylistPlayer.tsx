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
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlayerEngine } from "@/components/player/engine";
import { VideoStage, Timecode } from "@/components/player/VideoStage";
import { AnnotationLayer } from "@/components/player/AnnotationLayer";
import { useHotkeys } from "@/lib/keyboard/useHotkeys";
import type { Command } from "@/lib/keyboard/keymap";
import { formatClock } from "@/lib/hurling/notation";
import { markPlaylistViewed } from "@/lib/actions/playlists";
import { addComment } from "@/lib/actions/review";
import { listComments } from "@/lib/actions/reads";
import type { Shape } from "@/lib/db/schema";
import type { CommentRow } from "@/components/review/types";

export type PlaylistClip = {
  itemId: string;
  clipId: string;
  videoId: string;
  src: string;
  title: string;
  note: string | null;
  startMs: number;
  endMs: number;
  tags: { label: string; colour: string }[];
  annotations: { atMs: number; durationMs: number; shapes: Shape[] }[];
};

export function PlaylistPlayer({
  playlistId,
  title,
  clips,
  viewerName,
}: {
  playlistId: string;
  title: string;
  clips: PlaylistClip[];
  viewerName: string;
}) {
  const engine = useMemo(() => new PlayerEngine(), []);
  const [index, setIndex] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [positionMs, setPositionMs] = useState(0);
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

  useEffect(() => engine.subscribe((t) => setPositionMs(t.positionMs)), [engine]);

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
    <div className="flex min-h-dvh flex-col lg:flex-row" style={{ background: "var(--color-stage)" }}>
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
            Previous
          </button>
          <button onClick={() => engine.toggle()} className="btn-primary text-xs">
            Play / pause
          </button>
          <button
            onClick={next}
            disabled={index + 1 >= clips.length}
            className="btn-outline text-xs"
          >
            Next
          </button>

          <Timecode engine={engine} markers={{}} halfLengthMin={30} />

          <div className="flex-1" />

          <label className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--color-ink-dim)" }}>
            <input
              type="checkbox"
              checked={autoAdvance}
              onChange={(e) => setAutoAdvance(e.target.checked)}
              className="accent-[var(--color-brand)]"
            />
            Autoplay
          </label>
          <span className="tabular text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            {index + 1} / {clips.length}
          </span>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <h1 className="text-base font-semibold">{current.title || "Untitled clip"}</h1>
            {current.note && (
              <p className="mt-1 text-[13px]" style={{ color: "var(--color-ink-dim)" }}>
                {current.note}
              </p>
            )}
            {current.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {current.tags.map((t, i) => (
                  <span
                    key={i}
                    className="rounded px-1.5 py-0.5 text-[11px]"
                    style={{
                      background: `color-mix(in oklab, ${t.colour} 26%, transparent)`,
                      color: "var(--color-ink)",
                    }}
                  >
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
                Nothing yet. Say what you see.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {comments.map((c) => (
                  <li key={c.id} className="text-[13px]">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium">{c.authorName}</span>
                      {c.atMs != null && (
                        <button
                          onClick={() => engine.seek(current.startMs + c.atMs!, { exact: true })}
                          className="tabular text-[11px]"
                          style={{ color: "var(--color-brand)" }}
                        >
                          {formatClock(c.atMs)}
                        </button>
                      )}
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap" style={{ color: "var(--color-ink-dim)" }}>
                      {c.body}
                    </p>
                  </li>
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
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--color-line)" }}>
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <ol>
          {clips.map((c, i) => (
            <li key={c.itemId}>
              <button
                onClick={() => goTo(i)}
                className="flex w-full gap-3 border-b px-4 py-2.5 text-left"
                style={{
                  borderColor: "var(--color-line)",
                  background: i === index ? "var(--color-surface-2)" : "transparent",
                }}
              >
                <span
                  className="tabular text-[11px]"
                  style={{ color: "var(--color-ink-faint)" }}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">
                    {c.title || "Untitled clip"}
                  </span>
                  <span className="tabular text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
                    {((c.endMs - c.startMs) / 1000).toFixed(0)}s
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
