# Changelog

This file records user-facing changes. Git history contains the earlier
development history; release dates are recorded when a version ships.

## Unreleased

### Added

- Account password settings and sign-out across devices.
- Per-account note storage limits, bounded imports, and streamed exports.
- Isolated release builds, a non-root runtime, and health-checked rollback.

### Changed

- Explicit titles stay intact when note bodies change across web and native apps.
- Guest migration saves progress per note and retains drafts after partial failure.
- Menus support keyboard navigation; search exposes combobox and option semantics.
- The web editor mounts once across responsive layouts and loads highlighting on demand.
- Native Google sign-in uses a proof key and state binding; updated clients are required.

### Fixed

- Edits made during a note's first save survive its response.
- Sign-out blocks late writes from repopulating the previous account's local cache.
- Native apps quarantine corrupt drafts and recover journaled edits on offline launch.
- Native conflict recovery offers saving a copy or discarding the local draft.
- Server outages preserve native sessions; definite authentication failures request sign-in.
- Share changes authorize ownership before resolving token collisions.
- Attachment cleanup uses indexed references and preserves files still used by another note.
- Service-worker caching tracks versioned PDF workers and excludes personalized pages.
