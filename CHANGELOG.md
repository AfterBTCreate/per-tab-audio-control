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

## [5.2.14] - Release - 2026-02-11 — First Official Chrome Web Store Update

**Valentine's Day Release** — This is the first Chrome Web Store update since the initial v4.2.0 submission. It represents over 100 incremental builds of new features, security hardening, QA fixes, accessibility improvements, and polish. Below is a summary of everything new since v4.2.0.

### What's New Since v4.2.0 (Chrome Web Store Submission)

#### New Features
- **Playback seekbar** with click-to-seek, drag-to-seek, time remaining toggle, and Spotify DRM support
- **Playback speed control** (0.05x–5x) with 7 customizable presets and non-linear slider
- **Custom visualizer color** override with color picker
- **Volume color badge style** — badge background matches volume level color
- **Badge style toggle** — light-on-dark or dark-on-light volume badge
- **Red badge for pending site rules** — visual indicator when a rule is available but not yet applied
- **DRM site detection** — proactive hint on Netflix, Spotify, Disney+, etc.
- **Tab title "Above" and "Hidden"** placement options
- **Hide keyboard shortcuts footer** toggle
- **Seekbar time display toggle** — total duration or time remaining
- **Show/hide visualizer** toggle
- **Focus mode + tab switcher integration** — mute/unmute follows tab navigation
- **Fullscreen workaround for Tab Capture** — auto browser fullscreen when video goes fullscreen
- **Live settings sync** — options page changes update the popup in real-time
- **Brand identity** — "After Bedtime Creations" logo and text in header

#### UI/UX Improvements
- **Playback speed presets** — 7-button row (3 slow + 1x + 3 fast) with customizable values
- **Balance presets** — Left/Center/Right buttons with customizable pan values
- **Range slider mode** — 4-position snap slider for compressor
- **Per-item EQ control mode** — each control independently toggleable between sliders and presets via S/P buttons
- **Unified advanced controls** — Balance, Output, and Site Rule merged into single Enhancements container
- **Individual item reorder & hide** — 8 advanced controls independently draggable and hideable
- **Header streamlined** — 3 audio mode buttons merged into single cycling toggle, shortcuts moved to footer, brand text added
- **Play/pause relocated** to volume controls row
- **Volume color scheme** — blue (1-50%), green (51-100%), yellow, orange, purple
- **Compact preset buttons** with reduced padding throughout
- **Consistent reset icons** across all controls
- **Consistent row heights** across all enhancement controls

#### Security Hardening (30+ fixes)
- Frequency data nonce authentication preventing unauthorized audio extraction
- Comprehensive backup CSV validation with range clamping on all imported values
- Tab ID validation across all message handlers
- Storage map growth caps (500 entries) with eviction
- Context menu preset validation against whitelists
- Type guards on all storage reads
- Device label length limits
- Stream ID format validation
- Active Tab Audio race condition fix
- Session storage validation
- Hostname validation and sanitization throughout

#### Bug Fixes (50+ fixes)
- Bass/treble cut presets restoration
- Resource leaks on page navigation (MutationObserver, AudioContext, intervals)
- Tab Capture cleanup on tab close and stream end
- Volume sent to wrong tab during async operations
- Space key double-action on focused buttons
- Seekbar flickering on multi-frame pages
- Site rules re-applying on subsequent popup opens
- YouTube static screen in fullscreen on ultrawide monitors
- Compressor preset mismatch between Web Audio and Tab Capture modes
- Context menu sync for all effect types
- Channel mode forwarding to Tab Capture
- Backup/restore completeness for all settings
- Reset All completeness for all UI elements and storage keys
- Live theme sync across all extension pages

#### Accessibility
- Volume and balance slider `aria-valuenow` updates for screen readers
- `:focus-visible` indicators on every interactive element across all pages
- Comprehensive ARIA attributes (labels, live regions, pressed states, roles)
- Color picker and file input accessibility
- Disabled button contrast improvements

#### Easter Eggs
- **404% Volume Not Found**
- **Mischief Managed**
- **214% Valentine**

---

## [5.1.30] - Release - 2026-02-10

### Accessibility
- **Volume slider `aria-valuenow` updates**: Screen readers now announce the current volume percentage when the slider changes
- **Balance slider `aria-valuenow` updates**: Screen readers now announce the current balance position when the slider changes
- **Color picker `aria-label`**: Added accessible label to the visualizer color picker on the options page
- **File input `aria-hidden` conflict**: Removed conflicting `aria-hidden="true"` from the hidden file input (already hidden via `display: none`)
- **Checkbox focus indicators**: Added `:focus-visible` outline to the domain checkbox in the popup
- **Disabled button contrast**: Increased disabled effect button opacity from 0.4 to 0.5 for better readability

---

## [5.1.29] - Release - 2026-02-10

### Fixed
- **Backup restore: `visualizerType` not dual-written to local storage**: After restoring a backup, the popup could display the wrong visualizer style because `visualizerType` wasn't written to `storage.local` (only `visualizerColor` was). Now both are dual-written on restore
- **Firefox "Enable Native Mode" button broken**: The button in the visualizer area called `toggleDomainDisabled()` which was never defined. Now correctly calls `activateDisableMode()` from popup-tabs.js
- **`expandedSections` cleared on reset**: Options page UI fold state (which sections are expanded) was incorrectly included in the reset list. Removed since it's ephemeral UI state, not a user setting

### Removed
- **Dead code cleanup**: Removed 3 unused legacy wrapper functions from popup-tabs.js (`isDomainInAutoMode`, `addDomainToAutoMode`, `removeDomainFromAutoMode`) and 3 unused message handlers from content.js (`GET_MEDIA_STATE`, `GET_FREQUENCY_DATA`, `MUTE_MEDIA`) — all superseded by newer implementations

---

## [5.1.28] - Release - 2026-02-10

### Changed
- **Speed scroll step**: Scroll wheel on speed slider now increments by exactly 0.05x rate instead of ~0.07x (was using fixed slider position steps which translated unevenly through the non-linear curve)
- **Shortcuts footer shows suggested keys as fallback**: When keyboard shortcuts aren't bound (common in Chrome due to conflicts), the footer now shows the suggested key combo dimmed with a dashed border instead of "Not set". Hovering shows a tooltip directing to `chrome://extensions/shortcuts`

### Fixed
- **Live theme sync across all extension pages**: Theme toggle (Bedtime/Morning) now syncs instantly between popup, options, guide, and FAQ pages via `storage.onChanged` listeners. Previously only the popup listened for theme changes; other pages required a refresh
- **Theme toggle not wired up on options page**: The `#themeToggle` button existed in HTML but had no click handler — now functional
- **loadTheme() couldn't switch from light to dark**: All three `loadTheme()` implementations (popup, options, faq) only added the `light-mode` class but never removed it, preventing live dark→light sync via storage listeners

---

## [5.1.25] - Release - 2026-02-10

### Fixed
- **Bass/treble type guard aborting function**: `sendTabSettingsToContentScript` and `syncStoredSettingsToTabCapture` had early `return` statements inside bass/treble type guards that would abort the entire function — preventing voice, compressor, balance, channel mode, and speed settings from being sent if bass or treble storage was corrupted. Changed to skip-and-continue pattern
- **Voice filter using wrong validation range**: `setTabCaptureVoice()` in offscreen.js validated gain against bass range (-24 to 24) instead of voice range (0 to 18). Parameterized `isValidGainDb()` to accept effect type
- **Variable shadowing in rule matching**: `ruleResult` was declared twice in same scope during site rule application, shadowing the first declaration. Renamed second to `matchedRule`
- **Popup sections duplicate IDs**: `validatePopupSectionsLayout()` didn't deduplicate section IDs from corrupted storage, potentially causing duplicate sections in popup UI
- **Header spacer insertion fallback**: New spacers with no previous spacer reference were inserted at array midpoint (arbitrary). Now inserts after locked header items
- **Device dropdown reentrancy**: `loadDefaultDeviceDropdown()` had no guard against concurrent calls during async device enumeration, potentially corrupting dropdown options

---

## [5.1.24] - Release - 2026-02-10

