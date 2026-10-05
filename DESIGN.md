---
name: Físeán
description: Hurling match video review for one GAA club, printed like the club's match programme.
colors:
  programme-white: "#ffffff"
  raised-grey: "#f4f5f7"
  pressed-grey: "#eceef2"
  hairline: "#dcdfe5"
  field-edge: "#a3a9b4"
  programme-black: "#15171b"
  ink-dim: "#484d57"
  ink-faint: "#676d79"
  reflex-blue: "#1f2f96"
  reflex-blue-faded: "#6c77b9"
  good-for-us: "#17803f"
  against-us: "#c2361f"
  against-us-ink: "#a92c18"
  unclear-amber: "#946000"
  screening-graphite: "#111317"
  screening-surface: "#171a1f"
  screening-chalk: "#eceef2"
  screening-blue: "#b3bcf6"
typography:
  display:
    fontFamily: "Chivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(3rem, 8.5vw, 6rem)"
    fontWeight: 900
    lineHeight: 0.92
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Chivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 5vw, 3.75rem)"
    fontWeight: 900
    lineHeight: 0.92
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Chivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.012em"
  figure:
    fontFamily: "Chivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Chivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Chivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.3
rounded:
  print: "2px"
  panel: "3px"
spacing:
  gutter-sm: "16px"
  gutter-md: "24px"
  gutter-lg: "40px"
  section: "56px"
components:
  button-primary:
    backgroundColor: "{colors.reflex-blue}"
    textColor: "{colors.programme-white}"
    rounded: "{rounded.print}"
    padding: "8px 12px"
  button-outline:
    backgroundColor: "{colors.programme-white}"
    textColor: "{colors.programme-black}"
    rounded: "{rounded.print}"
    padding: "8px 12px"
  button-outline-hover:
    backgroundColor: "{colors.pressed-grey}"
  button-ghost:
    textColor: "{colors.ink-dim}"
    rounded: "{rounded.print}"
    padding: "8px 12px"
  button-ghost-hover:
    backgroundColor: "{colors.pressed-grey}"
    textColor: "{colors.programme-black}"
  field:
    backgroundColor: "{colors.programme-white}"
    textColor: "{colors.programme-black}"
    rounded: "{rounded.print}"
    padding: "8px 12px"
  jersey:
    textColor: "{colors.reflex-blue}"
    rounded: "{rounded.print}"
    size: "24px"
---

# Design System: Físeán

## Overview

**Creative North Star: "The Match Programme"**

The list pages — matches, playlists, the squad, sign-in — are printed the way a
club's match programme is: white card, black ink, and one spot colour, a
printer's reflex blue, the colour a local printer runs a programme or a raffle
ticket in. Names are set heavy and big, the way an opponent's name runs across
a programme cover; everything else is plain and small beneath it. Sections open
on a heavy black rule and rows are divided by hairlines, so a page reads as one
sheet rather than a stack of boxes.

The screens that put footage on screen — review, live stat logging, the
playlist player, the phone watch screen — are a screening room. They take the
same system with the lights down: graphite ground, chalk ink, and the spot
blue lifted pale. A route opts in by wrapping itself in the dark-room scope;
every token flips and nothing else changes.

Colour means an outcome and nothing else. Green is good for us, red is against
us, amber is unclear; the spot blue is the club's own furniture. It is
deliberately not the club's jersey colours.

**Key Characteristics:**
- One grotesque (Chivo) doing every job through weight.
- One spot ink on white; heavy rules open sections, hairlines divide rows.
- Boxed numbers wherever a number is a position, a jersey or a running order.
- Light for reading and managing, dark only where video plays.
- Wide sheet (88rem) with a main column and a rail, never a narrow centred column.

## Colors

A one-ink print palette: black and a single reflex blue on white, with three
reserved outcome colours that never decorate.

### Primary
- **Reflex Blue** (reflex-blue): the spot ink. Wordmark, the bar under the current page, boxed jersey and position numbers, the primary button, figures that count something, focus rings and the text caret.

### Neutral
- **Programme White** (programme-white): the page. Every list page's ground.
- **Raised Grey** / **Pressed Grey** (raised-grey, pressed-grey): a row under the pointer, a pressed control, a code block. Never a card fill for content.
- **Hairline** (hairline): the rule between rows, table heads, strip dividers.
- **Field Edge** (field-edge): the edge of a form field and of an empty-state box.
- **Programme Black** (programme-black): body ink, and the heavy rule that opens a section.
- **Ink Dim** / **Ink Faint** (ink-dim, ink-faint): secondary lines and captions. Faint still clears 4.5:1 on white.

### Outcome (reserved)
- **Good for Us** (good-for-us), **Against Us** (against-us, against-us-ink for small text), **Unclear Amber** (unclear-amber): results, verdicts, stat marks. Always paired with words or a mark shape.

### Screening room
- **Graphite** (screening-graphite), **Screening Surface**, **Chalk** (screening-chalk), **Pale Reflex** (screening-blue): the same roles with the lights down, set by the dark-room scope.

**The One Ink Rule.** Reflex blue is the only colour the chrome may use. A second accent is a mistake.

