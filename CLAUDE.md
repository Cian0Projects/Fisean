@AGENTS.md

Do not commit or push anything in this repo unless I specifically request you and give you the password 'jeff'

# Físeán — working notes

Match video review for GAA clubs in all four codes (hurling, camogie, Gaelic
football, ladies Gaelic football) — one hosted instance serves many clubs,
each scoped by `teamId`, each with its code on `teams.code`. Next.js 16 (App
Router), TypeScript, SQLite + Drizzle, Tailwind 4. Seven runtime dependencies
and no ffmpeg — keep it that way unless asked.

**This file exists to save you reading.** Everything below is already true, so
take it as read rather than rediscovering it. Long procedures you need only
occasionally live in [`docs/AGENT-RECIPES.md`](docs/AGENT-RECIPES.md) — read
that file only when the task actually calls for one.

## Read this much, and no more

Go straight to the two or three files a task needs. Sizes are given because
some of these are not worth opening whole — `Grep` for the symbol instead.

| If the task is… | Read |
|---|---|
| Schema, any new table | `src/lib/db/schema.ts` (571) — conventions in its header |
| A server action | `src/lib/actions/clips.ts` (197) is the reference pattern |
| Permissions | `src/lib/auth/guard.ts` (78) — whole file, it is short; who may *see* or *share* a clip or playlist is `src/lib/auth/visibility.ts` (pure, tested); server lookups via `visibleClipIds` in `src/lib/queries/clips.ts`, never a bare `visibility = 'team'` filter |
| Comments, drawings on the frame, playback stopping on them | `src/lib/hurling/stops.ts` (rules, tested); `src/components/player/useCommentStops.ts`; `StopCard.tsx`; `AnnotationLayer.tsx` (drawing tools). A drawing is `comments.shapes`; the `annotations` table is dead |
| Sign-in (email code, no passwords) | `src/lib/auth/email-sign-in.ts` (164: issue, redeem, rate limits); `email-code.ts` beside it (pure, tested); `src/lib/actions/auth.ts` (`finish()` does what each request was for); pages under `src/app/login/` |
| Sending email, share notifications | `src/lib/mail/` (`index.ts` driver choice, `zeptomail.ts`, `local.ts` outbox, `templates.ts` all wording); `src/lib/notify/` (`digest.ts` batching rules, `queue.ts` called from actions, `sender.ts` timer started in `src/instrumentation.ts`). How it fits together: `docs/AGENT-RECIPES.md`, "Email" |
| Scoring, game clock | `src/lib/hurling/notation.ts` (181) |
| Pitch coordinates, zones | `src/lib/hurling/pitch.ts` (141) |
| Post-match stats | `src/lib/hurling/stats.ts` (613) — all the rules and roll-ups |
| Colour, type, spacing | `src/app/globals.css` — the whole design system |
| The video workspace | `src/components/review/ReviewWorkspace.tsx` (819) — **grep it, don't read it** |
| Player transport | `src/components/player/engine.ts` |
| Importing footage from Veo, Pixellot, Hudl, Drive… | `src/lib/media/import.ts` (rules, tested); `source.ts` (guarded fetch); `importer.ts` (queue, resumed from `src/instrumentation.ts`); `src/lib/actions/imports.ts`; `src/components/admin/FootageImport.tsx` |
| Footage upload, club sign-up | `src/lib/media/upload.ts` (part plan); `src/app/api/upload/`; `src/components/admin/FootageUpload.tsx`; `src/lib/db/clubs.ts` (create a club, shared by `/start` and `create-admin`) |
| Storage (R2, local stand-in) | `src/lib/storage/index.ts` (interface, S3-shaped); `r2.ts`; `local.ts` (signed links served by `/api/media`); `sigv4.ts` (presigning, no SDK) |
| Training drills (coaches) | `src/lib/hurling/drill.ts` (model, playback, video timing); `src/components/drills/DrillEditor.tsx` (board); `recordDrill.ts` beside it (video export via MediaRecorder, no ffmpeg) |
| Phone screens (watch, clip) | `src/components/mobile/PhoneWatch.tsx`; routes under `src/app/m/` |
| Android / iOS apps | `mobile/` — thin Capacitor shells onto `/m`; its own `package.json`, excluded from `npm run check`. Build and test steps in `mobile/README.md` |

`README.md` is the product argument, written for humans. Read it when a change
needs justifying in the same voice, not to find out how something works.

## Conventions you would otherwise have to infer

- **Server actions** live in `src/lib/actions/*.ts` under `"use server"`. Every
  one: `requireUserOrThrow()` / `requireCoach()`, load the row, `assertSameTeam`,
  validate, write, `revalidatePath`, return the saved row for optimistic UI.
  Never trust a client-supplied `teamId`.
