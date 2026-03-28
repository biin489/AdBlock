# Changelog

All notable changes to the Absolute AdBlocker extension will be documented in this file.

## [1.2.0] - 2026-03-29
### Added
- **Commercial Readiness**: First formal release preparation for Chrome Web Store.
- **Versioning System**: Implemented 4-digit SemVer for better update tracking.
- **Changelog**: Added `CHANGELOG.md` to track extension evolution.
- **UI Enhancements**: Added version display in the popup and "What's New" link.

### Fixed
- General performance improvements in `MutationObserver` filtering.
- Enhanced reliability of Facebook ad detection.

---

## [1.1.0] - 2026-03-15
### Added
- **Sub-Engine Architecture**: Integrated dedicated engines for Facebook and YouTube.
- **Real-time Stats**: Track blocked items categorized by DOM, Network, and Popup.
- **Debug Mode**: Added HTML extraction tool for Facebook posts.

### Changed
- Refactored `content_core.js` for better modularity.
- Updated popup UI with modern glassmorphism design.

---

## [1.0.0] - Initial Release
- Core ad-blocking functionality.
- Basic popup UI.
- Declarative Net Request integration.