### Security
- **extractDomain null return**: `extractDomain()` in popup now returns `null` instead of raw invalid input on URL parse failure, preventing untrusted strings from propagating as domain names
- **Device label length cap**: Backup restore now caps `deviceLabel` at 500 characters to prevent storage bloat from crafted CSV files
- **Session storage tab ID validation**: `activeTabAudioLastTabId` retrieved from session storage is now validated with `isValidTabId()` in both `onActivated` and `onFocusChanged` handlers
- **Offscreen tab ID validation**: Added `isValidTabId()` checks to `setTabCaptureCompressor()` and `setTabCaptureChannelMode()` in offscreen.js
- **GET_TAB_CAPTURE_MODE validation**: Added `isValidTabId(request.tabId)` check to the handler
- **Context menu preset validation**: Compressor presets and channel modes from context menu clicks are now validated against whitelists before writing to storage
- **Type guards before startsWith**: Added `typeof === 'string'` guards before `startsWith()` calls on bass/treble/speed levels from storage, preventing TypeError on corrupted storage
- **Hostname validation fallthrough**: Changed hostname validation fallthrough in content.js and page-script.js from log-only to `throw new Error('skip')` to ensure code reaches the catch block
- **Popup layout ID validation**: Backup restore now validates popup section IDs and header layout IDs against known whitelists
- **defaultAudioMode querySelector guard**: Audio mode dropdown value is validated against `['tabcapture', 'auto', 'native']` before use in a querySelector template literal
- **SET_VOLUME boundary validation**: Added `Number.isFinite(volume)` check at the message handler boundary
- **getEffectiveModeForDomain type check**: Added `typeof hostname !== 'string'` guard
- **isDomainDisabled hostname guard**: Added `isValidHostname(domain)` check in content.js
- **Device ID length limit**: `SET_TAB_CAPTURE_DEVICE` now rejects device IDs longer than 500 characters
- **Speed rate range validation**: Slider speed values from storage are now clamped to `EFFECT_RANGES.speed` bounds (0.05–5x)
- **Offscreen response accuracy**: Offscreen setter functions now return success/failure booleans, and message handlers use the actual return value instead of always reporting `{ success: true }`
- **isValidHostname scope guard**: Backup restore hostname validation uses `typeof isValidHostname === 'function'` guard for defense-in-depth

---

## [5.1.23] - Release - 2026-02-10

### Security
- **Frequency data nonce authentication**: Page scripts could previously dispatch `__tabVolumeControl_getFrequencyData` events and receive audio frequency/waveform data. Content script now generates a random nonce at `document_start` (before any page scripts), passes it to page-script.js via the init event, and includes it in all frequency data requests. Page-script.js verifies the nonce before responding, preventing unauthorized audio data extraction
- **Backup restore validation**: CSV restore now validates `bassBoost`, `trebleBoost`, `voiceBoost`, `compressor`, `channelMode`, and `speed` values against their allowed value sets. Previously, arbitrary strings from a crafted CSV could be injected into storage
- **Visualizer tab ID validation**: Replaced `!tabId` checks with `isValidTabId(tabId)` in 4 visualizer handlers (`START/STOP_PERSISTENT_VISUALIZER_CAPTURE`, `GET_PERSISTENT_VISUALIZER_DATA`, `GET_PERSISTENT_VISUALIZER_STATUS`). The old check would incorrectly reject tab ID `0` (falsy but valid)
- **Storage map growth cap**: `lastActiveMode` (audio mode per domain) and `tabCaptureSites` (Tab Capture preference per domain) maps now cap at 500 entries, evicting oldest entries when exceeded. Both maps are also cleared by Reset All Settings

---

## [5.1.22] - Release - 2026-02-10

### Fixed
- **Bass/treble cut presets not restored**: When navigating back to a tab with bass or treble cut presets (cut-low/medium/high), the settings were silently dropped because both `sendTabSettingsToContentScript` and `syncStoredSettingsToTabCapture` only handled boost presets. Cut presets now correctly resolve their gain values
- **Resource leak on page navigation**: MutationObservers, AudioContext, periodic media check interval, and user interaction listeners in content.js were never cleaned up on page unload. Added `pagehide` handler to disconnect observers, close AudioContext, and clear interval
- **Tab Capture not cleaned up on tab close**: Background script was sending `STOP_VISUALIZER_CAPTURE` on tab removal, which only cleaned up the visualizer. Changed to send `TAB_REMOVED` which cleans up the entire capture pipeline (audio processing + visualizer)
- **Offscreen stream leak**: Added `onended` handler to Tab Capture stream tracks in offscreen document. When a tab navigates or closes, stream tracks end automatically — the handler now triggers cleanup of the AudioContext and audio nodes
- **Space key double-action**: Pressing Space while a button was focused in the popup would trigger both the button's native click AND the play/pause toggle. Now excludes `BUTTON` elements from the keyboard handler
- **Volume sent to wrong tab**: `setVolume()` in popup captured `currentTabId` across multiple `await` boundaries. If the user switched tabs during the async operations, volume could be sent to the wrong tab. Tab ID is now captured at function entry
- **Effect preset index fallback**: `getEffectGain()` defaulted unrecognized preset levels to index 2 (maximum). Now defaults to -1 (no effect) for unknown levels
- **Slider position clamping**: `volumeToPosition()` and `positionToVolume()` now clamp outputs to valid ranges to prevent edge-case negative or overflow values

### Changed
- **DRM domains**: Added `music.youtube.com` to the DRM domains list (uses EME for protected content)

### Removed
- **Dead code**: Removed unused `GET_TAB_INFO` message handler (no sender exists), `START_TAB_CAPTURE_VISUALIZER` handler (superseded by persistent visualizer capture), and orphaned `PERMISSION_GRANTED` message send in permissions.js (no handler existed)

---

## [5.1.21] - Release - 2026-02-10

### Fixed
- **DRM site notification not showing**: `clearStatus()` in visualizer startup was clearing the DRM hint immediately after it was set (~50ms). On sites like Netflix where Tab Capture is active, the visualizer's `clearStatus()` (intended to clear "cannot access audio" messages) wiped the DRM notification. Fix: `clearStatus()` now protects DRM messages the same way it protects Active Tab Audio messages — skips clearing and preserves the 8-second auto-dismiss timer
- **FAQ audit and expansion**: Verified all 10 existing FAQ answers against codebase. Fixed Q8 (Tab Capture clicking) to specify blue badge color. Fixed Q9 (synced settings) to include badge style, visibility preferences, seekbar time display, disabled domains, visualizer color, tab info location. Fixed Q10 (reset) to include all items cleared by Reset All. Added 4 new FAQs: badge colors (all 3 types + volume badge styles), keyboard shortcuts (defaults + customization), DRM sites (Spotify/Netflix compatibility), privacy (no analytics/tracking/external requests)

---

## [5.1.19] - Release - 2026-02-10

### Fixed
- **Seekbar Spotify fix**: Seekbar now reads position/duration from Spotify's own UI elements when the audio element doesn't expose a valid duration (EME/DRM). Uses `findPrimaryMediaElement()` scoring first, falls back to site UI scraping via `getPositionFromSiteUI()`. Seeking on Spotify dispatches pointer events on Spotify's progress bar via `seekViaSiteUI()`. Fixes seekbar showing Canvas video loop (~3-10s) instead of actual song (~3-5 min)

---

## [5.1.18] - Release - 2026-02-10

### Fixed
- **User guide continued updates**: Fixed header button default order (ABTC Logo/Brand Text locked at start, not end), added Play/Pause to volume row controls, corrected hideable items list (Volume Icon can be hidden), removed redundant Reset Tab section, added Fullscreen Support section for Tab Capture, corrected microphone permission description (browser prompt, not manifest permission), added playback speed to site rules list

---

## [5.1.17] - Release - 2026-02-10

### Fixed
- **User guide comprehensive update**: Corrected badge colors and added all 3 "!" badge types (blue/red/yellow), added volume color indicators, fixed Tab Capture color (green→blue), fixed balance preset defaults (50→100), fixed spacer count (3→4), added Above/Hidden tab title options, added Playback Seekbar section, added Data Management section, expanded "What Syncs" list with all synced settings, documented global keyboard shortcuts with defaults

---

## [5.1.16] - Release - 2026-02-10

### Fixed
- **Backup/Restore completeness**: Added missing backup/restore support for seekbar time display, default audio mode, and popup sections layout (order + hidden arrays)
- **Reset All completeness**: Reset All now properly resets all options page UI elements — popup mode radio, default audio mode radio (+ localStorage cache), tab title location radio, seekbar time display checkbox, popup sections layout preview (S/P toggle states + section order), header layout preview, and theme body class

