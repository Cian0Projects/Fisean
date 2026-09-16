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
