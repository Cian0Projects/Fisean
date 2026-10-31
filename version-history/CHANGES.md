# Version history

A plain record of the big changes to Físeán: what changed, when, and why it
matters. Small fixes and tidying stay in the git log; this is for the changes
someone coming back to the project in a year would want to know about.

Newest first. Each entry is a title, the date, and a paragraph.

## The stats clock pauses and skips, for watching a match back
*2026-10-30*

A logger watching a match back on the television can now keep their clock with the footage. While a half is on, the clock strip has Back 15s, Pause and Forward 15s. "Clock wrong?" is now "Update time", which sets the clock to whatever the game clock shows. A pause is saved on the logger's clock (`stat_clocks.paused_at`), so it survives a reload. Entries logged while paused take the paused moment, and resuming moves the half's start on by the time it sat. Tapping a whistle while paused carries on first. One rule changed: setting the time no longer moves entries already logged that half. Skipping about in a recording says where the viewer now is, not that what they logged earlier was wrong, so every way of moving the clock now moves the clock alone (`skipClock` and `resumeClock` in `live-clock.ts`).

## A player's whole season on video, and their GPS beside their stats
*2026-10-30*

A player's season page now has "Watch the season": every moment of theirs in scope, one match after another, each from ten seconds before it happened, narrowed by kind (every shot this year is one chip), match, half or outcome. Each match's moments are placed on that match's own footage by its own clock (`seasonMoments` in `moments.ts`), and the player and list are a shared `MomentReel` that one match's "Watch it back" now uses too. GPS is linked to players by a new `gps_names` table: a coach says once which club member each GPS name is, and every match uploaded with that spelling follows, before or after. Names are matched ignoring case, fadas and punctuation, and the GPS page suggests a likely player where exactly one fits, but nothing is linked until a coach saves it, since one player's load on another's season is worse than a gap. Coaches see a player's distance, high speed running and top speed match by match on their season page; players do not, since GPS stays coaches' only.

## Season stats for the team and every player
*2026-10-30*

The stat sheets now add up across a season. `/stats/team` shows the form (won, drawn, lost, and a margin bar per match), then the match sheet's own headings as season figures with a line across the matches: shooting both ways and split by half, restarts, turnovers, discipline, the season's scorers and a map of every shot. `/stats/players` is the panel in one sortable table, and `/stats/players/[id]` is one player's season, with their shooting, maps and a row per match that opens that match's footage on their moments. Everyone can see all of it, coaches and players alike, the same as each match's sheet. Seasons are calendar years and can be narrowed to a competition. Nothing is stored: every figure is worked out from the submitted sheets when the page is read (`src/lib/hurling/trends.ts`, tested), so correcting a sheet or a number corrects the season. Only submitted sheets and entries count. A figure per match divides by the matches that actually logged that kind of stat, so a sheet that only logged shots does not count as a match with no turnovers. A player is found through each match's own number sheet, and entries on numbers with no name are counted for the team and flagged so someone can fill the names in. No schema change.

## Game footage on a drill: what happened, then what should have happened
*2026-10-31*

A coach can attach a playlist to a drill from the small Add game footage button beside Export video. The exported video then opens with that playlist's clips, one after another, under the label What happened, and cuts to the drill under What should have happened, so a moment from a match and its fix are one video to send round. Only the playlist's id is kept on the drill (`footage` in its JSON, so there is no migration). The clips are looked up when the video is made, by the same rules as the playlist page, so a clip that has gone private since is left out and a deleted playlist says so rather than exporting without it. The footage is drawn onto the same canvas the drill already records to, muted, so the video has no sound. The clips are read through the app's own media route rather than the bucket's signed link, because a canvas that has drawn a video from another origin cannot be recorded without CORS headers (the first version did the other thing and failed on the live site); a clip that cannot load stops the export with a message rather than quietly skipping it. Playing the footage inside the editor is not built yet.

## Choose where a drill's step notes sit on the pitch
*2026-10-30*