---

## [5.1.15] - Release - 2026-02-10

### Added
- **Seekbar time display toggle**: Click the duration text in the seekbar to switch between total duration and time remaining (-M:SS format), with preference persisted via storage and configurable in Options > Appearance > Playback Seekbar

---

## [5.1.14] - Release - 2026-02-10

### Changed
- **Visualizer sensitivity reduced**: All 4 visualizer modes (bars, mirrored bars, curve, dots) now show moderate activity at 100% volume and only reach full intensity at ~300%+ volume — amplification multiplier reduced from 2.5 to 1.2, power curves adjusted from 0.6–0.7 to 0.85

---

## [5.1.13] - Release - 2026-02-10

### Fixed
- **Seekbar flickering on multi-frame pages**: Content script frames without media no longer respond to `GET_MEDIA_POSITION` polls, preventing empty-frame responses from hiding the seekbar when media exists in another frame (e.g., iframe-based video players)

---

## [5.1.12] - Release - 2026-02-10

### Fixed
- **Tab Capture broken by overly strict streamId validation**: Removed character whitelist regex on `streamId` in offscreen.js that was rejecting valid Chrome `tabCapture.getMediaStreamId()` values — kept type check and length limit only

---

## [5.1.11] - Release - 2026-02-10

### Security
- **Active Tab Audio race condition fix**: Moved `focusModeState.lastActiveTabId` update to before async mute/unmute operations, preventing rapid tab switching from reading stale state and muting the wrong tab
- **MUTE_OTHER_TABS validation**: Added `isValidTabId()` check on `request.currentTabId` before using it to skip the current tab and store in focus mode state
- **UNMUTE_OTHER_TABS validation**: Added matching `isValidTabId()` check for consistency

---

## [5.1.10] - Release - 2026-02-10

### Security
- **FULLSCREEN_CHANGE type validation**: Added boolean type check on `isFullscreen` parameter to prevent truthy non-boolean values from triggering browser fullscreen mode
- **CSV import pattern validation**: Site rule patterns are now validated during backup restore — domain patterns sanitized via `sanitizeHostname()`, URL patterns validated via `URL` constructor, with 2048-char length limit
- **streamId format validation**: Added length limit and character whitelist regex for Tab Capture stream IDs in offscreen document
- **deviceLabel length validation**: Added 500-character length limit on device label strings in content.js, page-script.js, and offscreen.js to prevent resource exhaustion from malicious device drivers

---

## [5.1.9] - Release - 2026-02-10

### Fixed
- **Compressor preset mismatch**: Aligned "maximum" compressor values between Web Audio mode (content.js) and Tab Capture mode (offscreen.js) — ratio and release now match across both modes

### Removed
- **Dead code cleanup**: Removed unused `MESSAGE_TYPES` object from shared/constants.js (47 lines) — was defined but never referenced anywhere
- **Chrome manifest cleanup**: Removed Firefox-specific `browser_specific_settings.gecko` block from Chrome manifest (kept in Firefox manifest where it belongs)

---

## [5.1.8] - Release - 2026-02-09

### Changed
- **Tab Title Location subsection**: Moved tab title location radio buttons out of the Visualizer subsection into their own standalone subsection with dedicated heading, description, and status message
- **Playback Seekbar subsection**: Moved seekbar checkbox out of the Visualizer subsection into its own standalone subsection with dedicated heading, description, and status message
- **Reset Visualizer scope reduced**: The "Reset to Default" button in the Visualizer subsection no longer resets seekbar or tab title location settings, since those are now independent subsections

---

## [5.1.7] - Release - 2026-02-09

### Added
- **Custom visualizer color**: New option in Appearance > Visualizer to override volume-based colors with a single user-chosen color. Muted (0%) always stays red. Includes full backup/restore support and Reset to Default.

---

## [5.1.6] - Release - 2026-02-09

### Changed
- **Badge Style uses card-style selector**: Replaced radio buttons with card-style toggle buttons (matching the pattern used elsewhere in options) with title and description for each option.

---

## [5.1.5] - Release - 2026-02-09

### Added
- **Volume color badge style**: New "Volume color" option for Badge Style that colors the badge background to match the volume level — blue (1-50%), green (51-100%), yellow (101-200%), orange (201-350%), purple (351-500%). Uses the same color scale as the popup UI.

### Fixed
- **Site rules no longer re-apply on subsequent popup opens**: Previously, opening the popup on a tab where a site rule had already been applied would re-apply the rule, overwriting any manual volume adjustments. Now the rule is only applied once per tab.

---

## [5.1.4] - Release - 2026-02-09

### Added
- **Badge color scheme setting**: New "Badge Style" option in Appearance settings to switch the volume percentage badge between "Light on dark" (white text, black background — default) and "Dark on light" (black text, white background). Muted (red) and indicator (!) badges are unaffected. Includes full backup/restore support.

---

## [5.1.3] - Release - 2026-02-09

### Added
- **Red badge for pending site rules**: When a site rule exists for the current domain but hasn't been applied to the tab yet, the extension badge shows a red `!` with tooltip "Site rule available — click to apply". Clicking the extension icon applies the rule and switches the badge to the normal volume display. Badge priority: yellow (restricted page) > red (pending rule) > blue (Tab Capture pending) > volume %.

### Changed
- **Refactored site rule application**: Extracted inline rule application logic from `onTabUpdated` into reusable `applyMatchingSiteRule()` function, shared by both navigation and popup-triggered rule application.
- **Badge updates on rule changes**: Adding, editing, or deleting site rules now immediately updates badges across all tabs to reflect the new pending/resolved state.

---

## [5.1.2] - Release - 2026-02-09

### Fixed
- **YouTube static screen in fullscreen**: Removed `:fullscreen video { ... }` CSS override that conflicted with YouTube's transform-based video positioning. Now only the fullscreen container is forced to `100vw`/`100vh` — video elements inside are left to the player's own layout logic.

---

## [5.1.1] - Release - 2026-02-09

### Fixed
- **Ultrawide fullscreen clipping (v2)**: Replaced resize-event-only approach with CSS injection via `scripting.insertCSS()`. Injects `:fullscreen { width: 100vw !important; height: 100vh !important; }` and `:fullscreen video { width: 100%; height: 100%; object-fit: contain; }` with `!important` overrides. CSS rules are declarative — they apply continuously as the viewport transitions, eliminating the timing problem where video players size themselves before the browser finishes entering fullscreen. CSS is cleanly removed via `scripting.removeCSS()` on fullscreen exit.

---

## [5.1.0] - Release - 2026-02-08

### Fixed
- **Ultrawide fullscreen clipping regression**: Video no longer gets cut off at the bottom on ultrawide monitors in Tab Capture mode. Removed `100vw`/`100vh` inline styles from resize dispatch (conflicted with video player CSS), extended resize event timing to 2 seconds, and added a 3-second monitor loop that detects when the video player undersizes the fullscreen element and corrects it using actual screen dimensions. Inline styles are cleaned up on fullscreen exit.

---

## [5.0.9] - Release - 2026-02-08

### Changed
- **Code quality cleanup**: Standardized duplicated constant sync comments across background.js, content.js, page-script.js, and offscreen.js with clear source-of-truth references
- Added `VOLUME_DEFAULT` constant to all files with duplicated constants (was missing from content.js, page-script.js, offscreen.js)
- Renamed `DEFAULT_VOLUME` → `VOLUME_DEFAULT` in background.js for consistency with shared/constants.js
- Converted ~30 remaining string concatenations to template literals across all JS files
- Replaced inline `Math.max/min` volume clamping with `validateVolume()` helper in popup

---

## [5.0.8] - Release - 2026-02-08

### Changed
- **Volume color scheme swapped**: 1-50% is now blue (was green) and 51-100% is now green (was blue) across the entire UI — volume percentage text, slider fill, visualizer, preset buttons, volume icon waves, and options page preset inputs/rules

---

## [5.0.7] - Release - 2026-02-08

### Changed
- **Play/pause button relocated**: Moved from the visualizer left-edge overlay strip into the volume controls row as a standard `tab-nav-btn` icon button
- **Volume row layout**: Restructured with 3-part flex layout (`volume-left` / `volume-value` / `volume-right`) to center the volume percentage horizontally. New button order: [Play/Pause] [Prev] [−] [100%] [+] [Next] [Reset]
- **Tab title/URL padding**: Removed left margin offset that was compensating for the old play/pause strip inside the visualizer

