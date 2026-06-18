# Keep — iOS (SwiftUI)

A native SwiftUI client for the Keep web app, talking to the existing
Next.js API (`/api/notes`). This is an early **scaffold**: models, an API
client, an observable store, and list/editor views.

![Keep on iOS](docs/screenshot.png)

> The shot above currently shows the no-backend state (the client has no native
> auth yet — see below). It refreshes automatically once the app connects.

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
  Services/NotesStore.swift @Observable view-model (sorted pinned-first)
  Views/RootView.swift     NavigationStack + initial load
  Views/NotesListView.swift List, swipe pin/trash, compose
  Views/NoteEditorView.swift Debounced autosave editor (new→edit bridge)
```

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

- **Auth.** The web app uses NextAuth **session cookies**. The cleanest mobile
  path is one of:
  1. A sign-in `WebView` that establishes the session cookie in a shared
     `URLSession` (fastest to ship), or
  2. A token endpoint on the API for native clients (cleaner long-term).
  Until then, `KeepAPI` assumes an authenticated session and surfaces 401s as
  "Please sign in."
- Offline cache / sync, search, markdown rendering, color picker, version
  history, E2E encryption — all present on web, not yet ported.
- App icon / launch assets.

## Roadmap (suggested)

1. Auth (WebView sign-in → shared cookie jar)
2. Offline cache (SwiftData) + optimistic updates
3. Markdown preview + syntax highlighting
4. Pin/color/archive parity with web context menus
5. Share extension ("Save to Keep")
