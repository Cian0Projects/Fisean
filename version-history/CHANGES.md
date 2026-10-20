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

## Every code in its own words: kick-outs, 45s and the two-pointer
*2026-10-19*

Ardawn is for all four codes, but its stat sheet and built-in tags still
spoke hurling to everyone: a football club logged a "poc amach", won a "65"
and was offered a hook. Everything that differs now follows `teams.code`,
which the session carries as `teamCode`. The words come from `termsFor` in
`codes.ts` and `statVocabulary` in `stats.ts`, so football and ladies
football say kick-out, 45 and sideline kick; camogie keeps the poc amach but
gives a 45; hurling is unchanged. The stored values stay the same in every
code (`puckout`, `sixty_five`), so nothing was migrated and the roll-ups read
every sheet alike. The tags are one shared set, fitted to each club where
they are loaded by `tagsForCode`: hurling's stick skills are not offered in
football, and football gets a mark and a kick pass. Both football codes get
the two-pointer (the LGFA adopted the arc in April 2026). It is a shot result
on the sheet and a tag worth two on hotkey 8, it counts once in "9 of 14" and
twice in the scoreline, and the 40 m arc is drawn on their pitch maps.
Built-in tags added to the list are now written into an existing database at
startup, so clubs that signed up earlier get the new ones on the next deploy.
The game was only ever chosen on the sign-up form, and every club set up
before that form asked was hurling by default, so the squad page now has a
"The game" choice for the admin (`setClubCode`). Because nothing stored
depends on the code, changing it loses nothing; a clip tagged with something
the new code does not offer keeps that tag, without its hotkey.

## Privacy page, data agreement, and deleting a club
*2026-10-19*

A committee asks where footage is kept and who can see it before it lets a
panel be filmed, so `/privacy` answers that from what the code does: EU
storage on R2, access by club code, removal ending access at once. Behind it,
`/privacy/agreement` is the Article 28 data processing agreement, accepted by
setting up a club (the sign-up form now says so) and printable for a signed
copy. Both promise a club can delete its own data, which was only half true:
deleting a match dropped its video rows but left the files in storage, and
there was no way to close a club at all. Deleting a match now removes its
files, each match row has a Delete button for admins, and the squad page ends
with Close the club, which deletes the team row (everything cascades from it,
sessions included) and its footage once the club's name is typed.

## The whole app in the screening room
*2026-10-19*

Every signed-in screen is now dark: the matches, playlists, squad, drills,
stats, account and sign-in pages take the graphite, chalk and pale blue that
review and live stat logging already used, rather than the white programme
card. The dark palette is the default in `globals.css`, so the `DarkRoom`
wrapper and the four route layouts that applied it are gone. The one primary
action is printed in reverse (chalk on graphite) everywhere, and the browser's
own controls and status bar are dark to match. The signed-out home page is
deliberately unchanged: it sits in a new `.daylight` scope with the old light
palette until it is redesigned on its own. Print is unaffected; the stat sheet
still goes to paper in ink on white, and the print stylesheet now sets the
darker outcome and lane colours itself, since the screen defaults are the
bright ones. Emails keep their own light templates.

## A Stats section for coaches
*2026-10-19*

Coaches have a Stats link in the masthead, beside Matches. It opens a page
that starts a match (opponent, date, half length, nothing else, since
footage can be added days later) and goes straight to logging it, and lists
the club's matches with how many stats each has, a link to log more and a
link to the report. Before this, a match could only be created by uploading
footage, and logging was reached from a match's row on the Squad page,
which nobody thought to look at on match day. Everyone logging the same game
opens the same match from here, so their stats land on one sheet.

## A match clock for logging on the line
*2026-10-19*

Stats logged with no footage now carry a game clock. Every entry on the stat
sheet is stamped with the real-world moment it was seen (`match_stats.seen_at`,
set when the coach starts the entry, not when they press log), and the match
has four whistle times (`matches.throw_in_at` and the rest) that whoever keeps
time taps from the logging page. The game minute is worked out from the two
when the sheet is read, with the same conversion footage already used, so
several loggers on several phones land on one clock, a logger can start
before throw-in is tapped, and a whistle tapped late can be corrected
afterwards with every entry moving with it. Each phone checks the whistles
every 20 seconds, which is how the others see the clock start, and corrects
for its own clock being off by reading the server's. Footage still wins where
an entry has both. When footage is uploaded to the match later and its
throw-in and second half are marked, these entries land on it at the right
moment, each half measured from its own marker, so a file that starts before
the whistle or stops over the interval still lines up.

## Log a stat by voice
*2026-10-19*

Both stat logging forms, the live pad in the review workspace and the
standalone sheet, have a mic button. One tap opens it and the form fills in
as the coach talks: "shot seven point from a free", "pass seven to eleven
won", "their kick-out, long, we won it". It stays open through pauses and
stops when the entry is logged or discarded, and "scrap that" retakes the
stat without touching the screen. Nothing is logged by voice alone: the
coach still places it on the pitch and presses log. The engine is the
browser's own speech recognition (free, no key, Chrome, Edge and Safari,
needs a signal); everything that turns the words into a stat is in
`src/lib/hurling/voice.ts` with its own tests, so many words can mean one
thing and a paid engine can replace the browser's later without changing it.

