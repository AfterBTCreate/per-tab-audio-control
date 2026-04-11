# Per-Tab Audio Control

> The audio controls browsers forgot to include.

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/fhbglapkjnbiokdjlfbddcchakgpfijg?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/per-tab-audio-control/fhbglapkjnbiokdjlfbddcchakgpfijg)
[![License](https://img.shields.io/badge/license-MIT%20%2B%20Commons%20Clause-blue)](LICENSE)
[![Privacy](https://img.shields.io/badge/privacy-no%20tracking-brightgreen)](#privacy)
[![Audited](https://img.shields.io/badge/security-15%2B%20audits-success)](docs/SECURITY-FINDINGS.md)

Boost quiet videos up to 500%, adjust playback speed, fine-tune equalizer settings, set automatic volume rules per site, route audio to different output devices, and record tab audio — all from a single popup.

**No subscriptions. No ads. No data collection. No tracking. No external network requests.**

[Install →](https://chromewebstore.google.com/detail/per-tab-audio-control/fhbglapkjnbiokdjlfbddcchakgpfijg) · [Demo →](https://afterbedtimecreations.com/projects) · [Changelog →](CHANGELOG.md) · [Security →](SECURITY.md)

## Features

### Volume Control
- **0–500% range** per tab with precision slider
- **Five customizable presets** for quick volume switching
- **Built-in limiter** to prevent distortion when boosting
- **Volume badge** on the extension icon showing current percentage
- **Badge style toggle** light-on-dark, dark-on-light, or color matching volume level

### Audio Processing
- **Balance slider** with stereo, mono, and swap modes
- **Playback speed** 0.05x to 5x with 6 customizable presets and non-linear slider
- **Bass and treble** boost/cut controls
- **Voice boost / cut** for dialogue clarity (boost up to +18 dB, cut down to -40 dB)
- **Range compressor** with Podcast, Movie, and Maximum presets

### Recording
- **Record tab audio** to MP3 or WAV with one click
- **Configurable bitrate and sample rate** (MP3 quality presets, sample rate up to 48 kHz)
- **Per-tab consent disclaimer** on first use of each tab — recording never starts silently
- **Live recording timer** in the popup status bar
- **Auto-generated filenames** with sanitized tab title and timestamp
- **Save As dialog** ensures you confirm every download
- **Concurrency control** — only one tab can record at a time, prevents accidental overlaps

### Visualizer
- **Five display styles** Bars, Waveform, Mirrored, Curve, and Dots
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
- **DRM site detection** proactive hints for Netflix, Spotify, Disney+, and more
- Syncs across devices via your browser account

### Audio Modes
- **Tab Capture** Browser-level capture, works on all sites, supports fullscreen video
- **Disabled** Native browser audio only (0–100%)
- Per-site preferences auto-saved

### Convenience
- **Seekbar** Click-to-seek and drag-to-seek with time remaining toggle
- **Live stream seekbar** Shows "LIVE" indicator for live streams
- **Sleep timer** Auto-pause media after a set duration
- **All audio tabs overlay** Dropdown showing every tab playing audio with favicons and titles — click to switch tabs
- **Keyboard shortcuts** Alt+Shift+Up/Down for volume, Alt+Shift+M for mute
- **Context menu** Right-click options for quick actions
- **Tab switcher** Switch between audio tabs without leaving the popup
- **Focus mode** Mute all other tabs, integrates with tab navigation
- **Play/pause** media control from the popup with play/pause icon
- **Basic/Advanced mode** Animated slide transition between simple and full controls
- **One-click reset** for any control

### Customization
- **Light and dark themes** Sky Blue (light) and Starry Night (dark)
- **Header edit mode** Long-press logo to drag-and-drop reorder, show/hide items, adjust spacers
- **Sections edit mode** Drag-to-reorder popup sections, toggle between slider and preset modes per control
- **Per-item visibility** Hide individual controls including visualizer, seekbar, and shortcuts
- **Badge style** Light-on-dark, dark-on-light, or volume-matched color
- **Tab title placement** Inside, above, below, or hidden
- **Custom presets** for volume, balance, and playback speed
- **Backup and restore** Export and import all settings
- **Settings sync** Preferences sync across devices via Chrome Sync
- **Live two-way sync** Popup and options page changes sync in real-time

### Accessibility
- **Full keyboard navigation** Control everything without a mouse
- **Screen reader support** Comprehensive ARIA labels, live regions, and pressed states
- **Focus-visible indicators** on every interactive element
- **Live status announcements** Changes announced to screen readers
- **Reduced-motion support** Animations respect `prefers-reduced-motion`

## Privacy

**No data collection. No tracking. No analytics.**

Your audio settings stay on your device. This extension makes zero external network requests. Settings sync via your browser account only.

The full source code is published in this repository for independent verification. You don't have to take our word for it — you can read every line.

## Installation

### Chrome
**[Install from Chrome Web Store](https://chromewebstore.google.com/detail/per-tab-audio-control/fhbglapkjnbiokdjlfbddcchakgpfijg)**

> **Note:** The Chrome Web Store version may lag behind this repository due to submission timing and Chrome's review process.

### Manual Installation
1. Download or clone this repository
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `chrome/` folder from this repository

**Browser support:** Tested on Chrome. Should also work on other Chromium-based browsers (Edge, Brave, Vivaldi, Opera, Arc). Firefox port is not currently planned.

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
| `alarms` | Power the sleep timer countdown |
| `downloads` | Save recorded tab audio to disk via the Save As dialog |
| `<all_urls>` | Control audio on any website you visit |

**Runtime permission:** Microphone access is requested only when using the output device selector (to list available devices, no audio is recorded).

## Security

This project undergoes regular multi-agent security audits — 15+ documented audits as of v6.0+. The audit playbook with accepted patterns, intentional design decisions, and full audit history is published in [`docs/SECURITY-FINDINGS.md`](docs/SECURITY-FINDINGS.md).

Found a security issue? See [`SECURITY.md`](SECURITY.md) for the security policy and reporting instructions.

## Disclaimer

**Warning:** High volume levels can cause permanent hearing damage and may damage speakers or headphones. Use at your own risk. After Bedtime Creations is not liable for any hearing loss, equipment damage, or other harm resulting from use of this software.

## License

This project is licensed under the **MIT License + Commons Clause**. See the [LICENSE](LICENSE) file for details.

You can use, study, modify, and distribute this software freely, provided you:
- Include the original license and copyright
- **Do not sell** the software or services derived from it

The Commons Clause restricts commercial use. You may not sell this software or offer paid services based on it without permission from the author.

## Author

**After Bedtime Creations** — Privacy-first extensions, built late.

- [Website](https://afterbedtimecreations.com)
- [GitHub](https://github.com/AfterBTCreate)
- [X](https://x.com/AfterBTCreate)
