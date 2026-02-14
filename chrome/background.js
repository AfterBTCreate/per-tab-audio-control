// Per-Tab Audio Control - Background Service Worker
// Cross-browser compatible (Chrome & Firefox)
//
// Note: This file intentionally duplicates some utilities from shared/validation.js
// and shared/constants.js because service workers can't easily share code
// via HTML script tags. Keep these in sync with the shared versions.

// Debug flag - set to true for verbose logging during development
const DEBUG = false;
const log = (...args) => DEBUG && console.log('[BG]', ...args);
const logDebug = (...args) => DEBUG && console.debug('[BG]', ...args);

// ===== DUPLICATED CONSTANTS — KEEP IN SYNC =====
// Source of truth: shared/constants.js
// Also duplicated in: content/content.js, content/page-script.js, offscreen/offscreen.js
// Reason: Service worker can't import shared modules via HTML script tags
const VOLUME_DEFAULT = 100;
const VOLUME_MIN = 0;
const VOLUME_MAX = 500;

const EFFECT_RANGES = {
  bass: { min: -24, max: 24, default: 0 },
  treble: { min: -24, max: 24, default: 0 },
  voice: { min: 0, max: 18, default: 0 },
  speed: { min: 0.05, max: 5, default: 1 }
};

// Default presets — KEEP IN SYNC with shared/constants.js DEFAULTS object
const DEFAULT_VOLUME_PRESETS = [50, 100, 200, 300, 500];
const DEFAULT_BASS_PRESETS = [6, 12, 24];
const DEFAULT_BASS_CUT_PRESETS = [-6, -12, -24];
const DEFAULT_TREBLE_PRESETS = [6, 12, 24];
const DEFAULT_TREBLE_CUT_PRESETS = [-6, -12, -24];
const DEFAULT_VOICE_PRESETS = [4, 10, 18];
const DEFAULT_SPEED_SLOW_PRESETS = [0.75, 0.50, 0.25];
const DEFAULT_SPEED_FAST_PRESETS = [1.25, 1.50, 2.00];
const DEFAULT_VOLUME_STEPS = { scrollWheel: 5, keyboard: 1, buttons: 1 };
const DEFAULT_AUDIO_MODE_CHROME = 'tabcapture';

// Tab storage suffixes — KEEP IN SYNC with shared/constants.js
const TAB_STORAGE = {
  VOLUME: '',           // tab_123 (base key for volume)
  PREV: 'prev',         // tab_123_prev (previous volume before mute)
  DEVICE: 'device',     // tab_123_device
  BASS: 'bass',         // tab_123_bass
  TREBLE: 'treble',     // tab_123_treble
  VOICE: 'voice',       // tab_123_voice
  COMPRESSOR: 'compressor', // tab_123_compressor
  BALANCE: 'balance',   // tab_123_balance
  CHANNEL_MODE: 'channelMode', // tab_123_channelMode
  SPEED: 'speed',       // tab_123_speed
  RULE_APPLIED: 'ruleAppliedDomain' // tab_123_ruleAppliedDomain
};

// Helper to generate consistent tab storage keys — KEEP IN SYNC with shared/constants.js
function getTabStorageKey(tabId, suffix = '') {
  if (suffix) {
    return `tab_${tabId}_${suffix}`;
  }
  return `tab_${tabId}`;
}

// Security: Validate tabId parameter to prevent injection attacks
function isValidTabId(tabId) {
  return Number.isInteger(tabId) && tabId > 0 && tabId < 2147483647;
}

// Volume step for keyboard shortcuts (loaded from storage)
let keyboardStep = 1;

// Active Tab Audio mode - only the active tab plays audio
// Audio automatically follows the active tab when switching
let focusModeState = {
  active: false,
  lastActiveTabId: null  // Track last active tab to mute when switching
};

// Load keyboard step from storage
async function loadKeyboardStep() {
  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
  try {
    const result = await browserAPI.storage.sync.get(['volumeSteps']);
    const steps = result.volumeSteps || DEFAULT_VOLUME_STEPS;
    keyboardStep = steps.keyboard;
  } catch (e) {
    keyboardStep = 1;
  }
}

// Load keyboard step on startup
loadKeyboardStep();

// Listen for storage changes to update keyboard step
const browserAPIForListener = typeof browser !== 'undefined' ? browser : chrome;
browserAPIForListener.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.volumeSteps) {
    const steps = changes.volumeSteps.newValue || DEFAULT_VOLUME_STEPS;
    keyboardStep = steps.keyboard;
  }
});

// Security: Sanitize and validate hostname for storage keys
function sanitizeHostname(hostname) {
  if (!hostname || typeof hostname !== 'string') {
    return null;
  }
  // Trim and lowercase
  hostname = hostname.toLowerCase().trim();
  // Check length (max DNS hostname length is 253)
  if (hostname.length === 0 || hostname.length > 253) {
    return null;
  }
  // Only allow valid hostname characters (alphanumeric, dots, hyphens)
  // Must start and end with alphanumeric
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(hostname) && !/^[a-z0-9]$/.test(hostname)) {
    return null;
  }
  // No consecutive dots
  if (/\.\./.test(hostname)) {
    return null;
  }
  return hostname;
}

// Security: Validate URL and extract sanitized hostname
function getValidatedHostname(url) {
  try {
    const urlObj = new URL(url);
    return sanitizeHostname(urlObj.hostname);
  } catch (e) {
    return null;
  }
}

// Browser API compatibility layer
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
const isFirefox = typeof browser !== 'undefined';

// Check if URL is a restricted browser page where content scripts can't run
const restrictedUrlPatterns = [
  /^chrome:\/\//,
  /^chrome-extension:\/\//,
  /^about:/,
  /^edge:\/\//,
  /^moz-extension:\/\//,
  /^file:\/\//,
  /^brave:\/\//,
  /^vivaldi:\/\//,
  /^opera:\/\//
];

function isRestrictedUrl(url) {
  if (!url) return true;
  return restrictedUrlPatterns.some(pattern => pattern.test(url));
}

// Track tabs that have reported having media (for tab navigation including paused media)
const tabsWithMedia = new Set();

// Track previous window state per tab for fullscreen workaround (Tab Capture mode)
const fullscreenStateByTab = new Map();

// Log version on startup (DEBUG only - verify refresh is working)
log('Service worker starting - version', browserAPI.runtime.getManifest().version, isFirefox ? '(Firefox)' : '(Chrome)');

// Note: We intentionally do NOT close the offscreen document on service worker startup.
// The offscreen document holds persistent Tab Capture sessions that should survive
// service worker sleep/wake cycles. Closing it would reset audio to default.
// The offscreen document IS closed on extension update (see onInstalled handler)
// to ensure fresh code is loaded.

// Check if a URL matches any site volume rule
async function getMatchingSiteRule(url) {
  log('getMatchingSiteRule called with URL:', url);

  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
      url.startsWith('moz-extension://') || url.startsWith('about:')) {
    log('getMatchingSiteRule: Skipping restricted URL');
    return null;
  }

  const result = await browserAPI.storage.sync.get(['siteVolumeRules']);
  const rules = result.siteVolumeRules || [];
  log('getMatchingSiteRule: Found', rules.length, 'rules:', rules);

  if (rules.length === 0) {
    log('getMatchingSiteRule: No rules found');
    return null;
  }

  try {
    const hostname = getValidatedHostname(url);
    log('getMatchingSiteRule: Extracted hostname:', hostname);
    if (!hostname) {
      log('getMatchingSiteRule: Invalid hostname, returning null');
      return null;
    }

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      log('getMatchingSiteRule: Checking rule', i, ':', rule.pattern, 'isDomain:', rule.isDomain, 'volume:', rule.volume);

      // Sanitize rule pattern for security
      const sanitizedPattern = rule.isDomain ? sanitizeHostname(rule.pattern) : rule.pattern;
      log('getMatchingSiteRule: Sanitized pattern:', sanitizedPattern);

      if (!sanitizedPattern) {
        log('getMatchingSiteRule: Pattern sanitization failed, skipping rule');
        continue;
      }

      let matched = false;
      if (rule.isDomain) {
        // Domain match: check if hostname matches or is subdomain
        const exactMatch = hostname === sanitizedPattern;
        const subdomainMatch = hostname.endsWith(`.${sanitizedPattern}`);
        log('getMatchingSiteRule: Domain check - exactMatch:', exactMatch, 'subdomainMatch:', subdomainMatch);
        if (exactMatch || subdomainMatch) {
          matched = true;
        }
      } else {
        // Exact URL match
        const exactMatch = url === sanitizedPattern;
        const normalizedMatch = url.replace(/\/$/, '') === sanitizedPattern.replace(/\/$/, '');
        log('getMatchingSiteRule: URL check - exactMatch:', exactMatch, 'normalizedMatch:', normalizedMatch);
        if (exactMatch || normalizedMatch) {
          matched = true;
        }
      }

      if (matched) {
        log('getMatchingSiteRule: MATCHED! Returning rule with volume:', rule.volume);
        // Update lastUsed timestamp (debounced - only if more than 1 hour since last update)
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        if (!rule.lastUsed || (now - rule.lastUsed) > oneHour) {
          rules[i].lastUsed = now;
          // Save updated rules (async, don't wait)
          browserAPI.storage.sync.set({ siteVolumeRules: rules }).catch(() => {});
        }
        return rule;
      }
    }
    log('getMatchingSiteRule: No rules matched');
  } catch (e) {
    log('getMatchingSiteRule: Error during matching:', e.message);
    // Invalid URL, skip matching
  }

  return null;
}

// Apply a matching site rule to a tab — sets volume, device, effects, and marks domain as applied
// Returns { rule, deviceLabel } if a rule was applied, null otherwise
async function applyMatchingSiteRule(tabId, url) {
  const matchingRule = await getMatchingSiteRule(url);
  if (!matchingRule) return null;

  log('applyMatchingSiteRule: Applying rule for tab', tabId, 'volume:', matchingRule.volume);

  // Apply volume
  await setTabVolume(tabId, matchingRule.volume);

  // Apply device from rule if specified
  let deviceLabel = '';
  if (matchingRule.deviceLabel) {
    deviceLabel = matchingRule.deviceLabel;
    const deviceKey = getTabStorageKey(tabId, TAB_STORAGE.DEVICE);
    await browserAPI.storage.local.set({
      [deviceKey]: { deviceId: '', deviceLabel: matchingRule.deviceLabel }
    });
  }

  // Apply bass boost from rule if specified
  if (matchingRule.bassBoost) {
    const bassKey = getTabStorageKey(tabId, TAB_STORAGE.BASS);
    await browserAPI.storage.local.set({ [bassKey]: matchingRule.bassBoost });
  }

  // Apply treble boost from rule if specified
  if (matchingRule.trebleBoost) {
    const trebleKey = getTabStorageKey(tabId, TAB_STORAGE.TREBLE);
    await browserAPI.storage.local.set({ [trebleKey]: matchingRule.trebleBoost });
  }

  // Apply voice boost from rule if specified
  if (matchingRule.voiceBoost) {
    const voiceKey = getTabStorageKey(tabId, TAB_STORAGE.VOICE);
    await browserAPI.storage.local.set({ [voiceKey]: matchingRule.voiceBoost });
  }

  // Apply compressor from rule if specified
  if (matchingRule.compressor) {
    const compressorKey = getTabStorageKey(tabId, TAB_STORAGE.COMPRESSOR);
    await browserAPI.storage.local.set({ [compressorKey]: matchingRule.compressor });
    // If compressor is enabled, disable bass, treble, and voice boost
    if (matchingRule.compressor !== 'off') {
      const bassKey = getTabStorageKey(tabId, TAB_STORAGE.BASS);
      const trebleKey = getTabStorageKey(tabId, TAB_STORAGE.TREBLE);
      const voiceKey = getTabStorageKey(tabId, TAB_STORAGE.VOICE);
      await browserAPI.storage.local.set({
        [bassKey]: 'off',
        [trebleKey]: 'off',
        [voiceKey]: 'off'
      });
    }
  }

  // Apply balance from rule if specified (clamp to valid range)
  if (matchingRule.balance !== undefined && matchingRule.balance !== 0) {
    const balanceKey = getTabStorageKey(tabId, TAB_STORAGE.BALANCE);
    const validBalance = Math.max(-100, Math.min(100, Math.round(Number(matchingRule.balance) || 0)));
    if (validBalance !== 0) {
      await browserAPI.storage.local.set({ [balanceKey]: validBalance });
    }
  }

  // Apply channel mode from rule if specified
  if (matchingRule.channelMode) {
    const channelKey = getTabStorageKey(tabId, TAB_STORAGE.CHANNEL_MODE);
    await browserAPI.storage.local.set({ [channelKey]: matchingRule.channelMode });
  }

  // Apply speed from rule if specified
  if (matchingRule.speed) {
    const speedKey = getTabStorageKey(tabId, TAB_STORAGE.SPEED);
    await browserAPI.storage.local.set({ [speedKey]: matchingRule.speed });
  }

  // Remember this domain so we don't re-apply on navigation within site
  const hostname = getValidatedHostname(url);
  if (hostname) {
    const ruleAppliedKey = getTabStorageKey(tabId, TAB_STORAGE.RULE_APPLIED);
    log('Rule applied, saving domain to prevent re-application:', hostname);
    await browserAPI.storage.local.set({ [ruleAppliedKey]: hostname });
  }

  return { rule: matchingRule, deviceLabel };
}