The step note card used to pick the emptier end of the pitch on its own. A coach can now put it in any of nine spots (the corners, the four edges or the middle) from a small grid under "Step notes on the pitch" in the drill editor, or leave it on Auto. The choice is stored in the drill's JSON as `notePlace`, so there is no migration, and applies to the board, playback and the exported video alike. Against a side the card is narrow and tall, so a long note runs down the side of the pitch instead of across the middle of the play.

## A drill's step notes appear on the pitch, in playback and in the exported video
*2026-10-29*

The note a coach writes for each drill step used to show only in a line under the board, and in a caption strip under the pitch in the exported video. Now it is a card on the pitch itself, with the step's number in a disc beside it, in the editor while the drill plays or a step is open, and in the exported video. The wrapping and placement are one pure function (`noteCardLayouts` in `drill.ts`) that the board paints as SVG and the video paints on its canvas, so the two cannot disagree. The card sits at whichever end of the pitch has fewer players and kit under it anywhere in the drill, and stays there for every step so it does not hop about. It fades while a piece is being dragged. The video's caption band under the pitch is gone, since the card replaces it, which gives the pitch more room.

## Each stat logger keeps their own clock, and submits their own stats
*2026-10-29*

Logging on the line or off a stream used to share one match clock: any coach could tap a whistle and every phone's clock moved, entries were stamped with the time of day and given a minute later from those shared whistles, and a stream needed its delay measured and set. It confused even the person who built it. Now each logger has their own clock and only ever sees the game clock. Throw-in starts it, then Half time, Second half and Full time, one button at a time, with an undo for the last. Stats can only be logged while a half is on, so the form stays faded until throw-in and again over the break, and the half is taken from the clock, never picked. On a stream the logger taps each whistle as the stream shows it, so there is no delay to set. "Clock wrong?" sets the clock by what the game clock reads, and moves that half's entries with it. Each entry now stores its half and how far into it (`match_stats.half_ms`), and the pitch turns round by itself at the restart. A logger's entries are drafts that only they can see (`match_stats.draft`, clocks in the new `stat_clocks` table) until they press Submit at full time. Then the other coaches see them on the sheet, and the sheet still goes to the players separately when a coach submits it to the panel. Entries from before keep their minutes from the old shared whistles.

## Players added by name, before they have an account
*2026-10-29*

A coach can now put a player on the panel with just a name, from the panel on the Squad page or from the number sheet while putting names to a match's jerseys, so stats can be logged against someone who has not signed up. There is no new table: the player is an ordinary member with no email (`users.email` was already nullable), so they can be given a number, appear in the report and have their line counted like anyone else. When they join Ardawn, an admin adds their email to the same row with the existing "Add one" link and they sign in to a record that already holds their stats, which is why this is not a separate kind of record that would need merging later. Joining with the team code still makes a fresh account, so a player who does that before the admin adds their email would end up twice; the admin should add the email instead. A second player with exactly the same name is refused (add an initial), since that is nearly always a double click.

## Any length of half, changeable after the match is made
*2026-10-29*

