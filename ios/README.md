# Keep — iOS (SwiftUI)

A native SwiftUI client for the Keep web app, talking to the existing
Next.js API (`/api/notes`). This is an early **scaffold**: models, an API
client, an observable store, and list/editor views.

## Requirements

- Xcode 15+ (iOS 17 deployment target; uses the `@Observable` macro)
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) to generate the project:
  `brew install xcodegen`

## Generate & run

```bash
cd ios
xcodegen generate      # produces Keep.xcodeproj from project.yml
open Keep.xcodeproj
```

Set the backend in `project.yml` → `KEEP_BASE_URL` (defaults to
`http://localhost:3000`). `Config.swift` reads it from the Info.plist.

> Note: the loose `.swift` files show "cannot find type" in editors until the
> Xcode target exists — they only compile as a built target, not in isolation.

## Structure

```
Keep/
  KeepApp.swift            App entry; injects NotesStore
  Support/Config.swift     Base URL from Info.plist
  Models/Note.swift        Mirrors lib/types.ts Note
  Services/KeepAPI.swift   URLSession client over /api/notes
  Services/AuthClient.swift Native NextAuth sign-in (csrf + credentials)
  Services/NotesStore.swift @Observable view-model (sorted pinned-first)
  Views/RootView.swift     NavigationStack + initial load
  Views/SignInView.swift   Native email/password sign-in sheet
  Views/NotesListView.swift List, swipe pin/trash, compose
  Views/NoteEditorView.swift Debounced autosave editor (new→edit bridge)
```

## Auth

Email/password sign-in is **native** (no web view): `AuthClient` posts to the
NextAuth endpoints (`/api/auth/csrf` → `/api/auth/callback/password`) and the
shared `URLSession` cookie jar carries the resulting session cookie to
`/api/notes`. A 401 flips `NotesStore.needsAuth`, which presents `SignInView`.

Against `http://localhost:3000`, the Info.plist allows local-network cleartext
(`NSAllowsLocalNetworking`); production over HTTPS needs no exception.

Google and passkey aren't wired into the native flow yet — Google OAuth needs an
`ASWebAuthenticationSession`, and passkeys need the `AuthenticationServices`
APIs. Email/password covers getting the app signed in today.

## Not done yet (intentionally)

- Google / passkey native sign-in (email + password works today).
- Offline cache / sync, search, markdown rendering, color picker, version
  history, E2E encryption — all present on web, not yet ported.
- App icon / launch assets.

## Roadmap (suggested)

1. ~~Auth (sign-in → session cookie)~~ — done for email/password
2. Google (`ASWebAuthenticationSession`) + passkey (`AuthenticationServices`)
3. Offline cache (SwiftData) + optimistic updates
4. Markdown preview + syntax highlighting
5. Pin/color/archive parity with web context menus
6. Share extension ("Save to Keep")
