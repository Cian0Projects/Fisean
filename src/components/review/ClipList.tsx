"use client";

import { toGameTime, type Markers } from "@/lib/hurling/notation";
import { tagTone } from "@/lib/hurling/events";
import { TagMark } from "@/components/ui/TagMark";
import { clipTone, eventLabelOf, type ClipRow, type EventTypeRow, type Viewer } from "./types";

export function ClipList({
  clips,
  eventTypes,
  selectedId,
  markers,
  halfLengthMin,
  onSelect,
  onDelete,
  viewer,
}: {
  clips: ClipRow[];
  eventTypes: EventTypeRow[];
  selectedId: string | null;
  markers: Markers;
  halfLengthMin: number;
  onSelect: (clip: ClipRow) => void;
  onDelete: (id: string) => void;
  viewer: Viewer;
}) {
  const canDelete = (c: ClipRow) =>
    viewer.role !== "player" || c.createdBy === viewer.id;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="flex shrink-0 items-center justify-between border-b px-3 py-2"
        style={{ borderColor: "var(--color-line)" }}
      >
        <h2 className="label">Clips</h2>
        <span className="tabular text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          {clips.length}
        </span>
      </div>

      {clips.length === 0 ? (
        <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
          No clips yet.
          <br />
          <span className="mt-2 inline-block">
            Press <span className="kbd">C</span> while watching to capture what
            just happened.
          </span>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {clips.map((c) => {
            const tags = c.eventTypeIds
              .map((id) => eventTypes.find((e) => e.id === id))
              .filter((e): e is EventTypeRow => !!e);
            const selected = c.id === selectedId;

            return (
              <li key={c.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(c)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") onSelect(c);
                  }}
                  className="group flex w-full cursor-pointer gap-2.5 border-b px-3 py-2.5 text-left transition-colors"
                  style={{
                    borderColor: "var(--color-line)",
                    background: selected ? "var(--color-surface-2)" : "transparent",
                    opacity: c.pending ? 0.55 : 1,
                  }}
                >
                  {/* The clip's outcome, in the mark a shot map would use.
                      A fixed column, so titles line up whether or not a clip
                      was won or lost. */}
                  <span className="mt-[5px] flex w-2.5 shrink-0 justify-center">
                    <TagMark tone={clipTone(c, eventTypes)} size={9} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="tabular text-[12px] font-semibold">
                        {toGameTime(c.startMs, markers, halfLengthMin).label}
                      </span>
                      <span className="tabular text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                        {Math.round((c.endMs - c.startMs) / 1000)} s
                      </span>
                      {c.visibility === "private" && (
                        <span className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                          only you
                        </span>
                      )}
                    </div>

                    {c.title && <div className="truncate text-[13px]">{c.title}</div>}

                    {/* Tags as words, the way a match report names what
                        happened — not as coloured chips. */}
                    {tags.length > 0 && (
                      <div
                        className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px]"
                        style={{ color: "var(--color-ink-dim)" }}
                      >
                        {tags.map((t) => (
                          <span key={t.id} className="inline-flex items-center gap-1.5">
                            <TagMark tone={tagTone(t.slug)} />
                            {eventLabelOf(t)}
                          </span>
                        ))}
                      </div>
                    )}

                    {(c.createdBy !== viewer.id || c.commentCount > 0 || c.annotationCount > 0) && (
                      <div className="mt-1 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                        {[
                          c.createdBy !== viewer.id ? `Clipped by ${c.authorName}` : null,
                          c.commentCount > 0 ? `${c.commentCount} comment${c.commentCount === 1 ? "" : "s"}` : null,
                          c.annotationCount > 0
                            ? `${c.annotationCount} drawing${c.annotationCount === 1 ? "" : "s"}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                    )}
                  </div>

                  {canDelete(c) && !c.pending && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(c.id);
                      }}
                      aria-label="Delete clip"
                      className="shrink-0 self-start px-1 text-[12px] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      style={{ color: "var(--color-ink-dim)" }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
