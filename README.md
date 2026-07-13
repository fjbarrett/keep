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
- Local title/summary inference, with explicit opt-in Anthropic enhancement
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
- Private, authenticated image uploads through S3-compatible storage or Vercel Blob
- Anonymous aggregate analytics and a private owner dashboard

Offline support protects edits made while the application is already open.
For privacy, personalized HTML and public shared notes are never stored by the
service worker, so a full page reload still requires a network connection. An
explicit sign-out removes that account's IndexedDB cache and queued mutations.

## Getting started

```bash
npm install
cp .env.example .env.local
# Set AUTH_SECRET, AUTH_URL, and DATABASE_URL.
# Add Google, Resend, Anthropic, and object-storage settings as needed.
npm run dev
```

The idempotent bootstrap in `lib/db.ts` creates the notes, users, uploads,
native-auth, audit, and analytics tables on first use. A transient bootstrap
failure is retryable on the next request.

AI metadata is disabled by default. Setting `AI_METADATA_ENABLED=true` and an
Anthropic key sends up to the first 8 KiB of authenticated note text to
Anthropic for a title and summary. Guest text always stays in the browser.

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
  api/uploads/           Owner/share-authorized private image delivery
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
test, typecheck, audit, and production-build gates before deploying the latest
`main` commit. The deploy environment requires a pinned `DEPLOY_KNOWN_HOSTS`
entry in addition to the host and SSH key. `scripts/deploy.sh` provides the
equivalent manual flow and refreshes the project screenshot afterward.

The app can also run on other Node.js hosts when the same environment variables
and a Postgres database are available.

## Security and privacy

Keep's server can read note content: notes are stored as plaintext Postgres
columns so server search, export, and optional AI metadata work. Browser guest
notes are plaintext localStorage; signed-in offline copies are plaintext
IndexedDB scoped by account. The native clients put titles, summaries, and tags
in Spotlight, while full note bodies stay out of the system index.

Random public share links use 128-bit tokens. Vanity tokens must be at least 16
characters and should still be treated as public URLs. Uploaded images remain
private objects and are served only to their owner or through a note that
currently has a valid share token. See [SECURITY.md](./SECURITY.md) for the
deployment checklist and reporting process.

## License

MIT — see [LICENSE](./LICENSE).
