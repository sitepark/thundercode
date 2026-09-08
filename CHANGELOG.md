# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-08

### Added

- **compose:** Insert a hardcoded block at the caret
- **code-block:** Build a block from pasted source
- **popup:** Warn before inserting a large snippet
- **code-block:** Normalise whitespace in pasted source
- **compose:** Add a Ctrl+Shift+C keyboard shortcut
- **compose:** Degrade gracefully in plain-text composers
- **compose:** Convert a selection from the context menu
- **options:** Add an options page for tab width and font size
- **code-block:** Highlight the block with a vendored highlight.js
- **popup:** Render a live preview of the block
- **code-block:** Auto-detect the language

### Fixed

- Address code-review findings
- **code-block:** Keep the block's own fill out of the theme map
- **ui:** Blank toolbar icon, spell checking and square corners
- **ui:** Let the toolbar icon colour itself
- **ui:** Follow Thunderbird's light or dark appearance

[1.0.0]: https://github.com/sitepark/thundercode/releases/tag/1.0.0