// Send all tab settings to the content script (volume, device, effects, speed)
// Called after rule application or navigation to ensure the audio pipeline matches storage
async function sendTabSettingsToContentScript(tabId, volume, deviceId, deviceLabel) {
  try {
    await browserAPI.tabs.sendMessage(tabId, {
      type: 'SET_VOLUME',
      volume: volume
    });
    if (deviceId || deviceLabel) {
      await browserAPI.tabs.sendMessage(tabId, {
        type: 'SET_DEVICE',
        deviceId: deviceId || '',
        deviceLabel: deviceLabel || ''
      });
    }

    // Send bass/treble/voice boost, compressor, balance, and channel mode settings
    const bassKey = getTabStorageKey(tabId, TAB_STORAGE.BASS);
    const trebleKey = getTabStorageKey(tabId, TAB_STORAGE.TREBLE);
    const voiceKey = getTabStorageKey(tabId, TAB_STORAGE.VOICE);
    const compressorKey = getTabStorageKey(tabId, TAB_STORAGE.COMPRESSOR);
    const balanceKey = getTabStorageKey(tabId, TAB_STORAGE.BALANCE);
    const channelKey = getTabStorageKey(tabId, TAB_STORAGE.CHANNEL_MODE);
    const effectResult = await browserAPI.storage.local.get([bassKey, trebleKey, voiceKey, compressorKey, balanceKey, channelKey]);
    const bassBoostPresets = (await browserAPI.storage.sync.get(['bassBoostPresets'])).bassBoostPresets || DEFAULT_BASS_PRESETS;
    const trebleBoostPresets = (await browserAPI.storage.sync.get(['trebleBoostPresets'])).trebleBoostPresets || DEFAULT_TREBLE_PRESETS;
    const voiceBoostPresets = (await browserAPI.storage.sync.get(['voiceBoostPresets'])).voiceBoostPresets || DEFAULT_VOICE_PRESETS;

    if (effectResult[bassKey] && effectResult[bassKey] !== 'off') {
      const bassLevel = effectResult[bassKey];
      if (typeof bassLevel === 'string') {
        let bassGain = 0;
        if (bassLevel.startsWith('cut-')) {
          const bassCutPresets = (await browserAPI.storage.sync.get(['bassCutPresets'])).bassCutPresets || DEFAULT_BASS_CUT_PRESETS;
          const cutLevel = bassLevel.replace('cut-', '');
          bassGain = cutLevel === 'low' ? bassCutPresets[0] : cutLevel === 'medium' ? bassCutPresets[1] : cutLevel === 'high' ? bassCutPresets[2] : 0;
        } else {
          bassGain = bassLevel === 'low' ? bassBoostPresets[0] : bassLevel === 'medium' ? bassBoostPresets[1] : bassLevel === 'high' ? bassBoostPresets[2] : 0;
        }
        if (bassGain !== 0) {
          await browserAPI.tabs.sendMessage(tabId, { type: 'SET_BASS', gain: bassGain });
        }
      }
    }

    if (effectResult[trebleKey] && effectResult[trebleKey] !== 'off') {
      const trebleLevel = effectResult[trebleKey];
      if (typeof trebleLevel === 'string') {
        let trebleGain = 0;
        if (trebleLevel.startsWith('cut-')) {
          const trebleCutPresets = (await browserAPI.storage.sync.get(['trebleCutPresets'])).trebleCutPresets || DEFAULT_TREBLE_CUT_PRESETS;
          const cutLevel = trebleLevel.replace('cut-', '');
          trebleGain = cutLevel === 'low' ? trebleCutPresets[0] : cutLevel === 'medium' ? trebleCutPresets[1] : cutLevel === 'high' ? trebleCutPresets[2] : 0;
        } else {
          trebleGain = trebleLevel === 'low' ? trebleBoostPresets[0] : trebleLevel === 'medium' ? trebleBoostPresets[1] : trebleLevel === 'high' ? trebleBoostPresets[2] : 0;
        }
        if (trebleGain !== 0) {
          await browserAPI.tabs.sendMessage(tabId, { type: 'SET_TREBLE', gain: trebleGain });
        }
      }
    }

    if (effectResult[voiceKey]) {
      const voiceLevel = effectResult[voiceKey];
      const voiceGain = voiceLevel === 'low' ? voiceBoostPresets[0] : voiceLevel === 'medium' ? voiceBoostPresets[1] : voiceLevel === 'high' ? voiceBoostPresets[2] : 0;
      if (voiceGain > 0) {
        await browserAPI.tabs.sendMessage(tabId, { type: 'SET_VOICE', gain: voiceGain });
      }
    }

    if (effectResult[compressorKey] && effectResult[compressorKey] !== 'off') {
      await browserAPI.tabs.sendMessage(tabId, { type: 'SET_COMPRESSOR', preset: effectResult[compressorKey] });
    }

    if (effectResult[balanceKey] !== undefined) {
      await browserAPI.tabs.sendMessage(tabId, { type: 'SET_BALANCE', balance: effectResult[balanceKey] });
    }

    if (effectResult[channelKey]) {
      await browserAPI.tabs.sendMessage(tabId, { type: 'SET_CHANNEL_MODE', mode: effectResult[channelKey] });
    }

    // Send playback speed if saved for this tab
    const speedKey = getTabStorageKey(tabId, TAB_STORAGE.SPEED);
    const speedResult = await browserAPI.storage.local.get([speedKey]);
    const speedLevel = speedResult[speedKey];
    if (speedLevel && typeof speedLevel === 'string' && speedLevel !== 'off') {
      let rate = 1;
      if (speedLevel.startsWith('slider:')) {
        rate = parseFloat(speedLevel.split(':')[1]) || 1;
        if (!Number.isFinite(rate) || rate < EFFECT_RANGES.speed.min || rate > EFFECT_RANGES.speed.max) rate = 1;
      } else {
        const speedPresets = await browserAPI.storage.sync.get(['speedSlowPresets', 'speedFastPresets']);
        const slow = speedPresets.speedSlowPresets || DEFAULT_SPEED_SLOW_PRESETS;
        const fast = speedPresets.speedFastPresets || DEFAULT_SPEED_FAST_PRESETS;
        const speedMap = {
          'slow-low': slow[0], 'slow-medium': slow[1], 'slow-high': slow[2],
          'fast-low': fast[0], 'fast-medium': fast[1], 'fast-high': fast[2]
        };
        rate = speedMap[speedLevel] || 1;
      }
      if (rate !== 1) {
        await browserAPI.tabs.sendMessage(tabId, { type: 'SET_SPEED', rate: rate });
      }
    }
  } catch (e) {
    // Content script might not be injected yet
  }
}

// Forward stored tab settings to the Tab Capture offscreen document (Chrome only)
// Called after Tab Capture starts to ensure the offscreen pipeline matches stored settings
// (e.g., a pending site rule applied volume=0 to storage, but the offscreen starts at default gain)
async function syncStoredSettingsToTabCapture(tabId) {
  if (isFirefox || !chrome.offscreen) return;
  try {
    // Read all stored settings for this tab
    const volKey = getTabStorageKey(tabId, TAB_STORAGE.VOLUME);
    const bassKey = getTabStorageKey(tabId, TAB_STORAGE.BASS);
    const trebleKey = getTabStorageKey(tabId, TAB_STORAGE.TREBLE);
    const voiceKey = getTabStorageKey(tabId, TAB_STORAGE.VOICE);
    const compressorKey = getTabStorageKey(tabId, TAB_STORAGE.COMPRESSOR);
    const balanceKey = getTabStorageKey(tabId, TAB_STORAGE.BALANCE);
    const channelKey = getTabStorageKey(tabId, TAB_STORAGE.CHANNEL_MODE);
    const result = await browserAPI.storage.local.get([volKey, bassKey, trebleKey, voiceKey, compressorKey, balanceKey, channelKey]);

    // Volume — always send (default 100 if not stored)
    const volume = result[volKey] !== undefined ? result[volKey] : 100;
    chrome.runtime.sendMessage({ type: 'SET_TAB_CAPTURE_VOLUME', tabId, volume }).catch(() => {});

    // Effects — only send if stored (non-default)
    const bassBoostPresets = (await browserAPI.storage.sync.get(['bassBoostPresets'])).bassBoostPresets || DEFAULT_BASS_PRESETS;
    const trebleBoostPresets = (await browserAPI.storage.sync.get(['trebleBoostPresets'])).trebleBoostPresets || DEFAULT_TREBLE_PRESETS;
    const voiceBoostPresets = (await browserAPI.storage.sync.get(['voiceBoostPresets'])).voiceBoostPresets || DEFAULT_VOICE_PRESETS;

    if (result[bassKey] && result[bassKey] !== 'off') {
      const level = result[bassKey];
      if (typeof level === 'string') {
        let gain = 0;
        if (level.startsWith('cut-')) {
          const bassCutPresets = (await browserAPI.storage.sync.get(['bassCutPresets'])).bassCutPresets || DEFAULT_BASS_CUT_PRESETS;
          const cutLevel = level.replace('cut-', '');
          gain = cutLevel === 'low' ? bassCutPresets[0] : cutLevel === 'medium' ? bassCutPresets[1] : cutLevel === 'high' ? bassCutPresets[2] : 0;
        } else {
          gain = level === 'low' ? bassBoostPresets[0] : level === 'medium' ? bassBoostPresets[1] : level === 'high' ? bassBoostPresets[2] : 0;
        }
        if (gain !== 0) {
          chrome.runtime.sendMessage({ type: 'SET_TAB_CAPTURE_BASS', tabId, gain }).catch(() => {});
        }
      }
    }

    if (result[trebleKey] && result[trebleKey] !== 'off') {
      const level = result[trebleKey];
      if (typeof level === 'string') {
        let gain = 0;
        if (level.startsWith('cut-')) {
          const trebleCutPresets = (await browserAPI.storage.sync.get(['trebleCutPresets'])).trebleCutPresets || DEFAULT_TREBLE_CUT_PRESETS;
          const cutLevel = level.replace('cut-', '');
          gain = cutLevel === 'low' ? trebleCutPresets[0] : cutLevel === 'medium' ? trebleCutPresets[1] : cutLevel === 'high' ? trebleCutPresets[2] : 0;
        } else {
          gain = level === 'low' ? trebleBoostPresets[0] : level === 'medium' ? trebleBoostPresets[1] : level === 'high' ? trebleBoostPresets[2] : 0;
        }
        if (gain !== 0) {
          chrome.runtime.sendMessage({ type: 'SET_TAB_CAPTURE_TREBLE', tabId, gain }).catch(() => {});
        }
      }
    }

    if (result[voiceKey] && result[voiceKey] !== 'off') {
      const level = result[voiceKey];
      const gain = level === 'low' ? voiceBoostPresets[0] : level === 'medium' ? voiceBoostPresets[1] : level === 'high' ? voiceBoostPresets[2] : 0;
      if (gain !== 0) {
        chrome.runtime.sendMessage({ type: 'SET_TAB_CAPTURE_VOICE', tabId, gain }).catch(() => {});
      }
    }

    if (result[compressorKey] && result[compressorKey] !== 'off') {
      chrome.runtime.sendMessage({ type: 'SET_TAB_CAPTURE_COMPRESSOR', tabId, preset: result[compressorKey] }).catch(() => {});
    }

    if (result[balanceKey] !== undefined) {
      const pan = result[balanceKey] / 100; // Convert -100..100 to -1..1
      chrome.runtime.sendMessage({ type: 'SET_TAB_CAPTURE_BALANCE', tabId, pan }).catch(() => {});
    }

    if (result[channelKey]) {
      chrome.runtime.sendMessage({ type: 'SET_TAB_CAPTURE_CHANNEL_MODE', tabId, mode: result[channelKey] }).catch(() => {});
    }
  } catch (e) {
    // Offscreen might not be ready yet
  }
}

// Update badge for a specific tab
// Priority: 1) Restricted page (yellow), 2) Site rule pending (red), 3) Tab Capture pending (blue), 4) Volume display
async function updateBadge(tabId, volume, tabUrl = null) {
  try {
    // Get tab URL if not provided
    let url = tabUrl;
    if (!url) {
      try {
        const tab = await browserAPI.tabs.get(tabId);
        url = tab.url;
      } catch (e) {
        // Tab might not exist
      }
    }

    // Check if restricted browser page - show warning indicator
    if (isRestrictedUrl(url)) {
      await browserAPI.action.setBadgeText({ text: '!', tabId });
      // Amber color matching the popup warning status (#fbbf24)
      await browserAPI.action.setBadgeBackgroundColor({ color: '#fbbf24', tabId });
      if (browserAPI.action.setBadgeTextColor) {
        await browserAPI.action.setBadgeTextColor({ color: '#000000', tabId }); // Dark text for contrast
      }
      await browserAPI.action.setTitle({
        title: 'Audio control not available on browser pages',
        tabId
      });
      return;
    }

    // Check if a site rule exists but hasn't been applied to this tab yet
    const hasPendingRule = await hasPendingSiteRule(tabId, url);
    if (hasPendingRule) {
      await browserAPI.action.setBadgeText({ text: '!', tabId });
      await browserAPI.action.setBadgeBackgroundColor({ color: '#D94A4A', tabId });
      if (browserAPI.action.setBadgeTextColor) {
        await browserAPI.action.setBadgeTextColor({ color: '#ffffff', tabId });
      }
      await browserAPI.action.setTitle({
        title: 'Site rule available — click to apply',
        tabId
      });
      return;
    }

    // Check if Tab Capture is pending - show activation indicator
    const pending = await isTabCapturePending(tabId);
    if (pending) {
      await browserAPI.action.setBadgeText({ text: '!', tabId });
      await browserAPI.action.setBadgeBackgroundColor({ color: '#4A90D9', tabId });
      if (browserAPI.action.setBadgeTextColor) {
        await browserAPI.action.setBadgeTextColor({ color: '#ffffff', tabId });
      }
      await browserAPI.action.setTitle({
        title: 'Click to activate Tab Capture for this site',
        tabId
      });
      return;
    }

    // Reset tooltip to default when showing volume
    await browserAPI.action.setTitle({
      title: 'Per-Tab Audio Control',
      tabId
    });

    // Set badge colors - red background when muted (0%), style-dependent otherwise
    const badgeStyleResult = await browserAPI.storage.sync.get(['badgeStyle']);
    const badgeStyle = badgeStyleResult.badgeStyle || 'light';

    let bgColor, textColor;
    if (volume === 0) {
      bgColor = '#CC0000';
      textColor = '#ffffff';
    } else if (badgeStyle === 'color') {
      // Background matches volume level color (same scale as popup UI)
      if (volume <= 50) bgColor = '#60a5fa';       // blue
      else if (volume <= 100) bgColor = '#4ade80';  // green
      else if (volume <= 200) bgColor = '#facc15';  // yellow
      else if (volume <= 350) bgColor = '#fb923c';  // orange
      else bgColor = '#a855f7';                      // purple
      textColor = '#000000';
    } else if (badgeStyle === 'dark') {
      bgColor = '#ffffff';
      textColor = '#000000';
    } else {
      bgColor = '#000000';
      textColor = '#ffffff';
    }
    const badgeText = `${volume}%`;

    await browserAPI.action.setBadgeText({ text: badgeText, tabId });
    await browserAPI.action.setBadgeBackgroundColor({ color: bgColor, tabId });

    // setBadgeTextColor may not be available in Firefox
    if (browserAPI.action.setBadgeTextColor) {
      await browserAPI.action.setBadgeTextColor({ color: textColor, tabId });
    }
  } catch (e) {
    // Tab might have been closed
  }
}

// Check if Tab Capture is pending activation for a tab (Chrome only)
// Returns true if: site has Tab Capture rule AND Tab Capture is not yet active
async function isTabCapturePending(tabId) {
  // Only relevant for Chrome
  if (isFirefox) return false;

  try {
    const tab = await browserAPI.tabs.get(tabId);
    if (!tab.url) return false;

    const url = new URL(tab.url);
    // Only for http/https
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

    // Check effective mode for this domain
    const effectiveMode = await getEffectiveModeForDomain(url.hostname);
    if (effectiveMode !== 'tabcapture') return false;

    // Check if Tab Capture is already active
    const isActive = await isTabCaptureActive(tabId);
    return !isActive;
  } catch (e) {
    return false;
  }
}

// Check if a site rule exists AND Tab Capture is pending for this tab
// Red badge replaces blue when a rule is available — more actionable than generic "Tab Capture pending"
// Returns false on Firefox/Web Audio (isTabCapturePending is always false there — rules just auto-apply)
async function hasPendingSiteRule(tabId, url) {
  if (!url) return false;
  try {
    const hostname = getValidatedHostname(url);
    if (!hostname) return false;
    const matchingRule = await getMatchingSiteRule(url);
    if (!matchingRule) return false;
    // Only show red when Tab Capture also needs activation
    return await isTabCapturePending(tabId);
  } catch (e) {
    return false;
  }
}

// Update badge and tooltip - delegates to updateBadge which handles pending state
async function updateTabCaptureIndicator(tabId) {
  try {
    const volume = await getTabVolume(tabId);
    await updateBadge(tabId, volume);
  } catch (e) {
    // Tab might have been closed
  }
}

// Validate volume value is within acceptable range
function validateVolume(value) {
  if (typeof value !== 'number' || isNaN(value)) {
    return VOLUME_DEFAULT;
  }
  // Clamp to valid range
  return Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, Math.round(value)));
}

// Get volume for a tab
async function getTabVolume(tabId) {
  const key = getTabStorageKey(tabId);
  const result = await browserAPI.storage.local.get([key]);
  return result[key] !== undefined ? validateVolume(result[key]) : VOLUME_DEFAULT;
}

