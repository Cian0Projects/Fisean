# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One GAA club's hurling panel: selectors, the manager and coaches, and the
players themselves. Players and coaches use the desktop pages about equally —
coaches to tag and publish, players to catch up on the clips they are in and
the playlists set for them. Players also use the phone view (`/m`) and the
Capacitor shells in `mobile/`.

## Product Purpose

Self-hosted match video review. A selector opens a 70-minute match on a Sunday
evening, clips and tags it, logs a stat sheet, and pushes playlists to the
panel's phones before Tuesday training. Success is that the footage actually
gets watched, by name, before the next session.

## Positioning

Built for one club and run on its own machine: no per-seat licence, no
upload of several-gigabyte files through a browser, hurling's own notation
(cúl–cúilín scorelines, poc amach, 30- and 35-minute halves) rather than a
generic sports template.

## Operating Context

- Coaches at a laptop at home or in the clubhouse, often straight after a
  match; the review workspace sits next to 70 minutes of footage.
- Players on phones and laptops, between work and training.
- The stat sheet is printed and handed round a dressing room, or sent as PDF.
- Footage is registered from the command line (`npm run ingest`).

## Capabilities and Constraints

- Next.js 16, SQLite + Drizzle, Tailwind 4; seven runtime dependencies, no
  ffmpeg — so no generated video thumbnails.
- Roles: player, coach, admin. Only admins manage the squad.
- Pitch positions are normalised 0–1; GAA positions numbered 1–15.

## Brand Commitments

- Name: Físeán. The mark is a goalpost with a sliotar over the bar
  (`src/components/ui/Mark.tsx`, `docs/brand/fisean-mark.svg`).
- Irish terms stay Irish for things said in Irish (cúl, cúilín, poc amach).
- Colour means an outcome: green good for us, red against us, amber unclear,
  never decorative. Marks also carry shape so maps survive colour-blindness
  and photocopying. Club jersey colours are deliberately not used in the chrome.
- The video workspace stays dark so footage reads; the list pages (matches,
  playlists, squad) are light.
- Sentence case everywhere; no all-caps labels, no dot-joined meta strings.

## Evidence on Hand

Demo squad from `npm run seed` (Demo Hurling Club, 16 players, matches,
clips, two playlists, a stat sheet). No real club data, testimonials or users
to quote.

## Product Principles

- The last match leads: it is what everyone came to look at.
- Watched by name — assignment and follow-up matter more than browsing.
- Hurling's own vocabulary and notation, never a generic sports template.
- Nothing that needs a server bill or a dependency to earn its place.
