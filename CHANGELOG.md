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

## [4.1.79] - Release - 2026-01-21

### Changed
- **ABC logo font**: Updated all SVG logos to use Comfortaa font (rounded letterforms) to match the Chrome Web Store icon and website branding

---

## [4.1.78] - Release - 2026-01-21

### Changed
- **Speaker icon updated**: Redesigned the speaker icon in the ABC logo to match the Chrome Web Store icon design with a more compact trapezoid shape and curved sound waves

---

## [4.1.77] - Release - 2026-01-21

### Fixed
- **Visualizer indicator in disabled mode**: Now shows the "Visualizer off" indicator in the bottom-right corner when domain is in disabled/off mode

---

## [4.1.76] - Release - 2026-01-21

### Fixed
- **Web Audio mode not working after switch**: Fixed "Extension cannot access audio" error when switching from Tab Capture to Web Audio mode. The issue was that page refresh lost user interaction context needed for AudioContext creation. Now sets a sessionStorage flag before refresh that content script reads to allow immediate audio processing.

---

## [4.1.75] - Release - 2026-01-21

### Changed
- **Tab Title Location default**: Changed default from "Inside visualizer" to "Below visualizer" for cleaner appearance

---

## [4.1.74] - Release - 2026-01-21

### Fixed
- **QA: Map iteration safety**: Fixed potential iterator invalidation when cleaning up message throttle entries - now collects keys before deletion
- **QA: Tab storage cleanup**: Added missing storage keys to tab close cleanup (bass, treble, voice, compressor, balance, channel mode) - prevents memory leaks

### Documentation
- **SECURITY-FINDINGS.md**: Updated rate limiting section to reflect current implementation status (rate limiting IS implemented, not absent)

---

## [4.1.73] - Release - 2026-01-21

### Added
- **Tab Title Location setting**: Choose where to display tab title - "Inside visualizer" (default, shows title and URL overlaid) or "Below visualizer" (shows title in separate row below)
- **Auto-scroll for notifications**: Status messages now auto-scroll into view when they cause a scrollbar to appear

### Changed
- **Tab counter repositioned**: Moved tab counter from bottom-left to top-right of the visualizer
- **Tab title truncation**: Added right padding to prevent title text from overlapping with the tab counter

### Documentation
- **User Guide updated**: Added Tab Title Location setting documentation under Appearance > Visualizer section

---

## [4.1.72] - Release - 2026-01-20

### Removed
- **Discord and Patreon links**: Removed Discord and Patreon/Support links from options.html, guide.html, and faq.html about sections

---

## [4.1.71] - Release - 2026-01-20

### Accessibility
- **Comprehensive ARIA Audit**: Added missing `aria-label` attributes throughout:
  - popup.html: Added `aria-hidden` to header spacers and slider markers
  - options.html: Added `aria-label` to icon-only about links, spacer buttons, and all reset buttons
  - guide.html: Added `aria-label` and `aria-hidden` to icon-only about links and their SVGs
  - faq.html: Added `aria-label` and `aria-hidden` to icon-only about links and their SVGs

---

## [4.1.70] - Release - 2026-01-20

### Documentation
- **User Guide Privacy & Security**: Updated "About Permissions" section with complete list of all 9 permissions
- **Website Privacy Policy**: Added popup sections customization to UI preferences list

---

## [4.1.69] - Release - 2026-01-20

### Documentation
- **User Guide Comprehensive Update**: Fine-grained review and corrections throughout:
  - **Popup Controls**: Fixed header buttons order to match actual default (Volume Icon first, ABTC Logo last/locked)
  - **Audio Mode Buttons**: Renamed "Tab Capture vs Web Audio Toggle" to "Audio Mode Buttons", documented three separate buttons
  - **Extension Icon Badge**: Added "!" badge indicator documentation for Tab Capture activation
  - **Header Layout**: Added note about ABTC Logo being locked at end
  - **Popup Sections Customization**: Added new section documenting the popup sections reordering feature
  - **Context Menu**: Fixed "Mute/Unmute Other Tabs" → "Toggle Focus Mode", updated Balance and Range preset names
  - All sections verified against current feature set

---

## [4.1.68] - Release - 2026-01-20