// Set volume for a tab
async function setTabVolume(tabId, volume) {
  const key = getTabStorageKey(tabId);
  const validatedVolume = validateVolume(volume);
  await browserAPI.storage.local.set({ [key]: validatedVolume });
  await updateBadge(tabId, validatedVolume);

  // Notify content script
  try {
    await browserAPI.tabs.sendMessage(tabId, {
      type: 'SET_VOLUME',
      volume: validatedVolume
    });
  } catch (e) {
    // Content script might not be ready
  }

  // Also send to Tab Capture if active (Chrome only)
  // This ensures keyboard shortcuts work in Tab Capture mode
  if (!isFirefox && chrome.offscreen) {
    try {
      const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
      });

      if (existingContexts.length > 0) {
        await chrome.runtime.sendMessage({
          type: 'SET_TAB_CAPTURE_VOLUME',
          tabId: tabId,
          volume: validatedVolume
        });
      }
    } catch (e) {
      // Offscreen might not be ready or Tab Capture not active for this tab
    }
  }

  // Notify popup (if open) about volume change
  try {
    browserAPI.runtime.sendMessage({
      type: 'VOLUME_CHANGED',
      tabId: tabId,
      volume: validatedVolume
    });
  } catch (e) {
    // Popup might not be open
  }
}

// Clean up storage when tab is closed
browserAPI.tabs.onRemoved.addListener(async (tabId) => {
  // Remove all tab-specific storage keys
  const keysToRemove = [
    getTabStorageKey(tabId),                          // volume
    getTabStorageKey(tabId, TAB_STORAGE.PREV),        // previous volume
    getTabStorageKey(tabId, TAB_STORAGE.DEVICE),      // audio device
    getTabStorageKey(tabId, TAB_STORAGE.RULE_APPLIED),// site rule applied flag
    getTabStorageKey(tabId, TAB_STORAGE.BASS),        // bass enhancement
    getTabStorageKey(tabId, TAB_STORAGE.TREBLE),      // treble enhancement
    getTabStorageKey(tabId, TAB_STORAGE.VOICE),       // voice enhancement
    getTabStorageKey(tabId, TAB_STORAGE.COMPRESSOR),  // compressor/limiter
    getTabStorageKey(tabId, TAB_STORAGE.BALANCE),     // stereo balance
    getTabStorageKey(tabId, TAB_STORAGE.CHANNEL_MODE),// channel mode (stereo/mono/swap)
    getTabStorageKey(tabId, TAB_STORAGE.SPEED)        // playback speed
  ];
  try {
    await browserAPI.storage.local.remove(keysToRemove);
  } catch (e) {
    console.error('[TabVolume] Failed to remove tab storage keys:', e.message);
  }

  // Remove from tabs with media tracking
  tabsWithMedia.delete(tabId);

  // Clean up fullscreen state tracking (don't restore window state — tab is already gone)
  fullscreenStateByTab.delete(tabId);

  // Clear tracked tab if it was closed (Active Tab Audio mode continues)
  if (focusModeState.active && focusModeState.lastActiveTabId === tabId) {
    focusModeState.lastActiveTabId = null;
    try {
      await browserAPI.storage.session.set({ activeTabAudioLastTabId: null });
    } catch (e) {
      // Session storage might not be available
    }
    // onActivated will handle unmuting the next active tab
  }

  // Notify offscreen to clean up all captures for this tab (Chrome only)
  // TAB_REMOVED cleans up both visualizer and Tab Capture audio pipelines
  if (!isFirefox && chrome.offscreen) {
    try {
      const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
      });
      if (existingContexts.length > 0) {
        chrome.runtime.sendMessage({
          type: 'TAB_REMOVED',
          tabId: tabId
        }).catch(() => {}); // Ignore errors if offscreen not ready
      }
    } catch (e) {
      // Ignore errors
    }
  }
});

// Active Tab Audio mode - mute previous tab, unmute new active tab
browserAPI.tabs.onActivated.addListener(async (activeInfo) => {
  // Check session storage for state (survives service worker restarts)
  let isActive = focusModeState.active;
  let previousTabId = focusModeState.lastActiveTabId;

  // If local state is false, check session storage (service worker may have restarted)
  if (!isActive) {
    try {
      const stored = await browserAPI.storage.session.get(['activeTabAudioMode', 'activeTabAudioLastTabId']);
      isActive = stored.activeTabAudioMode || false;
      const storedTabId = stored.activeTabAudioLastTabId;
      previousTabId = isValidTabId(storedTabId) ? storedTabId : null;
      if (isActive) {
        focusModeState.active = true;
        focusModeState.lastActiveTabId = previousTabId;
      }
    } catch (e) {
      // Session storage error - continue with local state
    }
  }

  if (!isActive) return;

  const newActiveTabId = activeInfo.tabId;

  // Update tracked active tab immediately (before async work) to prevent race
  // conditions when multiple onActivated events fire in rapid succession
  focusModeState.lastActiveTabId = newActiveTabId;

  // Mute the previous active tab (if different and exists)
  if (previousTabId && previousTabId !== newActiveTabId) {
    try {
      await browserAPI.tabs.update(previousTabId, { muted: true });
      // Also mute Tab Capture (bypasses browser mute)
      if (!isFirefox) {
        try {
          await chrome.runtime.sendMessage({
            type: 'SET_TAB_CAPTURE_VOLUME',
            tabId: previousTabId,
            volume: 0
          });
        } catch (tcErr) {
          // Tab might not have Tab Capture active
        }
      }
    } catch (e) {
      // Tab might have been closed
    }
  }

  // Unmute the new active tab
  try {
    await browserAPI.tabs.update(newActiveTabId, { muted: false });
    // Also restore Tab Capture volume
    if (!isFirefox) {
      try {
        const savedVolume = await getTabVolume(newActiveTabId);
        await chrome.runtime.sendMessage({
          type: 'SET_TAB_CAPTURE_VOLUME',
          tabId: newActiveTabId,
          volume: savedVolume
        });
      } catch (tcErr) {
        // Tab might not have Tab Capture active
      }
    }
  } catch (e) {
    // Tab error
  }

  // Persist to session storage (local state already updated above, before async work)
  try {
    await browserAPI.storage.session.set({ activeTabAudioLastTabId: newActiveTabId });
  } catch (e) {
    // Session storage error
  }
});

// Update Tab Capture pending indicator when switching tabs
browserAPI.tabs.onActivated.addListener(async (activeInfo) => {
  await updateTabCaptureIndicator(activeInfo.tabId);
});

// Active Tab Audio mode - handle window focus changes (cross-window tab switching)
browserAPI.windows.onFocusChanged.addListener(async (windowId) => {
  // Ignore when focus is lost (no window has focus)
  if (windowId === browserAPI.windows.WINDOW_ID_NONE) return;

  // Check if Active Tab Audio mode is enabled
  let isActive = focusModeState.active;
  let previousTabId = focusModeState.lastActiveTabId;

  // If local state is false, check session storage (service worker may have restarted)
  if (!isActive) {
    try {
      const stored = await browserAPI.storage.session.get(['activeTabAudioMode', 'activeTabAudioLastTabId']);
      isActive = stored.activeTabAudioMode || false;
      const storedTabId = stored.activeTabAudioLastTabId;
      previousTabId = isValidTabId(storedTabId) ? storedTabId : null;
      if (isActive) {
        focusModeState.active = true;
        focusModeState.lastActiveTabId = previousTabId;
      }
    } catch (e) {
      // Session storage error - continue with local state
    }
  }

  if (!isActive) return;

  // Get the active tab in the newly focused window
  try {
    const tabs = await browserAPI.tabs.query({ active: true, windowId: windowId });
    if (tabs.length === 0) return;

    const newActiveTabId = tabs[0].id;

    // Skip if it's the same tab (user just clicked the same window again)
    if (newActiveTabId === previousTabId) return;

    // Mute the previous active tab
    if (previousTabId) {
      try {
        await browserAPI.tabs.update(previousTabId, { muted: true });
        if (!isFirefox) {
          try {
            await chrome.runtime.sendMessage({
              type: 'SET_TAB_CAPTURE_VOLUME',
              tabId: previousTabId,
              volume: 0
            });
          } catch (tcErr) {
            // Tab might not have Tab Capture active
          }
        }
      } catch (e) {
        // Tab might have been closed
      }
    }

    // Unmute the new active tab
    try {
      await browserAPI.tabs.update(newActiveTabId, { muted: false });
      if (!isFirefox) {
        try {
          const savedVolume = await getTabVolume(newActiveTabId);
          await chrome.runtime.sendMessage({
            type: 'SET_TAB_CAPTURE_VOLUME',
            tabId: newActiveTabId,
            volume: savedVolume
          });
        } catch (tcErr) {
          // Tab might not have Tab Capture active
        }
      }
    } catch (e) {
      // Tab error
    }

    // Update tracked active tab
    focusModeState.lastActiveTabId = newActiveTabId;
    try {
      await browserAPI.storage.session.set({ activeTabAudioLastTabId: newActiveTabId });
    } catch (e) {
      // Session storage error
    }
  } catch (e) {
    // Query error
  }
});

// Handle tab mute state changes - unmute media elements when tab is manually unmuted
browserAPI.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only handle mute state changes
  if (!changeInfo.mutedInfo) return;

  // When tab is unmuted, also unmute media elements and restore Tab Capture volume
  if (changeInfo.mutedInfo.muted === false) {
    try {
      await browserAPI.tabs.sendMessage(tabId, { type: 'UNMUTE_MEDIA' });
      console.log('[TabVolume] Tab unmuted, sent UNMUTE_MEDIA to tab:', tabId);
    } catch (e) {
      // Content script might not be loaded - that's OK
    }

    // Also restore Tab Capture volume to saved value (Chrome only)
    if (!isFirefox) {
      try {
        const savedVolume = await getTabVolume(tabId);
        await chrome.runtime.sendMessage({
          type: 'SET_TAB_CAPTURE_VOLUME',
          tabId: tabId,
          volume: savedVolume
        });
        console.log('[TabVolume] Tab unmuted, restored Tab Capture volume to:', savedVolume);
      } catch (tcErr) {
        // Tab might not have Tab Capture active - that's fine
      }
    }
  }
});

// Handle tab updates (navigation, refresh)
browserAPI.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    log('Tab update complete for tabId:', tabId, 'URL:', tab.url);
    let volume = await getTabVolume(tabId);
    log('Current stored volume for tab:', volume);

    // Check for site volume rules - only apply on first visit to a domain, not on navigation within site
    let ruleDeviceLabel = '';
    if (tab.url) {
      try {
        const currentDomain = getValidatedHostname(tab.url);
        log('Current domain:', currentDomain);
        if (!currentDomain) {
          // Invalid URL, skip rule application
          log('Invalid domain, skipping rule application');
          return;
        }

        const ruleAppliedKey = getTabStorageKey(tabId, TAB_STORAGE.RULE_APPLIED);
        const ruleResult = await browserAPI.storage.local.get([ruleAppliedKey]);
        const lastAppliedDomain = ruleResult[ruleAppliedKey];
        log('Last applied domain:', lastAppliedDomain, '| Current domain:', currentDomain, '| Same?', lastAppliedDomain === currentDomain);

        // Only apply rule if this is a new domain (not navigation within same site)
        if (lastAppliedDomain !== currentDomain) {
          log('Domain changed, checking for matching rule...');
          const matchedRule = await applyMatchingSiteRule(tabId, tab.url);
          if (matchedRule) {
            volume = matchedRule.rule.volume;
            ruleDeviceLabel = matchedRule.deviceLabel;
          }
          // If no rule matched, don't store domain - allows rules added later to apply
        } else {
          log('Domain unchanged, skipping rule check (already applied for this domain)');
        }
      } catch (e) {
        log('Error during rule application:', e.message);
        // Invalid URL, skip rule application
      }
    }

    // Update badge - shows Tab Capture pending indicator or volume
    await updateTabCaptureIndicator(tabId);

    // Get saved device for this tab (handles both old string format and new object format)
    const deviceKey = getTabStorageKey(tabId, TAB_STORAGE.DEVICE);
    const deviceResult = await browserAPI.storage.local.get([deviceKey]);
    const savedDevice = deviceResult[deviceKey];

    // Extract deviceId and deviceLabel from storage
    let deviceId = '';
    let deviceLabel = ruleDeviceLabel; // Use rule device if just applied
    if (savedDevice) {
      if (typeof savedDevice === 'string') {
        // Old format - just device ID
        deviceId = savedDevice;
      } else {
        // New format - object with deviceId and deviceLabel
        deviceId = savedDevice.deviceId || '';
        deviceLabel = savedDevice.deviceLabel || '';
      }
    }

    // If no tab-specific device and no rule device, check for global default (local - device-specific)
    if (!deviceId && !deviceLabel) {
      const globalSettings = await browserAPI.storage.local.get(['useLastDeviceAsDefault', 'globalDefaultDevice']);
      if (globalSettings.useLastDeviceAsDefault && globalSettings.globalDefaultDevice) {
        const globalDefault = globalSettings.globalDefaultDevice;
        deviceId = globalDefault.deviceId || '';
        deviceLabel = globalDefault.deviceLabel || '';
        console.log('[TabVolume] Applying global default device on navigation:', deviceLabel);

        // Save as tab-specific device so it persists
        if (deviceLabel) {
          await browserAPI.storage.local.set({
            [deviceKey]: { deviceId, deviceLabel }
          });
        }
      }
    }

    // Re-send all settings to content script after navigation
    await sendTabSettingsToContentScript(tabId, volume, deviceId, deviceLabel);
  }
});

// Chrome-only: Offscreen document management for audio device enumeration
// Uses a promise-based lock to prevent race conditions when multiple callers
// try to create the offscreen document simultaneously
let offscreenDocumentLock = null;

async function setupOffscreenDocument() {
  // Only available in Chrome
  if (isFirefox || !chrome.offscreen) {
    return false;
  }

  // If another call is in progress, wait for it and return its result
  // This must be checked BEFORE any async operations to prevent race window
  if (offscreenDocumentLock) {
    return offscreenDocumentLock;
  }

  // Create the lock immediately (synchronously) before any async work
  let resolveLock;
  offscreenDocumentLock = new Promise(resolve => { resolveLock = resolve; });

  try {
    const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');

    // Check if already exists
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [offscreenUrl]
    });

    if (existingContexts.length > 0) {
      resolveLock(true);
      return true;
    }

    // Create the document
    await chrome.offscreen.createDocument({
      url: offscreenUrl,
      reasons: ['USER_MEDIA'],
      justification: 'Enumerate audio output devices and Tab Capture for visualizer'
    });
    // Small delay to ensure the offscreen JS has loaded and registered its listeners
    await new Promise(resolve => setTimeout(resolve, 100));
    resolveLock(true);
    return true;
  } catch (e) {
    // Document may already exist (created between our check and create call)
    if (e.message && e.message.includes('single offscreen')) {
      resolveLock(true);
      return true;
    }
    resolveLock(false);
    throw e;
  } finally {
    offscreenDocumentLock = null;
  }
}

// Check if Tab Capture is currently active for a tab (Chrome only)
async function isTabCaptureActive(tabId) {
  if (isFirefox || !chrome.offscreen) {
    return false;
  }

  try {
    const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [offscreenUrl]
    });

    if (existingContexts.length === 0) {
      return false;
    }

    const response = await chrome.runtime.sendMessage({
      type: 'GET_VISUALIZER_CAPTURE_STATUS',
      tabId: tabId
    });

    return response && response.isActive;
  } catch (e) {
    return false;
  }
}

// Initiate Tab Capture for a tab (Chrome only, requires user gesture context)
// This is called from keyboard shortcuts which provide user gesture context
// Per-tab lock prevents concurrent initiation from rapid key presses
const tabCaptureInitLocks = new Map();

