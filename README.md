# Keep

A small, opinionated notes app — pinning, archiving, tinted cards, full-text search across title and body, and a slide-in editor. Built as a single-page Next.js app backed by Postgres.

![screenshot placeholder](./docs/screenshot.png)

## Stack

- **Next.js 14** (App Router, React Server Components where useful, route handlers for the API)
- **TypeScript** end to end
- **Tailwind CSS** with CSS variables driving a tint-aware color system
- **Postgres** via `pg`, with a pooled client cached across hot reloads and a self-healing schema bootstrap
- **Framer Motion** (`motion`) for the editor transition

## Features

- Create, edit, pin, archive, delete, and recolor notes
- Three views (All / Pinned / Archive) with live counts
- Search across title and body
- Sectioned layout — pinned notes float to the top of the All view
- Graceful DB-error banner with a retry affordance — the app stays usable even when Postgres is unreachable
- SSL-aware Postgres connection that works against both self-hosted (self-signed cert) and managed providers

## Getting started

```bash
# 1. Install
npm install

# 2. Point at a Postgres instance
cp .env.example .env.local
# edit DATABASE_URL

# 3. Run
npm run dev
```

The schema (one `notes` table + two indexes) is created on first request — no separate migration step.

## Project layout

```
app/
  api/notes/         CRUD route handlers
  layout.tsx         Root layout + fonts
  page.tsx           The single page — view state, search, editor wiring
components/          Header, NoteList, NoteRow, NoteEditor, TintPicker, …
lib/
  db.ts              pg Pool + SSL handling + schema bootstrap
  types.ts           Note shape and tint palette
  useNotes.ts        Client hook: fetch + optimistic mutations
```

## Deployment

Deploys cleanly to Vercel. Set `DATABASE_URL` as a project environment variable. Set `OPENAI_API_KEY` to enable LLM-generated note titles; without it, Keep falls back to local zero-token title inference. Any Postgres provider works — the connection layer handles both managed (real CA) and self-hosted (self-signed) certs.

## License

MIT
