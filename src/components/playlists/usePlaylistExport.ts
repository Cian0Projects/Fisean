"use client";

/**
 * The state of exporting a playlist, or one clip of it, as a video: where the
 * comments sit, how far the recording has got, and the finished file. Shared
 * by the panel (the whole playlist) and the running order's rows (one clip),
 * so only one recording runs at a time. The drawing is in recordPlaylist.ts.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import type { CommentRow } from "@/components/review/types";
import { COMMENT_PLACES, DEFAULT_COMMENT_PLACE, exportFileName, type CommentsOnVideo } from "@/lib/hurling/clip-export";
import { canRecordVideo } from "@/components/drills/recordDrill";
import { recordPlaylist } from "./recordPlaylist";

type ClipToExport = { clipId: string; title: string; exportSrc: string; startMs: number; endMs: number };

const PLACE_KEY = "fisean.exportComments";

// Where the comments sit is a per-browser convenience, so it is read from
// storage as an external store: the server renders the default and the browser
// swaps in the saved choice without a mismatch.
const placeListeners = new Set<() => void>();
const watchPlace = (listener: () => void) => {
  placeListeners.add(listener);
  return () => void placeListeners.delete(listener);
};
// Held here as well, so a choice still shows where storage will not keep it.
let chosen: CommentsOnVideo | null = null;
function savedPlace(): CommentsOnVideo {
  if (chosen) return chosen;
  try {
    const saved = localStorage.getItem(PLACE_KEY);
    if (saved === "off" || COMMENT_PLACES.includes(saved as never)) return saved as CommentsOnVideo;
  } catch {
    // Private window or blocked storage: the default stands.
  }
  return DEFAULT_COMMENT_PLACE;
}
const watchNothing = () => () => {};

export type PlaylistExport = ReturnType<typeof usePlaylistExport>;

export function usePlaylistExport({
  title,
  teamName,
  clips,
  commentsByClip,
}: {
  title: string;
  teamName: string;
  clips: ClipToExport[];
  /** The comments as they are now, so one just posted is in the video. */
  commentsByClip: Record<string, CommentRow[]>;
}) {
  const place = useSyncExternalStore(watchPlace, savedPlace, () => DEFAULT_COMMENT_PLACE);
  // Known only in the browser; the server assumes it can so the button is not
  // missing from the first paint.
  const supported = useSyncExternalStore(watchNothing, canRecordVideo, () => true);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<{ url: string; file: File } | null>(null);

  // A finished video's object URL is let go when it is replaced or the page closes.
  useEffect(() => {
    if (!video) return;
    return () => URL.revokeObjectURL(video.url);
  }, [video]);

  const setPlace = (next: CommentsOnVideo) => {
    chosen = next;
    try {
      localStorage.setItem(PLACE_KEY, next);
    } catch {
      // Not remembered; nothing else depends on it.
    }
    placeListeners.forEach((l) => l());
  };

  /** Export the clips at these positions in the running order, or all of them. */
  const run = async (only?: number) => {
    const picked = only == null ? clips : clips.slice(only, only + 1);
    if (picked.length === 0 || progress !== null) return;
    setError(null);
    setVideo(null);
    setProgress(0);
    try {
      // Started with no await before it: the recorder asks for sound inside
      // this click, which is the only place a browser lets it start.
      const { blob, ext } = await recordPlaylist({
        title: only == null ? title : picked[0].title || "Untitled clip",
        teamName,
        comments: place,
        clips: picked.map((c) => ({
          title: c.title,
          src: c.exportSrc,
          startMs: c.startMs,
          endMs: c.endMs,
          comments: commentsByClip[c.clipId] ?? [],
        })),
        onProgress: setProgress,
      });
      const name = exportFileName(only == null ? title : picked[0].title, only == null ? "playlist" : "clip");
      const file = new File([blob], `${name}.${ext}`, { type: blob.type });
      const url = URL.createObjectURL(file);
      setVideo({ url, file });
      // On a computer, the file simply downloads. On a phone a download goes
      // nowhere useful, so the save and share buttons wait for a tap instead.
      if (!matchMedia("(pointer: coarse)").matches) {
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The video could not be made.");
    } finally {
      setProgress(null);
    }
  };

  return { place, setPlace, supported, progress, error, video, run, busy: progress !== null };
}