A match's halves were 30 or 35 minutes, picked when it was made (or the club's default, for a match made by uploading footage), with no way to change it after. A challenge game of twelve-minute halves therefore read its second half from 30:00. Now any whole number of minutes from 5 to 45 can be typed beside 30 and 35, both when making a match and afterwards: in the halves box at the top of the review stat pad, and under the match clock in the line logger. No stat stores its minute (each one's game time is worked out from the whistles or markers as the sheet is read), so changing the length relabels everything already logged for that match.

## Opposition numbers on stats, one stat's map at a time, and room either side when watching back
*2026-10-29*

A stat can now name one of their players by number, wherever one of theirs is in it: their shooter, their catcher, who won a ball or a restart off us, who lost or won a turnover, who was tackled or fouled. It is an optional box beside ours in both the stat pad and the line logger, kept in a column of its own (`match_stats.opposition_number`) so a number of theirs is never counted in one of our players' lines; their scorers appear under ours in the report once any has a number. The stat pad's map is back to showing only the kind of stat being logged, in the current half, since every kind on one map was too crowded to place a dot in, and a small note by the log button says each entry saves the moment it is logged, then confirms it. In "Watch it back", "5 s back" and "5 s on" reach past either end of a moment for when the logging was early or late.

## Halves set once when logging off footage, and a map that follows them
*2026-10-29*

Logging stats against a match video used to mean picking the half on every entry, with nowhere in the workspace to mark the halves themselves. The stat pad now opens with a halves strip: play to the throw-in and press "Set here", do the same at the restart, and say which end of the picture is ours in the first half. These are the video's own markers, so every coach logging off the footage shares them and the whole workspace runs on the game clock. Every entry then takes its half from where it sits in the file, and the per-entry half picker disappears. The pitch map follows the playhead: it shows one half at a time with every kind of stat on it (entries logged live on the line included, once found on the footage), drawn the way round the camera sees it, and turns round by itself for the second half. Stored positions never depend on the drawing, so first-half entries stay exactly as they were. Clicking a mark opens it to watch, edit or delete, and a delete asks first. Schema: `videos.our_end_first_half`.

## Stat sheets are submitted to the panel, and watched back moment by moment
*2026-10-29*

A stat sheet is now the coaches' draft until one of them submits it. A game is often logged by two or three people, and a half-finished sheet gave players a wrong scoreline and wrong numbers. The coaches' bar at the top of the sheet says who has logged how many entries, and has "Submit to the panel" (and "Take it back", for corrections; a submitted sheet can still be edited). Until then a player sees no stat sheet, no scoreline from it on the home page or the phone, and no draft entries sent to the review workspace. Once it is out, everyone reads all of it, every player's numbers included. Players now have a Stats tab listing the submitted sheets with how many moments of each are theirs. Every sheet gains "Watch it back": filter by player, half, outcome and kind of stat, and each entry plays from ten seconds before it was logged to three after. Entries logged on the line are found on the footage through the match's whistles and the file's half markers. Overlapping passages (a turnover and the point off it) play as one, and entries that cannot be placed are counted rather than silently dropped. Nothing is stored for the reel: it is worked out when the page is read, so a number put to a name later moves with it. Schema: `matches.stats_submitted_at` and `stats_submitted_by`, the latter a bare id since SQLite cannot add a referencing column with its ON DELETE rule.

## GPS report: one sheet per page, and a speed page
*2026-10-29*

Each GPS report page spilled over a portrait page when printed, so the two pages came out as four, wrapped in the browser's own date and address header and footer. Each is now one fixed sheet of A4 on a named print page with no margin (which is what removes the browser's header and footer), with its own header (badge, title, opponent, date) and footer (page number, coaches only). Rows tighten with the size of the squad so a full panel still fits one sheet. The pages are also split by question rather than repeating every column: page one is workload (total distance, HMLD, accelerations, decelerations) and page two is speed (HSR, top speed in m/s and km/h, % speed, and HSR share, the part of a player's distance that was at pace). No schema change.

## GPS reports for a match
*2026-10-28*

A coach can attach a GPS export to a match and read it as a two page report. Matches on the Stats page gain "Upload GPS", which becomes "View GPS" once a CSV is attached. The CSV is the player table from StatSports, Catapult or any provider; columns are found by name, in any order (Name and Total Distance are required, HMLD, HSR, Max Speed, Percentage Speed, Accels and Decels are used when present), and a km/h top speed is converted to metres per second. Page one ranks every player by total distance and page two by high speed running, each with the club badge, a bar and tint on the ranked column, a top, average and lowest strip, and a short note on what each figure means; it prints as two pages. Coaches and admins only, since running load is health data. New `match_gps` table (migration 0026); names are kept as the provider spelled them and are not matched to users. Parsing and ranking are in `src/lib/hurling/gps.ts`, tested in `tests/gps.test.mjs`, and `docs/example gps data/example_gps.csv` is a sample to try it with.

## Comments and drawings on the phone
*2026-10-28*

The phone could play a clip's comments but not make any: no way to write one, and no pen. Watching a clip now offers "Comment", which opens a sheet that leaves the video working above it, with second and frame steps to park on the moment, a text box, and a list of the clip's comments to edit or delete. "Draw on this frame" swaps the clip buttons for a pen bar (the same six tools and colours as the desktop) and posts the drawing with the comment through the same `addComment` action, so it stops the clip for everyone. The drawing layer also never set `touch-action: none`, so a finger drag scrolled the page instead of drawing; that is fixed for every screen that uses it. No schema change.

<!-- Template:

## Title of the change
*YYYY-MM-DD*

One paragraph: what changed, why, and anything it affects (data, how the app
is used, how it is deployed).

-->

## Clips are for commenting, and private until shared
*2026-10-28*

A clip no longer carries event tags or the players in it. The tag buttons and number-key tagging are gone from the review screen, the tags and "who is in it" from the clip panel and the phone's clip sheet, and the tags from the clip list and playlist player; the review header no longer works out a scoreline from tagged clips. What a clip is goes in its title, in the coach's own words, and the point goes in the comments, with a drawing on the frame. The clip panel is now one scrolling column (title, comments, who can see it, add to playlist) instead of two tabs. Every new clip starts private, its maker's alone, and is shared on purpose from the same picker as before; the phone's "I'm in" filter is now "Shared with me". Counting the match stays with the stat sheet. Existing tags and players on older clips are left in the database, unshown, and the tables are untouched.

## Comments stop the clip; clips and playlists choose who sees them
*2026-10-27*

A comment is now made at a moment in the clip (the first frame or anywhere after it) and can carry a drawing on that frame: arrows, circles, highlighted areas, pen lines, a spotlight or a label. Watching back, in a playlist, on the review screen or on a phone, the clip pauses at each comment, shows it over the picture with its drawing, and plays on when asked; the drawing is on that one frame only and is gone the moment the clip plays. Before, a drawing was saved separately, showed for three seconds in playlists only, never reappeared on the review screen and could not be deleted. `comments` gained a `shapes` column, and a migration copied every old row of `annotations` across as a comment with no words; that table is no longer read and can be dropped once this is confirmed in production. Clips and playlists now share one rule for who sees them: everyone, just the maker, or any mix of all players, all coaches, all admins and named people (`share_roles` on both tables, the new `clip_shares` table, and `playlist_viewers` for named people on a playlist). A private clip is now truly private: the coaches no longer see players' private clips, and only a clip's or playlist's maker can change who sees it, so a coach cannot widen a player's choice. People newly reached by name, or by group on a clip, are emailed once; a new "clip shared with you" email links to `/review/<video>?clip=<id>`, which opens on that clip. New playlists start private, so a cut being built never reaches or emails the panel early. Someone else's private clip on a shared playlist, or with you tagged in it, stays hidden. The rules are in `src/lib/hurling/stops.ts` and `src/lib/auth/visibility.ts`, both tested.

## Set the match clock by its minute
*2026-10-24*

A logger joining after throw-in can now set the clock from what the game
clock reads ("15:30, first half") instead of the time of day the whistle
went, which nobody arriving late knows. The stat logger's "Adjust" became
"Set the clock", and the whistle the clock counts from is worked back from
now: throw-in in the first half, the restart in the second (with a throw-in
put in for it when none was tapped). It is saved to the match, so every
phone logging it moves too, and a phone on a stream delay works it back from
its own delayed moment. Setting a whistle by time of day is still there
underneath.

## Anyone can set up a club; the host checks it before it opens
*2026-10-24*

The sign-up code is gone: `/start` is open to anyone, and `SIGNUP_CODE` is no
longer read. Instead every new club is made waiting (`clubs.approved_at` is
null; clubs from before were approved as they stood). The host is emailed at
`HOST_EMAIL` (default hello@ardawnsport.ie) with who set it up and any club
already here whose name shares an identifying word, the likeliest sign of a
duplicate, with a signed link to a page that approves or declines it. Until
then the club's admin counts as signed out everywhere but a waiting page that
says what is happening, and its join code lets nobody in, so nothing is
uploaded and no panel forms. Approving emails the admin that the club is
ready; declining deletes the club and their account and emails them to get
in touch. `npm run pending-clubs` lists waiting clubs with their links, in
case an email goes astray.

## Marks and two-point attempts on the football stat sheet
*2026-10-24*

Football and ladies football sheets get a stat of their own: the mark, either
side's, off a kick-out or an advanced mark inside the 45, with whether it was
scored from. It is logged by tap or by voice ("advanced mark fourteen, we
scored"), has its own lane on the timeline, a section in the report and a
column in the player table, and is never offered to a hurling or camogie
sheet. The report's shooting columns also split every attempt by the arc,
read off the map, so a coach sees how often the team went for two and how
often it came off. One nullable column, `match_stats.mark_kind`, added by
migration 0020; existing rows are untouched.

## A club can have more than one team
*2026-10-24*

A dual club used to set up each team as a separate club, and nobody could be
on two of them because an email belongs to one account. Now a club holds
teams: a new `clubs` table, and `teams.club_id` pointing at it. Every
existing team became a club of one, under its own id and name. Each team keeps
its own game, join code, panel, footage, clips, drills and stats, scoped by
`teamId` exactly as before, so the under 16s still cannot see the seniors.
Players and coaches are on one team, the one they joined. Admins are club
admins: from the squad page they add a team, go to another team (which moves
them onto it, so nobody is ever on two at once), and move someone on their
panel to another team in the club. The badge is the club's and is set on every
team together, the last-admin check counts the whole club, and closing a club
closes all its teams. "Clips you are in" and "playlists set for you" now also
filter by team, so someone moved across stops seeing the old team's titles.
The set-up page tells a club without a sign-up code to email for one before
asking for it, and a code sent as `/start?code=…` fills itself in and hides
the field.

## Voice remembers what it heard
*2026-10-24*

The browser's speech engine mishears GAA words in ways nobody would guess:
puck out comes back as "bookhouse", won as "one", shot as "shop". Each stat
logged by voice now keeps the words the engine wrote, in a new
`match_stats.voice_heard` column, beside what the coach finally logged. It is
text only, never audio, and nothing in the app shows it; it is there to be
read off real matches so the mishearings can be added to the phrase table in
`src/lib/hurling/voice.ts` in batches rather than guessed at one by one. The
same release teaches the parser the first of them: sound-alikes for every
stat type, trusted only as a stat's first word, "we one" as a win, and
"bookhouse" as a puck-out anywhere in a sentence.

## Double tap to skip, and a scrub bar in full screen
*2026-10-23*

Full screen showed the picture and nothing else, so there was no way to
move through the match without leaving it. The video stage now carries its
own bar in full screen (play, the time, a scrub bar the width of the
screen, exit), which fades while the match plays and comes back at a touch
or a mouse move. On every screen with a video, phone and desktop alike, two
taps or clicks on the right half of the picture skip forward ten seconds
and two on the left go back, with each quick tap after that adding another
ten. A single tap still plays and pauses at once, because an iPhone only
starts a video from inside a tap; a double puts that toggle back before it
skips. The tap rules are in `src/components/player/taps.ts`, tested. An
iPhone's full screen is still its own player, which the page cannot draw
on.

## Closing a club is done by the host, on request
*2026-10-23*

The squad page used to let an admin delete the whole club by typing its
name. It was the one action in the app with no way back, and too easy to
reach. The button is gone: the squad page now explains what closing deletes
and opens an email to hello@ardawnsport.ie, sent from the admin's own
address. The host checks with the club, then runs
`npm run close-club -- --email <admin> --yes`, which finds the club by that
admin's address (a dry run without `--yes` shows what would go) and deletes
it the same way as before, footage in storage included. The privacy page and
the data agreement now say a club asks, and that it is done within seven
days of the club confirming.

## Backups leave the server, and a preflight before the first club
*2026-10-23*

The nightly database backup used to stay on the same disk as the database, so
losing the server would have lost every club's clips, tags and stats even
though the footage was safe in R2. `npm run backup` now sends each snapshot to
the bucket under `backups/` as well as keeping 30 days locally, and the cron
job that runs it lives in the repo (`deploy/backup-cron.sh`), so `update.sh`
installs it on servers set up before it existed. `npm run preflight` checks a
server is fit for real clubs: footage in R2 and not on local disk, an EU
bucket, a live test upload, the CORS rule, email really sending, the sign-up
code, the storage cap and a recent backup in both places. `/api/health`
answers only when the database does, for an uptime monitor. Done ahead of
outreach to the first founding clubs.

## Phones get the phone screens, and live logging works off a stream
*2026-10-22*

A phone opening the review workspace saw nothing: its side panel will not
narrow, so the video was left a sliver. The review page now sends a phone
(told by the `Sec-CH-UA-Mobile` hint, else "Mobile" in the user agent, so
tablets keep the workspace) to `/m/watch`, with `?full=1` to opt out. Live
stat logging is the other job people will do on a phone, so the phone home
page now gives coaches "Log stats live" for the latest match and a way to
start another, the logger keeps its log button pinned under the thumb on a
narrow screen, and the full site's nav scrolls sideways instead of
squeezing. Logging can now be done off a live stream as well as from the
line: each phone can run a set number of seconds behind, measured by
tapping when a whistle already tapped at the ground shows on the stream, so
its stamps, whistles and running clock all match what the logger sees.

## New code photographs, and hurling joins the run
*2026-10-21*

The home page's code photographs are replaced for camogie, Gaelic football and ladies football, and hurling has its own at last, so all four codes now play in the run behind the hero. The two nearly square photographs (camogie, ladies football) carry their own crop point in `CodeHero.tsx`, because the shared one would cut the players' heads off in a wide frame.

## A landscape film of live logging on the home page
*2026-10-21*

The portrait frame for a film of a player on their phone is gone, and so is the list beside it. In its place is a full width 16:9 frame under the title "Log the match as it happens", for a film of the app used live during a match, by tap and by voice. Three beats under the frame say what it shows: in real time, by voice, and the stat sheet ready at the whistle. The frame shows a placeholder until `IN_USE_VIDEO` in `page.tsx` is set.

## Logging by voice on the home page
*2026-10-20*

The home page has a section for logging by voice: a spoken stat ("shot, ours, score, number 12") beside the four fields it fills in. It is sold for speed during a live match and for fewer slips than typing fields, and it says what the feature does today: the form fills in, and the coach still places the stat and presses log.

## The promo film leads the home page
*2026-10-20*

The home page now opens on words on the left and the promo film on the right, instead of the film playing behind the headline. The four code photographs stay behind both, dimmed under one flat wash and dissolving slowly every seven seconds, so they set the scene without competing with the film. The code tabs are gone, and hurling is left out of the run until it has a photograph. The old "See it in a coach's hands" placeholder became a portrait frame for a film of a player using the app on their phone, with words beside it: the match, their clips, the stats and the drills, with nothing to install. Managers are not shown, because they log the stats after the match, from the footage. The frame shows a placeholder until `IN_USE_VIDEO` in `page.tsx` is set.

## A home page that opens on all four codes
*2026-10-19*

The public home page is now a dark room that opens on a full-screen photograph, with the header, headline and buttons laid over it. Four equal tabs (hurling, camogie, Gaelic football, ladies football) run along the bottom, and the active tab's hairline fills in the logo green as the timer for the slideshow, so no code reads as the main one. Slides dissolve into each other and the showing photo pushes in slowly; a visitor who prefers reduced motion gets neither and changes slide by choosing a tab. The promo video moved to its own section below, and grows in as it is scrolled to. Hurling has no photograph yet, so its slide is a labelled placeholder (never a camogie picture standing in for it) and the slideshow opens on the first code that does have one. The pitch with the 13, 20, 45 and 65 lines behind the old hero is gone.

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
