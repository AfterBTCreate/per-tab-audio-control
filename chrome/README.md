# Per-Tab Audio Control

The audio controls browsers forgot to include.

Boost quiet videos up to 500%, fine-tune equalizer settings, set automatic volume rules per site, and route audio to different output devices — all from a single popup.

**[Screenshots and full feature list](https://afterbedtimecreations.com/projects.html)**

## Features

### Core Audio Controls
- **Volume boost** — Amplify any tab from 0% to 500%
- **Per-site rules** — Automatically apply your preferred volume to specific websites
- **Mute control** — Mute individual tabs or all other tabs with one click
- **Focus mode** — Instantly mute all other tabs to focus on your current audio
- **Balance slider** — Pan audio left/right, with stereo, mono, and swap presets

### Audio Enhancements
- **Equalizer** — Bass boost, treble, and voice enhancement controls
- **Compressor** — Normalize loud/quiet audio for consistent levels
- **Limiter** — Prevent distortion when boosting volume

### Additional Features
- **Real-time visualizer** — See audio levels as you adjust
- **Output device selector** — Route each tab's audio to different speakers/headphones
- **Keyboard shortcuts** — Alt+Shift+M to mute, Alt+Shift+Up/Down for volume
- **Context menu** — Right-click options for quick actions
- **Customizable UI** — Reorder header items and popup sections, collapse sections you don't use

### Design
- **Night Sky theme** — Clean, dark interface designed for low-light use
- **Compact popup** — Everything accessible without scrolling
- **Settings sync** — Preferences sync across devices via Chrome Sync

## Privacy

**No data collection. No tracking. No analytics.**

Your audio settings stay on your device. This extension makes zero external network requests.

## Installation

### Chrome
Coming soon to the Chrome Web Store.

### Firefox
Firefox support is in development. The codebase is compatible but some features require additional work.

### Manual Installation
1. Download or clone this repository
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `chrome` folder

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

## License

This project is licensed under the **GNU General Public License v3.0** — see the [LICENSE](LICENSE) file for details.

You can use, study, modify, and distribute this software freely, provided you:
- Include the original license and copyright
- Make modifications available under GPL v3
- State any changes you made

## Author

**After Bedtime Creations** — Privacy-focused software, built late.

- [Website](https://afterbedtimecreations.com)
- [GitHub](https://github.com/AfterBTCreate)
- [X](https://x.com/AfterBTCreate)
