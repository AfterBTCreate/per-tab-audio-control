# Per-Tab Audio Control

The audio controls browsers forgot to include.

Boost quiet videos up to 500%, fine-tune equalizer settings, set automatic volume rules per site, and route audio to different output devices — all from a single popup.

No subscriptions. No ads. No data collection.

![Per-Tab Audio Control popup](https://afterbedtimecreations.com/images/extension-sliders-dark.png)

**[Full feature list and more screenshots](https://afterbedtimecreations.com/projects)**

## Features

### Core Audio Controls
- **Volume boost** — Amplify any tab from 0% to 500%
- **Per-site rules** — Automatically apply your preferred volume to specific websites
- **Focus mode** — Instantly mute all other tabs to focus on your current audio
- **Balance slider** — Pan audio left/right, with stereo, mono, and swap presets
- **Play/Pause** — Control media playback from the popup or context menu

### Audio Enhancements
- **Equalizer** — Bass boost, treble, and voice enhancement controls
- **Compressor** — Normalize loud/quiet audio for consistent levels
- **Limiter** — Prevent distortion when boosting volume

### Audio Modes
- **Tab Capture** (default) — Works on all sites, most reliable
- **Web Audio** — Lighter option for simple sites
- **Disabled** — Native browser volume only (0-100%)
- Per-site mode preferences saved automatically

### Additional Features
- **Real-time visualizer** — See audio levels as you adjust, click to jump to that tab
- **Output device selector** — Route each tab's audio to different speakers/headphones
- **Keyboard shortcuts** — Alt+Shift+M to mute, Alt+Shift+Up/Down for volume
- **Context menu** — Right-click options for quick actions
- **Tab switcher** — Switch between audio tabs without leaving the popup
- **Built-in user guide** — Feature explanations accessible from Settings

### Customization
- **Light and dark themes** — Morning (light) and Bedtime (dark) themes
- **Customizable UI** — Reorder header items and popup sections, hide sections you don't use
- **Basic/Advanced mode** — Toggle between simple volume controls and full feature set
- **Configurable presets** — Set your own volume and effect presets
- **Backup and restore** — Export and import all settings
- **Settings sync** — Preferences sync across devices via Chrome Sync

### Accessibility
- **Full keyboard navigation** — Control everything without a mouse
- **Screen reader support** — Compatible with assistive technologies
- **Live status announcements** — Changes announced to screen readers

## Privacy

**No data collection. No tracking. No analytics.**

Your audio settings stay on your device. This extension makes zero external network requests.

## Installation

### Chrome
Submitted to Chrome Web Store (pending review).

### Firefox
Firefox support is in development. The codebase is compatible but some features require additional work.

### Manual Installation
1. Download or clone this repository
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension folder

## Permissions

| Permission | Why It's Needed |
|------------|-----------------|
| `tabs` | Identify which tab is playing audio and display tab information |
| `activeTab` | Control audio on the current tab when you interact with the extension |
| `storage` | Save your preferences locally and sync across devices |
| `scripting` | Inject audio control scripts into web pages |
| `tabCapture` | Capture and process audio for volume boost and equalizer features |
| `offscreen` | Maintain audio processing in the background |
| `contextMenus` | Add right-click menu options |
| `<all_urls>` | Control audio on any website you visit |

**Runtime permission:** Microphone access is requested only when using the output device selector (to list available devices — no audio is recorded).

## Disclaimer

**Warning:** High volume levels can cause permanent hearing damage and may damage speakers or headphones. Use at your own risk. After Bedtime Creations is not liable for any hearing loss, equipment damage, or other harm resulting from use of this software.

## License

This project is licensed under the **MIT License + Commons Clause** — see the [LICENSE](LICENSE) file for details.

You can use, study, modify, and distribute this software freely, provided you:
- Include the original license and copyright
- **Do not sell** the software or services derived from it

The Commons Clause restricts commercial use — you may not sell this software or offer paid services based on it without permission from the author.

## Author

**After Bedtime Creations** — Privacy-focused software, built late.

- [Website](https://afterbedtimecreations.com)
- [GitHub](https://github.com/AfterBTCreate)
- [X](https://x.com/AfterBTCreate)