### Removed
- **`.media-toggle-btn` styles**: Absolute-positioned overlay styles replaced by existing `tab-nav-btn` styling

---

## [5.0.6] - Release - 2026-02-08

### Added
- **Tab Capture channel mode**: Stereo/mono/swap now works at BOTH source level (page-script.js) AND Tab Capture level (offscreen.js) — dual processing like volume, bass, treble, voice, balance, and compressor
- **Backup site overrides**: Site audio mode overrides (per-site Tab Capture/Web Audio/Off) are now included in backup export and import

### Fixed
- **Context menu channel mode**: Channel mode changes via context menu are now forwarded to Tab Capture offscreen document
- **Reset tab channel mode**: Tab reset via context menu now resets channel mode in Tab Capture sessions
- **Message type consistency**: Added 5 missing message types to constants.js (TOGGLE_PLAYBACK, GET_NATIVE_MODE_STATUS, MUTE_MEDIA, UNMUTE_MEDIA, SET_TAB_CAPTURE_CHANNEL_MODE)
- **Dead code cleanup**: Removed 3 unused message types from constants.js (RESET_TAB, RESET_ALL, CHECK_DOMAIN_DISABLED)

---

## [5.0.5] - Release - 2026-02-08

### Security
- **Tab Capture validation**: Fixed `request.gainDb` → `request.gain` parameter name mismatch in background.js validation for Tab Capture bass/treble/voice effects (validation was non-functional)
- **Tab Capture voice range**: Voice boost now validates against correct range (0-18 dB) instead of bass range (-24 to +24 dB)
- **Page-script treble range**: Treble gain validation now uses `EFFECT_RANGES.treble` instead of copy-pasted `EFFECT_RANGES.bass`

### Fixed
- **Channel swap**: Fixed `'swap'` vs `'swapped'` mismatch in page-script.js VALID_CHANNEL_MODES — channel swap via Web Audio was silently rejected
- **Backup restore**: Fixed `isValidHostname()` being undefined in options context — native mode domain restore from backups was silently failing
- **CONTENT_READY error handling**: Added `.catch()` to Promise.all in background.js — prevents content script hanging on storage errors
- **Seekbar drag-release**: Fixed `isSeeking` flag getting stuck when mouse leaves slider during drag — now commits seek on mouseleave
- **Seekbar cleanup**: Added `stopSeekbarPolling()` to popup beforeunload handler to prevent interval leak
- **Seekbar seek validation**: Added `duration > 0` check before computing seek time in commitSeek()
- **Dead code removal**: Removed unreachable `FOCUS_SWITCH_TAB` handler from background.js (not in VALID_MESSAGE_TYPES, not in constants, never sent)

---

## [5.0.4] - Release - 2026-02-08

### Fixed
- **Options: Header Layout hint text spacing**: Added bottom margin to the hint text so it doesn't sit flush against the Visualizer subsection separator

---

## [5.0.3] - Release - 2026-02-08

### Fixed
- **Options: Visualizer reset button spacing**: Added 16px bottom margin to match the Header Layout reset button spacing before the subsection separator

---

## [5.0.2] - Release - 2026-02-08

### Added
- **Options: Show Seekbar toggle**: New "Show playback seekbar in popup" checkbox in the Visualizer subsection allows hiding/showing the seekbar. Included in backup/restore and Reset All
- **Options: Visualizer Reset button styling fix**: Reset button now uses the standard `button-row` wrapper for consistent full-width styling matching other sections

---

## [5.0.1] - Release - 2026-02-08

### Added
- **Options: Visualizer Reset button**: New "Reset to Default" button in the Visualizer subsection resets visualizer style, show/hide toggle, and tab title location to defaults

### Fixed
- **Options: "Below visualizer" disabled when visualizer hidden**: When "Show visualizer in popup" is unchecked, the "Below visualizer" tab title option is now disabled alongside "Inside visualizer" since both reference a non-existent visualizer. If either was selected, it auto-switches to "Above visualizer"

---

## [5.0.0] - Release - 2026-02-08

### Added
- **Playback seekbar**: New seek/progress bar below the visualizer area, visible in both Basic and Advanced modes. Displays current time and total duration, supports click-to-seek and drag-to-seek. Polls media position at 500ms intervals while the popup is open
- **Seekbar keyboard support**: Arrow keys on the focused seekbar seek in small increments
- **Seekbar drag handling**: Polling pauses while dragging to prevent UI conflicts, commits seek on release
- **Graceful hiding**: Seekbar automatically hides when media has no duration (live streams, no media detected)
- **Native/disabled mode support**: Seekbar works in all audio modes (Tab Capture, Web Audio, and Disabled)
- **Light mode support**: Seekbar colors adapt to light/dark theme
- **New message types**: `GET_MEDIA_POSITION` and `SEEK_MEDIA` for content script communication

---

## [4.9.14] - Release - 2026-02-08

### Added
- **Options: Show Visualizer toggle**: New checkbox in Appearance > Visualizer subsection to hide/show the entire visualizer container in the popup. When hidden, the "Inside visualizer" tab title location option is automatically disabled and defaults to "Above visualizer"
- **Backup/restore support**: Show Visualizer setting included in CSV backup export, import, and Reset All

---

## [4.9.13] - Release - 2026-02-08

### Added
- **Options: Popup Mode toggle**: Basic/Advanced mode radio buttons added to Appearance section, matching the popup header toggle. Bi-directional live sync — changing mode in options updates the popup in real time and vice versa
- **Options: Appearance description**: Updated section description with tip to open a new window and the popup to preview changes in real time

---

## [4.9.12] - Release - 2026-02-08

### Fixed
- **background.js**: Fixed wrong EQ preset fallback values — bass used `[4,8,12]` instead of `[6,12,24]`, voice used `[3,6,9]` instead of `[4,10,18]` (caused wrong gain when user presets not set)
- **background.js**: Fixed Tab Capture gain validation allowed -50..50 dB instead of -24..24 dB (matched effect ranges)
- **popup-effects.js**: Fixed voice slider validated -24..24 instead of correct 0..18 range
- **offscreen.js**: Fixed gain validation allowed -50..50 dB instead of -24..24 dB

### Changed
- **Centralized constants**: All volume limits (`VOLUME_MIN`/`VOLUME_MAX`), effect ranges (`EFFECT_RANGES`), default presets, and default volume steps are now defined as named constants in every file that needs them — background.js, content.js, page-script.js, offscreen.js, and popup modules
- **Eliminated hardcoded magic numbers**: Replaced 60+ inline hardcoded values with constant references across the entire codebase to prevent values drifting out of sync

---

## [4.9.11] - Release - 2026-02-08

### Fixed
- **Site Rules**: Speed/playback rate is now captured when saving site rules and auto-applied when navigating to matching sites
- **Site Rules**: Deleting a rule now clears stale domain tracking, so re-created rules apply immediately without requiring extension reload
- **Backup Export**: Site rules CSV now includes all effect columns — was missing Treble Boost, Compressor, Channel Mode, and Speed (data loss on export/import)
- **Backup Import**: Site rules import now correctly parses all effect fields from the expanded CSV format
- **Backup**: Volume step defaults and range validation now reference centralized DEFAULTS and VOLUME_STEP_RANGE instead of hardcoded values

---

## [4.9.10] - Release - 2026-02-08

### Added
- **Context Menu**: Added "Reset Tab to Defaults" action — resets volume, bass, treble, voice, compressor, balance, channel mode, speed, and output device all at once. Syncs to popup and Tab Capture.

---

## [4.9.9] - Release - 2026-02-08

### Fixed
- **Context Menu → Popup Sync**: All context menu changes now persist to storage and reflect in popup when opened (volume, bass, treble, voice, compressor, balance, speed, channel mode)
- **Context Menu → Tab Capture**: Effects set via context menu now forward to Tab Capture offscreen document (compressor, bass, treble, voice, balance)
- **Context Menu**: Fixed Range (compressor) preset names — was sending `light/medium/heavy` but content script expects `podcast/movie/maximum`, causing all non-Off presets to silently fail
- **Context Menu**: Fixed balance sent raw -100..100 to content script instead of normalized -1..1
- **Context Menu**: Added missing Speed submenu with Normal, Slow (Low/Med/High), and Fast (Low/Med/High) presets
- **Default Keyboard Step**: Changed default keyboard shortcut volume step from 5% to 1% for finer control

