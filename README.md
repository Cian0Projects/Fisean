# Físeán

Hurling match video review for GAA teams. Clip, tag, annotate and share
footage — built so a selector can open a 70-minute match on a Sunday evening
and have it tagged and pushed to the panel's phones before Tuesday training.

Self-hosted, no per-seat licence, and it runs on your own machine for free
while you decide whether it earns a server.

---

## Getting it running

```bash
npm install
cp .env.example .env.local        # then set SESSION_SECRET
npm run db:migrate
npm run create-admin              # creates your squad, prints the join code
npm run dev
```

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**To look around before setting anything up**, seed a demonstration squad with
a tagged match, two playlists and fifteen players:

```bash
npm run seed
```

That prints sign-in details — `bainisteoir` as the manager, `tjreid` as a
player, password `hurling2026`.

### Adding real footage

**File type.** `.mp4` with **H.264** video is the safe choice — it decodes
everywhere, and it's what the built-in probe (see
[`src/lib/media/probe.ts`](src/lib/media/probe.ts)) reads duration, frame
rate, dimensions and codec from directly, with no ffmpeg involved. `.mov`
works the same way, since it shares MP4's underlying box structure — but only
if the video inside is H.264; a ProRes export, for instance, won't play in a
browser at all. Avoid HEVC (H.265) too: it's what iPhones record by default,
Safari plays it, but Chrome on Windows needs hardware decoding support and can
show a black screen for part of the panel. Físeán detects HEVC at ingest and
warns; if you see that warning, re-export as H.264.

**Naming.** You don't name or place the file yourself — `ingest` does that:

```bash
npm run ingest -- "C:\footage\ballygunner.mp4" --match <match id>
```

