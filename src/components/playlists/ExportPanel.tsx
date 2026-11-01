"use client";

/**
 * The playlist's export, as one button. Beside it, the nine spots the comments
 * can sit in on the video (the same grid the drill board uses for its step
 * notes) and a way to leave them off. Exporting one clip is a button on that
 * clip's row in the running order, in PlaylistPlayer.
 */
import { COMMENT_PLACES, type CommentPlace } from "@/lib/hurling/clip-export";
import type { PlaylistExport } from "./usePlaylistExport";

const LABELS: Record<CommentPlace, string> = {
  "top-left": "Top left",
  top: "Top",
  "top-right": "Top right",
  left: "Left",
  middle: "Middle",
  right: "Right",
  "bottom-left": "Bottom left",
  bottom: "Bottom",
  "bottom-right": "Bottom right",
};

export function ExportPanel({ exporting, clipCount }: { exporting: PlaylistExport; clipCount: number }) {
  const { place, setPlace, supported, progress, error, video, run, busy } = exporting;

  return (
    <section className="border-b px-4 py-3" style={{ borderColor: "var(--color-line)" }}>
      <h2 className="label mb-2">Export</h2>

      {!supported ? (
        <p className="caption">Exporting a video needs Chrome, Edge or Safari.</p>
      ) : (
        <>
          <button
            type="button"
            className="btn-primary tabular w-full"
            disabled={busy || clipCount === 0}
            onClick={() => void run()}
          >
            {progress === null ? "Export video" : `Recording ${Math.round(progress * 100)}%`}
          </button>

          <div className="mt-3 flex items-start gap-3">
            <div
              className="grid w-[6.5rem] shrink-0 grid-cols-3 gap-1 rounded-[3px] p-1"
              style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-line)" }}
              role="group"
              aria-label="Where the comments sit on the video"
            >
              {COMMENT_PLACES.map((p) => {
                const on = place === p;
                return (
                  <button
                    key={p}
                    type="button"
                    title={LABELS[p]}
                    aria-label={LABELS[p]}
                    aria-pressed={on}
                    disabled={busy}
                    onClick={() => setPlace(p)}
                    className="h-6 rounded-[2px] border transition-colors"
                    style={{
                      borderColor: on ? "var(--color-ash)" : "var(--color-line-strong)",
                      background: on ? "var(--color-ash)" : "transparent",
                    }}
                  />
                );
              })}
            </div>
            <div className="min-w-0">
              <p className="caption">
                {place === "off"
                  ? "The video has no comments on it."
                  : `Comments sit ${LABELS[place].toLowerCase()}. Each clip stops on a comment long enough to read it.`}
              </p>
              <button
                type="button"
                aria-pressed={place === "off"}
                disabled={busy}
                onClick={() => setPlace(place === "off" ? "bottom-left" : "off")}
                className="mt-1.5 rounded-[2px] border px-2.5 py-1 text-[13px] font-semibold"
                style={{
                  borderColor: place === "off" ? "var(--color-ash)" : "var(--color-line)",
                  background: place === "off" ? "var(--color-spot-tint)" : "transparent",
                  color: place === "off" ? "var(--color-ash)" : "var(--color-ink-dim)",
                }}
              >
                No comments
              </button>
            </div>
          </div>
        </>
      )}

      {progress !== null && (
        <p className="caption mt-2" aria-live="polite">
          Recording in real time. Keep this tab in front until it finishes.
        </p>
      )}
      {error && (
        <p className="mt-2 text-[13px]" style={{ color: "var(--color-danger-ink)" }} role="alert">
          {error}
        </p>
      )}
      {video && progress === null && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
          <span style={{ color: "var(--color-ink-dim)" }}>
            Video ready: {video.file.name.split(".").pop()!.toUpperCase()}, {(video.file.size / 1_000_000).toFixed(1)} MB.
          </span>
          <a href={video.url} download={video.file.name} className="btn-primary">
            Save video
          </a>
          {typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [video.file] }) && (
            <button
              type="button"
              className="btn-outline"
              onClick={() => void navigator.share({ files: [video.file], title: video.file.name }).catch(() => {})}
            >
              Share
            </button>
          )}
        </div>
      )}
    </section>
  );
}
