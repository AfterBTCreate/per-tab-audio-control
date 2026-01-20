# Changelog

All notable changes to Per-Tab Audio Control will be documented in this file.

This project uses [Semantic Versioning](https://semver.org/):
- **MAJOR.MINOR.PATCH** format
- **Alpha** (0.x): Initial development, unstable
- **Beta** (1.x - 3.x): Feature complete, testing phase
- **Release** (4.0+): Production ready

---

## [Unreleased]

---

## [4.1.10] - Release - 2026-01-19

### Fixed
- **Keyboard Shortcuts in Tab Capture Mode**: Fixed keyboard shortcuts (Alt+Shift+Up/Down) not changing actual audio volume when Tab Capture mode is active. The shortcuts were updating the badge/storage but not sending the volume change to the offscreen document that processes Tab Capture audio.

---

## [4.1.9] - Release - 2026-01-19

### Improved
- **Error Handling**: Added proper error handling for volume get/set operations in background.js. Previously, promise rejections were unhandled which could cause silent failures.

---

## [4.1.8] - Release - 2026-01-19

### Fixed
- **Compressor in Tab Capture Mode**: Fixed compressor (Podcast/Movie/Maximum) not working when Tab Capture mode is active. The compressor was only being applied to the content script's audio chain, not the offscreen document that handles Tab Capture audio processing.

---

## [4.1.7] - Release - 2026-01-19

### Changed
- **Code Cleanup**: Added `getTabStorageKey()` helper and `TAB_STORAGE` constants to eliminate 50+ hardcoded storage key patterns. Reduces typo risk and centralizes the key format (`tab_123_bass`, etc.) in one place.

---

## [4.1.6] - Release - 2026-01-19

### Changed
- **Code Cleanup**: Removed duplicated `getEffectiveAudioMode()` function from content.js (44 lines → 23 lines). Now delegates to background.js via messaging, making it the single source of truth for audio mode determination.

---

## [4.1.5] - Release - 2026-01-19

### Fixed
- **Cross-Origin Media (Facebook Messenger, etc.)**: Fixed audio not working on sites with cross-origin video content. In Tab Capture mode, the content script now skips processing media elements through Web Audio API, avoiding CORS restrictions that were silencing audio.
- **Focus Now Mutes Tab Capture Audio**: Focus button now properly mutes tabs using Tab Capture mode. Tab Capture audio bypasses browser-level mute, so Focus now also sets Tab Capture volume to 0. Volume is restored when the tab is manually unmuted.

---

## [4.1.4] - Release - 2026-01-19

### Changed
- **Renamed "Mute Others" to "Focus"**: The button that mutes other tabs is now called "Focus" with a new concentric rings icon, better reflecting its purpose of focusing on the current tab's audio.
- **Removed "Unmute Other Tabs"**: The context menu option to unmute other tabs has been removed. Focus is now a one-way action (mute only). Users can manually unmute individual tabs via browser tab controls.

### Improved
- **Icon Visibility**: Increased opacity of the Focus icon's concentric rings for better visibility in both light and dark modes.

### Fixed
- **Manual Unmute Now Works**: When you manually unmute a tab (via browser tab controls) after using Focus, audio now resumes immediately without needing to refresh the page.
- **Spotify No Longer Paused**: Focus now only mutes Spotify (browser-level mute) instead of clicking the pause button. Audio resumes when unmuted without losing playback position.
- **YouTube/Twitch Mute Stability**: Focus now uses browser-level mute only (removed media element muting which caused YouTube to auto-unmute after a few seconds).

---

## [4.1.3] - Release - 2026-01-19

### Changed
- **Mute Others Simplified**: "Mute Others" button now only mutes (no toggle/restore). Click to mute all other tabs; use context menu "Unmute Other Tabs" to restore if needed.

### Fixed
- **Spotify Mute Others**: Fixed issue where Mute Others would toggle play/pause on Spotify. Now only pauses (never plays).

---

## [4.1.2] - Release - 2026-01-19

### Fixed
- **Site Rules Not Applying (Complete Fix)**: Clear stale domain tracking data on extension update so Site Rules are re-evaluated. The previous fix (4.1.1) only prevented future storage of unmatched domains; this fix also clears existing stale data.

---

## [4.1.1] - Release - 2026-01-19

### Fixed
- **Site Rules Not Applying**: Fixed bug where Site Rules wouldn't apply if you visited a domain before creating a rule. The domain tracking was storing visited domains regardless of whether a rule matched, preventing newly-created rules from ever being applied.

---

## [4.1.0] - Release - 2026-01-18

### Summary
**First public release** - published to GitHub. Chrome Web Store submission pending.

### Added
- **Video.js Support**: Play/pause button now works on sites using the Video.js player library

### Changed
- **Social Links**: Updated company info section on Settings, FAQ, and User Guide pages with compact icon-only buttons for Website, GitHub, X, and Discord

### Fixed
- **Spotify Mute Others**: "Mute Others" now works on Spotify and similar sites using Web Audio API (added pause/play button clicking as fallback)
- **Branding Consistency**: User Guide and FAQ pages use same muted-color ABTC logo and brand text styling as Settings page
- **Options Page Load Error**: Removed duplicate `DEFAULT_VOLUME_STEPS` declaration causing conflicts
- **Theme Consistency**: Options and FAQ pages now default to dark (bedtime) theme on fresh install
- **Bypass Mode Toggle Error**: Fixed "Could not establish connection" error when switching bypass mode
- **Console Errors**: Added proper error handling for messaging on restricted browser pages
- **Restricted Page UI**: Now properly handles controls on browser pages (chrome://, vivaldi://, etc.)
- **Browser Page Detection**: Fixed warning message not showing on Vivaldi and Brave browser pages

---

## [4.0.0] - Beta - 2026-01-18

### Summary
Production-ready milestone with Night Sky theme branding and improved code quality.

### Changed
- **Dark Mode**: Night Sky gradient background with soft blue-gray borders
- **Light Mode**: Warm Morning theme (cream tones instead of harsh white)
- **Logo Colors**: Updated ABTC letter colors to muted pastels matching new theme
- **Theme Toggle**: Renamed from "light/dark" to "morning/bedtime" to match company branding
- **Code Refactoring**: Extracted shared utilities into `shared/` directory (browser-api.js, constants.js, validation.js)

### Fixed
- **Console Warnings**: Eliminated AudioContext autoplay policy warnings by deferring audio processing until media plays

---

## [3.4.0] - Beta - 2026-01-15

### Summary
Major documentation overhaul and branding updates.

### Added
- **X Link**: Added X (@AfterBTCreate) link to Settings, User Guide, and FAQ pages

### Changed
- **Documentation**: Complete guide.html reorganization to match popup layout flow
- **Company Tagline**: Updated to "Privacy-focused software, built late."
- **Product Tagline**: Added "The audio controls browsers forgot to include"
- **Branding**: Removed ">" from all text branding; updated letter colors (A=red, B=green, C=blue)
- **Context Menu**: Reordered EQ items to match popup; renamed "Compressor" to "Range"

### Fixed
- **Tab Capture**: Fixed audio settings resetting to defaults when service worker wakes up
- **CSP Compliance**: Removed inline style from mute icon SVG

---

## [3.3.0] - Beta - 2026-01-14

### Summary
**Milestone release** consolidating extensive development. Major features include Tab Capture audio control, 500% volume boost, dual-mode audio system, and comprehensive UI/code refactoring.

### New Features

#### 500% Volume Boost
- Maximum volume increased from 300% to 500%
- New "Ultra" tier (351-500%) with purple color scheme
- 5th wave added to volume icon for ultra volume levels
- 5th volume preset button (default: 50%, 100%, 200%, 300%, 500%)

#### Tab Capture Audio System (Chrome)
- **Full audio control on protected sites** (Spotify, DRM content, iframes)
- Volume, EQ (bass/treble/voice), and balance now work via Tab Capture
- Persistent across popup opens - no need to re-enable each time
- Smart reconnection based on domain preferences

#### Dual-Mode Audio Architecture
- **Tab Capture / Web Audio Toggle**: Separate control in popup header
- **Bypass Button**: Simple on/off toggle, returns to last active mode
- **Per-default mode site overrides**: Each mode maintains independent override lists
- **Mute Others**: Replaced "Pause Others" with browser's native tab muting API

#### Basic/Advanced Mode
- Toggle button in popup header switches between views
- **Basic mode**: Volume controls only (slider, presets, tab navigation)
- **Advanced mode**: Full features (balance, effects, device, rules)

#### EQ Slider Option
- Alternative to preset buttons for Bass/Treble/Voice
- Bass/Treble: -24 to +24 dB range
- Voice: 0-18 dB boost range

#### Customizable Volume Steps
- Configure step size for scroll wheel, keyboard shortcuts, and +/- buttons
- Range: 1-20% per action

#### Header Layout Customization
- Drag-and-drop interface to reorder header icons
- Visibility toggles for optional icons
- Adjustable spacer count (0-3)
- Settings sync across devices

### UI/UX Improvements
- ABTC company logo with colored text styling
- Light/dark mode variants of logos
- Comprehensive tooltips on all controls
- Unified color scheme throughout
- Updated button colors (mode-specific colors for Tab Capture, Web Audio, Bypass)

### Performance
- Port-based visualizer streaming (push vs poll)
- Reduced FFT size: 128 → 64 for less CPU usage
- Fixed 30fps rendering
- Content script reuses typed arrays

### Bug Fixes
- Fixed visualizer flickering when switching modes
- Fixed Tab Capture auto-starting but UI showing Web Audio mode
- Fixed "Enable Tab Capture" button not persisting preference
- Fixed Play/Pause on Spotify and DRM sites
- Fixed mousewheel volume control in Basic/Native Mode

### Code Quality
- **popup.js** → 6 modules (core, effects, devices, volume, visualizer, tabs)
- **popup.css** → 6 modules (base, tab, volume, presets, effects, controls)
- **options.js** → 7 modules (constants, utils, presets, rules, backup, devices, ui)
- Added storage quota protection
- Added DEBUG flag for development logging
- CSP hardening with `style-src 'self'`

### Security
- Message rate limiting for high-frequency message types
- Removed debug helpers from page-script.js

---

## [3.2.0] - Beta - 2026-01-10

### Changed
- FAQ split to separate page from Settings

---

## [3.1.0] - Beta - 2026-01-10

### Added
- **Native Mode**: Firefox fallback with 0-100% volume control
- **Reset Tab Button**: Resets all settings for current tab to defaults

---

## [3.0.0] - Beta - 2026-01-10

### Changed
- **Native Mode**: Replaces "Disable" with proper fallback mode
- Faster countdown for audio processing

---

## [2.9.0] - Beta - 2026-01-07

### Added
- **Context Menu**: Right-click menu for quick access to volume presets and settings
- **Badge Improvements**: Shows current volume level on extension icon
- **Disable Domain Toggle**: Quick toggle to disable extension on specific sites

---

## [2.8.0] - Beta - 2026-01-06

### Added
- **Compressor Presets**: Podcast, Movie, and Maximum compression options
- **Audio Limiter**: Prevents clipping at high volumes

---

## [2.7.0] - Beta - 2026-01-06

### Added
- **Dynamic Volume Icon**: Color-coded waves indicating volume level

---

## [2.6.0] - Beta - 2026-01-06

### Added
- **Non-linear Volume Slider**: Finer control at lower volumes
- **Balance Mouse Wheel**: Scroll to adjust left/right balance

---

## [2.5.0] - Beta - 2026-01-05

### Added
- **Firefox Feature Parity**: 300% boost and device switching now work on Firefox

---

## [2.4.0] - Beta - 2026-01-04

### Added
- **Default Device Setting**: Set preferred audio output device
- **Bass/Voice Presets**: Quick access to common EQ settings

---

## [2.3.0] - Beta - 2026-01-03

### Added
- **Firefox Audio Mode Toggle**: Switch between audio modes on Firefox

---

## [2.2.0] - Beta - 2025-12-31

### Added
- **Dynamic Shortcuts Display**: Shows current keyboard shortcut bindings
- **Permission Management**: UI for managing extension permissions

---

## [2.1.0] - Beta - 2025-12-30

### Added
- **Site Volume Rules**: Automatically apply volume settings to specific sites
- **Keyboard Shortcuts**: Configurable shortcuts for common actions

---

## [2.0.0] - Beta - 2025-12-27

### Added
- **Device Selection**: Choose audio output device per tab
- **Settings Page**: Comprehensive options page
- **Themes**: Light and dark mode support

---

## [1.0.0] - Beta - 2025-12-26

### Summary
Initial development release (private testing).

### Features
- Per-tab volume control (0-300%)
- Volume slider with percentage display
- Preset volume buttons
- Basic visualizer
- Cross-browser support (Chrome, Firefox)