It copies the file into `data/media/<team id>/<a generated id>.mp4` and stores
that path as the video's `storageKey`. The original filename is kept only for
display (you'll see "ballygunner.mp4" in the admin panel), never as the path
on disk. If you'd rather place the file yourself first — say, copying it
directly into `data/media/` over the network to a server — point `ingest` at
wherever it landed; it notices the file is already inside `MEDIA_DIR` and
registers it in place instead of copying it again.

**Linking to a match.** A match (`opponent`, `competition`, `playedOn`, …) and
its footage are separate rows on purpose — the match can exist before you have
the file, and one match can hold more than one video (two camera angles, or
two files if the recording split partway through). Add the match first at
`/admin`, then click **Copy ingest command** on it, which copies the whole
command with that match's id already filled in. Leave off `--match` entirely
and `ingest` attaches the footage to whichever match was played most
recently — the common case when you're ingesting right after adding it.

---

## The three ideas that make it fast

Everything else is detail.

### 1. A clip is a row, not a video file

```
clip = { videoId, startMs, endMs, title, tags[] }
```

Playback seeks to `startMs` and stops at `endMs`. Creating a clip is an
`INSERT` — no transcode, no export queue, no progress bar. One 90-minute
source file backs hundreds of clips.

It also means watching the full match and watching a clip of it cost the same
per byte — a clip is just a byte range of the same file, served by the same
route. There is no separate "clip file" to wait on, whichever way someone
watches.

### 2. Quick-clip captures what you *just* watched

Press <kbd>C</kbd> and you get a clip spanning the **eight seconds before you
pressed** through three seconds after. You react after seeing the incident —
no pausing, no scrubbing back, no dragging handles. Follow it with a number
key to tag what it was.

Eight seconds is deliberate: it comfortably covers a poc amach and the contest
that followed. The pre-roll is adjustable in the tagging bar.

### 3. Progressive MP4 over HTTP Range, not HLS

An MP4's `moov` atom carries the full sample table, so once the browser has
parsed it, it knows the exact byte offset of the keyframe nearest any
timestamp and requests precisely that range. Seek cost is one round trip and
one GOP.

HLS can only seek to a segment boundary, two to six seconds away — strictly
worse for frame-accurate review, and it would need a transcode. The only thing
HLS buys is adaptive bitrate, which barely matters for a closed 40-person
squad on known devices.

So there is **no ffmpeg dependency and no transcoding step**. The app serves
byte ranges and the browser does the rest.

Three further details do the remaining work, all in
[`src/components/player/engine.ts`](src/components/player/engine.ts):

- **Seek coalescing.** Dragging a scrubber fires `pointermove` dozens of times
  a second. Issuing a seek for each queues work the browser then grinds
  through, and the playhead lags the cursor. A depth-one queue holding only
  the newest target turns dozens of seeks into a handful.
- **`fastSeek()` while dragging**, where the browser has it (Safari does,
  Chrome does not), then an exact seek on release.
- **`requestVideoFrameCallback`** for position, not `timeupdate` — which fires
  about four times a second and is useless for frame-accurate in/out points.

---

## Tailored to hurling

The event taxonomy lives in the database, not in component code, so a club can
add the events it actually tracks without a migration. The built-in set is in
[`src/lib/hurling/events.ts`](src/lib/hurling/events.ts).

**Scoring.** A cúl is worth three points, a cúilín one. Scores are written in
GAA notation — `1-12` is one cúl and twelve cúilíní, fifteen points, and beats
`0-14`. The scoreline **derives from the tags**: tag the match and the score
appears on its own, rather than being typed in twice.

Because `scoreValue` is a plain column, a two-point score needs no code change
— which matters, given the 2026 hurling trials include a direct sideline cut
over the bar worth two.

**Game clock.** Mark throw-in and half-time once on a video and every
timestamp in the interface switches to game time — "2nd 35:00" rather than
"01:54:03". Coaches think in game minutes.

**Pitch.** Event positions are stored as normalised 0–1 coordinates, not
metres, because a GAA pitch is not a fixed size (130–145 m × 80–90 m). Line
positions for the 13, 20, 45 and 65 are computed from whatever the match
records. The 65 is hurling's own — football marks a 45.

**Positions.** The full 1–15 numbering and its six lines, so clips can be
filtered by line: "everything the half backs were involved in".

---

## Roles

Everyone can create clips. A player clipping their own play is a feature — it
multiplies the analysis without multiplying the coach's workload. What is
restricted is editing other people's work, uploading footage, and managing the
squad.

| | player | coach | admin |
|---|:---:|:---:|:---:|
| Create clips, playlists, comments, annotations | ✅ | ✅ | ✅ |
| Edit or delete **own** work | ✅ | ✅ | ✅ |
| Edit or delete **anyone's** work | — | ✅ | ✅ |
| Upload footage, create matches, set game-clock markers | — | ✅ | ✅ |
| Publish official playlists, assign them to players | — | ✅ | ✅ |
| Manage the panel and roles, rotate the join code, delete footage | — | — | ✅ |

---

## Keyboard

The full map is in [`docs/KEYBOARD.md`](docs/KEYBOARD.md), and <kbd>?</kbd>
shows it in the app — rendered from the same table that handles the keys, so
it cannot drift out of date.

The shuttle is the industry-standard <kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd>
and in/out are <kbd>I</kbd> <kbd>O</kbd>, so anyone arriving from Hudl,
Premiere or Resolve is already fluent.

---

## Making it practical for 40 players

**Everyone can watch the full match, not just their own clips.** That's the
primary flow: `/` leads with the match list, opening one plays the whole game
end to end, and clips and playlists are things a player builds *from* that —
not a gate in front of it. "Clips you're in" and assigned playlists sit below
as quick access back to specific moments, not as a replacement for the match.

**The bandwidth maths, honestly.** If every one of 40 players watched a full
3 GB match once, that is 120 GB for the round. A club plays perhaps one or two
matches a week in season, so a genuinely worst-case week — everyone watching
everything in full — is still under 500 GB. That is comfortably inside the
20 TB Hetzner allowance recommended below (see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)), so nothing had to be restricted to
make the numbers work. In practice usage is well below that ceiling anyway —
not everyone rewatches every match in full every week — but the app doesn't
depend on that being true.

The one place bandwidth is a real, practical constraint is **LAN-only /
Tailscale hosting straight off your own machine** (see below): there, you're
bound by your home upload speed, not a data cap, and 40 people streaming a
full match at once over residential broadband will be slow. That's the
tradeoff for not paying for a server yet, not a limitation of the app.

