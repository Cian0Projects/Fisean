# Version history

A plain record of the big changes to Físeán: what changed, when, and why it
matters. Small fixes and tidying stay in the git log; this is for the changes
someone coming back to the project in a year would want to know about.

Newest first. Each entry is a title, the date, and a paragraph.

<!-- Template:

## Title of the change
*YYYY-MM-DD*

One paragraph: what changed, why, and anything it affects (data, how the app
is used, how it is deployed).

-->

## A public home page before sign-in
*2026-10-07*

Someone arriving at `/` without a session used to be sent straight to the
sign-in gate, with nothing to say what the tool was. They now see a home page:
the promo video, three short reasons to use it, the three steps from raw
footage to a playlist for the panel, and links to sign in or join a team. A
signed-in user still lands on the matches dashboard at the same address, so no
links change. The page uses a dark night-and-green palette of its own, set as
`--ardawn-*` tokens and `.ardawn-*` buttons in `globals.css`, kept apart from
the outcome colours the rest of the app reserves. The video is served from
`public/Ardawn_Promo.mp4`, so it is part of the deploy.

## Físeán becomes Ardawn
*2026-10-07*

The product's public name is now Ardawn, and it describes itself as GAA video
review rather than hurling video review. The rename covers the page title,
the web app manifest, the Android app name, and the wordmark in the nav, the
sign-in gate, the phone home screen and the review workspace. The mark keeps
its two posts and crossbar, but the sliotar over the bar is replaced by a
block of pitch green under it, matching the new identity artwork. Package
ids (`ie.fisean.app`), the repository and the code's own comments keep the
old name for now, so installed apps and existing data are untouched.
