"use client";

/**
 * One comment, shared by the clip panel and the playlist player. Only the
 * author sees Edit (the server enforces it too); an edited comment says so.
 * The author and the coaches see Delete, which takes the drawing with it.
 * Text focus is reported up so the keyboard shortcuts stand down while typing.
 *
 * The time is the moment playback stops on it; pressing it parks the player
 * there, which brings up the comment and its drawing over the picture.
 */
import { useState } from "react";
import { deleteComment, editComment } from "@/lib/actions/review";
import { formatClock } from "@/lib/hurling/notation";
import { PenIcon } from "@/components/ui/Icon";
import type { CommentRow, Viewer } from "./types";

export function CommentItem({
  comment,
  viewer,
  onSeek,
  onSaved,
  onDeleted,
  onTextFocus,
  underlineTime = false,
}: {
  comment: CommentRow;
  viewer: Pick<Viewer, "id" | "role">;
  onSeek: (atMs: number) => void;
  onSaved: (updated: CommentRow) => void;
  onDeleted: (comment: CommentRow) => void;
  onTextFocus: (focused: boolean) => void;
  underlineTime?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = comment.userId !== null && comment.userId === viewer.id;
  const canDelete = mine || viewer.role !== "player";
  const drawn = (comment.shapes?.length ?? 0) > 0;

  const remove = async () => {
    if (!window.confirm(drawn ? "Delete this comment and its drawing?" : "Delete this comment?")) return;
    try {
      await deleteComment(comment.id);
      onDeleted(comment);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete that.");
    }
  };

  const stop = () => {
    setEditing(false);
    setError(null);
    onTextFocus(false);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await editComment({ commentId: comment.id, body: draft });
      onSaved({ ...comment, body: saved.body, editedAt: saved.editedAt });
      stop();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="text-[13px]">
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate font-medium whitespace-nowrap">{comment.authorName}</span>
        {comment.parentId == null && (
          <button
            onClick={() => onSeek(comment.atMs ?? 0)}
            title="Go to this moment"
            className={`tabular shrink-0 rounded-[2px] px-1.5 py-px text-[12px]${underlineTime ? " underline" : ""}`}
            style={{ color: "var(--color-ash)", background: "var(--color-surface-3)" }}
          >
            {formatClock(comment.atMs ?? 0)}
          </button>
        )}
        {drawn && (
          <span
            role="img"
            title="Has a drawing"
            aria-label="Has a drawing"
            className="shrink-0"
            style={{ color: "var(--color-ink-faint)" }}
          >
            <PenIcon size={13} />
          </span>
        )}
        {!editing && (
          <span className="ml-auto flex shrink-0 gap-3">
            {mine && (
              <button
                onClick={() => {
                  setDraft(comment.body);
                  setEditing(true);
                }}
                className="text-[12px]"
                style={{ color: "var(--color-ink-faint)" }}
              >
                Edit
              </button>
            )}
            {canDelete && (
              <button onClick={() => void remove()} className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                Delete
              </button>
            )}
          </span>
        )}
      </div>

      {editing ? (
        <div className="mt-1 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => onTextFocus(true)}
            onBlur={() => onTextFocus(false)}
            rows={3}
            autoFocus
            className="field resize-none"
          />
          {error && (
            <div className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button onClick={stop} className="text-xs" style={{ color: "var(--color-ink-faint)" }}>
              Cancel
            </button>
            <button onClick={() => void save()} disabled={saving} className="btn-primary text-xs">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : comment.body ? (
        // The comment itself sits in a box, so it reads as what was said and
        // not as one more line of the heading above it.
        <p
          className="mt-1.5 rounded-[2px] border px-2.5 py-2 whitespace-pre-wrap"
          style={{
            color: "var(--color-ink)",
            background: "var(--color-surface)",
            borderColor: "var(--color-line)",
          }}
        >
          {comment.body}
          {comment.editedAt != null && (
            <span className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
              {" "}
              (edited)
            </span>
          )}
        </p>
      ) : null}
      {!editing && error && (
        <div className="mt-0.5 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          {error}
        </div>
      )}
    </li>
  );
}