**What actually drives adoption**, all of it already built:

- Joining is one code on a phone in under a minute. No email verification, no
  invitations to chase, nothing for the manager to approve afterwards.
- View tracking tells a selector who has actually watched an assigned
  playlist.
- Everyone can clip and build playlists, so players self-review without
  waiting on a coach.

**Still to do before a season:** a PWA manifest so it installs to the home
screen, and squad-wide notifications when a playlist is assigned.

---

## Sharing it without paying for anything

The app is self-contained — a SQLite file and a media folder. To get the panel
watching without renting a server:

**On the club WiFi.** `npm run lan` binds to all interfaces; give out the
network address it prints. Good for a clubhouse review session.

**From home, still on your machine.** Put your PC and the players' phones on a
[Tailscale](https://tailscale.com) network — free for personal use — and the
app is reachable from anywhere while still running locally.

Both only work while your machine is on, which is the honest limit. When that
stops being acceptable, [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) has the
server path, costed.

---

## How it is built

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16, App Router, TypeScript | One deploy, one language. Video bypasses the app server anyway, so a separate backend buys nothing. |
| Database | SQLite + Drizzle | SQLite is the *production* database too, not a local stand-in. For 40 users on one box there is no separate process to run and a backup is a copy of one file — and no second dialect to support. |
| Video | Native `<video>` + a custom controller | The interaction model *is* the product. Player libraries abstract away exactly the things this needs — dual-element preloading, a shuttle state machine, frame-accurate in/out points. |
| Annotations | Hand-rolled SVG | Shapes stay individually selectable, scale to any player size for free, and serialise straight to JSON. A canvas would give a bitmap that is wrong on a phone. |
| Auth | scrypt + a signed cookie | No OAuth for a closed club. Join code, then username and password. Sessions are rows, so removing a player ends their access immediately. |
| Styling | Tailwind 4 | Dark by default — a bright interface beside match footage is tiring and washes out the video. |

**Seven runtime dependencies**, no player library, no state library, no AWS
SDK, nothing to compile beyond `better-sqlite3`.

### Layout

```
src/
  app/
    page.tsx                  dashboard — a player's clips come first
    review/[videoId]/         the review workspace
    playlists/[id]/           playlist playback
    admin/                    squad, matches, footage, join code
    api/media/[...key]/       Range-capable footage serving
  components/
    player/engine.ts          the transport — seek coalescing, shuttle, rVFC
    player/Timeline.tsx       scrub bar, clips, game-clock markers
    player/AnnotationLayer.tsx  SVG drawing in normalised coordinates
    review/ReviewWorkspace.tsx  the tagging surface
  lib/
    hurling/                  taxonomy, positions, pitch, scoring notation
    keyboard/keymap.ts        the keymap as data
    media/probe.ts            MP4 box reader — duration, fps, codec
    db/schema.ts              the whole schema
scripts/                      create-admin, ingest, seed, migrate, smoke
tests/                        node --test
```

---

## Checks

```bash
npm run check      # typecheck + lint + unit tests
npm run smoke      # end-to-end, against a running dev server
```

The unit tests cover the logic that is easy to get subtly wrong: GAA scoring
notation, game-clock conversion, pitch geometry, password hashing, and HTTP
Range parsing. The smoke test mints a real session and asserts that ranged
requests actually return 206 with the right bytes — if that regresses, seeking
degrades to re-downloading and the whole tool gets slow.

---

## Known limits

- **A codec warning you should take seriously.** iPhones record HEVC (H.265)
  by default. Safari plays it; Chrome on Windows needs hardware support and
  may show a black screen for part of the panel. Físeán detects this at ingest
  and warns. Ask whoever films to export H.264 MP4.
- **No clip export yet.** Clips play in the app; there is no "download to send
  on WhatsApp". That needs an ffmpeg render queue, deliberately deferred.
- **No filmstrip on the timeline yet.** The scrub bar shows clips, markers and
  buffered range, but not thumbnails. Generating a sprite sheet client-side is
  the intended approach and needs no ffmpeg.
- **One video per review session.** Multi-camera is in the schema but has no
  interface.
- **Playlist reordering** is server-side only — no drag handle yet.
