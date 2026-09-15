# Keyboard

Press <kbd>?</kbd> in the app for this same list — it renders from
[`src/lib/keyboard/keymap.ts`](../src/lib/keyboard/keymap.ts), the table that
handles the keys, so the two cannot drift apart.

The shuttle is the industry-standard <kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd> and
in/out are <kbd>I</kbd> <kbd>O</kbd>. Anyone arriving from Hudl, Premiere or
Resolve already knows them.

## The one to learn

<kbd>C</kbd>. Watch at normal speed, and when something happens, press it. The
clip covers the seconds **before** you pressed, so you never scrub back. Follow
it with a number key to tag what it was, without pausing.

That is the difference between tagging a match in about 70 minutes and tagging
it in four hours.

## Transport

| Key | Action |
|---|---|
| <kbd>Space</kbd> | Play / pause |
| <kbd>J</kbd> | Shuttle back — repeat taps ramp 1×, 2×, 4×, 8× |
| <kbd>K</kbd> | Pause |
| <kbd>L</kbd> | Shuttle forward — repeat taps ramp 1×, 2×, 4×, 8× |

Reverse shuttle steps the playhead backwards frame by frame, because
`playbackRate` cannot go negative.

## Precision

| Key | Action |
|---|---|
| <kbd>←</kbd> <kbd>→</kbd> | Nudge one second |
| <kbd>Shift</kbd> <kbd>←</kbd> <kbd>→</kbd> | Nudge five seconds |
| <kbd>Alt</kbd> <kbd>←</kbd> <kbd>→</kbd> | Nudge ten seconds |
| <kbd>,</kbd> <kbd>.</kbd> | One frame back / forward |

Frame stepping uses the frame rate read from the file at ingest. Footage with a
variable frame rate makes it approximate.

## Clipping

| Key | Action |
|---|---|
| <kbd>C</kbd> | Quick clip — captures the pre-roll seconds before the keypress |
| <kbd>I</kbd> <kbd>O</kbd> | Set in / out point |
| <kbd>[</kbd> <kbd>]</kbd> | Trim the in / out point to the playhead |
| <kbd>Enter</kbd> | Save the clip between the in and out points |
| <kbd>Esc</kbd> | Clear the in/out points, or leave drawing mode |
| <kbd>Z</kbd> or <kbd>Ctrl</kbd> <kbd>Z</kbd> | Undo the last clip |

Undo matters more than it sounds. Coaches mis-tag constantly, and cheap undo is
what makes one-press tagging feel safe enough to use at speed.

## Tagging

<kbd>1</kbd> – <kbd>9</kbd> and <kbd>0</kbd> tag the ten events a hurling
selector reaches for most often:

| Key | Event |
|---|---|
| <kbd>1</kbd> | Cúl |
| <kbd>2</kbd> | Cúilín |
| <kbd>3</kbd> | Wide |
| <kbd>4</kbd> | Poc amach — won |
| <kbd>5</kbd> | Poc amach — lost |
| <kbd>6</kbd> | Turnover won |
| <kbd>7</kbd> | Turnover conceded |
| <kbd>8</kbd> | Hook |
| <kbd>9</kbd> | Free won |
| <kbd>0</kbd> | Free conceded |

With **no clip selected**, a number key creates a quick clip already tagged.
With a clip selected, it toggles that tag on the clip. Everything else in the
taxonomy is in the details panel.

Bindings are stored on `event_types.hotkey`, so they are data — a club can
remap them to what it actually tracks without a code change.

## Review

| Key | Action |
|---|---|
| <kbd>A</kbd> | Draw on the video — press again to save |
| <kbd>T</kbd> | Comment at this moment |
| <kbd>P</kbd> | Add the clip to a playlist |
| <kbd>Shift</kbd> <kbd>↑</kbd> <kbd>↓</kbd> | Previous / next clip |

In drawing mode, <kbd>1</kbd>–<kbd>5</kbd> pick the tool — arrow, circle, pen,
spotlight, label — rather than tagging.

## View

| Key | Action |
|---|---|
| <kbd>−</kbd> <kbd>=</kbd> | Slower / faster |
| <kbd>F</kbd> | Fullscreen |
| <kbd>?</kbd> | This list |

## Typing

Whenever focus is in a text field, every shortcut above is released, so typing
"cúilín" into a comment does not fire the clip, comment and tag shortcuts as
you go. Focus leaves the field and the keys come back.

## A tagging pass, end to end

1. Open the match. Mark throw-in and half-time so timestamps read as game
   clock rather than file position.
2. Play at 1× or 1.5×. Left hand on the number row, right hand on
   <kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd>.
3. Something happens → one number key. A tagged clip is saved and you keep
   watching. No modal, no pause.
4. Roll wrong? <kbd>[</kbd> or <kbd>]</kbd> trims it.
5. Need precision? <kbd>I</kbd>, watch, <kbd>O</kbd>, <kbd>Enter</kbd>.
6. Mis-tagged? <kbd>Z</kbd>.
7. At the end: select clips, add the players in them, and build the playlists
   to assign.