async function initiateTabCaptureFromKeyboard(tabId) {
  if (isFirefox || !chrome.tabCapture) {
    return false;
  }

  // If already initiating for this tab, wait for the existing operation
  if (tabCaptureInitLocks.has(tabId)) {
    return tabCaptureInitLocks.get(tabId);
  }

  const initPromise = (async () => {
    try {
      // Ensure offscreen document exists
      await setupOffscreenDocument();

      // Get the media stream ID (requires user gesture - keyboard shortcut provides this)
      const streamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId: tabId
      });

      if (!streamId) {
        console.log('[TabVolume] Keyboard shortcut: No stream ID returned');
        return false;
      }

      // Send to offscreen document to start capture
      const response = await chrome.runtime.sendMessage({
        type: 'START_VISUALIZER_CAPTURE',
        streamId: streamId,
        tabId: tabId
      });

      console.log('[TabVolume] Keyboard shortcut initiated Tab Capture for tab', tabId);

      // Clear the pending indicator now that Tab Capture is active
      if (response && response.success) {
        await updateTabCaptureIndicator(tabId);
        // Sync stored tab settings to the offscreen document
        await syncStoredSettingsToTabCapture(tabId);
      }

      return response && response.success;
    } catch (e) {
      console.error('[TabVolume] Keyboard shortcut Tab Capture failed:', e);
      return false;
    }
  })();

  tabCaptureInitLocks.set(tabId, initPromise);
  try {
    return await initPromise;
  } finally {
    tabCaptureInitLocks.delete(tabId);
  }
}

async function getAudioDevicesViaOffscreen(requestPermission) {
  // Only available in Chrome
  if (isFirefox || !chrome.offscreen) {
    return { success: false, error: 'Offscreen API not available', useContentScript: true };
  }

  try {
    await setupOffscreenDocument();

    const response = await chrome.runtime.sendMessage({
      type: 'GET_AUDIO_DEVICES',
      requestPermission: requestPermission
    });

    return response;
  } catch (e) {
    return { success: false, error: e.message, useContentScript: true };
  }
}

