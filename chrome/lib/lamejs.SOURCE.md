# lamejs

Vendored JavaScript port of the LAME MP3 encoder, used by the offscreen document for tab audio recording (added in v6.0.0).

## Version

**1.2.1** — from npm / jsdelivr

## Source

- **npm package:** https://www.npmjs.com/package/lamejs
- **CDN URL used:** https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js
- **Upstream repository:** https://github.com/zhuker/lamejs
- **License:** See upstream repository. lamejs is a port of LAME (historically LGPL).

## Integrity

| File              | Size (bytes) | SHA-256                                                            |
| ----------------- | ------------ | ------------------------------------------------------------------ |
| `lamejs.min.js`   | 156,043      | `15d285e2587b3bdbfd18a68de6ce07cc074f7480a82c3815da2dc1c348ec6df4` |

**Verified against upstream on 2026-04-11** — the vendored file is byte-identical to `https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js`.

## Reproducibility

To re-fetch and verify this file from upstream:

```bash
curl -sL "https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js" -o lamejs.min.js
sha256sum lamejs.min.js
# Expected:
# 15d285e2587b3bdbfd18a68de6ce07cc074f7480a82c3815da2dc1c348ec6df4  lamejs.min.js
```

## Why vendored

Chrome Web Store extensions load all scripts from the extension origin under CSP `script-src 'self'`. External script loading is not permitted, so the library must be bundled with the extension.

See also: [`SECURITY.md`](../../SECURITY.md) for the project's security policy and audit history.

## Update procedure

1. Check upstream for new versions: https://www.npmjs.com/package/lamejs
2. Download the new version via the curl recipe above
3. Review the upstream changelog and source for changes
4. Replace `lamejs.min.js` with the new file
5. Update this `SOURCE.md` with the new version number, SHA-256, and verification date
6. Test the recording feature end-to-end before committing
