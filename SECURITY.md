# Security Policy

## Reporting Security Issues

If you discover a security vulnerability in Per-Tab Audio Control, please report it privately to **privacy@afterbedtimecreations.com**.

Please include:

- A description of the issue
- Steps to reproduce
- The version affected (`chrome/manifest.json` → `version`)
- Any proof-of-concept code (if applicable)

Please do **not** file public GitHub issues for security vulnerabilities. Private disclosure gives us time to investigate and ship a fix before details are made public.

## Supported Versions

Only the latest released version receives security updates. The Chrome Web Store auto-updates installed extensions, so users on the current version are always protected.

| Version | Supported          |
| ------- | ------------------ |
| Latest  | ✅ Yes             |
| Older   | ❌ No              |

## Threat Model

Per-Tab Audio Control is a privacy-first browser extension. Its security posture is built around the following principles:

- **No network requests.** The extension makes zero outbound network connections. All audio processing happens locally on the user's device.
- **No data collection, analytics, or telemetry.** Settings are stored in `chrome.storage.local` and `chrome.storage.sync` only. Nothing is transmitted off-device.
- **Minimal external dependencies.** The only third-party library is `chrome/lib/lamejs.min.js` (LAME MP3 encoder, used for the audio recording feature). Source URL and SHA-256 integrity hash are documented in [`chrome/lib/lamejs.SOURCE.md`](chrome/lib/lamejs.SOURCE.md).
- **Source-available for verification.** The full source is published in this repository for inspection (MIT + Commons Clause).

### In scope

- Cross-site scripting in extension UI (popup, options, guide pages)
- Privilege escalation across tabs or origins
- Data leakage through extension messaging or storage
- Permission boundary violations (e.g., reading page content the extension shouldn't access)
- Issues in audio recording, MP3 encoding, or file download flows

### Out of scope

- General Chrome / Chromium browser bugs (please report those to Google)
- Vulnerabilities in third-party websites the extension runs on
- Vulnerabilities in upstream LAME / lamejs (please report to [zhuker/lamejs](https://github.com/zhuker/lamejs))
- User opt-in choices (e.g., recording audio they don't have permission to record — see in-app disclaimer)

## Audit History

As of April 2026, the codebase has undergone 18+ documented security audits across 4 months of active development covering security, accessibility, code quality, and feature behavior. Known issues are tracked in the GitHub issue tracker.

## Acknowledgments

We thank all security researchers who help keep Per-Tab Audio Control safe for users. Reports leading to verified security improvements may be acknowledged in `CHANGELOG.md` at the reporter's discretion.
