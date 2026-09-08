# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-09-09

First public release.

### Added

- Insert a syntax-highlighted code block at the caret in an HTML compose window.
- Syntax highlighting for 36 languages via a vendored highlight.js 11.12.0.
- Automatic language detection, overridable in the popup.
- Live preview of the block in the popup before inserting.
- Right-click a selection in the compose window to turn it into a code block.
- Whitespace normalisation of pasted source.
- A warning before inserting a large snippet.
- An options page for the theme and related preferences.
- Light and dark rendering that follows Thunderbird's appearance.
- `Ctrl+Shift+C` as the default shortcut.

Requires Thunderbird 128 or newer.

[unreleased]: https://github.com/sitepark/thundercode/compare/1.0.0...HEAD
[1.0.0]: https://github.com/sitepark/thundercode/releases/tag/1.0.0
