---
name: Físeán
description: Match video review for GAA clubs in hurling, camogie, Gaelic football and ladies football, set like the club's match programme with the lights down.
colors:
  graphite: "#111317"
  raised-graphite: "#171a1f"
  pressed-graphite: "#1e2229"
  hairline: "#262b33"
  field-edge: "#3d4450"
  chalk: "#eceef2"
  chalk-dim: "#a6acb8"
  chalk-faint: "#848b98"
  pale-reflex: "#b3bcf6"
  pale-reflex-faded: "#7a84c2"
  good-for-us: "#4cc17a"
  against-us: "#d2442f"
  against-us-ink: "#e05a44"
  unclear-amber: "#e0b95e"
  sod: "#0d1a13"
  logo-green: "#35c46b"
  daylight-white: "#ffffff"
  daylight-black: "#15171b"
  reflex-blue: "#1f2f96"
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
    backgroundColor: "{colors.chalk}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.print}"
    padding: "8px 12px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.chalk}"
    rounded: "{rounded.print}"
    padding: "8px 12px"
  button-outline-hover:
    backgroundColor: "{colors.pressed-graphite}"
  button-ghost:
    textColor: "{colors.chalk-dim}"
    rounded: "{rounded.print}"
    padding: "8px 12px"
  button-ghost-hover:
    backgroundColor: "{colors.pressed-graphite}"
    textColor: "{colors.chalk}"
  field:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.print}"
    padding: "8px 12px"
  jersey:
    textColor: "{colors.pale-reflex}"
    rounded: "{rounded.print}"
    size: "24px"
---

# Design System: Físeán

## Overview

**Creative North Star: "The Match Programme, in the screening room"**

Every screen is laid out the way a club's match programme is, and every screen
is in the screening room: graphite ground, chalk ink, and one spot colour, a
printer's reflex blue lifted pale so it still reads as the same ink with the
lights down. Names are set heavy and big, the way an opponent's name runs
across a programme cover; everything else is plain and small beneath it.
Sections open on a heavy chalk rule and rows are divided by hairlines, so a
page reads as one sheet rather than a stack of boxes.

It began as the palette of the screens with footage on them (review, live stat
logging, the playlist player, the phone watch screen), because a bright
surround beside 70 minutes of video tires the eye and washes out the picture.
It now runs through the whole app, so going from the fixture list into a match
is walking further into the same room rather than the lights snapping off.

Two things stay in daylight. The public home page wraps itself in the
`.daylight` scope, which sets the old programme-white palette, until it is
redesigned on its own. And print drops everything to ink on paper, so the stat
sheet still goes round a dressing room as a white page.

Colour means an outcome and nothing else. Green is good for us, red is against
us, amber is unclear; the spot blue is the club's own furniture. It is
deliberately not the club's jersey colours.

**Key Characteristics:**
- One grotesque (Chivo) doing every job through weight.
- One pale spot ink on graphite; heavy chalk rules open sections, hairlines divide rows.
- Boxed numbers wherever a number is a position, a jersey or a running order.
- Dark on every screen; white only on paper and, for now, the public home page.
- Wide sheet (88rem) with a main column and a rail, never a narrow centred column.

## Colors

A one-ink palette with the lights down: chalk and a single pale reflex blue on
graphite, with three reserved outcome colours that never decorate. Every value
is a token in `src/app/globals.css`, so nothing outside it names a colour.

### Primary
- **Pale Reflex** (pale-reflex): the spot ink. The bar under the current page, boxed jersey and position numbers, figures that count something, links, focus rings and the text caret.

### Neutral
- **Graphite** (graphite): the page, on every screen. Graphite rather than a tinted near-black.
- **Raised / Pressed Graphite** (raised-graphite, pressed-graphite): a row under the pointer, a pressed control, the rare panel. Never a card fill for content.
- **Hairline** (hairline): the rule between rows, table heads, strip dividers.
- **Field Edge** (field-edge): the edge of a form field and of an empty-state box.
- **Chalk** (chalk): body ink, the heavy rule that opens a section, and the fill of the one primary action.
- **Chalk Dim** / **Chalk Faint** (chalk-dim, chalk-faint): secondary lines and captions. Faint still clears 4.5:1 on graphite.
- **Sod** (sod): the ground a pitch map or drill board is drawn on.

### Outcome (reserved)
- **Good for Us** (good-for-us), **Against Us** (against-us, against-us-ink for small text), **Unclear Amber** (unclear-amber): results, verdicts, stat marks. Brighter than their printed versions so each clears 4.5:1 on graphite. Always paired with words or a mark shape.

### Daylight and print
- **Daylight White**, **Daylight Black**, **Reflex Blue** (daylight-white, daylight-black, reflex-blue): the same roles in the light. The `.daylight` scope sets them for the public home page, and the print stylesheet sets them, with the outcome colours darkened to clear 4.5:1 on white, for anything that goes to paper.

**The One Ink Rule.** The pale reflex blue is the only colour the chrome may use. A second accent is a mistake. The logo's green belongs to the mark and the public home page, and never says how a play went.