## Sign in by email, and share emails
*2026-10-17*

Passwords are gone. Signing in, joining a panel and setting up a club all
ask for an email, and a six-digit code comes back with a link beside it: the
code for the phone apps, where an emailed link opens the browser instead of
the app, and the link for a laptop. Codes and link keys are stored only as
HMACs keyed with SESSION_SECRET, die after fifteen minutes or five wrong
guesses, and are rate limited by address and by network; the sign-in form
looks the same whether or not an address has an account. Joining and club
set-up now make nothing until the code comes back, so nobody can put someone
else's email on a panel. Players also get emailed when a coach assigns them a
playlist, a match's footage is ready, the coaches publish a playlist, or they
are tagged in a clip. Shares wait in a `notifications` table until ten quiet
minutes have passed (an hour at most), then go as one email, so an evening's
tagging is one message rather than forty. Every share email carries a signed
one-click unsubscribe; `/account` changes your email (verified first) and
turns the emails on or off. Mail goes through Zoho ZeptoMail's EU API with a
send-only token, and to a local outbox in development. Existing accounts keep
their sessions but need an email to sign in again: an admin can fill a blank
one on the squad page, and `npm run set-email` does it from the terminal.
`npm run db:migrate` now switches foreign keys off around a run, because the
migrator's transaction made drizzle-kit's own `PRAGMA foreign_keys=OFF` a
no-op, and rebuilding `users` would otherwise have cascaded away every
session, clip tag, playlist assignment and number sheet.

## A public home page that shows the real app
*2026-10-17*

The page a club sees before signing in was rewritten after comparing it with
Hudl, Spiideo and Veo. It had read as a generic template: a slogan, two
numbered rows of three, one cropped video and nothing specific to the Gaelic
games. It is now set in the same light programme style as the list pages and
built from things the app actually does, in short lines: a plain hero, three
rows each showing a real screen (clipping, the stat sheet, the drill board)
taken from frames of the promo video in `public/home/`, a Sunday to Tuesday
account of a club's week, and four questions clubs ask. Each screen plays into
place the first time it is scrolled to (`RevealOnScroll`, a few lines of
IntersectionObserver), and stands still for anyone who has asked for reduced
motion. A first version tied the motion to the scroll position with a CSS
view timeline, and a quick flick of the wheel ran it too fast to be seen. There is
one main action, Set up your club, with joining by code as a
link beside it. The promo now keeps its own 16:9 shape instead of being cropped
to 16:10, and has a poster frame while it loads. The page's headlines are
set in Barlow Condensed, a second face loaded for the home page only, because
Chivo at black weight read as a startup template rather than as sport. The
promo sits on a stretch of dark pitch marked at the 13, 20, 45 and 65 that
runs off the screen's edge, with the logo's green under its corner. The home
page has no spot blue at all: it is black, white and the logo's green, which
is now its own token (`--color-logo`), kept apart from the outcome green the
app uses for a good play. The mark is drawn by the one `Mark` component
everywhere, in that green, and the wordmark beside it is set in ink.

## Bring matches across from other apps, and all four codes
*2026-10-17*

A club moving to Ardawn can now bring last season with it in minutes. On the
squad page, a coach pastes download links from Veo, Pixellot, Hudl, Spiideo,
Google Drive or Dropbox, one per line or a whole export email at once. Each
link is checked straight away and comes back as a match named from its file,
and the server then fetches the files itself, straight into storage, so
nothing goes through the clubhouse broadband and the page can be closed.
None of those apps lets a club move its whole library out, but every one
hands over a single match as a download link, so that is what this takes.
Transfers resume after a restart (a new `footage_imports` table, picked up
from `src/instrumentation.ts`), and an expired link can be swapped for a
fresh one without losing what has arrived. Every fetch, redirects included,
refuses private network addresses. Ardawn is also now plainly for all four
codes, hurling, camogie, Gaelic football and ladies Gaelic football, in the
copy and the docs, and each club says which it plays at sign-up (a new
`teams.code` column, hurling for existing clubs). For now the code only sets
the ball a new drill starts with; the kick-out, the 45 and the two-point
arc come next.

## Club badges, and the squad as one list
*2026-10-14*

An admin can now give the club its badge on the squad page. Their browser
scales whatever image they pick down to a 256 pixel PNG before it uploads,
the server accepts nothing but a PNG (an SVG can carry script), and it is
kept with the club in the database so the nightly backup includes it. It
shows beside the club's name on the squad page and in every page's masthead.
The squad page itself lost the team sheet and the position column: positions
and numbers change game to game and each match keeps its own number sheet,
so the panel is now just everyone at the club, each flagged player, coach
or team admin, with only the admin able to change which. Schema: `teams`
gains `badge` and `badge_updated_at` (migration 0011).

## One script puts Ardawn live at ardawnsport.ie
*2026-10-13*