---

## [4.9.8] - Release - 2026-02-08

### Summary
**Comprehensive QA & security audit fixes** — Addressed 25+ findings across all extension modules. Hardened backup import validation, added range clamping to all imported values, fixed race conditions in Tab Capture initiation, and strengthened input validation throughout.

### Security
- **Backup import**: Strengthened header validation from substring match to exact format check
- **Backup import**: Added range clamping to all imported numeric values (volumes, EQ gains, speed, steps, balance)
- **Backup import**: Added hostname validation on imported Native Mode domains
- **page-script.js**: Added range validation to all 9 CustomEvent listeners (volume, bass, treble, voice, balance, speed, channel mode)
- **content.js**: Added bounds clamping to filter gains at point of use (bass/treble: -24 to 24dB, voice: 0-18dB)
- **content.js**: Clamped balance normalization result to [-1, 1] range
- **background.js**: Added `isValidTabId()` check in context menu click handler
- **background.js**: Added `parseInt` result validation for context menu balance handler
- **content.js/page-script.js**: Normalized hostname validation to lowercase-first (consistent with background.js)
- **offscreen.js**: Added preset validation before applying compressor settings

### Fixed
- **background.js**: Tab Capture keyboard shortcut race condition — added per-tab promise lock to prevent concurrent initiation
- **background.js**: `tabs.onRemoved` storage cleanup now wrapped in try-catch so subsequent cleanup continues on failure
- **background.js**: Throttle map cleanup now rate-limited to every 10 seconds (prevents repeated no-op cleanup on every message)
- **background.js**: Stale tab key cleanup now uses `isValidTabId()` instead of manual bounds check
- **content.js**: MutationObserver in disabled mode now disconnects after first media detection
- **content.js**: `GET_DEVICES` message handler now has `.catch()` to prevent popup hangs on rejection
- **options-rules.js**: Rule deletion now validates index upper bound (`< rules.length`)
- **options-header-layout.js**: Drag-and-drop error handling uses try/finally to ensure indicator cleanup
- **popup-visualizer.js**: Warmup loop decrements valid frame count instead of resetting to 0 on empty frames
- **popup-visualizer.js**: Persistent capture reconnect verifies status after setting flags (TOCTOU guard)
- **popup-tabs.js**: Focus mode tab switch recovers cleanly if `MUTE_OTHER_TABS` fails
- **shared/constants.js**: Added missing `MUTE_OTHER_TABS`, `UNMUTE_OTHER_TABS`, `GET_FOCUS_STATE` to `MESSAGE_TYPES`

---

## [4.9.7] - Release - 2026-02-08

### Summary
**Comprehensive keyboard focus styles** — Added visible `:focus-visible` indicators to every interactive element across Options, FAQ, Guide, and Permissions pages. All buttons, links, inputs, selects, radio cards, toggles, collapsible headers, and drag-and-drop items now show a blue focus ring when navigated via keyboard.

### Fixed
- **Options page**: All `.btn` buttons (30+), collapsible section headers, FAQ accordion headers, expand/collapse buttons, about links, FAQ/Guide link cards, settings links, header buttons (back, theme, expand), S/P mode toggles, spacer buttons, visibility toggles, number inputs, text inputs, device select dropdown, refresh/cleanup/clear/delete buttons — all had no visible keyboard focus indicator
- **FAQ page**: Accordion headers (`role="button"`), expand all button, back link, about links, theme toggle — all lacked focus styles despite being keyboard-accessible
- **Guide page**: Same shared elements as FAQ — all now show focus ring
- **Permissions page**: Grant and Skip buttons had no focus indicator
- **Input fields**: All inputs with `outline: none` now have `box-shadow` as a visible replacement focus indicator (previously only had a subtle border-color change)

---

## [4.9.6] - Release - 2026-02-08

### Summary
**Slider focus visibility** — Added keyboard focus indicators to balance slider and all EQ sliders (Speed, Bass, Treble, Voice, Range). When tabbing through the popup, focused sliders now show a visible ring around the thumb, matching the existing volume slider behavior.

### Fixed
- **Balance slider missing focus indicator**: The balance slider had no visible highlight when focused via keyboard Tab navigation, unlike the volume slider which already had one
- **EQ sliders missing focus indicators**: Speed, Bass, Treble, Voice, and Range sliders also lacked keyboard focus styles

### Improved
- All sliders now use consistent `:focus-visible` styles with a white ring (dark mode) or warm brown ring (light mode) on the thumb, with both WebKit and Firefox (`-moz-range-thumb`) support

---

## [4.9.5] - Release - 2026-02-08

### Summary
**Accessibility audit + audio mode icon fix** — Comprehensive ARIA and tooltip audit across all HTML files. Added missing `aria-label`, `aria-hidden`, `aria-live`, `aria-pressed`, `role`, and `title` attributes. Fixed audio mode icon not appearing on restricted pages.

### Fixed
- **Audio mode icon missing on restricted pages**: On `chrome://` and other restricted URLs, the popup's `init()` returned early before calling `updateDisableButtonUI()`, leaving the audio mode toggle with no icon. Now the mode icon shows correctly on all pages.

### Improved
- **Popup accessibility**: Added `aria-hidden="true"` to all decorative SVGs inside buttons (nav, reset, media toggle), `aria-live="polite"` to tab title/URL for screen reader announcements, `aria-pressed` to media toggle button, `aria-label` to balance preset buttons, `aria-hidden` to all effects dividers
- **Options page accessibility**: Added `role="status" aria-live="polite"` to all 19 status message divs, `aria-label` to grant device permission button and help link anchors
- **Permissions page accessibility**: Added `title` and `aria-label` to Grant and Skip buttons, `role="status" aria-live="polite"` to status div
- **Offscreen page**: Added `lang="en"` to `<html>` element
- **Voice slider "Off" color**: Voice slider value now shows red (`#8b4040`) when at 0 dB, matching the Range slider "Off" color

---

## [4.9.4] - Release - 2026-02-08

### Summary
**Balance presets UI polish + full panning defaults** — Balance preset buttons (Left/Center/Right) now use equal-width flex layout matching other effect rows, and Left/Right defaults changed to 100% for full panning.

### Changed
- **Balance preset button layout**: Buttons use `flex: 1 1 0` inside a flex container, matching the layout pattern of Voice and Range preset rows. Title stays at standard 44px width, controls remain at the right.
- **Balance presets defaults**: Changed from `{ left: 50, right: 50 }` to `{ left: 100, right: 100 }` — clicking Left now pans fully left, Right fully right

---

## [4.9.3] - Release - 2026-02-08

### Summary
**Visualizer type live sync** — Changing the visualizer style via click-and-hold in the popup now syncs back to the Options page in real-time.

### Fixed
- **Visualizer type not syncing to Options**: Popup was saving to `local` storage only, but Options reads from `sync`. Now the popup saves to both `sync` and `local` (matching the pattern Options already uses). Added a `storage.onChanged` listener in Options to update the radio buttons live.

---

## [4.9.2] - Release - 2026-02-08

### Summary
**Focus mode + popup tab switcher fix** — Popup tab switcher now correctly mutes/unmutes tabs when Active Tab Audio (focus) mode is enabled.

### Fixed
- **Focus mode ignored popup tab switcher**: Using the prev/next tab arrows in the popup while focus mode was active would show the new tab's controls but not mute the old tab or unmute the new one — both tabs played simultaneously. Now the popup unmutes the new tab and sends `MUTE_OTHER_TABS` (the same proven handler used by the Focus button) after all tab settings are loaded, so nothing can undo the muting afterward.

---

## [4.9.1] - Release - 2026-02-08

### Summary
**QA fixes and documentation update** — Removed dead code, fixed type inconsistency, added missing tab cleanup for speed storage, and updated Guide/FAQ with all features from v4.5-4.9.

