# Keep — Claude collaboration notes

Keep is a Next.js (App Router) notes app built as a public portfolio project. The git history and PR descriptions are part of the artifact — treat them with the same care as the code.

## Working style

Before implementing any non-trivial task, evaluate it and respond with one of:

- **Ship it now** — single concern, reasonable size, no prerequisite.
- **Do X first** — there's a setup/extract/test that would make this PR cleaner.
- **Split this** — too big or mixes concerns; propose the split.
- **Skip / defer** — low signal for a portfolio.

Then proceed (or wait for confirmation if splitting).

Be brief — one or two sentences of guidance, then execute. Don't be preachy.

## PR conventions

- Always create a feature branch (`feat/...`, `fix/...`, `chore/...`) and open a PR. Squash-merge, delete branch.
- Target <300 LOC per PR; <500 acceptable. Bigger almost always splits.
- One concern per PR. Don't mix redesign + bugfix + new feature.
- Avoid back-to-back redesigns of the same surface — reads as indecision in `git log`.
- Commit messages: lowercase type prefix, single-sentence subject, body explains the **why** not the what.
- PR body: short `## Summary` (bulleted) and `## Test plan` (checklist).

## Code conventions

- Tailwind utility classes; CSS variables from `app/globals.css` (`--color-background`, `--color-surface`, `--color-border`, `--color-text`, `--color-muted`, `--color-link`, `--color-accent`, `--color-danger`).
- Client components colocated in `components/`. Keep one large `NotesView.tsx` is fine for now; extract a piece when the file grows further or when one section is genuinely reusable.
- No comments unless the *why* is non-obvious. Identifiers should carry intent.
- Autosave is the source of truth for both new and edited notes — there is no explicit "Save" button.

## Architecture quick map

- `app/page.tsx` → `<Header />` + `<NotesView />`.
- `components/NotesView.tsx` — top-level state, sidebar, main editor pane, search overlay, settings pane.
- `components/NoteEditor.tsx` — autosaving editor (new and edit modes both autosave; `createdIdRef` bridges new → edit).
- `lib/useNotes.ts` — CRUD + guest/local fallback + sync.
- `lib/db.ts` / `lib/types.ts` — Postgres + types.
- `auth.ts` — NextAuth.

## Things worth doing for portfolio polish

Flag organically when natural — don't pile them on:

- A README with screenshot + stack + 3 sentences on what's interesting.
- A handful of tests around non-trivial logic (title inference, autosave debounce, guest→user sync).
- An accessibility pass on keyboard nav + focus rings.
- Extract `Sidebar.tsx` / `MainPlaceholder.tsx` from `NotesView.tsx` once it grows past comfort.

## Deploys

Production runs on a DigitalOcean droplet (`keep-prod`, behind Caddy/HTTPS at
keeptxt.com), not Vercel. To ship after merging to `main`:

```bash
scripts/deploy.sh        # ssh → pull main, build, restart; then screenshots the live site
```

**Always screenshot on deploy.** `scripts/deploy.sh` calls `scripts/screenshot.sh`,
which captures keeptxt.com to `screenshots/keep-<timestamp>.png` (an archive kept
in the repo so design changes can be reviewed over time) and refreshes
`docs/screenshot.png` (the image shown in the README). Commit the refreshed
`docs/screenshot.png` and the new `screenshots/` file with the deploy.
