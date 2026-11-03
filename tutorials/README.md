# How-to videos

Short screen recordings of the real app, made with Playwright and written as
1080p mp4 files with a jpg poster each: to `public/guides/` for the two a
stranger may watch, and to `content/guides/` (a video marked `members: true`)
for the rest, which the app serves to signed in members only. Who sees which is
`src/lib/guides.ts`. This folder has its
own `package.json`, like `mobile/`, so Playwright stays out of the app's seven
dependencies and out of `npm run check`.

| Video | What it shows |
|---|---|
| `set-up-your-club` | Sign up a club, confirm the emailed code, wait for the check |
| `join-your-panel` | A player joins with the team code |
| `log-stats-live` | Throw-in, a tackle, a shot, a poc amach, half time |
| `after-the-match-stats` | Name the numbers, submit the sheet, read the report |
| `make-a-drill` | New drill, set-up, steps, playback |
| `make-a-clip` | Quick clip, title, trim, who can see it, tag players |

## Recording them

They are recorded against a throwaway copy of the app, never `data/fisean.db`.
Needs ffmpeg on the path and Playwright's Chromium (`npx playwright install chromium`).

```bash
npm run build                      # from the repo root
cd tutorials && npm install
node setup.mjs                     # throwaway database, demo club, footage that plays
sh serve.sh &                      # the build on :3131 against that database
node record.mjs                    # every video, or: node record.mjs make-a-drill
sh sheet.sh make-a-drill           # contact sheet to check one without watching it
```

`setup.mjs` renames the demo squad to made-up names (the seed uses real
people) and crops the scoreboard and taskbar out of the footage. Point
`TUTORIAL_FOOTAGE` at another mp4 to use different footage. Each video resets
what it touches first, so it can be recorded again without running setup.

## How it is made

`lib.mjs` holds everything the videos share. The cursor, click ripples,
numbered captions, title card and end card are DOM elements injected into the
page, so they are in the picture because they are in the page. Frames come
from Chrome's screencast as 1920 by 1080 JPEGs and ffmpeg stitches them at
30 fps, because Playwright's own `recordVideo` is low bitrate and smears small
type. Each file in `videos/` is a title, a subtitle and a list of steps using
`t.say`, `t.click`, `t.type`, `t.drag`, `t.ring` and `t.scroll`.

Captions follow the app's writing rules: sentence case, no dashes.