**The Footage Is Black Rule.** A frame that holds video (a match preview, the player stage) is literal black, not a token. Footage is not part of the palette, and black is what it letterboxes into on every screen.

**The Outcome Rule.** Green, red and amber mean something happened on the field. Watching a playlist, deleting a file or being selected are not outcomes and do not borrow them.

**The Tag Rule.** A clip tag is coloured by what it says about the game (`tagTone` in `src/lib/hurling/events.ts`): filled green, a red ring or a dashed amber ring, the same marks as the pitch maps, drawn by `TagMark`. A tag that only names a skill or a phase stays in ink with no mark. The referee's cards are the one literal colour (card-yellow, card-red), drawn card-shaped. The hues stored with each event type are not used on screen.

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

Flat. There are no shadows. Depth is a heavy rule above a section, a hairline between rows, and a tone step (raised graphite) on hover. The only box with a heavy edge is the result box, ruled like a programme's scores panel.

**The Printed Sheet Rule.** If it could not be printed in one ink on card, it does not belong: no shadows, gradients, glass or glow.

## Shapes

Square print corners (2px) on buttons, fields, number boxes and the join code; 3px on the rare panel. Numbers sit in outlined squares: solid when filled, dashed when a slot is empty. Pills and round corners appear only on the tiny outcome dots and meters.

## Components

### Buttons
- **Shape:** square print corner (2px).
- **Primary:** printed in reverse, chalk fill with graphite text, semibold 13–14px, the way a programme's back page runs white out of black. One per region. Not a pale tint of the spot ink, which reads as somebody else's dark mode. In daylight it is solid reflex blue with white text.
- **Outline:** a 1px chalk rule, chalk text; a pressed-graphite fill on hover.
- **Ghost:** dim text with no edge; pressed-graphite on hover. Used for row actions.
- **Focus:** 2px pale-reflex outline, offset 2px.

### Inputs / Fields
- **Style:** graphite fill, 1px field-edge border, 2px corners. The page sets `color-scheme: dark`, so date pickers, selects and autofill are dark too.
- **Focus:** the border and a 1px ring turn pale reflex; the caret is pale reflex.

### Navigation
- **Style:** a graphite masthead with a hairline underneath. The mark, the wordmark in chalk, then the club name, then semibold section links. The current section has a 3px pale-reflex bar under it. The jersey box comes before the signed-in name. On phones the masthead keeps the mark, the section links and "Phone view".

### Jersey / number box
- Outlined in the spot ink (1.5px), square, tabular figures. It marks jersey numbers, formation positions and running-order steps. It is dashed when the slot is empty.

### Result box
- Ruled in chalk at 1.5px. One row per side: the name, then the score in figure weight with the total in brackets. The verdict ("Won by 6 points") sits under a heavy rule and is the only outcome colour on the cover. Before the stat sheet has shots, a dashed "No result yet" box holds its place. One component (`src/components/matches/ResultBox.tsx`) on the cover and the stat sheet; on the stat sheet it adds the half-time line, and the scorers follow it in programme notation ("R Hayes 0-4 (0-2f)").

### Match preview
- A match's thumbnail, taken from its own footage: one of its first three team clips, preferring a named one. It is 16:9 with a 2px corner on a black ground. It rests on the clip's first frame and loops up to 8s of the clip while its fixture row is hovered or focused, and never under reduced motion. The lead match captions it on a translucent black strip; a fixture row gets a small play badge. With no picture to show, the lead match draws our shot map from the stat sheet instead; with no shots either, it is a single caption line. A fixture row keeps its dashed slot so the list stays aligned.

### Team sheet
- The fifteen in six lines, goalkeeper at the top. Each line is on a six-column grid, so three slots fill the row, the midfield pair sits in the middle and the goalkeeper is centred. The shape holds on phones, with the number stacked over the name.

## Do's and Don'ts

### Do:
- **Do** open every section with the 3px chalk rule and divide its rows with hairlines.
- **Do** box numbers that are positions, jerseys or steps in a sequence, in the spot ink.
- **Do** say counts in a line of prose ("1 camera angle, 14 clips and 75 stats logged.") rather than as a strip of big figures. On the stat sheet each section opens on a sentence ("We won 5 possessions and lost 8.").
- **Do** write won-of-total as "1 of 2". A hyphenated pair is a scoreline and nothing else.
- **Do** take every colour from a token, so print and daylight can swap the palette under it.
- **Do** keep sentence case, and pair every outcome colour with words or a shape.

### Don't:
- **Don't** use club jersey colours, a second accent, gradients, shadows or glow.
- **Don't** use a light token as if it were black (the rule or ink behind a video, say): on graphite those are chalk.
- **Don't** put a kicker or eyebrow above a heading; the date and context go under the name.
- **Don't** use Unicode glyphs as icons; use the drawn icons in `src/components/ui/Icon.tsx`.
- **Don't** mark a row with a coloured side stripe; use a dot or the chip's own mark.
- **Don't** join a label with a spaced dash or a middle dot ("Poc amach — won", "6 · Centre back"); write it as it is said ("Poc amach won", "6, centre back"), and use "v" between teams.
- **Don't** set a list page in a narrow centred column.