### Fixed
- **Dead code removed**: Unused `balanceContainer` variable in popup-core.js (leftover from dual-mode balance refactor)
- **`EQ_DUAL_MODE_ITEMS` type consistency**: Changed from Array to Set in popup-effects.js to match options-constants.js (prevents `.has()` mismatch bugs)
- **Speed storage cleanup**: Added `tab_XXX_speed` to the `tabs.onRemoved` cleanup array in background.js — previously speed settings were never cleaned up when tabs closed
- **Speed restoration on navigation**: Added speed re-application in `tabs.onUpdated` handler — previously navigating within a tab would reset playback speed to 1x while other effects (EQ, balance, compressor) were restored
- **FAQ reset list**: Updated to include speed and range reset buttons (was only listing bass, treble, voice)
- **FAQ/Guide sync list**: Updated to include speed and balance presets

### Added
- **Guide: Speed Control section** — Documenting slider/preset modes, non-linear scale, and customizable speed presets
- **Guide: Sliders vs Presets section** — Documenting the S/P toggle system for all 6 dual-mode items
- **Guide: Balance presets section** — Documenting Left/Center/Right buttons and customizable values
- **Guide: Range slider mode** — Documenting the 4-position snap slider
- **Guide: EQ slider/preset mode** — Documenting dual-mode for bass/treble/voice

---

## [4.9.0] - Release - 2026-02-08

### Summary
**Range slider mode + Balance presets mode** — Range and Balance now support dual-mode (Sliders/Presets) like Speed, Bass, Treble, and Voice. Range gets a 4-position snap slider mimicking its preset buttons. Balance gets 3 preset buttons (Left/Center/Right) with customizable values in Options. Total dual-mode items: 6.

### Added
- **Range slider mode**: New slider with 4 discrete snap positions (Off/Podcast/Movie/Max) with color-coded gradient and value labels matching compressor preset colors
- **Balance presets mode**: 3 buttons (Left/Center/Right) with blue/gray/orange colors matching the balance slider gradient. S/M/Swap/Reset buttons appear in both modes
- **Balance presets customization**: Options > Presets > Balance Presets — customize Left and Right values (1-100), Center always resets to 0
- **6 S/P toggles**: Range and Balance now appear in Options > Advanced Controls with S/P toggle buttons
- **Backup/restore support**: New `[Balance Presets]` section in backup CSV export/import
- **Mousewheel support**: Compressor slider supports mouse wheel to step between preset positions

### Changed
- **`EQ_DUAL_MODE_ITEMS` expanded**: From 4 items (Speed, Bass, Treble, Voice) to 6 (+ Range, Balance)
- **Compressor row**: Existing preset buttons row now has `eq-presets-mode` class for dual-mode switching
- **Balance row**: Existing slider row now has `eq-slider-mode` class; channel mode buttons (S/M/Swap/Reset) are synced across both modes
- **DEFAULTS**: Added `balancePresets: { left: 50, right: 50 }` to shared constants

### Fixed
- **Popup stuck at "Loading..."**: Init error handler now removes `initializing` class so error messages are visible instead of leaving the popup stuck
- **Balance presets load**: Added defensive error handling around balance presets storage load

---

## [4.8.0] - Release - 2026-02-08

### Summary
**Per-item EQ control mode** — Each enhancement control (Speed, Bass, Treble, Voice) can now independently be set to sliders or presets mode via S/P toggle buttons in Options > Advanced Controls. "All Sliders" and "All Presets" buttons provide quick bulk switching. The previous standalone "Enhancement Controls" radio group has been replaced by these per-item toggles.

### Added
- **Per-item S/P toggle**: Each dual-mode item (Speed, Bass, Treble, Voice) in the Advanced Controls drag-and-drop list now has an S/P toggle button to independently switch between sliders and presets mode
- **All Sliders / All Presets buttons**: Bulk-set all 4 dual-mode items to the same mode at once
- **Per-item control mode in backup/restore**: Export includes per-item overrides; import supports both new and old format

### Changed
- **Removed Enhancement Controls subsection**: The standalone Sliders/Presets radio group in Appearance is replaced by per-item S/P toggles in Advanced Controls
- **Storage format**: `popupSectionsLayout` now includes a `controlMode` object for per-item overrides (sparse — only stores deviations from global default)
- **Popup EQ mode application**: Per-item mode scoping using `data-item-id` wrapper instead of global row toggling
- **Options preset sections visibility**: Preset configuration sections are shown if any item uses presets mode (previously tied to a single global toggle)

### Fixed
- **Reset to Default** now also resets EQ control modes and global default back to sliders

---

## [4.7.2] - Release - 2026-02-08

### Summary
**Consistent effect row heights** — Fixed EQ control rows (Speed, Bass, Treble, Voice) changing height when toggling between presets and sliders mode.

### Fixed
- **Effect row height consistency**: Rows no longer shift in height when switching between preset buttons and slider controls. Fixed `height` on `.effect-row` and removed stale `margin-bottom`/`:last-child` rule that applied 4px extra margin to preset rows but not slider rows (due to DOM order, the slider row was always `:last-child` and got 0 margin while the preset row got 4px)

---

## [4.7.0] - Release - 2026-02-08

### Summary
**DRM site status message** — When the popup opens on a known DRM-protected streaming site (Netflix, Disney+, Spotify, etc.), an informational hint appears immediately: "DRM site — playback control & visualizer may be limited". This gives users instant feedback instead of waiting 2-3 seconds for the generic auto-detection.

### Added
- **DRM site detection**: Proactive info hint on known DRM/EME streaming sites (Netflix, Disney+, Hulu, Max, Peacock, Paramount+, Prime Video, Apple TV+, Crunchyroll, Spotify, Tidal, Deezer, ESPN+, DAZN, and more)
- **Subdomain matching**: Subdomains like `watch.sling.com` automatically match the parent `sling.com` entry
- **Tab-switch aware**: DRM hint shows/hides correctly when switching between DRM and non-DRM tabs
- **Non-blocking**: Info hint (8s duration) doesn't disable controls or prevent later "Cannot access audio" warnings

---

## [4.6.0] - Release - 2026-02-08

### Summary
**Tab title location + hide shortcuts footer** — Expanded the Tab Title Location setting with two new options: "Above visualizer" (title row above the visualizer) and "Hidden" (hide title entirely). Added a new toggle to show/hide the keyboard shortcuts footer at the bottom of the popup.

### Added
- **Tab title "Above visualizer"**: New option places the tab title in a row above the visualizer with a bottom border separator
- **Tab title "Hidden"**: New option hides the tab title and URL entirely while keeping the tab counter visible
- **Hide keyboard shortcuts footer**: New checkbox in Appearance settings to show/hide the shortcut hints (Vol Up/Down/Mute) at the bottom of the popup
- **Real-time sync**: Both new settings update the popup instantly when changed in options
- **Backup/restore support**: Both settings included in CSV backup and restore

---

## [4.5.0] - Release - 2026-02-08

### Summary
**Speed presets** — Added 7-button speed preset row (3 slow + 1x + 3 fast) matching the bass/treble preset pattern. Controlled by the existing Enhancement Controls toggle (presets vs sliders). Speed preset values are customizable in options with non-overlapping ranges.

### Added
- **Speed preset buttons**: 7 combined buttons — Slow High, Slow Medium, Slow Low, 1x (Off), Fast Low, Fast Medium, Fast High
- **Speed preset customization**: New Speed Fast and Speed Slow sections in Options → Presets (visible when preset mode is selected)
- **Backup/restore support**: Speed presets included in CSV backup and restore

### Changed
- **Speed storage format**: Per-tab speed now stored as level strings (`'off'`, `'slow-low'`, `'fast-medium'`, `'slider:RATE'`) instead of raw numbers. Existing values are automatically migrated on load.
- **Speed slider**: Now wrapped in the presets/sliders toggle system — shows slider in sliders mode, preset buttons in presets mode
- **Pitch correction**: `preservesPitch` now explicitly forced to `true` on all media elements when changing playback speed, preventing chipmunk/deep voice effects across all browsers

### Defaults
- Slow presets: 0.75x (Low), 0.50x (Medium), 0.25x (High)
- Fast presets: 1.25x (Low), 1.50x (Medium), 2.00x (High)

---

## [4.4.3] - Release - 2026-02-08

### Summary
**Header layout refinements** — Default header order updated. Spacer between ABTC logo and brand text is now locked (cannot be moved or removed). Minimum spacer count is 1.

### Changed
- **Default header order**: Audio Mode now appears before Focus (was after)
- **Locked spacer**: Spacer1 (between logo and brand text) is now locked — cannot be dragged or removed
- **Minimum spacers**: Removed the "0 spacers" option; minimum is now 1 (the locked spacer)

