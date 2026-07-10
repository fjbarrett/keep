# Keep

A small, opinionated notes app with autosave, pin/archive/trash, full-text
search, and a date-grouped sidebar. It is a Next.js application backed by
Postgres, with a guest mode that keeps notes in the browser until sign-in.

![Keep — sidebar with date-grouped notes and an open note editor](./docs/screenshot.png)

## Stack

- **Next.js 16** App Router and React 19
- **TypeScript** end to end
- **Tailwind CSS** with app-wide color tokens
- **Auth.js / NextAuth** with Google and verified email/password sign-in
- **Postgres** through a small pooled data layer
- **IndexedDB** for account-scoped note caching and queued mutations
- Native **iOS and macOS** clients sharing the same authenticated API

## Features

- Debounced autosave for new and existing notes
- LLM-generated titles and summaries through Anthropic, with a local fallback
- Pin, archive, trash, restore, and delete forever
- Tags, color labels, and full-text search across title and body
- Keyboard navigation and a searchable command-style overlay
- Stable deep links at `/note/<noteId>`
- Guest notes in `localStorage`, with idempotent migration after sign-in
- Account-scoped offline cache and ordered mutation replay for interrupted saves
- Markdown preview and optional Shiki syntax highlighting, persisted per note
- Public share links with 128-bit bearer tokens, vanity links, and revocation
- Google Keep Takeout, plain-text, Markdown, ZIP, and PDF import
- Plain-text or ZIP export
- Public image uploads through S3-compatible storage or Vercel Blob
- Anonymous aggregate analytics and a private owner dashboard

Offline support protects edits made while the application is already open.
For privacy, personalized HTML and public shared notes are never stored by the
service worker, so a full page reload still requires a network connection.

## Getting started

```bash
npm install
cp .env.example .env.local
# Set AUTH_SECRET and DATABASE_URL.
# Add Google, Resend, Anthropic, and object-storage settings as needed.
npm run dev
```

The idempotent bootstrap in `lib/db.ts` creates the notes, users, native-auth,
audit, and analytics tables on first use. A transient bootstrap failure is
retryable on the next request.

Useful checks:

```bash
npm test
npx tsc --noEmit
npm run build
npm audit
```

## Project layout

```text
app/
  api/notes/             Authenticated CRUD, import/export, titles, sharing
  api/auth/              Auth.js plus registration and email verification
  note/[noteId]/         Stable note deep links
  p/[token]/             Public shared-note pages
components/
  NotesView.tsx          Top-level product state and editor wiring
  NoteEditor.tsx         Race-safe debounced editor
  Sidebar.tsx            Date groups, filters, actions, and sharing
  NotesGrid.tsx          Responsive note cards
lib/
  db.ts                  Postgres pool and idempotent schema bootstrap
  useNotes.ts            Optimistic CRUD and ordered sync queue
  offlineDb.ts           Per-account IndexedDB cache and outbox
  titleModel.ts          Anthropic metadata with local fallback
ios/                     Native iOS and macOS clients
__tests__/               Unit, route, persistence, and editor regression tests
proxy.ts                 Auth gate, CSP, rewrites, and public rate limits
```

## Deployment

Production is self-hosted behind Caddy. The GitHub Actions workflow runs the
test, typecheck, and production-build gates before deploying the latest `main`
commit. `scripts/deploy.sh` provides the equivalent manual flow and refreshes
the project screenshot afterward.

The app can also run on other Node.js hosts when the same environment variables
and a Postgres database are available.

## License

MIT — see [LICENSE](./LICENSE).
