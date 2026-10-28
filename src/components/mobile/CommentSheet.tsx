"use client";

/**
 * Commenting on a clip, on a phone.
 *
 * A comment is made where the playhead is, as on the desktop: park on the
 * moment, write the point, and perhaps draw on that frame first. Watching
 * back, the clip stops there to show it (src/lib/hurling/stops.ts).
 *
 * Unlike the clip sheet this one leaves the video and its controls working
 * above it, because the moment is the point: the step buttons here move the
 * playhead a second or a frame at a time, and the time the comment will stop
 * at follows it. The words live in the screen above, not here, so they
 * survive a trip out to draw and back.
 *
 * The text is set at 16 px on purpose: anything smaller and iOS zooms the
 * whole page in on focus and leaves it there.
 */
import type { PlayerEngine } from "@/components/player/engine";
import { CommentItem } from "@/components/review/CommentItem";
import { Moment } from "@/components/review/ClipInspector";
import type { ClipRow, CommentRow, Viewer } from "@/components/review/types";
import { formatClock } from "@/lib/hurling/notation";
import { inPlayingOrder } from "@/lib/hurling/stops";

type Props = {
  clip: ClipRow;
  viewer: Viewer;
  engine: PlayerEngine;
  /** Null while they load. */
  comments: CommentRow[] | null;
  onCommentsChange: (comments: CommentRow[]) => void;
  onClipChange: (patch: Partial<ClipRow>) => void;
  text: string;
  onText: (text: string) => void;
  /** Where in the clip a drawing in progress was made, if there is one. */
  drawnAtMs: number | null;
  marks: number;
  posting: boolean;
  error: string | null;
  onDraw: () => void;
  onPost: () => void;
  onClose: () => void;
};

export function CommentSheet({
  clip,
  viewer,
  engine,
  comments,
  onCommentsChange,
  onClipChange,
  text,
  onText,
  drawnAtMs,
  marks,
  posting,
  error,
  onDraw,
  onPost,
  onClose,
}: Props) {
  const canPost = !posting && (text.trim() !== "" || marks > 0);

  const park = (move: () => void) => {
    engine.pause();
    move();
  };

  return (
    // The wrapper lets touches through to the video above; only the panel
    // takes them.
    <div className="pointer-events-none fixed inset-0 z-40 flex flex-col justify-end" role="dialog" aria-label="Comment on this clip">
      <div
        className="pointer-events-auto mx-auto flex max-h-[44dvh] w-full max-w-xl flex-col rounded-t-xl border-t"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-line-strong)" }}
      >
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-2">
          <div className="flex items-center justify-between">
            <h2 className="title text-lg">Comment</h2>
            <button className="btn-ghost min-h-10 text-[15px]" onClick={onClose}>
              Close
            </button>
          </div>

          <div className="mt-1 flex items-center gap-1">
            <StepButton label="Back 1 second" onClick={() => park(() => engine.nudge(-1000))}>
              −1 s
            </StepButton>
            <StepButton label="Back 1 frame" onClick={() => park(() => engine.stepFrames(-1))}>
              −1 f
            </StepButton>
            <div className="tabular min-w-0 flex-1 text-center text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
              Stops at{" "}
              <span className="font-semibold" style={{ color: "var(--color-ash)" }}>
                {drawnAtMs != null ? formatClock(drawnAtMs) : <Moment engine={engine} startMs={clip.startMs} />}
              </span>
            </div>
            <StepButton label="Forward 1 frame" onClick={() => park(() => engine.stepFrames(1))}>
              +1 f
            </StepButton>
            <StepButton label="Forward 1 second" onClick={() => park(() => engine.nudge(1000))}>
              +1 s
            </StepButton>
          </div>

          <label htmlFor="comment-body" className="sr-only">
            Comment
          </label>
          <textarea
            id="comment-body"
            value={text}
            onChange={(e) => onText(e.target.value)}
            placeholder={marks ? "Say what the drawing shows" : "Park on the moment, then say what happened"}
            rows={2}
            className="field mt-2 resize-none text-[16px]"
          />
          {error && (
            <p className="mt-1 text-[13px]" style={{ color: "var(--color-ink-dim)" }}>
              {error}
            </p>
          )}

          {comments && comments.length > 0 && (
            <ul className="mt-4 space-y-3 border-t pt-3" style={{ borderColor: "var(--color-line)" }}>
              {inPlayingOrder(comments).map((c) => (
                <CommentItem
                  key={c.id}
                  comment={c}
                  viewer={viewer}
                  underlineTime
                  onSeek={(atMs) => park(() => engine.seek(clip.startMs + atMs, { exact: true }))}
                  onSaved={(u) => onCommentsChange(comments.map((x) => (x.id === u.id ? u : x)))}
                  onDeleted={(d) => {
                    const gone = comments.filter((x) => x.id === d.id || x.parentId === d.id);
                    onCommentsChange(comments.filter((x) => !gone.includes(x)));
                    onClipChange({
                      commentCount: Math.max(0, clip.commentCount - gone.length),
                      annotationCount: Math.max(0, clip.annotationCount - (d.shapes?.length ? 1 : 0)),
                    });
                  }}
                  onTextFocus={() => {}}
                />
              ))}
            </ul>
          )}
          {comments === null && (
            <p className="mt-4 text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
              Loading comments
            </p>
          )}
        </div>

        <div
          className="flex gap-2 border-t px-4 pt-3"
          style={{
            borderColor: "var(--color-line)",
            paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)",
          }}
        >
          <button className="btn-outline min-h-12 flex-1 text-[15px]" onClick={onDraw}>
            {marks ? `Drawing, ${marks} mark${marks === 1 ? "" : "s"}` : "Draw on this frame"}
          </button>
          <button className="btn-primary min-h-12 px-6 text-[15px]" onClick={onPost} disabled={!canPost}>
            {posting ? "Posting" : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="tabular min-h-11 min-w-12 rounded px-2 text-[14px] active:bg-[var(--color-surface-3)]"
      style={{ border: "1px solid var(--color-line-strong)" }}
    >
      {children}
    </button>
  );
}