**The Outcome Rule.** Green, red and amber mean something happened on the field. Watching a playlist, deleting a file or being selected are not outcomes and do not borrow them.

## Typography

**Display Font:** Chivo (with ui-sans-serif, system-ui)
**Body Font:** Chivo

**Character:** A sturdy grotesque with the heft of a local printer's programme face. At black weight it carries a name across the page. At regular it reads as plainly as a fixture list. Its figures are squared and open, and tabular on request.

### Hierarchy
- **Display** (900, clamp(3rem, 8.5vw, 6rem), 0.92): the lead match's opponent and the club name on the squad page. One per page.
- **Headline** (900, clamp(2.75rem, 5vw, 3.75rem), 0.92): page names such as Playlists.
- **Title** (700, 1–1.3rem, 1.2): section headings, playlist names, fixture opponents.
- **Figure** (800, 2.5rem, 0.95, proportional digits): scorelines in the result box.
- **Body** (400, 15px, 1.5): prose, max 64ch.
- **Label** (400, 12px, 1.3): captions under names and figures, and table heads. Sentence case.

**The Weight Is the Hierarchy Rule.** Emphasis comes from weight and size in the one family. Never from italics, a second face, or colouring a single word.

**The Tabular Column Rule.** Any column of numbers (dates, clocks, counts) is set tabular. Big standalone figures stay proportional.

## Layout

The sheet is 88rem wide with 16 / 24 / 40px gutters (phone, tablet, laptop). List pages split into a main column and a rail of about 22–25rem from `lg` up. The rail holds the second thing a reader wants: clips, playlists, matches and footage. It collapses under the main column on phones. Sections are separated by about 56px, with more space above a section rule than below it. Tables stay tables on phones: minor columns drop and the date folds into the caption line.

**The No Dead Margin Rule.** A list page never sits in a narrow centred column with empty sides. When there is little content, the rail carries the secondary lists.

## Elevation & Depth

Flat. There are no shadows. Depth is a heavy rule above a section, a hairline between rows, and a tone step (raised grey) on hover. The only box with a heavy edge is the result box, ruled like a programme's scores panel.

**The Printed Sheet Rule.** If it could not be printed in one ink on card, it does not belong: no shadows, gradients, glass or glow.

## Shapes

Square print corners (2px) on buttons, fields, number boxes and the join code; 3px on the rare panel. Numbers sit in outlined squares: solid when filled, dashed when a slot is empty. Pills and round corners appear only on the tiny outcome dots and meters.

## Components

### Buttons
- **Shape:** square print corner (2px).
- **Primary:** solid reflex blue with white text, semibold 13–14px. One per region.
- **Outline:** a 1px black rule, black text; a pressed-grey fill on hover.
- **Ghost:** dim text with no edge; pressed-grey on hover. Used for row actions.
- **Focus:** 2px reflex-blue outline, offset 2px.

### Inputs / Fields
- **Style:** white fill, 1px field-edge border, 2px corners.
- **Focus:** the border and a 1px ring turn reflex blue; the caret is reflex blue.

### Navigation
- **Style:** a white masthead with a hairline underneath. Mark and wordmark in reflex blue, then the club name, then semibold section links. The current section has a 3px reflex-blue bar under it. The jersey box comes before the signed-in name. On phones the masthead keeps the mark, the section links and "Phone view".

### Jersey / number box
- Outlined in the spot ink (1.5px), square, tabular figures. It marks jersey numbers, formation positions and running-order steps. It is dashed when the slot is empty.

### Result box
- Ruled in black at 1.5px. One row per side: the name, then the score in figure weight with the total in brackets. The verdict ("Won by 6 points") sits under a heavy rule and is the only outcome colour on the cover. Before the stat sheet has shots, a dashed "No result yet" box holds its place.

### Match preview
- A match's thumbnail, taken from its own footage: one of its first three team clips, preferring a named one. It is 16:9 with a 2px corner on a black ground. It rests on the clip's first frame and loops up to 8s of the clip while its fixture row is hovered or focused, and never under reduced motion. The lead match captions it on a translucent black strip; a fixture row gets a small play badge. With no clips, no footage or an undecodable file, it shows the dashed empty slot.

### Team sheet
- The fifteen in six lines, goalkeeper at the top. Each line is on a six-column grid, so three slots fill the row, the midfield pair sits in the middle and the goalkeeper is centred. The shape holds on phones, with the number stacked over the name.

## Do's and Don'ts

### Do:
- **Do** open every section with the 3px black rule and divide its rows with hairlines.
- **Do** box numbers that are positions, jerseys or steps in a sequence, in reflex blue.
- **Do** say counts in a line of prose ("1 camera angle, 14 clips and 75 stats logged.") rather than as a strip of big figures.
- **Do** wrap any route that plays footage in the dark-room scope.
- **Do** keep sentence case, and pair every outcome colour with words or a shape.

### Don't:
- **Don't** use club jersey colours, a second accent, gradients or shadows.
- **Don't** put a kicker or eyebrow above a heading; the date and context go under the name.
- **Don't** use Unicode glyphs as icons; use the drawn icons in `src/components/ui/Icon.tsx`.
- **Don't** mark a row with a coloured side stripe; use a dot or the chip's own mark.
- **Don't** set a list page in a narrow centred column.