---

## [4.4.2] - Release - 2026-02-08

### Summary
**Default control order** — Speed control moved to second position (after Balance) in the default advanced controls order.

### Changed
- **Default order**: Speed now appears after Balance instead of after Range: Balance, Speed, Bass, Treble, Voice, Range, Output, Site Rule
- **DOM order**: HTML source order updated to match the new default

---

## [4.4.1] - Release - 2026-02-08

### Summary
**Consistent reset icons** — All reset buttons in advanced controls (Balance, Bass, Treble, Voice) now use the counterclockwise arrow icon, matching the Speed reset button and the Reset Tab button.

### Changed
- **Reset button icons**: Replaced circle-with-dot SVG with counterclockwise arrow SVG on Balance, Bass, Treble, and Voice reset buttons for visual consistency

---

## [4.4.0] - Release - 2026-02-08

### Summary
**Playback speed control** — New speed slider in advanced controls. Range: 0.05x to 5x with piecewise exponential mapping centered at 1x. Works across all audio modes (Tab Capture, Web Audio, and Disabled) since it uses the native `HTMLMediaElement.playbackRate` property.

### Added
- **Speed slider**: Playback speed control (0.05x–5x) in advanced controls section between Range and Output
- **Piecewise exponential mapping**: Fine control around 1x, full range at extremes
- **Per-tab speed**: Speed setting stored and restored per-tab
- **Speed color coding**: Orange for slow, gray for normal, green for fast
- **Options integration**: Speed control appears in Advanced Controls section ordering/visibility
- **Reset support**: Speed resets to 1x with Reset Tab button and individual reset button

---

## [4.3.22] - Release - 2026-02-08

### Summary
**Header finalized** — Default header layout set to: ABTC Logo, Brand Text, Focus, Audio Mode, Basic/Advanced, Theme, Settings, Volume Icon (with spacers). Branding items (logo and text) are now locked and always visible.

### Changed
- **Default header layout**: Reordered to match final design — branding on the left, controls center-right, volume icon far right
- **Branding locked**: ABTC logo and brand text are now locked (cannot be reordered or hidden) and always visible
- **Options page**: Removed visibility checkboxes for ABTC Logo and Brand Text

---

## [4.3.21] - Release - 2026-02-08

### Summary
**Header streamlined** — Keyboard shortcuts moved from header popover to a persistent footer. Three separate audio mode buttons (Tab Capture / Web Audio / Disable) merged into a single cycling toggle. "After Bedtime Creations" brand text added to header.

### Changed
- **Shortcuts → footer**: Removed keyboard icon and popover from header; shortcuts now displayed as a persistent footer at the bottom of the popup
- **Audio mode toggle**: Replaced three separate buttons (Tab Capture, Web Audio, Disable) with a single cycling toggle button. Click to advance: TC (blue) → WA (orange) → Off (red). Firefox skips Tab Capture.
- **Brand text**: Added "After Bedtime Creations" two-line text to the header bar (10px font)
- **Header layout**: `tabCapture`, `webAudio`, `offMode` merged into `audioMode`; `shortcuts` removed from layout; `brandText` added
- **Options page**: Updated header layout editor to reflect merged audio mode and removed shortcuts
- **Migrations**: Auto-migration handles old stored layouts (3 audio items → 1, removes shortcuts, adds brandText)
- **4th spacer**: Added a 4th spacer slot for header layout customization

---

## [4.3.20] - Release - 2026-02-08

### Summary
**Per-item reorder & hide** — The "Popup Sections" feature (which only had one section) is repurposed into "Advanced Controls" with 7 individually reorderable/hideable items: Balance, Bass, Treble, Voice, Range, Output, and Site Rule.

### Changed
- **Individual item wrappers**: Each advanced control is wrapped in `.advanced-item[data-item-id]` for independent ordering and visibility
- **Removed `.audio-effects` wrapper**: All 7 items are now direct flex children of `.enhancements-section`
- **Divider management**: Each item has its own divider; JS hides the first visible item's divider and shows the rest
- **Options page renamed**: "Popup Sections" → "Advanced Controls" with updated descriptions
- **Default layout updated**: Storage default now lists 7 item IDs instead of single `enhancements`
- **Auto-migration**: Existing `enhancements` entry is filtered out and all 7 new IDs are added automatically via `validatePopupSectionsLayout()`
- **Popup migration in popup**: Added inline migration in popup's `applyPopupSectionsLayout()` so stale stored layouts are corrected without requiring options page visit
- **Spacing improvements**: Added 10px gap between presets and advanced container, 6px gap below visualizer, 4px gap below volume row
- **Basic mode tightened**: Removed `min-height` and reduced bottom margin in basic mode for a compact popup

---

## [4.3.19] - Release - 2026-02-08

### Summary
**Unified advanced container** - Output and Site Rule merged into the Enhancements section, eliminating separate containers. All advanced controls now live in one bordered box with consistent row heights.

### Changed
- **Output row merged into Enhancements**: Device selector is now a row inside the enhancements container instead of a standalone box
- **Site Rule row merged into Enhancements**: Site rule controls are now a row inside the enhancements container instead of a standalone box
- **Section ordering simplified**: Only one advanced section remains; removed `output` and `siteRule` from section maps and ordering system
- **Compact row padding reduced**: Dropdown and button padding reduced from 6px to 3px vertical to match other compact rows

---

## [4.3.18] - Release - 2026-02-08

### Summary
**Compact volume presets** - Reduced vertical padding on volume preset buttons to match the slimmer effect buttons.

### Changed
- **Compact volume preset buttons**: Reduced `.preset-btn` vertical padding from 7px to 3px

---

## [4.3.17] - Release - 2026-02-08

### Summary
**Compact effect buttons** - Reduced vertical padding on preset buttons for slimmer rows throughout the Enhancements section.

### Changed
- **Compact preset buttons**: Reduced vertical padding from 6px to 3px on `.effect-btn`, `.effect-buttons.combined .effect-btn`, and `.effect-btn-spacer`
- **Row min-height reduced**: 28px → 22px to match the slimmer buttons

---

## [4.3.16] - Release - 2026-02-08

### Summary
**Uniform row heights** - All rows in the Enhancements section (Balance, Bass, Treble, Voice, Range) now have consistent height.

### Changed
- **Uniform row heights**: Added `min-height: 28px` to `.balance-row` and `.effect-row` so all rows match the natural height of the Range preset buttons

---

## [4.3.15] - Release - 2026-02-08

### Summary
**Bass/Treble divider** - Added visual separator between Bass and Treble controls, matching the existing dividers between other sections.

### Changed
- **Divider between Bass and Treble**: Added `effects-divider` between Bass and Treble rows, consistent with the Balance→Bass, Treble→Voice, and Voice→Range dividers

---

## [4.3.14] - Release - 2026-02-08

### Summary
**Balance L/R alignment and header visibility fix** - Balance labels align with EQ sliders; re-enabling header items in Options now live-updates the popup.

### Fixed
- **Header items not reappearing when re-enabled**: `applyHeaderLayout()` only added `header-item-hidden` class but never removed it, so toggling an item back on in Options had no visible effect until popup was reopened

### Changed
- **L/R labels align with EQ sliders**: L label starts at the same position as the Bass/Treble slider left edge; R label ends at the Bass/Treble slider right edge
- **R label repositioned**: Moved R out of the button group to sit between the slider and the S/M/⇄/reset controls
- **Balance row gap matches EQ rows**: Unified to 10px gap (matching `.effect-row`), removing negative margins and slider margin hacks
- **Balance button spacing**: 3px gap between S/M/⇄/reset buttons for better readability
- **Balance thumb re-centered**: Compensating `margin-left: 3px` on slider to offset the wider button gap and keep the thumb aligned with Bass/Treble thumbs
- **Fixed L/R swap layout shift**: Balance labels now have fixed 8px width so swapping L↔R doesn't shift the slider center

---

## [4.3.7] - Release - 2026-02-08

### Summary
**UI polish** - Balance row visuals now match EQ controls: same slider thumb style, same reset icon size, and centered slider with visible L/R labels.

