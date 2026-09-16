@AGENTS.md

# Físeán — working notes

Self-hosted hurling match video review for one GAA club. Next.js 16 (App
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
| Permissions | `src/lib/auth/guard.ts` (78) — whole file, it is short |
| Scoring, game clock | `src/lib/hurling/notation.ts` (181) |
| Pitch coordinates, zones | `src/lib/hurling/pitch.ts` (141) |
| Post-match stats | `src/lib/hurling/stats.ts` (613) — all the rules and roll-ups |
| Colour, type, spacing | `src/app/globals.css` — the whole design system |
| The video workspace | `src/components/review/ReviewWorkspace.tsx` (819) — **grep it, don't read it** |
| Player transport | `src/components/player/engine.ts` |

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
- **Positions are normalised 0–1**, never pixels or metres — a GAA pitch is
  130–145 m long, so metres would be a lie. Convert at the edges.
- **Irish terms stay Irish** for the things people say in Irish: cúl, cúilín,
  poc amach, Físeán. Everything else is English.
- **Colour means an outcome**: green good for us, red against us, amber
  unclear — reserved, never decorative. Chalk is the ink, ash is for figures.
  Marks also carry shape (filled / ring / dashed) so the maps survive
  colour-blindness and photocopying.
- **Comments explain why**, in prose, at the top of a file or above a decision.
  Match the existing density — it is higher than most codebases.
- Sentence case everywhere. No ALL-CAPS labels, no ` · `-joined meta strings.

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
- `npm run seed` refuses to run on a database that already has a team.

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
