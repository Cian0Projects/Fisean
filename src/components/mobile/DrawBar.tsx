"use client";

/**
 * The pen's controls on a phone: what to draw with, in what colour, and a way
 * to take a mark back.
 *
 * It sits in the pinned block under the video, in place of the clip buttons,
 * so the picture stays in view while a thumb is on it. The desktop's row of
 * small buttons does not survive a finger, so the tools scroll sideways at a
 * 44 px height and the colours are big enough to hit. The drawing itself is
 * the same AnnotationLayer the desktop uses, over the same frame.
 */
import { COLOURS, TOOLS, type Tool } from "@/components/player/AnnotationLayer";

type Props = {
  tool: Tool;
  colour: string;
  onTool: (tool: Tool) => void;
  onColour: (colour: string) => void;
  marks: number;
  onUndo: () => void;
  onClear: () => void;
  onDone: () => void;
};

export function DrawBar({ tool, colour, onTool, onColour, marks, onUndo, onClear, onDone }: Props) {
  return (
    <div className="border-b px-4 pb-3" style={{ borderColor: "var(--color-line)" }}>
      <div className="-mx-4 flex gap-1 overflow-x-auto px-4 py-1" role="radiogroup" aria-label="Drawing tool">
        {TOOLS.map((t) => (
          <button
            key={t.tool}
            role="radio"
            aria-checked={tool === t.tool}
            onClick={() => onTool(t.tool)}
            className="min-h-11 shrink-0 rounded px-3.5 text-[15px]"
            style={{
              background: tool === t.tool ? "var(--color-surface-3)" : "transparent",
              color: tool === t.tool ? "var(--color-ink)" : "var(--color-ink-dim)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        {COLOURS.map((c) => (
          <button
            key={c}
            onClick={() => onColour(c)}
            aria-label={`Colour ${c}`}
            aria-pressed={colour === c}
            className="flex h-11 w-11 items-center justify-center"
          >
            <span
              className="h-7 w-7 rounded-full"
              style={{
                background: c,
                outline: colour === c ? "2px solid var(--color-ink)" : "none",
                outlineOffset: "2px",
              }}
            />
          </button>
        ))}
      </div>

      <div className="mt-1 flex items-center gap-2">
        <button className="btn-ghost min-h-11 px-3 text-[15px]" onClick={onUndo} disabled={marks === 0}>
          Undo
        </button>
        <button className="btn-ghost min-h-11 px-3 text-[15px]" onClick={onClear} disabled={marks === 0}>
          Clear
        </button>
        <span className="flex-1" />
        <button className="btn-primary min-h-11 px-6 text-[15px]" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