// Get audio devices via content script (Chrome fallback)
async function getAudioDevicesViaContentScript(tabId, requestPermission) {
  try {
    const response = await browserAPI.tabs.sendMessage(tabId, {
      type: 'GET_DEVICES',
      requestPermission: requestPermission
    });
    return {
      success: true,
      devices: response.devices || [],
      permissionGranted: response.devices && response.devices.length > 0 &&
                         response.devices.some(d => d.label && !d.label.includes('Audio Device'))
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Get audio devices directly in background script (Firefox only)
// Firefox background scripts are event pages with full DOM access, not service workers
async function getAudioDevicesDirectly(requestPermission) {
  try {
    if (!navigator.mediaDevices) {
      return { success: false, error: 'mediaDevices not available' };
    }

    let permissionGranted = false;
    if (requestPermission) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        permissionGranted = true;
      } catch (e) {
        // Permission denied or dismissed - continue anyway
        console.debug('[TabVolume] getUserMedia error:', e.name, e.message);
      }
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioOutputs = devices
      .filter(d => d.kind === 'audiooutput')
      .map(d => ({
        deviceId: d.deviceId,
        label: d.label || `Audio Device ${d.deviceId.slice(0, 8) || 'Unknown'}...`,
        groupId: d.groupId
      }));

    // Check if we have real labels
    const hasLabels = audioOutputs.some(d => d.label && !d.label.includes('Audio Device'));

    return {
      success: true,
      devices: audioOutputs,
      permissionGranted: permissionGranted || hasLabels
    };
  } catch (e) {
    console.error('[TabVolume] Direct device enumeration error:', e);
    return { success: false, error: e.message };
  }
}

// Validate message sender is from within our extension
function isValidSender(sender) {
  // Must be from our extension
  if (sender.id !== browserAPI.runtime.id) {
    return false;
  }
  return true;
}

// Validate message type is a known type
const VALID_MESSAGE_TYPES = [
  'REQUEST_AUDIO_DEVICES', 'DEVICE_NOT_FOUND', 'GET_VOLUME', 'SET_VOLUME',
  'GET_TAB_ID', 'GET_AUDIBLE_TABS',
  'MUTE_OTHER_TABS', 'UNMUTE_OTHER_TABS', 'GET_FOCUS_STATE',
  'HAS_MEDIA', 'CONTENT_READY', 'VOLUME_CHANGED',
  'GET_TAB_CAPTURE_PREF', 'SET_TAB_CAPTURE_PREF',
  // Persistent visualizer Tab Capture (offscreen document)
  'START_PERSISTENT_VISUALIZER_CAPTURE', 'STOP_PERSISTENT_VISUALIZER_CAPTURE',
  'GET_PERSISTENT_VISUALIZER_DATA', 'GET_PERSISTENT_VISUALIZER_STATUS',
  // Tab Capture audio control (offscreen document)
  'SET_TAB_CAPTURE_VOLUME', 'SET_TAB_CAPTURE_BASS', 'SET_TAB_CAPTURE_TREBLE',
  'SET_TAB_CAPTURE_VOICE', 'SET_TAB_CAPTURE_BALANCE', 'SET_TAB_CAPTURE_DEVICE',
  'SET_TAB_CAPTURE_COMPRESSOR', 'SET_TAB_CAPTURE_CHANNEL_MODE', 'GET_TAB_CAPTURE_MODE', 'GET_EFFECTIVE_MODE',
  // Fullscreen workaround (Tab Capture mode)
  'FULLSCREEN_CHANGE',
  // Pending site rule application (from popup)
  'APPLY_PENDING_SITE_RULE'
];

function isValidMessageType(type) {
  return typeof type === 'string' && VALID_MESSAGE_TYPES.includes(type);
}

// ==================== Message Rate Limiting ====================

// Track last message time per type per tab (defense against message flooding)
const messageThrottles = new Map();
let lastThrottleCleanup = 0;
const THROTTLE_INTERVAL_MS = 30; // Max ~33 messages/sec per type per tab
const THROTTLED_MESSAGE_TYPES = ['SET_VOLUME', 'VOLUME_CHANGED']; // High-frequency types

function shouldThrottleMessage(type, tabId) {
  if (!THROTTLED_MESSAGE_TYPES.includes(type)) {
    return false; // Don't throttle this type
  }

  const key = `${type}:${tabId || 'popup'}`;
  const now = Date.now();
  const lastTime = messageThrottles.get(key) || 0;

  if (now - lastTime < THROTTLE_INTERVAL_MS) {
    return true; // Throttle this message
  }

  messageThrottles.set(key, now);

  // Cleanup old entries periodically (avoid running on every message when nothing to clean)
  if (messageThrottles.size > 100 && (now - lastThrottleCleanup) > 10000) {
    lastThrottleCleanup = now;
    const cutoff = now - 5000; // Remove entries older than 5 seconds
    // Collect keys to delete first to avoid modifying Map during iteration
    const keysToDelete = [];
    for (const [k, v] of messageThrottles) {
      if (v < cutoff) keysToDelete.push(k);
    }
    for (const k of keysToDelete) {
      messageThrottles.delete(k);
    }
  }

  return false;
}

// Handle messages from popup and content scripts
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Security: Validate sender is from our extension
  if (!isValidSender(sender)) {
    console.warn('[TabVolume] Ignoring message from unknown sender:', sender.id);
    return false;
  }

  // Security: Validate message type
  if (!request || !isValidMessageType(request.type)) {
    console.warn('[TabVolume] Invalid message type:', request?.type);
    return false;
  }

  // Security: Rate limit high-frequency message types
  if (shouldThrottleMessage(request.type, sender.tab?.id)) {
    return false; // Silently drop throttled messages
  }

  // Handle request for audio devices (from popup)
  if (request.type === 'REQUEST_AUDIO_DEVICES') {
    (async () => {
      // Firefox: enumerate directly in background script (event page has DOM access)
      if (isFirefox) {
        const result = await getAudioDevicesDirectly(request.requestPermission);
        sendResponse(result);
        return;
      }

      // Chrome: try offscreen document first
      if (chrome.offscreen) {
        const result = await getAudioDevicesViaOffscreen(request.requestPermission);
        if (result.success || !result.useContentScript) {
          sendResponse(result);
          return;
        }
      }

      // Chrome fallback: use content script
      const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        const result = await getAudioDevicesViaContentScript(tabs[0].id, request.requestPermission);
        sendResponse(result);
      } else {
        sendResponse({ success: false, error: 'No active tab' });
      }
    })();
    return true;
  }

  // Handle device not found notification from content script
  if (request.type === 'DEVICE_NOT_FOUND') {
    const tabId = sender.tab?.id;
    if (tabId) {
      const deviceKey = getTabStorageKey(tabId, TAB_STORAGE.DEVICE);
      browserAPI.storage.local.remove([deviceKey]).then(() => {
        console.log('[TabVolume] Cleared stale device ID for tab:', tabId);
      }).catch(e => {
        console.error('[TabVolume] Failed to clear stale device ID:', e.message);
      });
    }
    sendResponse({ success: true });
    return true;
  }

  if (request.type === 'GET_VOLUME') {
    const tabId = request.tabId;
    if (!isValidTabId(tabId)) {
      sendResponse({ volume: 100 }); // Default to 100% for invalid tabId
      return false;
    }
    getTabVolume(tabId).then(volume => {
      sendResponse({ volume });
    }).catch(e => {
      console.error('[TabVolume] Failed to get volume:', e.message);
      sendResponse({ volume: 100 }); // Default to 100% on error
    });
    return true;
  }

  if (request.type === 'SET_VOLUME') {
    const tabId = request.tabId;
    const volume = request.volume;
    if (!isValidTabId(tabId)) {
      sendResponse({ success: false, error: 'Invalid tab ID' });
      return false;
    }
    if (!Number.isFinite(volume)) {
      sendResponse({ success: false, error: 'Invalid volume' });
      return false;
    }
    setTabVolume(tabId, volume).then(() => {
      sendResponse({ success: true });
    }).catch(e => {
      console.error('[TabVolume] Failed to set volume:', e.message);
      sendResponse({ success: false, error: e.message });
    });
    return true;
  }

  // Return the tab ID to the content script (used for per-tab mode detection)
  if (request.type === 'GET_TAB_ID') {
    const tabId = sender.tab?.id;
    sendResponse({ tabId: tabId || null });
    return false; // Synchronous response
  }

  // Get all tabs currently playing audio
  if (request.type === 'GET_AUDIBLE_TABS') {
    (async () => {
      try {
        // Get audible tabs
        const audibleTabs = await browserAPI.tabs.query({ audible: true });
        const includedTabIds = new Set(audibleTabs.map(t => t.id));

        // Get tabs with media (may include paused media)
        const mediaTabs = [];
        for (const tabId of tabsWithMedia) {
          if (!includedTabIds.has(tabId)) {
            try {
              const tab = await browserAPI.tabs.get(tabId);
              mediaTabs.push(tab);
              includedTabIds.add(tabId);
            } catch (e) {
              // Tab no longer exists, remove from tracking
              tabsWithMedia.delete(tabId);
            }
          }
        }

        // Combine and return
        const allTabs = [...audibleTabs, ...mediaTabs];
        sendResponse({ tabs: allTabs });
      } catch (e) {
        sendResponse({ tabs: [] });
      }
    })();
    return true;
  }

  // Mute Other Tabs - mute all tabs except current (one-way, no restore tracking)
  if (request.type === 'MUTE_OTHER_TABS') {
    (async () => {
      try {
        const currentTabId = request.currentTabId;
        if (!isValidTabId(currentTabId)) {
          sendResponse({ success: false, error: 'Invalid tab ID' });
          return;
        }
        const tabs = await browserAPI.tabs.query({});

        // Mute all other tabs that aren't already muted
        let mutedCount = 0;
        for (const tab of tabs) {
          if (tab.id === currentTabId) continue;
          if (tab.mutedInfo?.muted) continue;
          try {
            await browserAPI.tabs.update(tab.id, { muted: true });
            mutedCount++;
            // Also mute Tab Capture session if active (Tab Capture audio bypasses browser mute)
            if (!isFirefox) {
              try {
                await chrome.runtime.sendMessage({
                  type: 'SET_TAB_CAPTURE_VOLUME',
                  tabId: tab.id,
                  volume: 0
                });
              } catch (tcErr) {
                // Tab might not have Tab Capture active
              }
            }
          } catch (muteErr) {
            // Tab might have been closed
          }
        }

        // Set Active Tab Audio mode state (local and session storage)
        focusModeState.active = true;
        focusModeState.lastActiveTabId = currentTabId;
        try {
          await browserAPI.storage.session.set({
            activeTabAudioMode: true,
            activeTabAudioLastTabId: currentTabId
          });
        } catch (e) {
          // Session storage error
        }

        sendResponse({ success: true, mutedCount });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  // Get Focus State - check if Active Tab Audio mode is enabled
  if (request.type === 'GET_FOCUS_STATE') {
    (async () => {
      let isActive = focusModeState.active;
      // Check session storage if local state is false (service worker may have restarted)
      if (!isActive) {
        try {
          const stored = await browserAPI.storage.session.get(['activeTabAudioMode']);
          isActive = stored.activeTabAudioMode || false;
          if (isActive) {
            focusModeState.active = true;
          }
        } catch (e) {
          // Session storage might not be available
        }
      }
      sendResponse({ success: true, active: isActive });
    })();
    return true;
  }

  // Unmute Other Tabs - unmute all muted tabs except current (for focus toggle)
  if (request.type === 'UNMUTE_OTHER_TABS') {
    (async () => {
      try {
        const currentTabId = request.currentTabId;
        if (!isValidTabId(currentTabId)) {
          sendResponse({ success: false, error: 'Invalid tab ID' });
          return;
        }
        const tabs = await browserAPI.tabs.query({});

        // Unmute all other tabs that are muted and restore saved volumes
        let unmutedCount = 0;
        for (const tab of tabs) {
          if (tab.id === currentTabId) continue;
          if (!tab.mutedInfo?.muted) continue;
          try {
            await browserAPI.tabs.update(tab.id, { muted: false });
            unmutedCount++;
            // Also restore Tab Capture volume if active
            if (!isFirefox) {
              try {
                const savedVolume = await getTabVolume(tab.id);
                await chrome.runtime.sendMessage({
                  type: 'SET_TAB_CAPTURE_VOLUME',
                  tabId: tab.id,
                  volume: savedVolume
                });
              } catch (tcErr) {
                // Tab might not have Tab Capture active
              }
            }
          } catch (unmuteErr) {
            // Tab might have been closed
          }
        }

        // Clear Active Tab Audio mode state (local and session storage)
        focusModeState.active = false;
        focusModeState.lastActiveTabId = null;
        try {
          await browserAPI.storage.session.remove(['activeTabAudioMode', 'activeTabAudioLastTabId']);
        } catch (e) {
          // Session storage error
        }

        sendResponse({ success: true, unmutedCount });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  // Track tabs that have media elements (for showing paused media in tab list)
  if (request.type === 'HAS_MEDIA') {
    const tabId = sender.tab?.id;
    if (tabId) {
      tabsWithMedia.add(tabId);
    }
    sendResponse({ success: true });
    return true;
  }

  // Get per-site tabCapture preference
  if (request.type === 'GET_TAB_CAPTURE_PREF') {
    (async () => {
      const hostname = request.hostname;
      if (!hostname) {
        sendResponse({ enabled: false });
        return;
      }

      const sanitized = sanitizeHostname(hostname);
      if (!sanitized) {
        sendResponse({ enabled: false });
        return;
      }

      try {
        const result = await browserAPI.storage.local.get(['tabCaptureSites']);
        const sites = result.tabCaptureSites || {};
        sendResponse({ enabled: !!sites[sanitized] });
      } catch (e) {
        sendResponse({ enabled: false });
      }
    })();
    return true;
  }

  // Set per-site tabCapture preference
  if (request.type === 'SET_TAB_CAPTURE_PREF') {
    (async () => {
      const hostname = request.hostname;
      const enabled = request.enabled;

      if (!hostname) {
        sendResponse({ success: false });
        return;
      }

      const sanitized = sanitizeHostname(hostname);
      if (!sanitized) {
        sendResponse({ success: false });
        return;
      }

      try {
        const result = await browserAPI.storage.local.get(['tabCaptureSites']);
        const sites = result.tabCaptureSites || {};

        if (enabled) {
          sites[sanitized] = true;
          // Prune oldest entries if map exceeds 500 domains
          const keys = Object.keys(sites);
          if (keys.length > 500) {
            const excess = keys.length - 500;
            for (let i = 0; i < excess; i++) {
              delete sites[keys[i]];
            }
          }
        } else {
          delete sites[sanitized];
        }

        await browserAPI.storage.local.set({ tabCaptureSites: sites });
        console.log('[TabVolume] tabCapture preference saved for', sanitized, ':', enabled);
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  // Get effective audio mode for a hostname (considers default mode and all overrides)
  if (request.type === 'GET_EFFECTIVE_MODE') {
    (async () => {
      const hostname = request.hostname;
      if (!hostname) {
        sendResponse({ success: false, mode: null });
        return;
      }

      try {
        const mode = await getEffectiveModeForDomain(hostname);
        sendResponse({ success: true, mode: mode });
      } catch (e) {
        sendResponse({ success: false, mode: null, error: e.message });
      }
    })();
    return true;
  }

  // ==================== Persistent Visualizer Tab Capture (via Offscreen) ====================

  // Start persistent visualizer capture (offscreen document manages the stream)
  if (request.type === 'START_PERSISTENT_VISUALIZER_CAPTURE') {
    (async () => {
      const tabId = request.tabId;
      if (!isValidTabId(tabId)) {
        sendResponse({ success: false, error: 'No tab ID provided' });
        return;
      }

      if (isFirefox) {
        sendResponse({ success: false, error: 'tabCapture not supported in Firefox' });
        return;
      }

      try {
        // Ensure offscreen document exists
        await setupOffscreenDocument();

        // Get the media stream ID
        const streamId = await chrome.tabCapture.getMediaStreamId({
          targetTabId: tabId
        });

        if (!streamId) {
          sendResponse({ success: false, error: 'No stream ID returned' });
          return;
        }

        // Send to offscreen document to start capture
        const response = await chrome.runtime.sendMessage({
          type: 'START_VISUALIZER_CAPTURE',
          streamId: streamId,
          tabId: tabId
        });

        console.log('[TabVolume] Persistent visualizer capture started for tab', tabId);

        // Clear the pending indicator now that Tab Capture is active
        if (response && response.success) {
          await updateTabCaptureIndicator(tabId);
          // Sync stored tab settings (volume, effects) to the offscreen document
          // so the Tab Capture pipeline matches any previously applied site rules
          await syncStoredSettingsToTabCapture(tabId);
        }

        sendResponse(response);
      } catch (e) {
        console.error('[TabVolume] Persistent visualizer capture failed:', e);
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  // Stop persistent visualizer capture
  if (request.type === 'STOP_PERSISTENT_VISUALIZER_CAPTURE') {
    (async () => {
      const tabId = request.tabId;
      if (!isValidTabId(tabId)) {
        sendResponse({ success: false, error: 'No tab ID provided' });
        return;
      }

      if (isFirefox) {
        sendResponse({ success: true });
        return;
      }

      try {
        await setupOffscreenDocument();
        const response = await chrome.runtime.sendMessage({
          type: 'STOP_VISUALIZER_CAPTURE',
          tabId: tabId
        });
        console.log('[TabVolume] Persistent visualizer capture stopped for tab', tabId);
        sendResponse(response);
      } catch (e) {
        console.error('[TabVolume] Error stopping persistent visualizer capture:', e);
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  // Get visualizer data from persistent capture
  if (request.type === 'GET_PERSISTENT_VISUALIZER_DATA') {
    (async () => {
      const tabId = request.tabId;
      if (!isValidTabId(tabId)) {
        sendResponse({ success: false, frequencyData: null, waveformData: null });
        return;
      }

      if (isFirefox) {
        sendResponse({ success: false, frequencyData: null, waveformData: null });
        return;
      }

      try {
        // Check if offscreen exists before querying
        const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');
        const existingContexts = await chrome.runtime.getContexts({
          contextTypes: ['OFFSCREEN_DOCUMENT'],
          documentUrls: [offscreenUrl]
        });

        if (existingContexts.length === 0) {
          sendResponse({ success: false, frequencyData: null, waveformData: null, isActive: false });
          return;
        }

        const response = await chrome.runtime.sendMessage({
          type: 'GET_VISUALIZER_DATA',
          tabId: tabId
        });
        sendResponse(response);
      } catch (e) {
        sendResponse({ success: false, frequencyData: null, waveformData: null, error: e.message });
      }
    })();
    return true;
  }

  // Check if persistent visualizer capture is active for a tab
  if (request.type === 'GET_PERSISTENT_VISUALIZER_STATUS') {
    (async () => {
      const tabId = request.tabId;
      if (!isValidTabId(tabId)) {
        sendResponse({ isActive: false });
        return;
      }

      if (isFirefox) {
        sendResponse({ isActive: false });
        return;
      }

      try {
        // Check if offscreen exists
        const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');
        const existingContexts = await chrome.runtime.getContexts({
          contextTypes: ['OFFSCREEN_DOCUMENT'],
          documentUrls: [offscreenUrl]
        });

        if (existingContexts.length === 0) {
          sendResponse({ isActive: false });
          return;
        }

        const response = await chrome.runtime.sendMessage({
          type: 'GET_VISUALIZER_CAPTURE_STATUS',
          tabId: tabId
        });
        sendResponse(response);
      } catch (e) {
        sendResponse({ isActive: false });
      }
    })();
    return true;
  }

  // ==================== Tab Capture Audio Control ====================
  // Route audio control messages to offscreen document

  if (request.type === 'SET_TAB_CAPTURE_VOLUME' ||
      request.type === 'SET_TAB_CAPTURE_BASS' ||
      request.type === 'SET_TAB_CAPTURE_TREBLE' ||
      request.type === 'SET_TAB_CAPTURE_VOICE' ||
      request.type === 'SET_TAB_CAPTURE_BALANCE' ||
      request.type === 'SET_TAB_CAPTURE_DEVICE' ||
      request.type === 'SET_TAB_CAPTURE_COMPRESSOR' ||
      request.type === 'SET_TAB_CAPTURE_CHANNEL_MODE') {
    (async () => {
      if (isFirefox) {
        sendResponse({ success: false, error: 'Not supported in Firefox' });
        return;
      }

      // Validate tabId for all Tab Capture messages
      if (!isValidTabId(request.tabId)) {
        sendResponse({ success: false, error: 'Invalid tab ID' });
        return;
      }

      // Validate type-specific parameters before forwarding
      if (request.type === 'SET_TAB_CAPTURE_VOLUME') {
        if (!Number.isFinite(request.volume) || request.volume < VOLUME_MIN || request.volume > VOLUME_MAX) {
          sendResponse({ success: false, error: 'Invalid volume value' });
          return;
        }
      } else if (request.type === 'SET_TAB_CAPTURE_BASS' ||
                 request.type === 'SET_TAB_CAPTURE_TREBLE') {
        if (!Number.isFinite(request.gain) || request.gain < EFFECT_RANGES.bass.min || request.gain > EFFECT_RANGES.bass.max) {
          sendResponse({ success: false, error: 'Invalid gain value' });
          return;
        }
      } else if (request.type === 'SET_TAB_CAPTURE_VOICE') {
        if (!Number.isFinite(request.gain) || request.gain < EFFECT_RANGES.voice.min || request.gain > EFFECT_RANGES.voice.max) {
          sendResponse({ success: false, error: 'Invalid gain value' });
          return;
        }
      } else if (request.type === 'SET_TAB_CAPTURE_BALANCE') {
        if (!Number.isFinite(request.pan) || request.pan < -1 || request.pan > 1) {
          sendResponse({ success: false, error: 'Invalid balance value' });
          return;
        }
      } else if (request.type === 'SET_TAB_CAPTURE_DEVICE') {
        if (request.deviceId !== null && (typeof request.deviceId !== 'string' || request.deviceId.length > 500)) {
          sendResponse({ success: false, error: 'Invalid device ID' });
          return;
        }
      } else if (request.type === 'SET_TAB_CAPTURE_COMPRESSOR') {
        const validPresets = ['off', 'podcast', 'movie', 'maximum'];
        if (typeof request.preset !== 'string' || !validPresets.includes(request.preset)) {
          sendResponse({ success: false, error: 'Invalid compressor preset' });
          return;
        }
      } else if (request.type === 'SET_TAB_CAPTURE_CHANNEL_MODE') {
        const validModes = ['stereo', 'mono', 'swap'];
        if (typeof request.mode !== 'string' || !validModes.includes(request.mode)) {
          sendResponse({ success: false, error: 'Invalid channel mode' });
          return;
        }
      }

      try {
        // Route to offscreen (parameters validated)
        const response = await chrome.runtime.sendMessage(request);
        sendResponse(response);
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  if (request.type === 'GET_TAB_CAPTURE_MODE') {
    (async () => {
      if (isFirefox) {
        sendResponse({ success: true, isTabCaptureMode: false });
        return;
      }

      if (!isValidTabId(request.tabId)) {
        sendResponse({ success: false, isTabCaptureMode: false });
        return;
      }

      try {
        // Check if offscreen exists
        const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');
        const existingContexts = await chrome.runtime.getContexts({
          contextTypes: ['OFFSCREEN_DOCUMENT'],
          documentUrls: [offscreenUrl]
        });

        if (existingContexts.length === 0) {
          sendResponse({ success: true, isTabCaptureMode: false });
          return;
        }

        const response = await chrome.runtime.sendMessage({
          type: 'GET_TAB_CAPTURE_MODE',
          tabId: request.tabId
        });
        sendResponse(response);
      } catch (e) {
        sendResponse({ success: true, isTabCaptureMode: false });
      }
    })();
    return true;
  }

  if (request.type === 'CONTENT_READY') {
    // Content script is ready, send current volume and device
    if (!sender.tab) return false;
    const tabId = sender.tab.id;
    const deviceKey = getTabStorageKey(tabId, TAB_STORAGE.DEVICE);
    Promise.all([
      getTabVolume(tabId),
      browserAPI.storage.local.get([deviceKey]),
      browserAPI.storage.local.get(['useLastDeviceAsDefault', 'globalDefaultDevice'])
    ]).then(([volume, deviceResult, globalSettings]) => {
      updateBadge(tabId, volume);

      // Handle both old format (string) and new format (object with deviceId and deviceLabel)
      const savedDevice = deviceResult[deviceKey];
      let deviceId = '';
      let deviceLabel = '';
      if (savedDevice) {
        if (typeof savedDevice === 'string') {
          deviceId = savedDevice;
        } else {
          deviceId = savedDevice.deviceId || '';
          deviceLabel = savedDevice.deviceLabel || '';
        }
      }

      // If no tab-specific device, check for global default
      if (!deviceId && !deviceLabel && globalSettings.useLastDeviceAsDefault && globalSettings.globalDefaultDevice) {
        const globalDefault = globalSettings.globalDefaultDevice;
        deviceId = globalDefault.deviceId || '';
        deviceLabel = globalDefault.deviceLabel || '';
        console.log('[TabVolume] Applying global default device to tab', tabId, ':', deviceLabel);

        // Save as tab-specific device so it persists
        if (deviceLabel) {
          browserAPI.storage.local.set({
            [deviceKey]: { deviceId, deviceLabel }
          });
        }
      }

      sendResponse({
        volume,
        deviceId,
        deviceLabel
      });
    }).catch((e) => {
      console.error('[TabVolume] CONTENT_READY failed:', e);
      sendResponse({ volume: 100, deviceId: '', deviceLabel: '' });
    });
    return true;
  }

  // Handle pending site rule application (from popup — user clicked icon on red badge tab)
  if (request.type === 'APPLY_PENDING_SITE_RULE') {
    (async () => {
      const tabId = request.tabId;
      if (!isValidTabId(tabId)) {
        sendResponse({ success: false });
        return;
      }
      try {
        const tab = await browserAPI.tabs.get(tabId);
        if (!tab.url) {
          sendResponse({ success: false });
          return;
        }
        // Check if rule was already applied to this tab (don't re-apply on subsequent popup opens)
        const currentDomain = getValidatedHostname(tab.url);
        const ruleAppliedKey = getTabStorageKey(tabId, TAB_STORAGE.RULE_APPLIED);
        const appliedResult = await browserAPI.storage.local.get([ruleAppliedKey]);
        if (appliedResult[ruleAppliedKey] === currentDomain) {
          sendResponse({ success: false });
          return;
        }
        const ruleResult = await applyMatchingSiteRule(tabId, tab.url);
        if (ruleResult) {
          // Send settings to content script so the audio pipeline reflects the rule
          await sendTabSettingsToContentScript(tabId, ruleResult.rule.volume, '', ruleResult.deviceLabel);
          await updateBadge(tabId, ruleResult.rule.volume, tab.url);
          sendResponse({ success: true, volume: ruleResult.rule.volume });
        } else {
          sendResponse({ success: false });
        }
      } catch (e) {
        sendResponse({ success: false });
      }
    })();
    return true;
  }

  // Handle fullscreen workaround for Tab Capture mode (Chrome only)
  // Tab Capture prevents true fullscreen on video elements, so we toggle browser
  // fullscreen (F11 equivalent) using chrome.windows.update()
  if (request.type === 'FULLSCREEN_CHANGE' && !isFirefox && sender.tab) {
    if (typeof request.isFullscreen !== 'boolean') return false;
    const tabId = sender.tab.id;
    const windowId = sender.tab.windowId;

    if (request.isFullscreen) {
      // Entering fullscreen — check if window is already fullscreen (e.g. user pressed F11)
      browserAPI.windows.get(windowId).then(win => {
        if (win.state === 'fullscreen') {
          // Already fullscreen, don't track — we didn't cause it
          return;
        }
        // Save previous state so we can restore on exit
        fullscreenStateByTab.set(tabId, win.state); // 'maximized' or 'normal'
        // Inject CSS to force the fullscreen container to fill the actual viewport.
        // This is more reliable than resize events because CSS rules are declarative —
        // they apply continuously as the viewport changes, without timing issues.
        // Only targets :fullscreen (the container), NOT :fullscreen video — overriding
        // video element sizing breaks players like YouTube that use transforms/positioning.
        const fullscreenCSS = ':fullscreen { width: 100vw !important; height: 100vh !important; }';
        browserAPI.scripting.insertCSS({
          target: { tabId },
          css: fullscreenCSS
        }).catch(() => {});

        browserAPI.windows.update(windowId, { state: 'fullscreen' }).then(() => {
          // Also dispatch resize events so video players that listen for resize
          // can recalculate their internal layout (controls positioning, etc.)
          const dispatchResize = () => {
            browserAPI.scripting.executeScript({
              target: { tabId, allFrames: true },
              func: () => {
                window.dispatchEvent(new Event('resize'));
              },
              world: 'MAIN'
            }).catch(() => {});
          };
          setTimeout(dispatchResize, 100);
          setTimeout(dispatchResize, 500);
          setTimeout(dispatchResize, 1000);
        });
      }).catch(() => {});
    } else {
      // Exiting fullscreen — restore previous window state if we triggered the fullscreen
      const previousState = fullscreenStateByTab.get(tabId);
      fullscreenStateByTab.delete(tabId);
      if (previousState) {
        // Remove the injected fullscreen CSS override
        const fullscreenCSS = ':fullscreen { width: 100vw !important; height: 100vh !important; }';
        browserAPI.scripting.removeCSS({
          target: { tabId },
          css: fullscreenCSS
        }).catch(() => {});
        browserAPI.windows.update(windowId, { state: previousState }).catch(() => {});
      }
    }
    return false;
  }

  return false;
});

// Handle keyboard shortcuts
browserAPI.commands.onCommand.addListener(async (command) => {
  const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  // Check if we should auto-initiate Tab Capture (Chrome only)
  // Only initiate if: mode is 'tabcapture', not Firefox, and not already active
  if (!isFirefox && tab.url) {
    try {
      const url = new URL(tab.url);
      // Skip chrome://, edge://, about:, etc.
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        const effectiveMode = await getEffectiveModeForDomain(url.hostname);

        // Only auto-initiate Tab Capture if mode is 'tabcapture'
        // Do NOT initiate for 'webaudio' or 'off' modes
        if (effectiveMode === 'tabcapture') {
          const isActive = await isTabCaptureActive(tab.id);
          if (!isActive) {
            // Initiate Tab Capture - keyboard shortcut provides user gesture context
            await initiateTabCaptureFromKeyboard(tab.id);
          }
        }
      }
    } catch (e) {
      // Invalid URL or other error - continue with volume change anyway
      console.log('[TabVolume] Keyboard shortcut: Could not check/initiate Tab Capture:', e.message);
    }
  }

  let volume = await getTabVolume(tab.id);

  switch (command) {
    case 'volume-up':
      volume = Math.min(VOLUME_MAX, volume + keyboardStep);
      break;
    case 'volume-down':
      volume = Math.max(VOLUME_MIN, volume - keyboardStep);
      break;
    case 'toggle-mute':
      // Store previous volume for unmuting
      if (volume === 0) {
        const prevKey = getTabStorageKey(tab.id, TAB_STORAGE.PREV);
        const result = await browserAPI.storage.local.get([prevKey]);
        volume = result[prevKey] || VOLUME_DEFAULT;
        await browserAPI.storage.local.remove([prevKey]);
      } else {
        const prevKey = getTabStorageKey(tab.id, TAB_STORAGE.PREV);
        await browserAPI.storage.local.set({ [prevKey]: volume });
        volume = 0;
      }
      break;
  }

  await setTabVolume(tab.id, volume);
});

// ==================== Page Script Injection ====================
// Inject page-script.js into pages ONLY if the domain is not disabled
// This runs early on navigation to intercept audio APIs before they're used

// ==================== Per-Default Mode Override System ====================
// Each default mode has its own override lists (except Off which is shared)
//
// Storage keys:
//   disabledDomains: []                    - Shared Off list (used by Tab Capture & Web Audio defaults)
//   tabCaptureDefault_webAudioSites: []    - Web Audio overrides when Tab Capture is default
//   webAudioDefault_tabCaptureSites: []    - Tab Capture overrides when Web Audio is default
//   offDefault_tabCaptureSites: []         - Tab Capture overrides when Off is default
//   offDefault_webAudioSites: []           - Web Audio overrides when Off is default

// Get the effective audio mode for a domain based on current default mode
async function getEffectiveModeForDomain(hostname) {
  if (!hostname || typeof hostname !== 'string') return null;

  try {
    const result = await browserAPI.storage.sync.get([
      'defaultAudioMode',
      'disabledDomains',
      'tabCaptureDefault_webAudioSites',
      'webAudioDefault_tabCaptureSites',
      'offDefault_tabCaptureSites',
      'offDefault_webAudioSites'
    ]);

    const defaultMode = result.defaultAudioMode || DEFAULT_AUDIO_MODE_CHROME;
    const disabledDomains = result.disabledDomains || [];

    // Check based on current default mode
    if (defaultMode === 'tabcapture') {
      // Tab Capture is default - check for Web Audio or Off overrides
      const webAudioSites = result.tabCaptureDefault_webAudioSites || [];
      if (disabledDomains.includes(hostname)) return 'off';
      if (webAudioSites.includes(hostname)) return 'webaudio';
      return 'tabcapture'; // Default

    } else if (defaultMode === 'auto') {
      // Web Audio is default - check for Tab Capture or Off overrides
      const tabCaptureSites = result.webAudioDefault_tabCaptureSites || [];
      if (disabledDomains.includes(hostname)) return 'off';
      if (tabCaptureSites.includes(hostname)) return 'tabcapture';
      return 'webaudio'; // Default

    } else {
      // Off is default - check for Tab Capture or Web Audio overrides
      const tabCaptureSites = result.offDefault_tabCaptureSites || [];
      const webAudioSites = result.offDefault_webAudioSites || [];
      if (tabCaptureSites.includes(hostname)) return 'tabcapture';
      if (webAudioSites.includes(hostname)) return 'webaudio';
      return 'off'; // Default
    }
  } catch (e) {
    console.error('[TabVolume] Error getting effective mode:', e);
    return null;
  }
}

// Check if a domain is in the disabled list (Off mode)
async function isDomainDisabled(hostname) {
  if (!hostname) return false;
  const effectiveMode = await getEffectiveModeForDomain(hostname);
  return effectiveMode === 'off';
}

// Inject page-script.js into a tab
async function injectPageScript(tabId, frameId = 0) {
  try {
    await browserAPI.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      files: ['content/page-script.js'],
      world: 'MAIN',
      injectImmediately: true
    });
  } catch (e) {
    // Tab might be a restricted page (chrome://, about:, etc.)
    // This is expected and can be silently ignored
  }
}

// Listen for navigation to inject page-script.js early
browserAPI.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Inject on 'loading' status to catch audio APIs as early as possible
  if (changeInfo.status !== 'loading') return;

  // Skip restricted URLs
  const url = tab.url || tab.pendingUrl;
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
      url.startsWith('about:') || url.startsWith('moz-extension://') ||
      url.startsWith('edge://') || url.startsWith('file://')) {
    return;
  }

  // Get hostname and check if disabled
  const hostname = getValidatedHostname(url);
  if (!hostname) return;

  const disabled = await isDomainDisabled(hostname);
  if (disabled) {
    console.log('[TabVolume] Domain disabled, skipping page-script injection:', hostname);
    return;
  }

  // Inject page-script.js
  await injectPageScript(tabId);
});

// Chrome-only: Close any existing offscreen document
async function closeOffscreenDocument() {
  if (isFirefox || !chrome.offscreen) {
    return;
  }

  const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) {
    await chrome.offscreen.closeDocument();
    console.log('[TabVolume] Closed existing offscreen document');
  }
}

// Migrate old autoModeDomains to new per-default storage structure
// This runs on install/update to preserve existing user data
async function migrateAutoModeDomains() {
  try {
    const result = await browserAPI.storage.sync.get([
      'autoModeDomains',
      'tabCaptureDefault_webAudioSites',
      'autoModeDomains_migrated'
    ]);

    // Skip if already migrated or no data to migrate
    if (result.autoModeDomains_migrated) return;
    if (!result.autoModeDomains || result.autoModeDomains.length === 0) {
      // Mark as migrated even if empty
      await browserAPI.storage.sync.set({ autoModeDomains_migrated: true });
      return;
    }

    // Migrate autoModeDomains to tabCaptureDefault_webAudioSites
    // (assumes Tab Capture was the default when these were set)
    const existingSites = result.tabCaptureDefault_webAudioSites || [];
    const migratedSites = [...new Set([...existingSites, ...result.autoModeDomains])];

    await browserAPI.storage.sync.set({
      tabCaptureDefault_webAudioSites: migratedSites,
      autoModeDomains_migrated: true
    });

    console.log('[TabVolume] Migrated', result.autoModeDomains.length, 'autoModeDomains to tabCaptureDefault_webAudioSites');
  } catch (e) {
    console.error('[TabVolume] Error migrating autoModeDomains:', e);
  }
}

// Clean up stale tab storage keys (orphaned from crashed/force-quit sessions)
async function cleanupStaleTabKeys() {
  try {
    const tabs = await browserAPI.tabs.query({});
    const validTabIds = new Set(tabs.map(t => t.id));

    const allStorage = await browserAPI.storage.local.get(null);
    const keysToRemove = [];

    // Find all tab_* keys that don't belong to open tabs
    for (const key of Object.keys(allStorage)) {
      if (key.startsWith('tab_')) {
        // Extract tab ID from key (handles tab_123, tab_123_prev, tab_123_device, etc.)
        const match = key.match(/^tab_(\d+)/);
        if (match) {
          const tabId = parseInt(match[1], 10);
          // Skip if parsing failed or value is unreasonable
          if (!isValidTabId(tabId)) continue;
          if (!validTabIds.has(tabId)) {
            keysToRemove.push(key);
          }
        }
      }
    }

    if (keysToRemove.length > 0) {
      await browserAPI.storage.local.remove(keysToRemove);
      console.log('[TabVolume] Cleaned up', keysToRemove.length, 'stale tab storage keys');
    }
  } catch (e) {
    console.error('[TabVolume] Error cleaning up stale keys:', e);
  }
}

// Clear ruleAppliedDomain keys on update so Site Rules are re-evaluated
// This is needed because if a user visits a site before creating a rule,
// the domain was stored and would prevent the rule from ever being applied
async function clearRuleAppliedDomains() {
  try {
    const allStorage = await browserAPI.storage.local.get(null);
    const keysToRemove = [];

    for (const key of Object.keys(allStorage)) {
      if (key.includes('_ruleAppliedDomain')) {
        keysToRemove.push(key);
      }
    }

    if (keysToRemove.length > 0) {
      await browserAPI.storage.local.remove(keysToRemove);
      console.log('[TabVolume] Cleared', keysToRemove.length, 'ruleAppliedDomain keys for rule re-evaluation');
    }
  } catch (e) {
    console.error('[TabVolume] Error clearing ruleAppliedDomain keys:', e);
  }
}

// Initialize on install/update
browserAPI.runtime.onInstalled.addListener(async (details) => {
  // Chrome-only: Close offscreen document on update to ensure fresh code
  if (!isFirefox && details.reason === 'update') {
    await closeOffscreenDocument();
    console.log('[TabVolume] Extension updated to version', browserAPI.runtime.getManifest().version);
  }

  // Fresh install: log it
  if (details.reason === 'install') {
    console.log('[TabVolume] Fresh install');
  }

  // Clear ruleAppliedDomain keys on update so Site Rules are re-evaluated
  // This ensures newly created rules will apply on existing domains
  if (details.reason === 'update') {
    await clearRuleAppliedDomains();
  }

  // Migrate old autoModeDomains to new per-default storage structure
  await migrateAutoModeDomains();

  // Clean up stale tab storage keys from previous sessions
  await cleanupStaleTabKeys();

  // Update badge for existing tabs
  const tabs = await browserAPI.tabs.query({});
  for (const tab of tabs) {
    const volume = await getTabVolume(tab.id);
    await updateBadge(tab.id, volume);
  }

  // Create context menus
  createContextMenus();
});

// ==================== Context Menu ====================

// Use contextMenus API (compatible with both Chrome and Firefox)
const contextMenusAPI = browserAPI.contextMenus || browserAPI.menus;

// Default presets moved to top of file (near line 27)

// Menu contexts
const MENU_CONTEXTS = ['page', 'audio', 'video'];

// Create all context menu items
async function createContextMenus() {
  if (!contextMenusAPI) {
    console.log('[TabVolume] Context menus not available');
    return;
  }

  // Load user presets from storage
  const storage = await browserAPI.storage.sync.get([
    'customPresets',
    'bassBoostPresets',
    'bassCutPresets',
    'trebleBoostPresets',
    'trebleCutPresets',
    'voiceBoostPresets',
    'speedSlowPresets',
    'speedFastPresets'
  ]);

  const volumePresets = storage.customPresets || DEFAULT_VOLUME_PRESETS;
  const bassPresets = storage.bassBoostPresets || DEFAULT_BASS_PRESETS;
  const bassCutPresets = storage.bassCutPresets || DEFAULT_BASS_CUT_PRESETS;
  const treblePresets = storage.trebleBoostPresets || DEFAULT_TREBLE_PRESETS;
  const trebleCutPresets = storage.trebleCutPresets || DEFAULT_TREBLE_CUT_PRESETS;
  const voicePresets = storage.voiceBoostPresets || DEFAULT_VOICE_PRESETS;
  const speedSlowPresets = storage.speedSlowPresets || DEFAULT_SPEED_SLOW_PRESETS;
  const speedFastPresets = storage.speedFastPresets || DEFAULT_SPEED_FAST_PRESETS;

  // Remove existing menus first
  contextMenusAPI.removeAll(() => {
    // Parent menu
    contextMenusAPI.create({
      id: 'tabVolumeParent',
      title: 'Per-Tab Audio Control',
      contexts: MENU_CONTEXTS
    });

    // ========== Volume Submenu ==========
    contextMenusAPI.create({
      id: 'volumeSubmenu',
      parentId: 'tabVolumeParent',
      title: 'Volume',
      contexts: MENU_CONTEXTS
    });

    // Mute option
    contextMenusAPI.create({
      id: 'volume_0',
      parentId: 'volumeSubmenu',
      title: 'Mute (0%)',
      contexts: MENU_CONTEXTS
    });

    // User's volume presets (validate each before creating menu item)
    volumePresets.forEach((vol) => {
      const validVol = validateVolume(vol);
      // Skip if validation changed the value significantly (indicates corrupted data)
      if (typeof vol !== 'number' || isNaN(vol)) return;
      contextMenusAPI.create({
        id: `volume_${validVol}`,
        parentId: 'volumeSubmenu',
        title: `${validVol}%`,
        contexts: MENU_CONTEXTS
      });
    });

    // Separator
    contextMenusAPI.create({
      id: 'sep1',
      parentId: 'tabVolumeParent',
      type: 'separator',
      contexts: MENU_CONTEXTS
    });

    // ========== Balance Submenu ==========
    contextMenusAPI.create({
      id: 'balanceSubmenu',
      parentId: 'tabVolumeParent',
      title: 'Balance',
      contexts: MENU_CONTEXTS
    });

    const balanceOptions = [
      { id: 'balance_-100', title: 'Full Left' },
      { id: 'balance_-50', title: 'Left 50%' },
      { id: 'balance_0', title: 'Center' },
      { id: 'balance_50', title: 'Right 50%' },
      { id: 'balance_100', title: 'Full Right' }
    ];
    balanceOptions.forEach(opt => {
      contextMenusAPI.create({
        id: opt.id,
        parentId: 'balanceSubmenu',
        title: opt.title,
        contexts: MENU_CONTEXTS
      });
    });

    // ========== Channel Mode Submenu ==========
    contextMenusAPI.create({
      id: 'channelSubmenu',
      parentId: 'tabVolumeParent',
      title: 'Channel Mode',
      contexts: MENU_CONTEXTS
    });

    const channelOptions = [
      { id: 'channel_stereo', title: 'Stereo' },
      { id: 'channel_mono', title: 'Mono' },
      { id: 'channel_swap', title: 'Swap L/R' }
    ];
    channelOptions.forEach(opt => {
      contextMenusAPI.create({
        id: opt.id,
        parentId: 'channelSubmenu',
        title: opt.title,
        contexts: MENU_CONTEXTS
      });
    });

    // Separator
    contextMenusAPI.create({
      id: 'sep2',
      parentId: 'tabVolumeParent',
      type: 'separator',
      contexts: MENU_CONTEXTS
    });

    // ========== Bass Boost Submenu ==========
    contextMenusAPI.create({
      id: 'bassBoostSubmenu',
      parentId: 'tabVolumeParent',
      title: 'Bass Boost',
      contexts: MENU_CONTEXTS
    });

    contextMenusAPI.create({
      id: 'bassBoost_off',
      parentId: 'bassBoostSubmenu',
      title: 'Off',
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: 'bassBoost_low',
      parentId: 'bassBoostSubmenu',
      title: `Low (+${bassPresets[0]}dB)`,
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: 'bassBoost_medium',
      parentId: 'bassBoostSubmenu',
      title: `Medium (+${bassPresets[1]}dB)`,
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: 'bassBoost_high',
      parentId: 'bassBoostSubmenu',
      title: `High (+${bassPresets[2]}dB)`,
      contexts: MENU_CONTEXTS
    });

    // ========== Bass Cut Submenu ==========
    contextMenusAPI.create({
      id: 'bassCutSubmenu',
      parentId: 'tabVolumeParent',
      title: 'Bass Cut',
      contexts: MENU_CONTEXTS
    });

    contextMenusAPI.create({
      id: 'bassCut_off',
      parentId: 'bassCutSubmenu',
      title: 'Off',
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: 'bassCut_low',
      parentId: 'bassCutSubmenu',
      title: `Low (${bassCutPresets[0]}dB)`,
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: 'bassCut_medium',
      parentId: 'bassCutSubmenu',
      title: `Medium (${bassCutPresets[1]}dB)`,
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: 'bassCut_high',
      parentId: 'bassCutSubmenu',
      title: `High (${bassCutPresets[2]}dB)`,
      contexts: MENU_CONTEXTS
    });

    // ========== Treble Boost Submenu ==========
    contextMenusAPI.create({
      id: 'trebleBoostSubmenu',
      parentId: 'tabVolumeParent',
      title: 'Treble Boost',
      contexts: MENU_CONTEXTS
    });

    contextMenusAPI.create({
      id: 'trebleBoost_off',
      parentId: 'trebleBoostSubmenu',
      title: 'Off',
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: 'trebleBoost_low',
      parentId: 'trebleBoostSubmenu',
      title: `Low (+${treblePresets[0]}dB)`,
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: 'trebleBoost_medium',
      parentId: 'trebleBoostSubmenu',
      title: `Medium (+${treblePresets[1]}dB)`,
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: 'trebleBoost_high',
      parentId: 'trebleBoostSubmenu',
      title: `High (+${treblePresets[2]}dB)`,
      contexts: MENU_CONTEXTS
    });

    // ========== Treble Cut Submenu ==========
    contextMenusAPI.create({
      id: 'trebleCutSubmenu',
      parentId: 'tabVolumeParent',
      title: 'Treble Cut',
      contexts: MENU_CONTEXTS
    });

    contextMenusAPI.create({
      id: 'trebleCut_off',
      parentId: 'trebleCutSubmenu',
      title: 'Off',
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: 'trebleCut_low',
      parentId: 'trebleCutSubmenu',
      title: `Low (${trebleCutPresets[0]}dB)`,
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: 'trebleCut_medium',
      parentId: 'trebleCutSubmenu',
      title: `Medium (${trebleCutPresets[1]}dB)`,
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: 'trebleCut_high',
      parentId: 'trebleCutSubmenu',
      title: `High (${trebleCutPresets[2]}dB)`,
      contexts: MENU_CONTEXTS
    });

    // ========== Voice Boost Submenu ==========
    contextMenusAPI.create({
      id: 'voiceBoostSubmenu',
      parentId: 'tabVolumeParent',
      title: 'Voice Boost',
      contexts: MENU_CONTEXTS
    });

    contextMenusAPI.create({
      id: 'voiceBoost_off',
      parentId: 'voiceBoostSubmenu',
      title: 'Off',
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: 'voiceBoost_low',
      parentId: 'voiceBoostSubmenu',
      title: `Low (+${voicePresets[0]}dB)`,
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: 'voiceBoost_medium',
      parentId: 'voiceBoostSubmenu',
      title: `Medium (+${voicePresets[1]}dB)`,
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: 'voiceBoost_high',
      parentId: 'voiceBoostSubmenu',
      title: `High (+${voicePresets[2]}dB)`,
      contexts: MENU_CONTEXTS
    });

    // ========== Speed Submenu ==========
    contextMenusAPI.create({
      id: 'speedSubmenu',
      parentId: 'tabVolumeParent',
      title: 'Speed',
      contexts: MENU_CONTEXTS
    });

    contextMenusAPI.create({
      id: 'speed_1',
      parentId: 'speedSubmenu',
      title: 'Normal (1x)',
      contexts: MENU_CONTEXTS
    });

    // Separator between normal and slow
    contextMenusAPI.create({
      id: 'speedSep1',
      parentId: 'speedSubmenu',
      type: 'separator',
      contexts: MENU_CONTEXTS
    });

    speedSlowPresets.forEach((rate, i) => {
      const labels = ['Low', 'Medium', 'High'];
      contextMenusAPI.create({
        id: `speed_${rate}`,
        parentId: 'speedSubmenu',
        title: `Slow ${labels[i] || ''} (${rate}x)`,
        contexts: MENU_CONTEXTS
      });
    });

    // Separator between slow and fast
    contextMenusAPI.create({
      id: 'speedSep2',
      parentId: 'speedSubmenu',
      type: 'separator',
      contexts: MENU_CONTEXTS
    });

    speedFastPresets.forEach((rate, i) => {
      const labels = ['Low', 'Medium', 'High'];
      contextMenusAPI.create({
        id: `speed_${rate}`,
        parentId: 'speedSubmenu',
        title: `Fast ${labels[i] || ''} (${rate}x)`,
        contexts: MENU_CONTEXTS
      });
    });

    // ========== Range Submenu ==========
    contextMenusAPI.create({
      id: 'rangeSubmenu',
      parentId: 'tabVolumeParent',
      title: 'Range',
      contexts: MENU_CONTEXTS
    });

    contextMenusAPI.create({
      id: 'compressor_off',
      parentId: 'rangeSubmenu',
      title: 'Off',
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: 'compressor_podcast',
      parentId: 'rangeSubmenu',
      title: 'Podcast',
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: 'compressor_movie',
      parentId: 'rangeSubmenu',
      title: 'Movie',
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: 'compressor_maximum',
      parentId: 'rangeSubmenu',
      title: 'Max',
      contexts: MENU_CONTEXTS
    });

    // Separator
    contextMenusAPI.create({
      id: 'sep3',
      parentId: 'tabVolumeParent',
      type: 'separator',
      contexts: MENU_CONTEXTS
    });

    // ========== Action Items ==========
    contextMenusAPI.create({
      id: 'togglePlayback',
      parentId: 'tabVolumeParent',
      title: 'Pause/Play',
      contexts: MENU_CONTEXTS
    });

    contextMenusAPI.create({
      id: 'toggleFocusMode',
      parentId: 'tabVolumeParent',
      title: 'Toggle Focus Mode',
      contexts: MENU_CONTEXTS
    });

    contextMenusAPI.create({
      id: 'resetTab',
      parentId: 'tabVolumeParent',
      title: 'Reset Tab to Defaults',
      contexts: MENU_CONTEXTS
    });

    // Separator
    contextMenusAPI.create({
      id: 'sep4',
      parentId: 'tabVolumeParent',
      type: 'separator',
      contexts: MENU_CONTEXTS
    });

    // ========== Domain Control ==========
    contextMenusAPI.create({
      id: 'enableBypassMode',
      parentId: 'tabVolumeParent',
      title: 'Disable Audio Processing',
      contexts: MENU_CONTEXTS
    });

    // Only show Tab Capture option on Chrome (not Firefox)
    if (!isFirefox) {
      contextMenusAPI.create({
        id: 'enableTabCapture',
        parentId: 'tabVolumeParent',
        title: 'Enable Tab Capture Mode',
        contexts: MENU_CONTEXTS
      });
    }

    contextMenusAPI.create({
      id: 'enableWebAudio',
      parentId: 'tabVolumeParent',
      title: 'Enable Web Audio Mode',
      contexts: MENU_CONTEXTS
    });

    // Separator
    contextMenusAPI.create({
      id: 'sep5',
      parentId: 'tabVolumeParent',
      type: 'separator',
      contexts: MENU_CONTEXTS
    });

    // ========== Navigation ==========
    contextMenusAPI.create({
      id: 'prevTab',
      parentId: 'tabVolumeParent',
      title: '← Previous Audio Tab',
      contexts: MENU_CONTEXTS
    });

    contextMenusAPI.create({
      id: 'nextTab',
      parentId: 'tabVolumeParent',
      title: '→ Next Audio Tab',
      contexts: MENU_CONTEXTS
    });

    // Separator
    contextMenusAPI.create({
      id: 'sep6',
      parentId: 'tabVolumeParent',
      type: 'separator',
      contexts: MENU_CONTEXTS
    });

    contextMenusAPI.create({
      id: 'openOptions',
      parentId: 'tabVolumeParent',
      title: 'Open Settings',
      contexts: MENU_CONTEXTS
    });

    console.log('[TabVolume] Context menus created');
  });
}

// Listen for storage changes to update menus when presets change
browserAPI.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync') {
    const presetKeys = ['customPresets', 'bassBoostPresets', 'bassCutPresets', 'trebleBoostPresets', 'trebleCutPresets', 'voiceBoostPresets', 'speedSlowPresets', 'speedFastPresets'];
    if (presetKeys.some(key => changes[key])) {
      console.log('[TabVolume] Presets changed, rebuilding context menus');
      createContextMenus();
    }
    // Update badges for all tabs when site rules change (shows/hides red pending badge)
    if (changes.siteVolumeRules) {
      browserAPI.tabs.query({}).then(tabs => {
        tabs.forEach(tab => {
          if (tab.id) updateTabCaptureIndicator(tab.id);
        });
      });
    }
    // Refresh all tab badges when badge style changes
    if (changes.badgeStyle) {
      browserAPI.tabs.query({}).then(tabs => {
        tabs.forEach(tab => {
          if (tab.id) updateTabCaptureIndicator(tab.id);
        });
      });
    }
  }
});

// Handle context menu clicks
if (contextMenusAPI) {
  contextMenusAPI.onClicked.addListener(async (info, tab) => {
    if (!tab || !tab.id || !isValidTabId(tab.id)) return;

    const menuItemId = String(info.menuItemId);

    // ========== Volume ==========
    if (menuItemId.startsWith('volume_')) {
      const volume = parseInt(menuItemId.replace('volume_', ''), 10);
      const validatedVolume = validateVolume(volume);
      await setTabVolume(tab.id, validatedVolume);
      await updateBadge(tab.id, validatedVolume);
      return;
    }

    // Helper: resolve effect level name to gain value using user presets
    async function resolveEffectGain(effect, level) {
      if (level === 'off') return 0;
      const storage = await browserAPI.storage.sync.get([
        'bassBoostPresets', 'bassCutPresets', 'trebleBoostPresets', 'trebleCutPresets', 'voiceBoostPresets'
      ]);
      const presetMap = {
        'bass': storage.bassBoostPresets || DEFAULT_BASS_PRESETS,
        'bassCut': storage.bassCutPresets || DEFAULT_BASS_CUT_PRESETS,
        'treble': storage.trebleBoostPresets || DEFAULT_TREBLE_PRESETS,
        'trebleCut': storage.trebleCutPresets || DEFAULT_TREBLE_CUT_PRESETS,
        'voice': storage.voiceBoostPresets || DEFAULT_VOICE_PRESETS
      };
      const presets = presetMap[effect] || [0, 0, 0];
      const index = level === 'low' ? 0 : level === 'medium' ? 1 : 2;
      return presets[index] || 0;
    }

    // Helper: forward effect to Tab Capture offscreen if active (Chrome only)
    async function forwardToTabCapture(tabId, type, params) {
      if (isFirefox) return;
      try {
        const active = await isTabCaptureActive(tabId);
        if (active) {
          chrome.runtime.sendMessage({ type, tabId, ...params }).catch(() => {});
        }
      } catch (e) {
        // Tab Capture not available or not active — skip
      }
    }

    // ========== Compressor ==========
    if (menuItemId.startsWith('compressor_')) {
      const preset = menuItemId.replace('compressor_', '');
      const validCompressorPresets = ['off', 'podcast', 'movie', 'maximum'];
      if (!validCompressorPresets.includes(preset)) return;
      // Store to local storage (popup reads this)
      const storageKey = getTabStorageKey(tab.id, TAB_STORAGE.COMPRESSOR);
      await browserAPI.storage.local.set({ [storageKey]: preset });
      // Send to content script
      try {
        await browserAPI.tabs.sendMessage(tab.id, { type: 'SET_COMPRESSOR', preset });
      } catch (e) {
        console.log('[TabVolume] Could not set compressor:', e.message);
      }
      // Forward to Tab Capture
      await forwardToTabCapture(tab.id, 'SET_TAB_CAPTURE_COMPRESSOR', { preset });
      return;
    }

    // ========== Voice Boost ==========
    if (menuItemId.startsWith('voiceBoost_')) {
      const level = menuItemId.replace('voiceBoost_', '');
      const gain = await resolveEffectGain('voice', level);
      // Store level string (popup reads this)
      const storageKey = getTabStorageKey(tab.id, TAB_STORAGE.VOICE);
      await browserAPI.storage.local.set({ [storageKey]: level });
      // Send to content script
      try {
        await browserAPI.tabs.sendMessage(tab.id, { type: 'SET_VOICE', gain });
      } catch (e) {
        console.log('[TabVolume] Could not set voice boost:', e.message);
      }
      // Forward to Tab Capture
      await forwardToTabCapture(tab.id, 'SET_TAB_CAPTURE_VOICE', { gain });
      return;
    }

    // ========== Bass Boost ==========
    if (menuItemId.startsWith('bassBoost_')) {
      const level = menuItemId.replace('bassBoost_', '');
      const gain = await resolveEffectGain('bass', level);
      // Store level string (popup reads this)
      const storageKey = getTabStorageKey(tab.id, TAB_STORAGE.BASS);
      await browserAPI.storage.local.set({ [storageKey]: level });
      // Send to content script
      try {
        await browserAPI.tabs.sendMessage(tab.id, { type: 'SET_BASS', gain });
      } catch (e) {
        console.log('[TabVolume] Could not set bass boost:', e.message);
      }
      // Forward to Tab Capture
      await forwardToTabCapture(tab.id, 'SET_TAB_CAPTURE_BASS', { gain });
      return;
    }

    // ========== Bass Cut ==========
    if (menuItemId.startsWith('bassCut_')) {
      const level = menuItemId.replace('bassCut_', '');
      const gain = await resolveEffectGain('bassCut', level);
      // Store as cut-level format (popup reads this for the bass key)
      const storageKey = getTabStorageKey(tab.id, TAB_STORAGE.BASS);
      const storageLevel = level === 'off' ? 'off' : `cut-${level}`;
      await browserAPI.storage.local.set({ [storageKey]: storageLevel });
      // Send to content script (bassCut presets are already negative)
      try {
        await browserAPI.tabs.sendMessage(tab.id, { type: 'SET_BASS', gain });
      } catch (e) {
        console.log('[TabVolume] Could not set bass cut:', e.message);
      }
      // Forward to Tab Capture
      await forwardToTabCapture(tab.id, 'SET_TAB_CAPTURE_BASS', { gain });
      return;
    }

    // ========== Treble Boost ==========
    if (menuItemId.startsWith('trebleBoost_')) {
      const level = menuItemId.replace('trebleBoost_', '');
      const gain = await resolveEffectGain('treble', level);
      // Store level string (popup reads this)
      const storageKey = getTabStorageKey(tab.id, TAB_STORAGE.TREBLE);
      await browserAPI.storage.local.set({ [storageKey]: level });
      // Send to content script
      try {
        await browserAPI.tabs.sendMessage(tab.id, { type: 'SET_TREBLE', gain });
      } catch (e) {
        console.log('[TabVolume] Could not set treble boost:', e.message);
      }
      // Forward to Tab Capture
      await forwardToTabCapture(tab.id, 'SET_TAB_CAPTURE_TREBLE', { gain });
      return;
    }

    // ========== Treble Cut ==========
    if (menuItemId.startsWith('trebleCut_')) {
      const level = menuItemId.replace('trebleCut_', '');
      const gain = await resolveEffectGain('trebleCut', level);
      // Store as cut-level format (popup reads this for the treble key)
      const storageKey = getTabStorageKey(tab.id, TAB_STORAGE.TREBLE);
      const storageLevel = level === 'off' ? 'off' : `cut-${level}`;
      await browserAPI.storage.local.set({ [storageKey]: storageLevel });
      // Send to content script (trebleCut presets are already negative)
      try {
        await browserAPI.tabs.sendMessage(tab.id, { type: 'SET_TREBLE', gain });
      } catch (e) {
        console.log('[TabVolume] Could not set treble cut:', e.message);
      }
      // Forward to Tab Capture
      await forwardToTabCapture(tab.id, 'SET_TAB_CAPTURE_TREBLE', { gain });
      return;
    }

    // ========== Balance ==========
    if (menuItemId.startsWith('balance_')) {
      const balance = parseInt(menuItemId.replace('balance_', ''), 10);
      if (!Number.isFinite(balance) || balance < -100 || balance > 100) return;
      // Store raw -100..100 value (popup reads this)
      const balanceKey = getTabStorageKey(tab.id, TAB_STORAGE.BALANCE);
      await browserAPI.storage.local.set({ [balanceKey]: balance });
      // Convert to -1..1 for content script and Tab Capture
      const pan = balance / 100;
      // Send to content script
      try {
        await browserAPI.tabs.sendMessage(tab.id, { type: 'SET_BALANCE', pan });
      } catch (e) {
        console.log('[TabVolume] Could not set balance:', e.message);
      }
      // Forward to Tab Capture
      await forwardToTabCapture(tab.id, 'SET_TAB_CAPTURE_BALANCE', { pan });
      return;
    }

    // ========== Channel Mode ==========
    if (menuItemId.startsWith('channel_')) {
      const mode = menuItemId.replace('channel_', '');
      const validChannelModes = ['stereo', 'mono', 'swap'];
      if (!validChannelModes.includes(mode)) return;
      // Store mode string (popup reads this)
      const modeKey = getTabStorageKey(tab.id, TAB_STORAGE.CHANNEL_MODE);
      await browserAPI.storage.local.set({ [modeKey]: mode });
      // Send to content script
      try {
        await browserAPI.tabs.sendMessage(tab.id, { type: 'SET_CHANNEL_MODE', mode });
      } catch (e) {
        console.log('[TabVolume] Could not set channel mode:', e.message);
      }
      // Forward to Tab Capture
      await forwardToTabCapture(tab.id, 'SET_TAB_CAPTURE_CHANNEL_MODE', { mode });
      return;
    }

    // ========== Speed ==========
    if (menuItemId.startsWith('speed_')) {
      const rate = parseFloat(menuItemId.replace('speed_', ''));
      if (!Number.isFinite(rate) || rate < EFFECT_RANGES.speed.min || rate > EFFECT_RANGES.speed.max) return;
      // Store as level string matching popup format
      const speedLevel = rate === 1 ? 'off' : `slider:${rate}`;
      const speedKey = getTabStorageKey(tab.id, TAB_STORAGE.SPEED);
      await browserAPI.storage.local.set({ [speedKey]: speedLevel });
      // Send to content script
      try {
        await browserAPI.tabs.sendMessage(tab.id, { type: 'SET_SPEED', rate });
      } catch (e) {
        console.log('[TabVolume] Could not set speed:', e.message);
      }
      return;
    }

    // ========== Actions ==========
    switch (menuItemId) {
      case 'togglePlayback':
        try {
          await browserAPI.tabs.sendMessage(tab.id, { type: 'TOGGLE_PLAYBACK' });
        } catch (e) {
          console.log('[TabVolume] Could not toggle playback:', e.message);
        }
        break;

      case 'resetTab':
        // Reset all audio settings for this tab to defaults
        {
          const tabId = tab.id;

          // 1. Reset volume to default
          await setTabVolume(tabId, VOLUME_DEFAULT);
          await updateBadge(tabId, VOLUME_DEFAULT);

          // 2. Clear all effect storage keys for this tab
          const keysToReset = {};
          keysToReset[getTabStorageKey(tabId, TAB_STORAGE.BASS)] = 'off';
          keysToReset[getTabStorageKey(tabId, TAB_STORAGE.TREBLE)] = 'off';
          keysToReset[getTabStorageKey(tabId, TAB_STORAGE.VOICE)] = 'off';
          keysToReset[getTabStorageKey(tabId, TAB_STORAGE.COMPRESSOR)] = 'off';
          keysToReset[getTabStorageKey(tabId, TAB_STORAGE.BALANCE)] = 0;
          keysToReset[getTabStorageKey(tabId, TAB_STORAGE.CHANNEL_MODE)] = 'stereo';
          keysToReset[getTabStorageKey(tabId, TAB_STORAGE.SPEED)] = 'off';
          await browserAPI.storage.local.set(keysToReset);

          // 3. Remove device and prev-volume keys
          const keysToRemove = [
            getTabStorageKey(tabId, TAB_STORAGE.DEVICE),
            getTabStorageKey(tabId, TAB_STORAGE.PREV)
          ];
          try {
            await browserAPI.storage.local.remove(keysToRemove);
          } catch (e) {}

          // 4. Send reset messages to content script
          try {
            await browserAPI.tabs.sendMessage(tabId, { type: 'SET_VOLUME', volume: VOLUME_DEFAULT });
            await browserAPI.tabs.sendMessage(tabId, { type: 'SET_BASS', gain: EFFECT_RANGES.bass.default });
            await browserAPI.tabs.sendMessage(tabId, { type: 'SET_TREBLE', gain: EFFECT_RANGES.treble.default });
            await browserAPI.tabs.sendMessage(tabId, { type: 'SET_VOICE', gain: EFFECT_RANGES.voice.default });
            await browserAPI.tabs.sendMessage(tabId, { type: 'SET_COMPRESSOR', preset: 'off' });
            await browserAPI.tabs.sendMessage(tabId, { type: 'SET_BALANCE', pan: 0 });
            await browserAPI.tabs.sendMessage(tabId, { type: 'SET_CHANNEL_MODE', mode: 'stereo' });
            await browserAPI.tabs.sendMessage(tabId, { type: 'SET_SPEED', rate: EFFECT_RANGES.speed.default });
            await browserAPI.tabs.sendMessage(tabId, { type: 'SET_DEVICE', deviceId: '' });
          } catch (e) {
            console.log('[TabVolume] Could not reset tab effects:', e.message);
          }

          // 5. Forward resets to Tab Capture if active
          await forwardToTabCapture(tabId, 'SET_TAB_CAPTURE_VOLUME', { volume: VOLUME_DEFAULT });
          await forwardToTabCapture(tabId, 'SET_TAB_CAPTURE_BASS', { gain: EFFECT_RANGES.bass.default });
          await forwardToTabCapture(tabId, 'SET_TAB_CAPTURE_TREBLE', { gain: EFFECT_RANGES.treble.default });
          await forwardToTabCapture(tabId, 'SET_TAB_CAPTURE_VOICE', { gain: EFFECT_RANGES.voice.default });
          await forwardToTabCapture(tabId, 'SET_TAB_CAPTURE_COMPRESSOR', { preset: 'off' });
          await forwardToTabCapture(tabId, 'SET_TAB_CAPTURE_BALANCE', { pan: 0 });
          await forwardToTabCapture(tabId, 'SET_TAB_CAPTURE_CHANNEL_MODE', { mode: 'stereo' });

          console.log('[TabVolume] Tab reset to defaults via context menu');
        }
        break;

      case 'toggleFocusMode':
        // Toggle Focus Mode (Active Tab Audio) - audio follows active tab
        // Uses same logic as MUTE_OTHER_TABS / UNMUTE_OTHER_TABS message handlers
        {
          // Check current Focus Mode state (local + session storage)
          let isActive = focusModeState.active;
          if (!isActive) {
            try {
              const stored = await browserAPI.storage.session.get(['activeTabAudioMode']);
              isActive = stored.activeTabAudioMode || false;
            } catch (e) {}
          }

          const currentTabId = tab.id;
          const allTabs = await browserAPI.tabs.query({});

          if (isActive) {
            // Disable Focus Mode - unmute all other tabs and restore saved volumes
            for (const otherTab of allTabs) {
              if (otherTab.id === currentTabId) continue;
              if (!otherTab.mutedInfo?.muted) continue;
              try {
                await browserAPI.tabs.update(otherTab.id, { muted: false });
                if (!isFirefox) {
                  try {
                    const savedVolume = await getTabVolume(otherTab.id);
                    await chrome.runtime.sendMessage({
                      type: 'SET_TAB_CAPTURE_VOLUME',
                      tabId: otherTab.id,
                      volume: savedVolume
                    });
                  } catch (tcErr) {}
                }
              } catch (e) {}
            }
            // Clear state
            focusModeState.active = false;
            focusModeState.lastActiveTabId = null;
            try {
              await browserAPI.storage.session.remove(['activeTabAudioMode', 'activeTabAudioLastTabId']);
            } catch (e) {}
            console.log('[TabVolume] Focus Mode disabled via context menu');
          } else {
            // Enable Focus Mode - mute all other tabs
            for (const otherTab of allTabs) {
              if (otherTab.id === currentTabId) continue;
              if (otherTab.mutedInfo?.muted) continue;
              try {
                await browserAPI.tabs.update(otherTab.id, { muted: true });
                if (!isFirefox) {
                  try {
                    await chrome.runtime.sendMessage({
                      type: 'SET_TAB_CAPTURE_VOLUME',
                      tabId: otherTab.id,
                      volume: 0
                    });
                  } catch (tcErr) {}
                }
              } catch (e) {}
            }
            // Set state
            focusModeState.active = true;
            focusModeState.lastActiveTabId = currentTabId;
            try {
              await browserAPI.storage.session.set({
                activeTabAudioMode: true,
                activeTabAudioLastTabId: currentTabId
              });
            } catch (e) {}
            console.log('[TabVolume] Focus Mode enabled via context menu, tracking tab:', currentTabId);
          }
        }
        break;

      case 'prevTab':
      case 'nextTab':
        // Get all tabs with audio
        const audioTabs = await browserAPI.tabs.query({ audible: true });
        if (audioTabs.length <= 1) break;

        // Find current tab index
        const currentIndex = audioTabs.findIndex(t => t.id === tab.id);
        let targetIndex;

        if (menuItemId === 'prevTab') {
          targetIndex = currentIndex <= 0 ? audioTabs.length - 1 : currentIndex - 1;
        } else {
          targetIndex = currentIndex >= audioTabs.length - 1 ? 0 : currentIndex + 1;
        }

        // Switch to target tab
        const targetTab = audioTabs[targetIndex];
        if (targetTab) {
          await browserAPI.tabs.update(targetTab.id, { active: true });
          await browserAPI.windows.update(targetTab.windowId, { focused: true });
        }
        break;

      case 'openOptions':
        browserAPI.runtime.openOptionsPage();
        break;

      case 'enableBypassMode':
        // Enable Bypass mode for current domain
        if (tab.url) {
          const hostname = getValidatedHostname(tab.url);
          if (hostname) {
            try {
              const result = await browserAPI.storage.sync.get(['disabledDomains']);
              let disabledDomains = result.disabledDomains || [];

              // Add to disabled domains if not already there
              if (!disabledDomains.includes(hostname)) {
                disabledDomains.push(hostname);
                await browserAPI.storage.sync.set({ disabledDomains });
              }

              // Set localStorage flag
              try {
                await browserAPI.scripting.executeScript({
                  target: { tabId: tab.id },
                  world: 'MAIN',
                  func: (d) => {
                    try { localStorage.setItem(`__tabVolumeControl_disabled_${d}`, 'true'); } catch(e) {}
                  },
                  args: [hostname]
                });
              } catch (e) {}

              // Reload the tab
              browserAPI.tabs.reload(tab.id);
            } catch (e) {
              console.error('[TabVolume] Error enabling bypass mode:', e);
            }
          }
        }
        break;

      case 'enableTabCapture':
      case 'enableWebAudio':
        // Set audio mode for current domain
        if (tab.url) {
          const hostname = getValidatedHostname(tab.url);
          if (hostname) {
            try {
              const targetMode = menuItemId === 'enableTabCapture' ? 'tabcapture' : 'webaudio';
              const otherMode = menuItemId === 'enableTabCapture' ? 'webaudio' : 'tabcapture';

              // Get default audio mode
              const modeResult = await browserAPI.storage.sync.get(['defaultAudioMode']);
              const defaultMode = modeResult.defaultAudioMode || DEFAULT_AUDIO_MODE_CHROME;

              // Helper to get storage key for override list
              const getOverrideKey = (defMode, overMode) => {
                if (overMode === 'off') return 'disabledDomains';
                if (defMode === 'tabcapture' && overMode === 'webaudio') return 'tabCaptureDefault_webAudioSites';
                if (defMode === 'auto' && overMode === 'tabcapture') return 'webAudioDefault_tabCaptureSites';
                if (defMode === 'native') {
                  if (overMode === 'tabcapture') return 'offDefault_tabCaptureSites';
                  if (overMode === 'webaudio') return 'offDefault_webAudioSites';
                }
                return null;
              };

              // Add to target mode's override list
              const addKey = getOverrideKey(defaultMode, targetMode);
              if (addKey) {
                const addResult = await browserAPI.storage.sync.get([addKey]);
                let addDomains = addResult[addKey] || [];
                if (!addDomains.includes(hostname)) {
                  addDomains.push(hostname);
                  await browserAPI.storage.sync.set({ [addKey]: addDomains });
                }
              }

              // Remove from other mode's override list
              const removeKey = getOverrideKey(defaultMode, otherMode);
              if (removeKey) {
                const removeResult = await browserAPI.storage.sync.get([removeKey]);
                let removeDomains = removeResult[removeKey] || [];
                removeDomains = removeDomains.filter(d => d !== hostname);
                await browserAPI.storage.sync.set({ [removeKey]: removeDomains });
              }

              // Also remove from disabled domains if enabling audio mode
              const disabledResult = await browserAPI.storage.sync.get(['disabledDomains']);
              let disabledDomains = disabledResult.disabledDomains || [];
              if (disabledDomains.includes(hostname)) {
                disabledDomains = disabledDomains.filter(d => d !== hostname);
                await browserAPI.storage.sync.set({ disabledDomains });
                // Remove localStorage flag
                try {
                  await browserAPI.scripting.executeScript({
                    target: { tabId: tab.id },
                    world: 'MAIN',
                    func: (d) => {
                      try { localStorage.removeItem(`__tabVolumeControl_disabled_${d}`); } catch(e) {}
                    },
                    args: [hostname]
                  });
                } catch (e) {}
              }

              // Save last active mode
              const lastModeResult = await browserAPI.storage.local.get(['lastActiveMode']);
              const lastActiveModes = lastModeResult.lastActiveMode || {};
              lastActiveModes[hostname] = targetMode;
              await browserAPI.storage.local.set({ lastActiveMode: lastActiveModes });

              // Reload the tab
              browserAPI.tabs.reload(tab.id);
            } catch (e) {
              console.error('[TabVolume] Error setting audio mode:', e);
            }
          }
        }
        break;
    }
  });
}
