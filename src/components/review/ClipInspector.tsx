"use client";

/**
 * Detail panel for the selected clip: title, tags, who is in it, comments,
 * and adding it to a playlist.
 *
 * Every text field reports focus upward so the workspace can switch the
 * keyboard into text mode — otherwise typing "cúilín" into a comment would
 * fire the clip, comment and tag shortcuts as you went.
 */
import { useEffect, useState, useTransition } from "react";
import type { PlayerEngine } from "@/components/player/engine";
import { formatClock } from "@/lib/hurling/notation";
import { positionLabel } from "@/lib/hurling/positions";
import { setClipPlayers, setClipTags, updateClip } from "@/lib/actions/clips";
import { addComment } from "@/lib/actions/review";
import { listComments, listEditablePlaylists } from "@/lib/actions/reads";
import { addClipToPlaylist, createPlaylist } from "@/lib/actions/playlists";
import {
  eventLabelOf,
  type ClipRow,
  type CommentRow,
  type EventTypeRow,
  type SquadMember,
  type Viewer,
} from "./types";

type Props = {
  clip: ClipRow;
  eventTypes: EventTypeRow[];
  squad: SquadMember[];
  viewer: Viewer;
  engine: PlayerEngine;
  onClipChange: (patch: Partial<ClipRow>) => void;
  onTextFocus: (focused: boolean) => void;
};

