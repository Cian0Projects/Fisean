"use client";

/**
 * A closed-by-default list of tick boxes: one line until you want it, then a
 * short scrolling list. Used where a long set of names would otherwise
 * stretch a side panel (people to share with, playlists a clip is in).
 *
 * It opens in place and pushes what is below it down, rather than floating
 * over it. The side panels scroll, and a floating list would be clipped by
 * them or fight the panel for the scroll. Ticks use shape as well as the
 * border (a check mark), so they read without colour.
 */
import { useId, useState } from "react";

export type CheckOption = {
  id: string;
  label: string;
  /** Quiet text after the label, such as ", coach". */
  hint?: string;
  checked: boolean;
};

export function CheckDropdown({
  label,
  options,
  onToggle,
  empty,
  footer,
  disabled = false,
  compact = false,
}: {
  /** The closed button's words, e.g. "Pick people". A count is added. */
  label: string;
  options: CheckOption[];
  onToggle: (id: string) => void;
  /** Shown instead of the list when there are no options. */
  empty?: string;
  /** Sits under the list, inside the open panel, e.g. a "New playlist" control. */
  footer?: React.ReactNode;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const ticked = options.filter((o) => o.checked).length;
  const text = compact ? "text-[12px]" : "text-[13px]";

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={listId}
        className={`flex w-full items-center justify-between gap-2 rounded-[2px] border px-2 py-1.5 text-left ${text}`}
        style={{ borderColor: "var(--color-line-strong)", color: "var(--color-ink)" }}
      >
        <span>
          {label}
          {ticked > 0 && <span style={{ color: "var(--color-ink-dim)" }}>{` (${ticked})`}</span>}
        </span>
        <span aria-hidden style={{ color: "var(--color-ink-faint)" }}>
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div
          id={listId}
          className="mt-1 rounded-[2px] border"
          style={{ borderColor: "var(--color-line)", background: "var(--color-surface-2)" }}
        >
          {options.length === 0 ? (
            <p className={`px-2 py-2 ${text}`} style={{ color: "var(--color-ink-faint)" }}>
              {empty ?? "Nothing to pick yet."}
            </p>
          ) : (
            <ul className="max-h-48 overflow-y-auto py-1">
              {options.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={o.checked}
                    disabled={disabled}
                    onClick={() => onToggle(o.id)}
                    className={`flex w-full items-center gap-2 px-2 py-1 text-left ${text}`}
                    style={{ color: o.checked ? "var(--color-ink)" : "var(--color-ink-dim)" }}
                  >
                    <span
                      aria-hidden
                      className="grid h-[14px] w-[14px] shrink-0 place-items-center rounded-[2px] border text-[10px] leading-none"
                      style={{
                        borderColor: o.checked ? "var(--color-ink)" : "var(--color-line-strong)",
                        background: o.checked ? "var(--color-surface-3)" : "transparent",
                      }}
                    >
                      {o.checked ? "✓" : ""}
                    </span>
                    <span className="min-w-0 truncate">
                      {o.label}
                      {o.hint && <span style={{ color: "var(--color-ink-faint)" }}>{o.hint}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {footer && (
            <div className="border-t px-2 py-1.5" style={{ borderColor: "var(--color-line)" }}>
              {footer}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
