# Keep — iOS (SwiftUI)

A native SwiftUI client for the Keep web app, talking to the existing
Next.js API (`/api/notes`). This is an early **scaffold**: models, an API
client, an observable store, and list/editor views.

![Keep on iOS](docs/screenshot.png)

> The shot refreshes automatically on each merge to `main` (see Screenshots).
> Until signed in (or pointed at a reachable backend) it shows the sign-in state.

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
  Services/GoogleSignIn.swift Google via ASWebAuthenticationSession + bridge
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

**Google** sign-in is native too, but bridges through the server because Google
forbids OAuth in an embedded web view. `GoogleSignIn` opens the system browser
via `ASWebAuthenticationSession` at `/native/google` (the same Google flow the
web uses); on success the server's `/native/bridge` mints a single-use code and
redirects to `keep://auth-callback?code=…`, which `GoogleSignIn` trades at
`/api/native/exchange` for the session cookie — landing it in the shared
`URLSession` jar so `/api/notes` is authenticated. (The `keep://` scheme needs no
Info.plist registration; the auth session claims it for the flow's duration.)

Passkeys aren't wired into the native flow yet (they need the
`AuthenticationServices` credential APIs).

## Screenshots

`scripts/ios-screenshot.sh` builds the app, boots a simulator, launches it, and
captures a screenshot — the mobile analog of `scripts/screenshot.sh` for the web
app. It archives under `ios/screenshots/` and refreshes `ios/docs/screenshot.png`
(the image above).

```bash
scripts/ios-screenshot.sh            # first available iPhone simulator
IOS_SIM_NAME="iPhone 17 Pro" scripts/ios-screenshot.sh
```

On every merge to `main`, the `ios-screenshot` CI job re-captures, archives the
shot under `ios/screenshots/`, and commits the refreshed image. It runs on a
macOS runner, so it's gated behind a repo variable to avoid spending macOS
minutes until you opt in:

```bash
gh variable set IOS_SCREENSHOT --body true
```

## Not done yet (intentionally)

- Passkey native sign-in (email + password and Google work today).
- Offline cache / sync, search, markdown rendering, color picker, version
  history, E2E encryption — all present on web, not yet ported.
- App icon / launch assets.

## Roadmap (suggested)

1. ~~Auth (sign-in → session cookie)~~ — done for email/password + Google
2. Passkey (`AuthenticationServices`)
3. Offline cache (SwiftData) + optimistic updates
4. Markdown preview + syntax highlighting
5. Pin/color/archive parity with web context menus
6. Share extension ("Save to Keep")
