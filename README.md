# Per-Tab Audio Control

The audio controls browsers forgot to include.

Boost quiet videos up to 500%, adjust playback speed, fine-tune equalizer settings, set automatic volume rules per site, and route audio to different output devices — all from a single popup.

No subscriptions. No ads. No data collection.

![Per-Tab Audio Control popup](https://afterbedtimecreations.com/images/extension-sliders-dark.png)

**[Screenshots and full feature guide](https://afterbedtimecreations.com/projects)**

## Features

### Volume Control
- **0–500% range** per tab with precision slider
- **Five customizable presets** for quick volume switching
- **Built-in limiter** to prevent distortion when boosting
- **Volume badge** on the extension icon showing current percentage
- **Badge style toggle** — light-on-dark or dark-on-light, with color matching volume level

### Audio Processing
- **Balance slider** with stereo, mono, and swap modes
- **Playback speed** — 0.05x to 5x with 7 customizable presets and non-linear slider
- **Bass and treble** boost/cut controls
- **Voice boost** for dialogue clarity
- **Range compressor** with Podcast, Movie, and Maximum presets

### Visualizer
- **Five display styles** — Bars, Waveform, Mirrored, Curve, and Dots
- **Custom color** override with color picker
- **Click-hold** to cycle styles, **click** to jump to that tab
- Works across all sites via Tab Capture

### Device Selection
- **Route individual tabs** to different audio outputs (speakers, headphones, etc.)
- **Set global defaults** for new tabs
- Ideal for gaming + music, streaming + chat, or work call setups

### Site Rules
- **Automatically apply** saved volume, EQ, compressor, and device settings per website
- **Red badge indicator** when a rule is available but not yet applied
- **DRM site detection** — proactive hints for Netflix, Spotify, Disney+, and more
- Syncs across devices via your browser account

### Audio Modes
- **Tab Capture** (Chrome default) — Browser-level capture, works on all sites, supports fullscreen video
- **Web Audio** (Firefox default) — Direct page audio integration, lighter option
- **Disabled** — Native browser audio only (0–100%)
- Per-site preferences auto-saved

### Convenience
- **Seekbar** — Click-to-seek and drag-to-seek with time remaining toggle and Spotify DRM support
- **Keyboard shortcuts** — Alt+Shift+Up/Down for volume, Alt+Shift+M for mute
- **Context menu** — Right-click options for quick actions
- **Tab switcher** — Switch between audio tabs without leaving the popup
- **Focus mode** — Mute all other tabs, integrates with tab navigation
- **Play/pause** media control from the popup
- **Basic/Advanced mode** — Toggle between simple volume controls and full feature set
- **One-click reset** for any control

### Customization
- **Light and dark themes** — Morning (light) and Bedtime (dark)
- **Drag-and-drop layout** — Reorder header items and popup sections
- **Per-item visibility** — Hide individual controls, toggle between sliders and presets
- **Tab title placement** — Above, inline, or hidden
- **Custom presets** for volume, balance, and playback speed
- **Backup and restore** — Export and import all settings
- **Settings sync** — Preferences sync across devices via Chrome Sync
- **Live settings sync** — Options page changes update the popup in real-time

### Accessibility
- **Full keyboard navigation** — Control everything without a mouse
- **Screen reader support** — Comprehensive ARIA labels, live regions, and pressed states
- **Focus-visible indicators** on every interactive element
- **Live status announcements** — Changes announced to screen readers

## Privacy

**No data collection. No tracking. No analytics.**

Your audio settings stay on your device. This extension makes zero external network requests. Settings sync via your browser account only.

## Installation

### Chrome
**[Install from Chrome Web Store](https://chromewebstore.google.com/detail/per-tab-audio-control/fhbglapkjnbiokdjlfbddcchakgpfijg)**

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
