"use client";

/**
 * One keydown listener for the whole workspace.
 *
 * Per-component listeners fight each other over who saw the key first and
 * make the mode rules impossible to reason about, so there is exactly one,
 * at the document root, resolving against the keymap table.
 */
import { useEffect, useRef } from "react";
import { resolve, type Command, type Mode } from "./keymap";

/** Typing in a field means the keyboard belongs to the field. */
function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function useHotkeys(
  mode: Mode,
  handler: (command: Command, event: KeyboardEvent) => void,
  enabled = true,
) {
  // Held in refs so a new handler identity on every render does not tear down
  // and rebuild the window listener. Synced in an effect rather than written
  // during render, which React does not allow.
  const handlerRef = useRef(handler);
  const modeRef = useRef(mode);

  useEffect(() => {
    handlerRef.current = handler;
    modeRef.current = mode;
  }, [handler, mode]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const effectiveMode: Mode = isTextTarget(e.target) ? "text" : modeRef.current;
      const binding = resolve(e, effectiveMode);
      if (!binding) return;

      // Auto-repeat is right for nudging a frame at a time and wrong for the
      // shuttle ramp, which should only advance on a fresh press.
      if (e.repeat && !binding.allowRepeat) return;

      // Space scrolls the page and arrows scroll containers; neither is
      // wanted while reviewing footage.
      e.preventDefault();
      handlerRef.current(binding.command, e);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