export function ClipInspector({
  clip,
  eventTypes,
  squad,
  viewer,
  engine,
  onClipChange,
  onTextFocus,
}: Props) {
  const [tab, setTab] = useState<"details" | "comments">("details");
  const [title, setTitle] = useState(clip.title);
  const [comments, setComments] = useState<CommentRow[] | null>(null);
  const [draft, setDraft] = useState("");
  const [pinTime, setPinTime] = useState(true);
  const [playlists, setPlaylists] = useState<{ id: string; title: string }[]>([]);
  const [pending, startTransition] = useTransition();

  // No effect is needed to reset state when the clip changes: ReviewWorkspace
  // renders this keyed by clip id, so it remounts with fresh state from props.

  useEffect(() => {
    if (tab !== "comments" || comments !== null) return;
    void listComments(clip.id).then(setComments);
  }, [tab, comments, clip.id]);

  useEffect(() => {
    void listEditablePlaylists().then(setPlaylists);
  }, []);

  const saveTitle = () => {
    onTextFocus(false);
    if (title === clip.title) return;
    onClipChange({ title });
    startTransition(async () => {
      try {
        await updateClip(clip.id, { title });
      } catch {
        // Keep the edit visible; a reload shows the stored value.
      }
    });
  };

  const toggleTag = (id: string) => {
    const next = clip.eventTypeIds.includes(id)
      ? clip.eventTypeIds.filter((t) => t !== id)
      : [...clip.eventTypeIds, id];
    onClipChange({ eventTypeIds: next });
    startTransition(() => void setClipTags(clip.id, next));
  };

  const togglePlayer = (id: string) => {
    const next = clip.playerIds.includes(id)
      ? clip.playerIds.filter((p) => p !== id)
      : [...clip.playerIds, id];
    onClipChange({ playerIds: next });
    startTransition(() => void setClipPlayers(clip.id, next));
  };

  const postComment = async () => {
    const body = draft.trim();
    if (!body) return;
    const atMs = pinTime ? Math.max(0, engine.snapshot.positionMs - clip.startMs) : null;
    setDraft("");
    try {
      const posted = await addComment({ clipId: clip.id, body, atMs });
      setComments((prev) => [...(prev ?? []), posted]);
      onClipChange({ commentCount: clip.commentCount + 1 });
    } catch {
      setDraft(body);
    }
  };

  const byCategory = eventTypes.reduce<Record<string, EventTypeRow[]>>((acc, e) => {
    (acc[e.category] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div
      className="flex max-h-[52%] min-h-0 shrink-0 flex-col border-t"
      style={{ borderColor: "var(--color-line)" }}
    >
      <div className="flex shrink-0 gap-1 px-2 pt-2">
        {(["details", "comments"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="rounded-t-md px-3 py-1.5 text-xs font-medium capitalize"
            style={{
              background: tab === t ? "var(--color-surface-2)" : "transparent",
              color: tab === t ? "var(--color-ink)" : "var(--color-ink-faint)",
            }}
          >
            {t}
            {t === "comments" && clip.commentCount > 0 && ` (${clip.commentCount})`}
          </button>
        ))}
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto p-3"
        style={{ background: "var(--color-surface-2)" }}
      >
        {tab === "details" ? (
          <div className="space-y-4">
            <div>
              <label className="label mb-1 block">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onFocus={() => onTextFocus(true)}
                onBlur={saveTitle}
                placeholder="What happens here?"
                className="field"
              />
            </div>

            <div className="tabular text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
              {formatClock(clip.startMs)} → {formatClock(clip.endMs)} ·{" "}
              {((clip.endMs - clip.startMs) / 1000).toFixed(1)}s · {clip.authorName}
            </div>

            <div>
              <span className="label mb-1.5 block">Tags</span>
              <div className="space-y-2">
                {Object.entries(byCategory).map(([category, list]) => (
                  <div key={category}>
                    <div
                      className="mb-1 text-[10px] uppercase tracking-wide"
                      style={{ color: "var(--color-ink-faint)" }}
                    >
                      {category.replace(/_/g, " ")}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {list.map((e) => {
                        const on = clip.eventTypeIds.includes(e.id);
                        return (
                          <button
                            key={e.id}
                            onClick={() => toggleTag(e.id)}
                            className="rounded border px-1.5 py-0.5 text-[11px]"
                            style={{
                              borderColor: on ? e.colour : "var(--color-line-strong)",
                              background: on
                                ? `color-mix(in oklab, ${e.colour} 26%, transparent)`
                                : "transparent",
                              color: on ? "var(--color-ink)" : "var(--color-ink-dim)",
                            }}
                          >
                            {eventLabelOf(e)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              {/* This is what makes a player's own page work. */}
              <span className="label mb-1.5 block">Players in this clip</span>
              <div className="flex flex-wrap gap-1">
                {squad.map((m) => {
                  const on = clip.playerIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => togglePlayer(m.id)}
                      title={positionLabel(m.position)}
                      className="rounded border px-1.5 py-0.5 text-[11px]"
                      style={{
                        borderColor: on ? "var(--color-brand)" : "var(--color-line-strong)",
                        background: on
                          ? "color-mix(in oklab, var(--color-brand) 24%, transparent)"
                          : "transparent",
                        color: on ? "var(--color-ink)" : "var(--color-ink-dim)",
                      }}
                    >
                      {m.jerseyNumber != null && (
                        <span className="tabular mr-1 opacity-60">{m.jerseyNumber}</span>
                      )}
                      {m.displayName}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="label mb-1.5 block">Add to playlist</span>
              <div className="flex flex-wrap gap-1">
                {playlists.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => startTransition(() => void addClipToPlaylist(p.id, clip.id))}
                    className="btn-outline px-2 py-1 text-[11px]"
                  >
                    {p.title}
                  </button>
                ))}
                <button
                  onClick={() => {
                    const name = window.prompt("New playlist name");
                    if (!name?.trim()) return;
                    startTransition(async () => {
                      const { id } = await createPlaylist({
                        title: name.trim(),
                        clipIds: [clip.id],
                        isOfficial: viewer.role !== "player",
                      });
                      setPlaylists((prev) => [...prev, { id, title: name.trim() }]);
                    });
                  }}
                  className="btn-ghost px-2 py-1 text-[11px]"
                >
                  + New
                </button>
              </div>
            </div>

            {pending && (
              <div className="text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
                Saving…
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {comments === null ? (
              <div className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                Loading…
              </div>
            ) : comments.length === 0 ? (
              <div className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                No comments yet.
              </div>
            ) : (
              <ul className="space-y-2.5">
                {comments.map((c) => (
                  <li key={c.id} className="text-[13px]">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium">{c.authorName}</span>
                      {c.atMs != null && (
                        <button
                          onClick={() => engine.seek(clip.startMs + c.atMs!, { exact: true })}
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

            <div className="space-y-2 pt-1">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onFocus={() => onTextFocus(true)}
                onBlur={() => onTextFocus(false)}
                placeholder="Add a comment…"
                rows={3}
                className="field resize-none"
              />
              <div className="flex items-center justify-between">
                <label
                  className="flex items-center gap-1.5 text-[11px]"
                  style={{ color: "var(--color-ink-faint)" }}
                >
                  <input
                    type="checkbox"
                    checked={pinTime}
                    onChange={(e) => setPinTime(e.target.checked)}
                    className="accent-[var(--color-brand)]"
                  />
                  Pin to this moment
                </label>
                <button onClick={() => void postComment()} className="btn-primary text-xs">
                  Post
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