### Documentation
- **User Guide Update**: Synchronized with FAQ changes:
  - Added "!" badge indicator and keyboard shortcut info to Tab Capture section
  - Updated Visualizer Auto-Disable section to remove obsolete button references
  - Rewrote "Switching to Tab Capture" as "Switching Audio Modes" with clearer instructions
  - Simplified Firefox disabling section
  - Updated "Switching Modes" section with separate header buttons
  - Fixed "What Syncs" list: removed obsolete refresh setting, added popup sections layout
  - Fixed terminology: "Disable Mode" → "Disabled Mode"

---

## [4.1.67] - Release - 2026-01-20

### Documentation
- **FAQ Update**: Updated "Reset to defaults" section:
  - Removed obsolete "Refresh behavior reset to default"
  - Added "Default audio mode reset"
  - Added "popup sections" to layout reset
  - Fixed terminology: "Disable mode" → "Disabled"

---

## [4.1.66] - Release - 2026-01-20

### Documentation
- **FAQ Update**: Updated "What settings sync" section:
  - Removed obsolete "Refresh behavior setting"
  - Added "Default audio mode" to synced list
  - Added "popup sections customization" to layout sync
  - Fixed terminology: "Disable mode" → "Disabled"

---

## [4.1.65] - Release - 2026-01-20

### Documentation
- **FAQ Update**: Mentioned keyboard shortcuts as alternative user gesture for Tab Capture activation

---

## [4.1.64] - Release - 2026-01-20

### Documentation
- **FAQ Update**: Updated "Why click extension for each tab" section:
  - Added new subsection explaining the "!" badge indicator
  - Badge shows when Tab Capture needs enabling on current tab
  - Updated tip to mention badge disappears once activated

---

## [4.1.63] - Release - 2026-01-20

### Documentation
- **FAQ Update**: Rewrote "Volume difference between modes" section:
  - Renamed from "Why does Disable mode sound louder than Tab Capture"
  - Added Web Audio mode explanation
  - Removed confusing "(100%)" from headings
  - Removed site-specific examples (YouTube, Spotify) for simplicity

---

## [4.1.62] - Release - 2026-01-20

### Documentation
- **FAQ Update**: Rewrote "Visualizer not working" section:
  - Simplified intro: Tab Capture (Chrome default) works on all sites
  - Removed outdated "Enable Tab Capture" button references
  - Consolidated fix steps for Chrome and Firefox
  - Removed redundant "Switching to Tab Capture" subsection

---

## [4.1.61] - Release - 2026-01-20

### Documentation
- **FAQ Update**: Rewrote "No sound on this site" section:
  - Changed advice from "disable" to "try switching modes while keeping enhancements"
  - Removed incorrect claim about Tab Capture issues
  - Updated fix steps: try different modes first, Disabled as last resort
  - Added note that per-site mode choice is saved

---

## [4.1.60] - Release - 2026-01-20

