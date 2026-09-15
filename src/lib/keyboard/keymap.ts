/**
 * The keymap, as data.
 *
 * One table drives three things: what the keys do, what the `?` cheatsheet
 * shows, and (later) per-user remapping. Keeping them in sync by hand is how
 * shortcut documentation ends up lying to people, so there is one source.
 *
 * The shuttle keys are the industry-standard J/K/L, and in/out are I/O, so
 * anyone arriving from Hudl, Premiere or Resolve is already fluent.
 */

export type Command =
  | "toggle_play"
  | "shuttle_back"
  | "shuttle_forward"
  | "shuttle_pause"
  | "nudge_back_1s"
  | "nudge_fwd_1s"
  | "nudge_back_5s"
  | "nudge_fwd_5s"
  | "nudge_back_10s"
  | "nudge_fwd_10s"
  | "frame_back"
  | "frame_fwd"
  | "quick_clip"
  | "set_in"
  | "set_out"
  | "trim_in"
  | "trim_out"
  | "save_clip"
  | "cancel"
  | "undo"
  | "annotate"
  | "comment"
  | "add_to_playlist"
  | "prev_clip"
  | "next_clip"
  | "speed_down"
  | "speed_up"
  | "fullscreen"
  | "help"
  | `tag_${number}`;

export type Mode = "transport" | "annotate" | "text";

export type Binding = {
  /** Display form for the cheatsheet. */
  keys: string;
  command: Command;
  label: string;
  group: "Transport" | "Precision" | "Clipping" | "Tagging" | "Review" | "View";
  /** Key repeat is right for nudging, wrong for a shuttle ramp. */
  allowRepeat?: boolean;
};

/**
 * Combos are normalised to `ctrl+shift+alt+key`, lower case, in that order.
 * `buildCombo` below is the only place that ordering is decided.
 */
export const BINDINGS: Record<string, Binding> = {
  " ": { keys: "Space", command: "toggle_play", label: "Play / pause", group: "Transport" },
  j: { keys: "J", command: "shuttle_back", label: "Shuttle back — 1×, 2×, 4×, 8×", group: "Transport" },
  k: { keys: "K", command: "shuttle_pause", label: "Pause", group: "Transport" },
  l: { keys: "L", command: "shuttle_forward", label: "Shuttle forward — 1×, 2×, 4×, 8×", group: "Transport" },

  arrowleft: { keys: "←", command: "nudge_back_1s", label: "Back 1 second", group: "Precision", allowRepeat: true },
  arrowright: { keys: "→", command: "nudge_fwd_1s", label: "Forward 1 second", group: "Precision", allowRepeat: true },
  "shift+arrowleft": { keys: "Shift ←", command: "nudge_back_5s", label: "Back 5 seconds", group: "Precision", allowRepeat: true },
  "shift+arrowright": { keys: "Shift →", command: "nudge_fwd_5s", label: "Forward 5 seconds", group: "Precision", allowRepeat: true },
  "alt+arrowleft": { keys: "Alt ←", command: "nudge_back_10s", label: "Back 10 seconds", group: "Precision", allowRepeat: true },
  "alt+arrowright": { keys: "Alt →", command: "nudge_fwd_10s", label: "Forward 10 seconds", group: "Precision", allowRepeat: true },
  ",": { keys: ",", command: "frame_back", label: "One frame back", group: "Precision", allowRepeat: true },
  ".": { keys: ".", command: "frame_fwd", label: "One frame forward", group: "Precision", allowRepeat: true },

  c: {
    keys: "C",
    command: "quick_clip",
    // The whole point: you press this *after* seeing the incident, and the
    // pre-roll covers what you just watched. No pausing, no scrubbing back.
    label: "Quick clip — captures the seconds before you pressed",
    group: "Clipping",
  },
  i: { keys: "I", command: "set_in", label: "Set in point", group: "Clipping" },
  o: { keys: "O", command: "set_out", label: "Set out point", group: "Clipping" },
  "[": { keys: "[", command: "trim_in", label: "Trim in point to playhead", group: "Clipping" },
  "]": { keys: "]", command: "trim_out", label: "Trim out point to playhead", group: "Clipping" },
  enter: { keys: "Enter", command: "save_clip", label: "Save clip", group: "Clipping" },
  escape: {
    keys: "Esc",
    command: "cancel",
    label: "Back to the match — or clear in / out points",
    group: "Clipping",
  },
  z: { keys: "Z", command: "undo", label: "Undo last clip", group: "Clipping" },
  "ctrl+z": { keys: "Ctrl Z", command: "undo", label: "Undo last clip", group: "Clipping" },

  a: { keys: "A", command: "annotate", label: "Draw on the video", group: "Review" },
  t: { keys: "T", command: "comment", label: "Comment at this moment", group: "Review" },
  p: { keys: "P", command: "add_to_playlist", label: "Add clip to playlist", group: "Review" },
  "shift+arrowup": { keys: "Shift ↑", command: "prev_clip", label: "Previous clip", group: "Review" },
  "shift+arrowdown": { keys: "Shift ↓", command: "next_clip", label: "Next clip", group: "Review" },

  "-": { keys: "−", command: "speed_down", label: "Slower", group: "View" },
  "=": { keys: "=", command: "speed_up", label: "Faster", group: "View" },
  f: { keys: "F", command: "fullscreen", label: "Fullscreen", group: "View" },
  "?": { keys: "?", command: "help", label: "Show shortcuts", group: "View" },
  "shift+/": { keys: "?", command: "help", label: "Show shortcuts", group: "View" },
};

/** Number keys tag the event bound to that hotkey in `event_types`. */
for (let n = 0; n <= 9; n++) {
  BINDINGS[String(n)] = {
    keys: String(n),
    command: `tag_${n}` as Command,
    label: `Tag event ${n}`,
    group: "Tagging",
  };
}

export function buildCombo(e: KeyboardEvent): string {
  const key = e.key.toLowerCase();
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("ctrl");
  if (e.shiftKey) parts.push("shift");
  if (e.altKey) parts.push("alt");
  parts.push(key === " " ? " " : key);
  return parts.join("+");
}

export function resolve(e: KeyboardEvent, mode: Mode): Binding | null {
  // While typing a comment or a clip title, the keyboard belongs to the text
  // field — otherwise "cúilín" would trigger a clip and a comment.
  if (mode === "text") return null;

  const combo = buildCombo(e);
  const binding = BINDINGS[combo] ?? null;
  if (!binding) return null;

  // In drawing mode the number keys pick a tool rather than tag an event.
  if (mode === "annotate" && binding.group === "Tagging") return null;

  return binding;
}

/** Grouped for the cheatsheet, de-duplicated by command. */
export function cheatsheet(): { group: Binding["group"]; items: Binding[] }[] {
  const groups: Binding["group"][] = [
    "Transport",
    "Precision",
    "Clipping",
    "Tagging",
    "Review",
    "View",
  ];
  const seen = new Set<string>();
  return groups.map((group) => ({
    group,
    items: Object.values(BINDINGS).filter((b) => {
      if (b.group !== group) return false;
      // Collapse the aliases (Z / Ctrl+Z, ? / Shift+/) to one row.
      const key = `${b.group}:${b.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  }));
}

/** Tagging keys are listed from the event taxonomy, not from here. */
export const TAG_KEY_ORDER = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
