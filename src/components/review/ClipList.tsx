"use client";

import { formatClock, toGameTime, type Markers } from "@/lib/hurling/notation";
import { eventLabelOf, type ClipRow, type EventTypeRow, type Viewer } from "./types";

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
        <span className="tabular text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
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
                  {/* The first tag's colour as a dot beside the time, the same
                      mark its chip carries — not a stripe down the row. */}
                  <span
                    aria-hidden
                    className="mt-[5px] h-2 w-2 shrink-0 rounded-full"
                    style={{ background: tags[0]?.colour ?? "var(--color-line-strong)" }}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="tabular text-[12px] font-semibold">
                        {toGameTime(c.startMs, markers, halfLengthMin).label}
                      </span>
                      <span className="tabular text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
                        {((c.endMs - c.startMs) / 1000).toFixed(1)}s
                      </span>
                      {c.visibility === "private" && (
                        <span className="text-[10px]" style={{ color: "var(--color-ink-faint)" }}>
                          private
                        </span>
                      )}
                    </div>

                    {c.title && <div className="truncate text-[13px]">{c.title}</div>}

                    {tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {tags.map((t) => (
                          <span
                            key={t.id}
                            className="rounded px-1.5 py-0.5 text-[10px]"
                            style={{
                              background: `color-mix(in oklab, ${t.colour} 24%, transparent)`,
                              color: "var(--color-ink)",
                            }}
                          >
                            {eventLabelOf(t)}
                          </span>
                        ))}
                      </div>
                    )}

                    <div
                      className="mt-1 flex items-center gap-2 text-[10px]"
                      style={{ color: "var(--color-ink-faint)" }}
                    >
                      <span>{c.authorName}</span>
                      {c.commentCount > 0 && <span>{c.commentCount} comment{c.commentCount === 1 ? "" : "s"}</span>}
                      {c.annotationCount > 0 && <span>{c.annotationCount} drawing{c.annotationCount === 1 ? "" : "s"}</span>}
                      <span className="tabular">{formatClock(c.startMs)}</span>
                    </div>
                  </div>

                  {canDelete(c) && !c.pending && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(c.id);
                      }}
                      aria-label="Delete clip"
                      className="shrink-0 self-start px-1 text-[11px] opacity-0 transition-opacity group-hover:opacity-100"
                      style={{ color: "var(--color-danger)" }}
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
