# Agent recipes

Procedures that take several attempts to work out and are needed only
occasionally. Deliberately kept out of `CLAUDE.md`, which is loaded into every
session — read this file only when the task calls for one of these.

---

## Run an isolated copy of the app

`next dev` refuses to start a second dev server for the same directory, and the
user usually has one running on `:3000` against the real database. So build
once and serve the build on another port, pointed at a throwaway database.

```bash
SCRATCH="<your scratchpad dir>"

DATABASE_PATH="$SCRATCH/verify.db" npm run db:migrate
DATABASE_PATH="$SCRATCH/verify.db" npm run seed     # demo squad, match, clips, stat sheet
npm run build
DATABASE_PATH="$SCRATCH/verify.db" npx next start -p 3131   # run in background
```

A real environment variable beats `.env.local` (see `scripts/_env.ts`), so this
never touches `data/fisean.db`.

## Email

How sign-in and share emails work, for when a task touches either.

**Sign-in has no passwords.** `/login`, `/join` and `/start` each take an
email (plus a name and team code, or club details) and call `issueSignIn()`
in `src/lib/auth/email-sign-in.ts`. That writes a `sign_in_requests` row
holding HMACs (keyed with `SESSION_SECRET`, salted with the row id) of a
6-digit code and a link key, then emails both. The person lands on
`/login/code?r=<id>` to type the code, or taps the link, which opens
`/login/link` (a button, never automatic, because mail scanners open links).
`redeemCode`/`redeemLink` spend the row once; `finish()` in
`src/lib/actions/auth.ts` then signs in, creates the player, creates the club,
or changes the email, according to `purpose`. Join and start make nothing
until the code comes back. Limits: 15 minutes, 5 wrong codes, 3 requests per
email and 20 per IP per 15 minutes. `/login` makes a request for unknown
emails too, but sends nothing, so it cannot reveal who has an account.

**Share emails are queued, then batched.** An action that shares something
calls `notifyUsers()` or `notifyPanel()` from `src/lib/notify/queue.ts` after
its own write. That only inserts `notifications` rows (unique per user, kind
and subject, so re-sharing is a no-op) and never throws into the action. A
timer in `src/lib/notify/sender.ts`, started from `src/instrumentation.ts`,
runs every minute. It sends a person's pending rows as one email once 10
minutes pass with no new ones (60 at most; rules and tests in `digest.ts`),
looks every subject up again first (deleted, private or untagged are left
out), and marks rows sent only after the send succeeds. The four kinds today
are `playlist-assigned`, `match-footage` (from `finishUpload`),
`team-playlist` (official playlists only) and `clip-tagged` (team clips
only).

To add a kind: add it to `NOTIFICATION_KINDS` and a line to `digestLines()`
in `digest.ts` (with a test), describe it in `describe()` in `sender.ts`,
call the queue from the action, and generate a migration (the column is an
enum).

**Wording** lives only in `src/lib/mail/templates.ts`, as text and HTML. The
tests fail if a dash gets into anything a reader sees.

**Drivers.** `ZEPTOMAIL_TOKEN` set means real email through ZeptoMail's EU
API (`zeptomail.ts`, one `fetch`, no SDK). Unset, or `MAIL_DRIVER=local`,
means `local.ts`: the email is written to `data/outbox/*.html` and its text
printed in the terminal, which is how to test sign-in on a laptop. Addresses
ending `.test` or `.invalid` always go to the outbox. Links in emails come
from `APP_URL` (`src/lib/url.ts`), which production requires: building them
from the Host header would let a forged request send a player's sign-in link
to someone else's server.

**Unsubscribe** links are `/unsubscribe?u=<user>&s=<HMAC>`; only a POST to
`/api/unsubscribe` changes anything, and that route also answers the
mail providers' one-click POST. People change their email (verified by code
first) and toggle share emails at `/account`. An admin can fill a blank
email on the squad page; `npm run set-email` does it from the terminal.

## Hit an authenticated page from a script

Sessions are rows plus a signed cookie, so a script can mint one. The pattern
is already written out in `scripts/smoke.ts` — copy the `SignJWT` block rather
than reinventing it:

```ts
const [session] = await db.insert(sessions).values({ userId, expiresAt }).returning();
const token = await new SignJWT({ sid: session.id })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime(Math.floor(expiresAt / 1000))
  .sign(new TextEncoder().encode(process.env.SESSION_SECRET!));
// fetch(url, { headers: { cookie: `fisean_session=${token}` } })
```

Delete the session row afterwards. Put the script in `scripts/` (so its
relative imports resolve), run it with `npx tsx`, and delete it when done —
`_tmp-` prefixed files are not meant to be committed.

## Screenshot a page

Worth doing for any visual change; a picture settles in one look what prose
cannot. Chromium's headless shell ships with Playwright's browser cache:

```bash
ls -d ~/AppData/Local/ms-playwright/chromium_headless_shell-*/   # version drifts
SHELL_BIN="<that dir>/chrome-headless-shell-win64/chrome-headless-shell.exe"
```

It cannot set a cookie from the command line, so **fetch the HTML with the
session cookie, rewrite its asset URLs to absolute, save it, and shoot the
file**:

```ts
const html = (await res.text())
  .replaceAll('href="/_next/', `href="${BASE}/_next/`)
  .replaceAll('src="/_next/', `src="${BASE}/_next/`);
```

```bash
"$SHELL_BIN" --disable-gpu --hide-scrollbars \
  --disable-web-security --allow-file-access-from-files \
  --window-size=1280,1400 --virtual-time-budget=6000 \
  --user-data-dir="$SCRATCH/profile" \
  --screenshot="$SCRATCH/page.png" "file:///$SCRATCH/page.html"
```

Notes, each of which cost an attempt to find:

- `--disable-web-security --allow-file-access-from-files` are what let a
  `file://` page load the self-hosted font from `localhost`. Without them the
  shot silently falls back to a system face and the typography looks wrong.
- Use the **headless shell**, not `msedge.exe --headless=new`, which hangs
  instead of writing the file.
- Build paths from forward slashes and `pathToFileURL()`; see the backslash
  warning in `CLAUDE.md`.

## See what the stat sheet looks like printed

The report's whole export story is the browser's print stylesheet, so changes
to colour tokens need checking on paper. The headless shell has no print
emulation flag, and reading a PDF needs `pdftoppm`, which is not installed.
Instead lift the real `@media print` block out of `globals.css` and apply it
unconditionally to a saved page, then screenshot that:

```js
const css = fs.readFileSync("src/app/globals.css", "utf8");
const i = css.indexOf("@media print {");
let depth = 0, j = i;
for (; j < css.length; j++) {
  if (css[j] === "{") depth++;
  else if (css[j] === "}" && --depth === 0) { j++; break; }
}
const block = css.slice(i, j).replace(/^@media print \{/, "").replace(/\}\s*$/, "");
html.replace("</head>", `<style>${block}</style></head>`);
```

What to look for: ink on paper, pitch maps on a pale ground with dark
markings, outcome colours preserved, controls gone.

## Check a palette for colour-blind safety

The bundled `dataviz` skill has a validator. Green against red is the pair that
fails, and this project's outcome colours depend on it:

```bash
node <dataviz skill>/scripts/validate_palette.js "#4cc17a,#d2442f,#e0b95e" \
  --mode dark --surface "#0f1613"
```

The current set passes CVD separation at ΔE 13.6 (deuteranopia) by being
separated in lightness as well as hue. The "lightness band" check will FAIL and
that is expected — it applies to categorical series, not to a reserved status
palette. If you change these colours, re-run it, and remember the shapes in
`PitchMap` are the backup channel.