- **Pure domain logic goes in `src/lib/hurling/`**, not in actions or
  components, because that is what the tests can import. Actions keep auth,
  scoping and persistence only.
- **Four codes, not one.** Never write hurling-only copy for something every
  code shares; say "match", "ball", "the panel". Anything that differs by
  code (ball, kick-out vs puck-out, 45 vs 65, two-point arc) reads
  `teams.code` through `src/lib/hurling/codes.ts`. The `hurling/` folder
  name is historical; it holds every code's rules.
- **Positions are normalised 0–1**, never pixels or metres — a GAA pitch is
  130–145 m long, so metres would be a lie. Convert at the edges.
- **Irish terms stay Irish** for the things people say in Irish: cúl, cúilín,
  poc amach. Everything else is English.
- **The product is shown to users as "Ardawn".** Físeán is only the repo
  and code name (cookie, database file, app IDs `ie.fisean.app`); never put it
  in UI text.
- **Colour means an outcome**: green good for us, red against us, amber
  unclear — reserved, never decorative. Chalk is the ink, ash is for figures.
  Marks also carry shape (filled / ring / dashed) so the maps survive
  colour-blindness and photocopying.
- **Comments explain why**, in prose, at the top of a file or above a decision.
  Match the existing density — it is higher than most codebases.
- Sentence case everywhere. No ALL-CAPS labels, no ` · `-joined meta strings.
- **No dashes in anything a user reads** (UI copy, titles, tooltips, emails):
  no em dash, no en dash, no ` - ` as punctuation. Use a colon, a comma or a
  new sentence; "1 to 7" for a range. GAA scores keep their hyphen (`1-12`),
  because that is the notation. Code comments are exempt.
- **Log big changes in [`version-history/CHANGES.md`](version-history/CHANGES.md)**
  as part of the same commit: a new feature, a schema change, a redesign, a
  change to how it is deployed or used. Newest first; a `## Title`, the date
  in italics, then one paragraph on what changed and why. Bug fixes and
  tidying stay in the git log only.

## Commands

```bash
npm run check    # typecheck + lint + test — run THIS, not the three separately
npm run build    # noisy; pipe through: grep -E "Compiled successfully|error TS"
npm run dev      # the user usually has this running on :3000 already
```

- Tests are `node --test` with **`--import tsx`**, which is what lets a test
  import a `.ts` module that imports another. Keep that flag.
- Schema changes: edit `schema.ts`, then `npx drizzle-kit generate`, then
  `npm run db:migrate`. Never hand-write a migration.
- **Read every generated migration that rebuilds a table** (`__new_<table>`).
  drizzle-kit copies columns you are adding in the same step from the old
  table, where they do not exist yet, so the migration fails. Split it:
  generate the column change first, then add the new columns and generate
  again. `scripts/migrate.ts` turns foreign keys off around the run; never
  run migrations any other way, or a rebuild of `users` cascades away every
  session, clip tag and playlist assignment.
- `npm run seed` refuses to run on a database that already has a team. Its
  people have `@demo.ardawn.test` emails; sign in as one and the code prints
  in the app's terminal (`.test` never reaches a real mail server).

## Landmines that cost real time

- **Write files with the Write tool, not Bash heredocs.** Large heredocs get
  truncated mid-file, and the shell eats backslashes — `"\\"` arrives as `"\"`
  and `"C:\Program Files"` becomes garbage. Both fail in ways that take several
  calls to diagnose.
- **`next dev` refuses a second dev server** for the same directory. To run an
  isolated copy, use `next start` on another port against a throwaway database
  (recipe in `docs/AGENT-RECIPES.md`).
- **Don't reuse a table name as a prop name.** `footage` not `videos`, or the
  import shadows the Drizzle table and TypeScript reports something obscure.
- `next dev` rewrites `AGENTS.md` to re-add its managed block. It leaves this
  file alone as long as `AGENTS.md` exists — keep the `@AGENTS.md` line at the
  top of this one.
- The print stylesheet at the end of `globals.css` sits **outside** `@layer` on
  purpose: unlayered rules beat Tailwind's theme tokens without `!important`.
  Anything hardcoding a colour instead of using a token breaks printing.

## Spending tokens well

- State a conclusion once. Don't re-read a file after editing it — `Edit` would
  have failed if the change had not applied.
- Pipe long output: `| tail -20`, `| grep -c`, `grep -E "error|✖"`. A build log
  or a full `ls -la` in context is pure cost.
- `Grep` with a symbol beats reading a file to find where something lives.
- When a task spans many files, do the reading in one batch of parallel calls,
  then write. Interleaving read-write-read repeats context.
- Verify with the cheapest thing that actually proves it: `npm run check` over
  a screenshot, a screenshot over a description of what it might look like.