### Documentation
- **FAQ Update**: Corrected "Volume capped at 100%" section:
  - Added "default mode set to Disabled" as a possible cause
  - Removed incorrect reference to red ⊘ button (doesn't appear in disabled mode)
  - Updated fix instructions: select Tab Capture/Web Audio instead of clicking ⊘
  - Added tip to change default mode in Settings if issue persists on all sites

---

## [4.1.59] - Release - 2026-01-20

### Fixed
- **Options Page Spacing**: Added margin below visualizer options so separator line doesn't sit too close to buttons

---

## [4.1.58] - Release - 2026-01-20

### Fixed
- **Header Layout Tooltip Cutoff**: ABTC Logo tooltip no longer cut off at right edge (added CSS rule for last-child alignment)
- **Header Layout Hint**: Added note that ABTC Logo is locked in position

---

## [4.1.57] - Release - 2026-01-20

### Documentation
- **Terminology Consistency**: Completed "Bypass" → "Disabled" rename throughout codebase:
  - Options page: Audio modes section, default mode buttons, header layout hints
  - Options UI: Site overrides list mode labels
  - Popup: Native mode status message
  - Context menu: "Enable Bypass Mode" → "Disable Audio Processing"
  - FAQ: Button reference for Firefox users

---

## [4.1.56] - Release - 2026-01-20

### Security
- **Tab ID Validation**: Added validation for tabId parameters in message handlers (GET_VOLUME, SET_VOLUME, GET_TAB_INFO) to prevent potential injection attacks

### Fixed
- **Effects Race Condition**: Added defense-in-depth check in applyEffect() to prevent bass/treble/voice changes while compressor is active, guarding against edge cases during tab switching

---

## [4.1.55] - Release - 2026-01-20

### Fixed
- **Input Validation**: Added NaN validation and radix parameter to all parseInt calls in EQ sliders (bass, treble, voice, balance) to prevent potential audio glitches from invalid input
- **Security Hardening**: Replaced innerHTML clearing pattern with safer replaceChildren() in permissions page device list

---

## [4.1.54] - Release - 2026-01-20

### Fixed
- **Context Menu Focus Mode**: Fixed toggle and tab-following behavior - Focus Mode now properly enables/disables and audio correctly follows the active tab when switching.

---

## [4.1.53] - Release - 2026-01-20

### Fixed
- **Context Menu Focus Mode**: The right-click menu "Focus" option now properly toggles Focus Mode (audio follows active tab) instead of just one-time muting other tabs. Renamed from "Focus (Mute Other Tabs)" to "Toggle Focus Mode" for clarity.

---

## [4.1.52] - Release - 2026-01-20

### Changed
- **UI Polish**: Reduced volume display font size and slider thumb for better spacing; moved slider markers closer to track; right-aligned Site Rule controls; added visible borders to Options page reset buttons; reorganized Options sections (moved Enhancement Controls to Appearance, reordered sections)

---

## [4.1.51] - Release - 2026-01-20

### Changed
- **Compact Output & Site Rule Sections**: The Output device selector and Site Rule sections are now condensed single-line layouts instead of collapsible sections, saving vertical space while keeping full functionality. Balance and Enhancements remain collapsible.

---

## [4.1.50] - Release - 2026-01-20

### Added
- **Popup Sections Layout Customization**: New customization feature allows reordering and hiding of the popup's main content sections (Balance, Enhancements, Output, Site Rule). Drag-and-drop to reorder, uncheck to hide. At least one section must remain visible.

### Changed
- **Consolidated "Appearance" Section**: Reorganized the Options page to group visual customization settings together. Header Layout, Popup Sections, and Visualizer options are now under a single "Appearance" section with flat subsection headings for cleaner organization.

---

## [4.1.49] - Release - 2026-01-20

### Added
- **Collapsible Popup Sections**: The Balance, Enhancements, Output, and Add Site sections in the popup can now be collapsed/expanded by clicking their headers. The collapsed state is saved and persists across popup opens. Click the chevron or section title to toggle; controls within headers (like Stereo/Mono/Swap buttons) remain clickable without collapsing.

---

## [4.1.48] - Release - 2026-01-20

### Changed
- **ABTC Logo Locked in Header**: The ABTC (AfterBedTime Creations) logo in the popup header is now locked at its default position and cannot be moved via the header layout customization. The logo shows "(locked)" in its tooltip and other items cannot be dropped before or after it.

---

## [4.1.47] - Release - 2026-01-20

### Added
- **Restricted Page Badge Indicator**: Browser pages (chrome://, about:, edge://, etc.) now show an amber "!" badge with tooltip "Audio control not available on browser pages". The amber color matches the warning status message in the popup, providing consistent visual feedback.

---

## [4.1.46] - Release - 2026-01-20

### Fixed
- **Tab Capture Indicator Badge/Tooltip Desync**: Fixed an issue where the badge would show the volume percentage but the tooltip would still say "Click to activate Tab Capture". The badge and tooltip now stay synchronized by centralizing pending state detection in `updateBadge()`.

---

## [4.1.45] - Release - 2026-01-20

### Added
- **Keyboard Shortcuts Auto-Initiate Tab Capture**: When using keyboard shortcuts (volume up/down, toggle mute) in Tab Capture mode, the extension now automatically initiates Tab Capture if it's not already active. This allows users to control volume via shortcuts without opening the popup first. Only triggers when the site's effective mode is Tab Capture - does not affect Web Audio or Disabled modes.

### Changed
- **Default Keyboard Step**: Changed default keyboard shortcut volume step from 1% to 5% for more practical volume adjustments out of the box.
- **Tab Capture Pending Indicator**: When Tab Capture mode is active for a site (either as the default mode or via site rule) but Tab Capture hasn't been initiated yet, the extension icon shows a blue "!" badge and the tooltip says "Click to activate Tab Capture for this site". The indicator clears once Tab Capture is activated via popup click or keyboard shortcut.

---

## [4.1.44] - Release - 2026-01-20

### Changed
- **Updated Extension Icons**: Replaced extension icons (16x16, 48x48, 128x128) with the new branding that matches the Chrome Web Store listing. The new icons feature a lighter blue-gray background and updated typography.

---

## [4.1.43] - Release - 2026-01-20

### Fixed
- **Race Condition in Offscreen Document Creation**: Replaced the mutex pattern with a proper promise-based lock that's assigned synchronously before any async operations, preventing the race window where two callers could both pass the existence check.
- **Volume Slider NaN Protection**: Added `Number.isFinite()` validation to `positionToVolume()` to handle edge cases where slider position might be NaN or non-finite.
- **Device Switch Error Handling**: The catch block for device switching now correctly reports `notFound: true` when the error is a `NotFoundError`, allowing proper error handling upstream.

### Documentation
- **QA Findings Updated**: Added documentation for intentional patterns: console statements (DEBUG-guarded), popup event listener lifecycle, webkitAudioContext legacy support, and empty catch blocks for fire-and-forget operations.

---

## [4.1.42] - Release - 2026-01-20

### Fixed
- **Active Tab Audio Status No Longer Disappears**: Fixed issue where the visualizer's status clearing would remove the Active Tab Audio reminder. The `clearStatus()` function now preserves the reminder, and `showStatus()` prevents other persistent messages from overwriting it. Only explicit disable or another Active Tab Audio message can remove it.

---

## [4.1.41] - Release - 2026-01-20

### Improved
- **Active Tab Audio Status Persistence**: The status message now persists when opening the popup from any tab and automatically restores after temporary messages (like "Muted 5 tabs") expire. Updated wording to "Active Tab Audio ON - Audio follows active tab" for clarity. On restricted pages (browser pages), shows combined message indicating both the feature status and page restrictions.

---

## [4.1.40] - Release - 2026-01-20

### Changed
- **New Default Header Layout**: Updated the default button order to: Spacer → Volume Icon → Tab Capture → Web Audio → Disable → Focus → Spacer → Basic/Advanced → Shortcuts → Theme → Settings → Spacer → ABTC Logo. This places the mode buttons together and moves the ABTC logo to the end.

---

## [4.1.39] - Release - 2026-01-20

### Changed
- **Removed Debug Logging**: Cleaned up all verbose console logging from the Active Tab Audio feature now that it's working properly.

---

## [4.1.38] - Release - 2026-01-20

### Fixed
- **Active Tab Audio Now Works Across Windows**: Added `windows.onFocusChanged` listener to handle cross-window tab switching. Previously, audio only followed tabs within the same window because `tabs.onActivated` doesn't fire when switching between windows.

---

## [4.1.37] - Release - 2026-01-20

### Changed
- **Improved Debug Logging**: Enhanced logging to show actual session storage values (not just `[Object]`), added explicit "SAVED" confirmation when storing state, and added service worker startup timestamp to detect restarts.

---

## [4.1.36] - Release - 2026-01-20

### Added
- **Debug Logging for Active Tab Audio**: Added extensive console logging to the `onActivated` listener to diagnose why audio doesn't follow tab switches. Check the service worker console (`chrome://extensions` → Inspect service worker) to see detailed state information when switching tabs.

---

## [4.1.35] - Release - 2026-01-20

### Fixed
- **Active Tab Audio Now Works Without Popup**: Fixed the `onActivated` listener to properly handle Tab Capture audio (which bypasses browser-level mute). Now correctly mutes Tab Capture on the previous tab and restores volume on the new active tab.
- **State Persists Across Service Worker Restarts**: Active Tab Audio mode state is now stored in session storage, so it survives when Chrome's service worker restarts between tab switches.

---

## [4.1.34] - Release - 2026-01-20

### Changed
- **Active Tab Audio Mode**: Completely redesigned Focus feature. When enabled, only the active tab plays audio. When you switch tabs, audio automatically follows - the previous tab is muted and the new tab is unmuted. Click Focus again to disable and unmute all tabs.

---

## [4.1.33] - Release - 2026-01-20

### Changed
- **Focus Mode Status on Initiating Tab Only**: The "Focus Active" status reminder now only shows on the tab that initiated focus mode, not all tabs.
- **Focus Auto-Disables on Tab Switch**: Focus mode now automatically unmutes all tabs when you switch away from the initiating tab. Previously it only reset when the initiating tab was closed.

---

## [4.1.32] - Release - 2026-01-20

### Changed
- **Focus Mode Status Wording**: Shortened to "Focus Active - Click Focus to unmute other tabs".

---

## [4.1.31] - Release - 2026-01-20

### Changed
- **Focus Mode Status Wording**: Changed "unmute other tabs" to "unmute all tabs" for clarity.

---

## [4.1.30] - Release - 2026-01-20

### Fixed
- **Focus Mode Status Shows on All Tabs**: The "Focus Mode Active" status reminder now displays on all tabs while focus mode is enabled, not just the initiating tab.
- **Focus Mode Status Actually Visible**: Fixed the status message not appearing by using the correct element reference (`statusMessage` instead of non-existent `status` element).

---

## [4.1.29] - Release - 2026-01-20

### Changed
- **Persistent Focus Mode**: Focus mode state now persists when the popup closes. Previously, the Focus button would reset when reopening the popup, making it unclear that other tabs were still muted.
- **Focus Mode Status Reminder**: When Focus mode is active and you reopen the popup on the initiating tab, a permanent status message reminds you to click Focus again to unmute other tabs.
- **Auto-Unmute on Tab Close**: If the tab that initiated Focus mode is closed, all other tabs are automatically unmuted. This prevents accidentally leaving tabs muted indefinitely.

---

## [4.1.28] - Release - 2026-01-20

### Changed
- **Web Audio Button Color**: Changed Web Audio button from green to orange when active, providing better visual distinction between modes (Tab Capture = blue, Web Audio = orange, Disable = red).
- **Focus Mode Toggle**: Focus button is now a toggle. First click mutes other tabs and turns the button green. Second click unmutes those tabs and returns to normal state. Previously Focus was a one-way action.

---

## [4.1.27] - Release - 2026-01-20

### Added
- **Additional Slider Markers in Disabled Mode**: Added 25% and 75% markers to the volume slider when in Disabled mode, providing finer visual reference for the linear 0-100% scale.

---

## [4.1.26] - Release - 2026-01-20

### Fixed
- **Slider Markers in Disabled Mode**: Fixed slider markers (0, 50, 100) not repositioning correctly in Disabled mode. The markers now properly align with the linear 0-100% scale instead of the non-linear boost scale positions.

---

## [4.1.25] - Release - 2026-01-20

### Fixed
- **Double-Refresh on Mode Switch**: Fixed a bug where switching from Disabled mode to Tab Capture or Web Audio would cause the page to refresh twice. The localStorage flag is now synced before the refresh to prevent the mismatch detection from triggering a second refresh.

---

## [4.1.24] - Release - 2026-01-20

### Changed
- **Red Badge for Muted Tabs**: The extension badge now shows a red background when volume is 0% (muted), making it easy to spot muted tabs at a glance.
- **Disable Button Styling**: The Disable button now uses the same gray inactive style as Tab Capture and Web Audio buttons for visual consistency.

### Removed
- **Mode Switch Status Messages**: Removed "Already in Tab Capture mode", "Already in Web Audio mode", and "Already in Disable mode" messages. These were unnecessary since mode switches now just refresh the page and close the popup.

---

## [4.1.23] - Release - 2026-01-20

### Changed
- **Simplified Mode Switching**: All audio mode switches (Tab Capture, Web Audio, Disable) now refresh the page. This eliminates edge cases where audio routing gets broken on sites with CORS/DRM restrictions. Previous real-time switching was unreliable on certain sites.

### Removed
- **Real-time Mode Switching Code**: Removed ~330 lines of complex code that attempted to switch modes without page refresh. This includes `switchToTabCapture()`, `switchToNativeMode()`, `switchToDefaultMode()` functions and related message handlers (`SWITCH_TO_WEBAUDIO_MODE`, `ENABLE_BYPASS_MODE`, `DISABLE_BYPASS_MODE`).

---

## [4.1.22] - Release - 2026-01-20

### Changed
- **Renamed "Bypass" to "Disable"**: The audio processing disable feature is now called "Disable" throughout the extension, guide, and FAQ. Tooltip: "Disables audio processing".
- **Unified Audio Mode Switching**: Tab Capture, Web Audio, and Disable buttons now all work the same way — only one can be active at a time. Click any button to activate that mode (no more toggle behavior on Disable). Clicking Tab Capture or Web Audio while in Disable mode now properly switches to that mode.
- **Uniform Button Colors**: Focus and Basic/Advanced buttons now use the same gray color as Settings, Shortcuts, and Theme buttons for a cleaner look.
- **Mode Switch Status Messages**: Clear feedback when switching modes — "Tab Capture Enabled", "Web Audio Enabled", or "Disabled Audio Processing". Messages display for 3.5 seconds.

---

## [4.1.21] - Release - 2026-01-20

### Changed
- **Button Color Refresh**: Updated header button colors for better visual distinction. Tab Capture (blue when active), Web Audio (green when active), Focus (orange), Disable (gray default, red when active).

---

## [4.1.20] - Release - 2026-01-20

### Changed
- **Unlocked ABTC Logo**: The company logo in the header can now be repositioned via Settings → Header Layout. Previously it was locked to the first position.
- **Renamed to ABTC Logo**: All references to "ABC Logo" changed to "ABTC Logo" (After Bedtime Creations) to avoid any trademark confusion.

---

## [4.1.19] - Release - 2026-01-20

### Changed
- **Separate Audio Mode Buttons**: Replaced single Tab Capture/Web Audio toggle with two independent buttons. Tab Capture and Web Audio are now separate controls in the header, making mode selection clearer.
- **Header Layout Settings**: Updated header layout customization to show Tab Capture and Web Audio as separate draggable items. Existing layouts automatically migrate from the old combined "Audio Mode" item.

---

## [4.1.18] - Release - 2026-01-20

### Changed
- **Compact Header Icons**: Reduced header button size from ~26px to ~22px (icons 16→14px, padding 5→4px, border-radius 6→5px). Creates a more compact header row while maintaining usability.

---

## [4.1.17] - Release - 2026-01-20

### Removed
- **Refresh Behavior Setting**: Removed the "Refresh Behavior" option from Settings since mode switches (Web Audio, Tab Capture, Bypass) now work without page refresh. The setting is obsolete - refresh only occurs as a fallback when messaging fails.

### Changed
- **Code Cleanup**: Simplified `refreshTabsForDomain()` to only refresh current tab (fallback only). Removed related UI, handlers, and constants.

---

## [4.1.16] - Release - 2026-01-20

### Fixed
- **Bypass Mode UI Restore**: Fixed popup UI not showing full controls (500% slider, effects) after disabling bypass mode. Now calls `updateDisabledDomainUI()` to properly restore the full control panel.

---

## [4.1.15] - Release - 2026-01-20

### Improved
- **Bypass Mode No Refresh**: Toggling bypass mode (the ⊘ button) no longer requires a page refresh. Audio processing is enabled/disabled instantly via direct messaging to the content script. Falls back to refresh only if messaging fails.

---

## [4.1.14] - Release - 2026-01-20

### Fixed
- **Web Audio Mode Switch (Complete Fix)**: Fixed "Extension cannot access audio on this site" error on YouTube when switching from Tab Capture to Web Audio mode. The issue occurred because YouTube videos auto-play without user page interaction, causing `userHasInteracted` to be false and preventing AudioContext creation. The mode switch message now explicitly sets `userHasInteracted = true` (popup click counts as interaction) and properly processes media elements through Web Audio.

---

## [4.1.13] - Release - 2026-01-20

### Changed
- **Web Audio Mode Switch (Partial)**: Mode switch now sends direct message to content script instead of refreshing page. This was an incomplete fix - see 4.1.14 for the complete solution.

---

## [4.1.12] - Release - 2026-01-19

### Security
- **Message Sender Validation**: Added explicit sender ID validation to offscreen.js message handler. Messages from unauthorized senders are now rejected with warning logs.
- **Message Type Validation**: Added string type check for message.type before processing in offscreen.js.
- **Parameter Validation**: Added bounds checking for all numeric parameters (volume 0-500, gain -50 to +50 dB, pan -1 to 1) in Tab Capture audio functions. Invalid values are rejected with warning logs.
- **Hostname Sanitization**: Added hostname validation in page-script.js and content.js before using in localStorage keys. Prevents potential issues with malformed hostnames.
- **Default Case Handling**: Added default case to offscreen.js message switch for logging unrecognized message types.

### Fixed
- **Critical Bug**: Fixed infinite recursion in offscreen.js DEBUG log function that would crash if DEBUG was set to true.

---

## [4.1.11] - Release - 2026-01-19

### Improved
- **Memory Management**: Added cleanup handlers for MutationObservers in disabled domain mode. Observers are now properly disconnected when pages unload, preventing potential memory leaks on long-running tabs.
- **Error Prevention**: Added validation for Tab Capture streamId parameter before attempting media capture. Invalid streamIds now return a clear error instead of cryptic browser exceptions.
- **Production Logging**: Converted all informational console.log statements in background.js and offscreen.js to use DEBUG-guarded log() helpers. Reduces console noise in production while preserving logs when DEBUG=true.

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