### Changed
- **Balance slider thumb matches EQ sliders**: Replaced box-shadow with bordered thumb style (dark mode: blue border hover, light mode: warm border hover)
- **Balance reset button matches EQ resets**: Icon scaled from 14×14 to 10×10 with thicker strokes, matching Bass/Treble/Voice reset icons
- **Balance slider centered with EQ**: Symmetric `margin: 0 6px` on the slider shortens it equally from both ends, keeping the center thumb aligned with Bass/Treble center positions while giving L/R labels clear visibility

---

## [4.3.1] - Release - 2026-02-07

### Summary
**UI cleanup** - Merged the Balance row into the Enhancements section, eliminating the separate Balance container for a cleaner, more unified layout.

### Changed
- **Balance merged into Enhancements section**: Balance row (slider, S/M/⇄, reset) is now the first row inside the Enhancements container instead of a separate bordered section
- **Removed "Enhancements" title**: The section header is no longer needed — balance row and EQ controls flow naturally together
- **Removed balance from section ordering**: Balance is no longer an independent section in Options → Popup Sections (now 3 sections: Enhancements, Output, Site Rule)

---

## [4.3.0] - Release - 2026-02-07

### Summary
**UI improvement** - Balance section condensed from two lines to one: title, slider, and channel mode buttons all on a single row.

### Changed
- **Balance section single-line layout**: Merged the header row (title + S/M/⇄/reset buttons) and slider row (L/slider/R) into one compact flex row: `Balance [L ===slider=== R] [S] [M] [⇄] [⟲]`

---

## [4.2.9] - Release - 2026-02-07

### Summary
**QA bug fixes** - Fixed shared DEFAULTS object mutation, hardened remaining sendMessage calls against extension context invalidation, and added defensive null check in background message handler.

### Fixed
- **DEFAULTS.headerLayout mutation bug**: `applyHeaderLayout()` mutated the shared `DEFAULTS.headerLayout` object by reference when no stored layout existed, corrupting defaults for subsequent calls. Now deep-copies the fallback value
- **Extension context invalidated errors**: Wrapped 3 remaining `sendMessage().catch(() => {})` calls in try-catch (disabled domain media report, native mode media report, general media observer report)
- **CONTENT_READY null safety**: Added `sender.tab` null check before accessing `sender.tab.id` in background.js message handler

---

## [4.2.8] - Release - 2026-02-07

### Summary
**Bug fix** - Fixed console error when extension is reloaded while a page has fullscreen active.

### Fixed
- **Extension context invalidated error**: Wrapped fullscreen event handler's `sendMessage` calls in try-catch to handle the synchronous throw when extension is reloaded/updated while content scripts are still running

---

## [4.2.7] - Release - 2026-02-07

### Summary
**Centralized defaults** - All default setting values are now defined in a single `DEFAULTS` object in `shared/constants.js`, eliminating scattered duplicates across popup and options files.

### Changed
- **Single source of truth for defaults**: Moved all default values (theme, visualizer, tab info location, EQ mode, audio mode, volume presets, EQ presets, header layout, popup sections) into `DEFAULTS` object in `shared/constants.js`
- **Removed duplicated constants**: Eliminated redundant `DEFAULT_HEADER_LAYOUT`, `DEFAULT_POPUP_SECTIONS_LAYOUT`, and preset arrays from `popup-core.js` and `options-constants.js` (now reference `DEFAULTS`)
- **Removed stale `DEFAULT_TAB_INFO_LOCATION`**: Unused constant in `options-constants.js` still had old value `'below'` — removed entirely

---

## [4.2.6] - Release - 2026-02-07

### Summary
**Default tab info location** - Fresh installs now default to showing tab title/domain inside the visualizer instead of below it.

### Changed
- **Tab Info Location default**: Changed from "Below visualizer" to "Inside visualizer" for new installations

---

## [4.2.5] - Release - 2026-02-07

### Summary
**Ultrawide fullscreen fix** - Fixed video clipping on ultrawide monitors when using the Tab Capture fullscreen workaround.

### Fixed
- **Ultrawide fullscreen clipping**: Dispatches a `resize` event after browser fullscreen transition so video players recalculate layout for the new viewport dimensions

---

## [4.2.4] - Release - 2026-02-07

### Summary
**Live settings sync** - Options page changes now update the popup in real-time without needing to close and reopen it.

### Added
- **Live settings sync**: All options page settings (theme, header layout, section layout, volume presets, volume steps, EQ presets, EQ control mode, visualizer style) now update the popup instantly via `storage.onChanged` listener

---

## [4.2.3] - Release - 2026-02-06

### Summary
**Fullscreen workaround for Tab Capture mode** - Automatically toggles browser fullscreen when a video enters fullscreen in Tab Capture mode, working around Chrome's limitation where Tab Capture prevents true fullscreen.

### Added
- **Fullscreen workaround (Tab Capture)**: When Tab Capture mode is active, video fullscreen requests now automatically trigger browser fullscreen (F11 equivalent), and exiting video fullscreen restores the previous window state (maximized/normal)

### Changed
- **Shortened all popup status messages** to fit on a single line for a cleaner look

---

## [4.2.1] - Release - 2026-02-06

### Summary
**Bug fix release** - Fixed 10 bugs found during comprehensive QA audit.

### Fixed
- **Visualizer default setting**: Options page now correctly updates popup's visualizer preference (was writing to sync storage but popup reads from local storage)
- **Voice Boost context menu**: Fixed prefix mismatch (`voice_` → `voiceBoost_`) that made all Voice Boost context menu options non-functional
- **Focus Mode volume restoration (context menu)**: Disabling Focus Mode via context menu now restores each tab's saved volume instead of resetting all tabs to 100%
- **Focus Mode volume restoration (popup)**: Same hardcoded volume=100 bug in `UNMUTE_OTHER_TABS` handler — now reads saved volume per tab
- **Backup/restore volume presets**: Fixed preset count mismatch — backup exported 5 presets but restore expected 4, silently discarding them
- **Reset All Settings crash**: Fixed call to non-existent `loadDisabledDomains()` (now calls `loadSiteOverrides()`)
- **Reset skips preset 5**: Added missing 5th preset to Reset All Settings UI update
- **Reset missing storage keys**: Added `defaultAudioMode`, site mode override lists, and `popupSectionsLayout` to Reset All Settings
- **Tab Info Location constant**: Fixed `DEFAULT_TAB_INFO_LOCATION` from `'inside'` to `'below'` to match actual default behavior
- **Web Audio connect() exclusion**: Added `trebleFilter`, `limiter`, and `analyser` to internal node exclusion list to prevent potential audio routing issues

---

## [4.2.0] - Release - 2026-01-21

### Summary
**Chrome Web Store Submitted** - Major update with popup customization and accessibility improvements.

### Added
- **Popup Sections Customization**: Reorder and hide the 4 main popup sections (Balance, Enhancements, Output, Site Rule) via Options page
- **Tab Title Location setting**: Choose to display tab title inside or below the visualizer
- **Volume Boost Warning**: One-time warning when boosting volume above 100% to protect hearing and speakers
- **Auto-scroll for notifications**: Status messages auto-scroll into view when needed

### Security
- **Input validation hardening**: Added defense-in-depth validation for audio parameters (volume, gain, balance, device, compressor)
- **Tab ID validation**: Strengthened validation to reject invalid IDs
- **EQ slider range clamping**: Enforced -24 to +24 dB limits on bass, treble, and voice controls
- **Popup cleanup**: Proper resource cleanup on popup close to prevent memory leaks

### Accessibility
- **Comprehensive ARIA audit**: Added missing `aria-label` and `aria-hidden` attributes throughout popup, options, guide, and FAQ pages

### Changed
- **ABTC logo redesign**: Updated speaker icon and Comfortaa font to match Chrome Web Store branding
- **Tab counter repositioned**: Moved from bottom-left to top-right of visualizer
- **Tab Title Location default**: Changed to "Below visualizer" for cleaner appearance
- **Validation error messages**: Now include valid ranges (e.g., "Invalid volume (must be 0-500)")

### Fixed
- **Web Audio mode after switch**: Fixed "Extension cannot access audio" error when switching from Tab Capture to Web Audio
- **Visualizer indicator in disabled mode**: Now correctly shows "Visualizer off" indicator
- **Memory management**: Fixed potential memory leaks on tab close and throttle cleanup

### Documentation
- **User Guide**: Comprehensive update with popup sections, audio mode buttons, and permissions documentation

---

## [4.1.0] - Release - 2026-01-18

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
