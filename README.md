# Keep

A small, opinionated notes app — autosave, pin/archive/trash, full-text search across title and body, and a date-grouped ChatGPT-style sidebar. Built as a single-page Next.js app backed by Postgres, with a guest mode that stores notes in `localStorage` until you sign in.

![Keep — sidebar with date-grouped notes and an open note editor](./docs/screenshot.png)

## Stack

- **Next.js 14** (App Router, route handlers for the API)
- **TypeScript** end to end
- **Tailwind CSS** with CSS variables for the graphite & amber color tokens (dark + light)
- **NextAuth** for sign-in (guest mode works without auth)
- **Postgres** via `pg`, with a pooled client cached across hot reloads and a self-healing schema bootstrap

## Features

- Autosaving editor — no Save button; new notes persist as soon as you start typing
- LLM-generated note titles (falls back to local inference when no API key is set)
- Pin, archive, move-to-trash, restore, delete-forever
- Tags with one-click filter chips in the sidebar
- Full-text search via a `⌘K` / `/` / `f` modal with `↑` `↓` and `Enter` navigation
- Keyboard-first: `j`/`k` note navigation, single-key actions, and a `?` shortcuts overlay
- Date-grouped sidebar (Today / Yesterday / Previous 7 days / Previous 30 days / Older)
- Per-note URLs — opening a note rewrites to `/<noteId>`, so refresh and bookmarks land back on it
- Offline support — a service worker plus an IndexedDB outbox that queues edits and replays them on reconnect
- Archive and Trash reachable from the Settings pane with a one-click "Back to notes"
- Guest mode: notes live in `localStorage`; signing in migrates them to your account
- Markdown preview and opt-in Shiki syntax highlighting per note
- Version history with line diffs and one-click restore
- Public share links (`/p/<token>`) with revocation
- Passkey sign-in alongside Google OAuth
- Google Keep Takeout import (Takeout ZIP or single `.json`)
- Plain-text export — single `.txt` per note, or a ZIP of everything
- Graceful DB-error banner with retry — the app stays usable even when Postgres is unreachable
- SSL-aware Postgres connection that works against both self-hosted (self-signed cert) and managed providers

## Getting started

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env.local
# set AUTH_SECRET (openssl rand -base64 32) and DATABASE_URL
# (plus OPENAI_API_KEY if you want LLM titles)

# 3. Run
npm run dev
```

The schema (one `notes` table + a few indexes) is created on first request — no separate migration step. Migrations are expressed idempotently in `lib/db.ts` so dropped columns and added indexes apply on next boot.

`npm test` runs the Vitest suite covering title inference, Takeout import parsing, and the autosave debounce.

## Project layout

```
app/
  api/notes/         CRUD + import + export + title route handlers
  [noteId]/          Deep links back into an open note
  p/[token]/         Public share pages
  layout.tsx         Root layout
  page.tsx           Header + NotesView
  signin/            NextAuth sign-in page
components/
  Header.tsx         Top bar (wordmark + auth chip)
  NotesView.tsx      Top-level state + editor wiring
  Sidebar.tsx        Date-grouped note list + tag filter chips
  NoteEditor.tsx     Autosaving editor (new + edit modes both autosave)
  SearchOverlay.tsx  ⌘K full-text search modal
  SettingsPane.tsx   Views (Archive/Trash) + Data (import/export) sections
  ShortcutsOverlay.tsx  `?` keyboard reference
  ...                Markdown preview, Shiki editor, passkeys, theme toggle
lib/
  db.ts              pg Pool + SSL handling + idempotent schema bootstrap
  types.ts           Note shape
  useNotes.ts        Client hook: fetch + optimistic mutations + guest sync
  offlineDb.ts       IndexedDB note cache + pending-op outbox
  inferTitle.ts      Local zero-token title fallback
  titleModel.ts      OpenAI-backed title generation
  googleKeepImport.ts  Takeout parser
  noteExport.ts      Plain-text / ZIP export
  passkeys.ts        WebAuthn registration + auth helpers
__tests__/           Vitest: title inference, Takeout import, autosave
auth.ts              NextAuth config
```

## Deployment

Deploys cleanly to Vercel. Set `DATABASE_URL` and `AUTH_SECRET` as project environment variables, plus `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` for Google sign-in. Set `OPENAI_API_KEY` to enable LLM-generated note titles; without it, Keep falls back to local zero-token title inference. Any Postgres provider works — the connection layer handles both managed (real CA) and self-hosted (self-signed) certs.

## License

MIT
