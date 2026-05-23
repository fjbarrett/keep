# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]
### Added
- Added a Trash view with restore and permanent delete actions.
- Added low-cost LLM-generated dashboard titles with local fallback.
- Added inferred dashboard titles for notes.
- Added guest notes with local browser storage and sign-in sync.
- Added Google Keep Takeout import from ZIP or JSON files.
- Added notes export as a single text file or a ZIP of text files when exporting multiple notes.
- Added keyboard shortcuts for search, creating notes, view switching, navigation, opening, pinning, archiving, and deleting.

### Changed
- Moved import and export actions into a settings pane.
- Removed the edit Done button in favor of autosaving the open note.
- Reworked the app into a persistent sidebar and editor layout on desktop.
- Local notes now require an explicit save after sign-in instead of auto-syncing.
- Gave the top bar a more colorful sage-tinted background.
- Replaced the always-visible search field with a shortcut-driven overlay.
- Renamed the app display name from fKeep to Keep and removed the header tagline.
- Made notes body-first by removing title entry from creation and editing.

### Fixed
- Restored visible note titles and fixed crowded pinned indicators in the sidebar.
- Normalized stale guest note titles so dashboard rows stay abbreviated.
- Prevented row color palettes from being clipped by the notes list container.

## [0.1.0] - YYYY-MM-DD
### Added
- Initial release.
