# Per-Tab Audio Control

Take complete control of audio in your browser. Boost quiet videos, fine-tune levels, or mute specific tabs while keeping others playing.

## Features

- **Individual volume control** - Adjust each tab independently (0-500%)
- **Site rules** - Automatically remembers your volume preferences per website
- **Keyboard shortcuts** - Alt+Shift+M to mute, Alt+Shift+Up/Down for volume
- **Audio normalization** - Built-in compressor and limiter
- **Real-time visualizer** - See audio levels as you adjust
- **Output device selection** - Route audio to different devices per tab
- **Night Sky theme** - Clean, dark interface

## Privacy

**No data collection. No tracking. No analytics.**

Your audio settings stay on your device. This extension makes zero external network requests.

## Installation

### Chrome Web Store
Coming soon

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
| `storage` | Save your preferences locally |
| `scripting` | Inject audio control scripts into web pages |
| `tabCapture` | Capture and process audio for volume boost and equalizer features |
| `offscreen` | Maintain audio processing in the background |
| `contextMenus` | Add right-click menu options |
| `<all_urls>` | Control audio on any website you visit |

**Runtime permission:** Microphone access is requested only if you use the audio output device selector (to enumerate available devices - no audio is recorded).

## License

This project is licensed under the **GNU General Public License v3.0** - see the [LICENSE](LICENSE) file for details.

This means you can:
- Use this software for any purpose
- Study and modify the source code
- Distribute copies
- Distribute your modifications

But you must:
- Include the original license and copyright
- Make your modifications available under GPL v3
- State any changes you made

## Author

**After Bedtime Creations**
Privacy-focused software, built late.

- Website: [afterbedtimecreations.com](https://afterbedtimecreations.com)
- GitHub: [@AfterBTCreate](https://github.com/AfterBTCreate)
