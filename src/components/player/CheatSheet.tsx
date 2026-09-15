"use client";

/**
 * The `?` overlay. Rendered from the same keymap table that handles the keys,
 * so it cannot drift out of date the way hand-written shortcut docs do.
 */
import { cheatsheet } from "@/lib/keyboard/keymap";
import type { EventTypeRow } from "@/components/review/types";

export function CheatSheet({
  open,
  onClose,
  hotkeyEvents,
}: {
  open: boolean;
  onClose: () => void;
  hotkeyEvents: EventTypeRow[];
}) {
  if (!open) return null;
  const groups = cheatsheet();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.72)" }}
      onClick={onClose}
    >
      <div
        className="card max-h-[86vh] w-full max-w-4xl overflow-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Keyboard</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--color-ink-dim)" }}>
              Everything here is designed so you can tag a full match without
              reaching for the mouse.
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost">
            Close
          </button>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map(({ group, items }) => (
            <section key={group}>
              <h3 className="label mb-2">{group}</h3>
              <ul className="space-y-1.5">
                {group === "Tagging"
                  ? hotkeyEvents.map((e) => (
                      <li key={e.id} className="flex items-center gap-2 text-[13px]">
                        <span className="kbd">{e.hotkey}</span>
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: e.colour }}
                        />
                        <span style={{ color: "var(--color-ink-dim)" }}>
                          {e.labelGa ?? e.labelEn}
                        </span>
                      </li>
                    ))
                  : items.map((b) => (
                      <li key={b.keys + b.label} className="flex items-start gap-2 text-[13px]">
                        <span className="kbd shrink-0">{b.keys}</span>
                        <span style={{ color: "var(--color-ink-dim)" }}>{b.label}</span>
                      </li>
                    ))}
              </ul>
            </section>
          ))}
        </div>

        <p
          className="mt-6 border-t pt-4 text-[13px]"
          style={{ borderColor: "var(--color-line)", color: "var(--color-ink-faint)" }}
        >
          The one to learn is <span className="kbd">C</span>. Watch at normal speed,
          and when something happens, press it — the clip covers the seconds{" "}
          <em>before</em> you pressed, so you never have to scrub back. Follow it
          with a number key to tag what it was.
        </p>
      </div>
    </div>
  );
}