Deploying used to mean working through `docs/DEPLOYMENT.md` by hand. Now
`deploy/setup.sh` does it on a fresh Ubuntu server: it installs Node and
Caddy, builds the app, migrates the database, gets HTTPS for `ardawnsport.ie`
(redirecting `www`), runs the app as a service bound to localhost, turns on
the firewall and schedules a nightly backup. `deploy/update.sh` releases
whatever is on `main`, taking a backup before it migrates. R2 buckets created
under the EU jurisdiction, which the guide recommends because the footage
includes minors, have their own hostname; the new `R2_JURISDICTION=eu` setting
makes the app use it. Before this, an EU bucket would have refused every
upload.

## The matches page leads with the newest footage
*2026-10-10*

The cover of the matches page used to be the last match played, with the
opponent's name set in the heaviest type on the page — so heavy it read as
if the opponent were the club that owned the account, while the video sat
small in a side column. Now the match whose footage arrived last leads, even
if it was played earlier, and its video is the largest thing on the page. The
fixture is a line at heading size, "our club v them", with a note of when the
video was added. Beside the picture are the result and a shooting panel: the
stat sheet's own efficiency figure (now one shared component), the
opponent's rate for comparison, and the map of our shots, linking to the
sheet's shooting section. The fixture list below is headed "Other matches"
and stays in date order.

## Footage in Cloudflare R2, with a local stand-in for testing
*2026-10-09*

Footage can now live in a Cloudflare R2 bucket (`STORAGE_DRIVER=r2`), chosen
because R2 charges nothing for egress and egress is this app's whole cost.
Uploads became S3 multipart uploads: the browser sends 8 MB parts, three at a
time, straight to the bucket on signed links, so the app server never carries
the gigabytes, and playback streams from signed links too. The earlier
chunk-append upload is gone. The local driver was rebuilt as a stand-in for
R2 that hands out the same kind of signed links and assembles parts the same
way, so testing on a laptop runs exactly the upload the hosted app runs. R2 is
reached with presigned URLs signed by sixty lines over `node:crypto`, checked
against AWS's published example, so there is still no new dependency. Playback
links are signed against a six-hour window so a re-render does not reload the
video. Migration `0010_multipart_uploads` adds `videos.upload_id` so a dropped
upload can resume. `/start` now asks for `SIGNUP_CODE` when the host sets one,
so only invited clubs can sign up. Dropping a file no longer asks which
listed match it belongs to — the match does not exist until its footage
does — but for the match's title and date, and the match is created in the
same request that starts the upload, so a refused upload leaves no empty
match behind.

## Hosted for many clubs, with uploads in the browser
*2026-10-09*

Getting a club started used to take a terminal twice: `npm run create-admin`
to make the club, and `npm run ingest` on the server for every match file.
That ruled out any club without someone technical. Now one hosted instance
serves every club. A club sets itself up at `/start` and its admin lands on
the squad page, where a match file is dragged onto the page or picked with
Upload video. Files go up in 8 MB chunks appended at a stated offset, so a
dropped connection is retried and a dead upload resumes when the same file is
dropped again; the probe then reads the stored file's two ends, with no
ffmpeg. Hosting many clubs on one instance needed three fixes: usernames and
join codes are now unique across the instance rather than per club (sign-in
asks only for a username, so two clubs' "cian" could open the wrong account),
the media route serves a file only to the club that owns it, and each club has
a storage allowance, `TEAM_STORAGE_GB`. Migration `0009_hosted_clubs` swaps
the per-team username index for a global one and adds a unique join code
index; it fails if two clubs already share a username or code. `ingest` stays,
for the host, and now files footage under whichever club owns `--match`.

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
the web app manifest, the Android and iOS app names and the apps' offline
screen, and the wordmark in the nav, the sign-in gate, the phone home screen
and the review workspace. Físeán, with two fadas, was hard for anyone without
Irish to say or pass on; Ardawn spells ardán, the stand you watch the match
from, the way English reads it. The mark keeps its two posts and crossbar, but
the sliotar over the bar is replaced by a block of pitch green under it,
matching the new identity artwork. Package ids (`ie.fisean.app`), the session
cookie, the database file, the repository and the code's own comments keep the
old name for now, so installed apps and existing data are untouched.

## Outcome-coloured tags, and a stat sheet that reads like a match report
*2026-10-05*

A design review found the app looked generated wherever it fell back on stock
defaults, so those places were brought into line with the club-programme look.
Clip tags no longer use a different stock colour each: they are coloured only
by outcome (green good for us, red against, amber unclear) with the pitch
maps' filled, ring and dashed marks, skills and phases stay in plain ink, and
cards are drawn as small yellow and red cards. The dark video screens print
their main button in reverse (chalk on graphite) and lose their rounded,
shadowed one-offs and 10px text. The stat sheet opens with the same result
box as the matches page, a half-time score and a scorers line in GAA notation
("R Hayes 0-4 (0-2f)"), says each section in a sentence instead of big-number
tiles, and writes won-of-total as "1 of 2" so nothing reads as a score. The
matches cover draws our shot map when there is no clip to preview, the phone
home leads with the playlists set for that player, and the playlist player now
says who set it and why. Migration 0008 renames the poc amach tags ("Poc amach
won" rather than "Poc amach — won") in existing databases.
