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

const DEFAULT_VOLUME = 100;

// Tab storage suffixes - duplicated from shared/constants.js (service worker limitation)
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
  RULE_APPLIED: 'ruleAppliedDomain' // tab_123_ruleAppliedDomain
};

// Helper to generate consistent tab storage keys - duplicated from shared/constants.js
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
let keyboardStep = 5;

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
    const steps = result.volumeSteps || { scrollWheel: 5, keyboard: 5, buttons: 1 };
    keyboardStep = steps.keyboard;
  } catch (e) {
    keyboardStep = 5;
  }
}

// Load keyboard step on startup
loadKeyboardStep();

// Listen for storage changes to update keyboard step
const browserAPIForListener = typeof browser !== 'undefined' ? browser : chrome;
browserAPIForListener.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.volumeSteps) {
    const steps = changes.volumeSteps.newValue || { scrollWheel: 5, keyboard: 5, buttons: 1 };
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
        const subdomainMatch = hostname.endsWith('.' + sanitizedPattern);
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

// Update badge for a specific tab
// Priority: 1) Restricted page, 2) Tab Capture pending, 3) Volume display
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

    // Set badge colors - red background when muted (0%), black otherwise
    const bgColor = volume === 0 ? '#CC0000' : '#000000';
    const textColor = '#ffffff';
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
    return DEFAULT_VOLUME;
  }
  // Clamp to valid range (0-500)
  return Math.max(0, Math.min(500, Math.round(value)));
}

// Get volume for a tab
async function getTabVolume(tabId) {
  const key = getTabStorageKey(tabId);
  const result = await browserAPI.storage.local.get([key]);
  return result[key] !== undefined ? validateVolume(result[key]) : DEFAULT_VOLUME;
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
    getTabStorageKey(tabId, TAB_STORAGE.CHANNEL_MODE) // channel mode (stereo/mono/swap)
  ];
  await browserAPI.storage.local.remove(keysToRemove);

  // Remove from tabs with media tracking
  tabsWithMedia.delete(tabId);

  // Clear tracked tab if it was closed (Active Tab Audio mode continues)
  if (focusModeState.active && focusModeState.lastActiveTabId === tabId) {
    focusModeState.lastActiveTabId = null;
    try {
      browserAPI.storage.session.set({ activeTabAudioLastTabId: null });
    } catch (e) {
      // Session storage might not be available
    }
    // onActivated will handle unmuting the next active tab
  }

  // Notify offscreen to stop any visualizer capture for this tab (Chrome only)
  if (!isFirefox && chrome.offscreen) {
    try {
      const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
      });
      if (existingContexts.length > 0) {
        chrome.runtime.sendMessage({
          type: 'STOP_VISUALIZER_CAPTURE',
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
      previousTabId = stored.activeTabAudioLastTabId || null;
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

  // Update tracked active tab (both local and session storage)
  focusModeState.lastActiveTabId = newActiveTabId;
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
      previousTabId = stored.activeTabAudioLastTabId || null;
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
          const matchingRule = await getMatchingSiteRule(tab.url);
          log('Matching rule result:', matchingRule);
          if (matchingRule) {
            log('Applying rule! Volume:', matchingRule.volume);
            volume = matchingRule.volume;
            await setTabVolume(tabId, volume);

            // Apply device from rule if specified
            if (matchingRule.deviceLabel) {
              ruleDeviceLabel = matchingRule.deviceLabel;
              // Save device preference for this tab
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

            // Apply balance from rule if specified
            if (matchingRule.balance !== undefined && matchingRule.balance !== 0) {
              const balanceKey = getTabStorageKey(tabId, TAB_STORAGE.BALANCE);
              await browserAPI.storage.local.set({ [balanceKey]: matchingRule.balance });
            }

            // Apply channel mode from rule if specified
            if (matchingRule.channelMode) {
              const channelKey = getTabStorageKey(tabId, TAB_STORAGE.CHANNEL_MODE);
              await browserAPI.storage.local.set({ [channelKey]: matchingRule.channelMode });
            }

            // Remember this domain so we don't re-apply on navigation within site
            log('Rule applied, saving domain to prevent re-application:', currentDomain);
            await browserAPI.storage.local.set({ [ruleAppliedKey]: currentDomain });
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

    // Re-send volume and device to content script after navigation
    try {
      await browserAPI.tabs.sendMessage(tabId, {
        type: 'SET_VOLUME',
        volume: volume
      });
      if (deviceId || deviceLabel) {
        await browserAPI.tabs.sendMessage(tabId, {
          type: 'SET_DEVICE',
          deviceId: deviceId,
          deviceLabel: deviceLabel
        });
      }

      // Send bass/treble/voice boost, compressor, balance, and channel mode settings if they exist for this tab
      const bassKey = getTabStorageKey(tabId, TAB_STORAGE.BASS);
      const trebleKey = getTabStorageKey(tabId, TAB_STORAGE.TREBLE);
      const voiceKey = getTabStorageKey(tabId, TAB_STORAGE.VOICE);
      const compressorKey = getTabStorageKey(tabId, TAB_STORAGE.COMPRESSOR);
      const balanceKey = getTabStorageKey(tabId, TAB_STORAGE.BALANCE);
      const channelKey = getTabStorageKey(tabId, TAB_STORAGE.CHANNEL_MODE);
      const effectResult = await browserAPI.storage.local.get([bassKey, trebleKey, voiceKey, compressorKey, balanceKey, channelKey]);
      const bassBoostPresets = (await browserAPI.storage.sync.get(['bassBoostPresets'])).bassBoostPresets || [4, 8, 12];
      const trebleBoostPresets = (await browserAPI.storage.sync.get(['trebleBoostPresets'])).trebleBoostPresets || [6, 12, 24];
      const voiceBoostPresets = (await browserAPI.storage.sync.get(['voiceBoostPresets'])).voiceBoostPresets || [3, 6, 9];

      if (effectResult[bassKey]) {
        const bassLevel = effectResult[bassKey];
        const bassGain = bassLevel === 'low' ? bassBoostPresets[0] : bassLevel === 'medium' ? bassBoostPresets[1] : bassLevel === 'high' ? bassBoostPresets[2] : 0;
        if (bassGain > 0) {
          await browserAPI.tabs.sendMessage(tabId, {
            type: 'SET_BASS',
            gain: bassGain
          });
        }
      }

      if (effectResult[trebleKey]) {
        const trebleLevel = effectResult[trebleKey];
        const trebleGain = trebleLevel === 'low' ? trebleBoostPresets[0] : trebleLevel === 'medium' ? trebleBoostPresets[1] : trebleLevel === 'high' ? trebleBoostPresets[2] : 0;
        if (trebleGain > 0) {
          await browserAPI.tabs.sendMessage(tabId, {
            type: 'SET_TREBLE',
            gain: trebleGain
          });
        }
      }

      if (effectResult[voiceKey]) {
        const voiceLevel = effectResult[voiceKey];
        const voiceGain = voiceLevel === 'low' ? voiceBoostPresets[0] : voiceLevel === 'medium' ? voiceBoostPresets[1] : voiceLevel === 'high' ? voiceBoostPresets[2] : 0;
        if (voiceGain > 0) {
          await browserAPI.tabs.sendMessage(tabId, {
            type: 'SET_VOICE',
            gain: voiceGain
          });
        }
      }

      // Send compressor setting if saved for this tab
      if (effectResult[compressorKey] && effectResult[compressorKey] !== 'off') {
        await browserAPI.tabs.sendMessage(tabId, {
          type: 'SET_COMPRESSOR',
          preset: effectResult[compressorKey]
        });
      }

      // Send balance if saved for this tab
      if (effectResult[balanceKey] !== undefined) {
        await browserAPI.tabs.sendMessage(tabId, {
          type: 'SET_BALANCE',
          balance: effectResult[balanceKey]
        });
      }

      // Send channel mode if saved for this tab
      if (effectResult[channelKey]) {
        await browserAPI.tabs.sendMessage(tabId, {
          type: 'SET_CHANNEL_MODE',
          mode: effectResult[channelKey]
        });
      }
    } catch (e) {
      // Content script might not be injected yet
    }
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
async function initiateTabCaptureFromKeyboard(tabId) {
  if (isFirefox || !chrome.tabCapture) {
    return false;
  }

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
    }

    return response && response.success;
  } catch (e) {
    console.error('[TabVolume] Keyboard shortcut Tab Capture failed:', e);
    return false;
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
  'GET_TAB_ID', 'GET_TAB_INFO', 'GET_AUDIBLE_TABS',
  'MUTE_OTHER_TABS', 'UNMUTE_OTHER_TABS', 'GET_FOCUS_STATE',
  'HAS_MEDIA', 'CONTENT_READY', 'VOLUME_CHANGED',
  'START_TAB_CAPTURE_VISUALIZER', 'GET_TAB_CAPTURE_PREF', 'SET_TAB_CAPTURE_PREF',
  // Persistent visualizer Tab Capture (offscreen document)
  'START_PERSISTENT_VISUALIZER_CAPTURE', 'STOP_PERSISTENT_VISUALIZER_CAPTURE',
  'GET_PERSISTENT_VISUALIZER_DATA', 'GET_PERSISTENT_VISUALIZER_STATUS',
  // Tab Capture audio control (offscreen document)
  'SET_TAB_CAPTURE_VOLUME', 'SET_TAB_CAPTURE_BASS', 'SET_TAB_CAPTURE_TREBLE',
  'SET_TAB_CAPTURE_VOICE', 'SET_TAB_CAPTURE_BALANCE', 'SET_TAB_CAPTURE_DEVICE',
  'SET_TAB_CAPTURE_COMPRESSOR', 'GET_TAB_CAPTURE_MODE', 'GET_EFFECTIVE_MODE'
];

function isValidMessageType(type) {
  return typeof type === 'string' && VALID_MESSAGE_TYPES.includes(type);
}

// ==================== Message Rate Limiting ====================

// Track last message time per type per tab (defense against message flooding)
const messageThrottles = new Map();
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

  // Cleanup old entries periodically (every 100 messages)
  if (messageThrottles.size > 100) {
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

  if (request.type === 'GET_TAB_INFO') {
    if (!isValidTabId(request.tabId)) {
      sendResponse({ title: 'Unknown', url: '' });
      return false;
    }
    browserAPI.tabs.get(request.tabId).then(tab => {
      sendResponse({
        title: tab.title,
        url: tab.url
      });
    }).catch((e) => {
      log('GET_TAB_INFO failed for tabId', request.tabId, ':', e.message);
      sendResponse({ title: 'Unknown', url: '' });
    });
    return true;
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
        const tabs = await browserAPI.tabs.query({});

        // Unmute all other tabs that are muted
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
                await chrome.runtime.sendMessage({
                  type: 'SET_TAB_CAPTURE_VOLUME',
                  tabId: tab.id,
                  volume: 100
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

  // ==================== Tab Capture for Visualizer ====================
  // Start tab capture and return stream ID for visualizer (Chrome only)
  if (request.type === 'START_TAB_CAPTURE_VISUALIZER') {
    (async () => {
      const tabId = request.tabId;
      if (!tabId) {
        sendResponse({ success: false, error: 'No tab ID provided' });
        return;
      }

      // Firefox doesn't support tabCapture in the same way
      if (isFirefox) {
        sendResponse({ success: false, error: 'tabCapture not supported in Firefox' });
        return;
      }

      try {
        // Get the media stream ID that the popup can use
        const streamId = await chrome.tabCapture.getMediaStreamId({
          targetTabId: tabId
        });

        if (streamId) {
          console.log('[TabVolume] tabCapture stream ID obtained for tab', tabId);
          sendResponse({ success: true, streamId });
        } else {
          sendResponse({ success: false, error: 'No stream ID returned' });
        }
      } catch (e) {
        console.error('[TabVolume] tabCapture failed:', e);
        sendResponse({ success: false, error: e.message });
      }
    })();
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
      if (!tabId) {
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
      if (!tabId) {
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
      if (!tabId) {
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
      if (!tabId) {
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
      request.type === 'SET_TAB_CAPTURE_COMPRESSOR') {
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
        if (!Number.isFinite(request.volume) || request.volume < 0 || request.volume > 500) {
          sendResponse({ success: false, error: 'Invalid volume value' });
          return;
        }
      } else if (request.type === 'SET_TAB_CAPTURE_BASS' ||
                 request.type === 'SET_TAB_CAPTURE_TREBLE' ||
                 request.type === 'SET_TAB_CAPTURE_VOICE') {
        if (!Number.isFinite(request.gainDb) || request.gainDb < -50 || request.gainDb > 50) {
          sendResponse({ success: false, error: 'Invalid gain value' });
          return;
        }
      } else if (request.type === 'SET_TAB_CAPTURE_BALANCE') {
        if (!Number.isFinite(request.pan) || request.pan < -1 || request.pan > 1) {
          sendResponse({ success: false, error: 'Invalid balance value' });
          return;
        }
      } else if (request.type === 'SET_TAB_CAPTURE_DEVICE') {
        if (request.deviceId !== null && typeof request.deviceId !== 'string') {
          sendResponse({ success: false, error: 'Invalid device ID' });
          return;
        }
      } else if (request.type === 'SET_TAB_CAPTURE_COMPRESSOR') {
        const validPresets = ['off', 'podcast', 'movie', 'maximum'];
        if (typeof request.preset !== 'string' || !validPresets.includes(request.preset)) {
          sendResponse({ success: false, error: 'Invalid compressor preset' });
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
    });
    return true;
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
      volume = Math.min(500, volume + keyboardStep);
      break;
    case 'volume-down':
      volume = Math.max(0, volume - keyboardStep);
      break;
    case 'toggle-mute':
      // Store previous volume for unmuting
      if (volume === 0) {
        const prevKey = getTabStorageKey(tab.id, TAB_STORAGE.PREV);
        const result = await browserAPI.storage.local.get([prevKey]);
        volume = result[prevKey] || 100;
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
  if (!hostname) return null;

  try {
    const result = await browserAPI.storage.sync.get([
      'defaultAudioMode',
      'disabledDomains',
      'tabCaptureDefault_webAudioSites',
      'webAudioDefault_tabCaptureSites',
      'offDefault_tabCaptureSites',
      'offDefault_webAudioSites'
    ]);

    const defaultMode = result.defaultAudioMode || 'tabcapture';
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
          if (!Number.isFinite(tabId) || tabId < 0) continue;
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

// Default presets (used if user hasn't customized)
const DEFAULT_VOLUME_PRESETS = [50, 100, 200, 300, 500];
const DEFAULT_BASS_PRESETS = [6, 12, 24];
const DEFAULT_BASS_CUT_PRESETS = [-6, -12, -24];
const DEFAULT_TREBLE_PRESETS = [6, 12, 24];
const DEFAULT_TREBLE_CUT_PRESETS = [-6, -12, -24];
const DEFAULT_VOICE_PRESETS = [4, 10, 18];

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
    'voiceBoostPresets'
  ]);

  const volumePresets = storage.customPresets || DEFAULT_VOLUME_PRESETS;
  const bassPresets = storage.bassBoostPresets || DEFAULT_BASS_PRESETS;
  const bassCutPresets = storage.bassCutPresets || DEFAULT_BASS_CUT_PRESETS;
  const treblePresets = storage.trebleBoostPresets || DEFAULT_TREBLE_PRESETS;
  const trebleCutPresets = storage.trebleCutPresets || DEFAULT_TREBLE_CUT_PRESETS;
  const voicePresets = storage.voiceBoostPresets || DEFAULT_VOICE_PRESETS;

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
      id: `bassBoost_${bassPresets[0]}`,
      parentId: 'bassBoostSubmenu',
      title: `Low (+${bassPresets[0]}dB)`,
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: `bassBoost_${bassPresets[1]}`,
      parentId: 'bassBoostSubmenu',
      title: `Medium (+${bassPresets[1]}dB)`,
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: `bassBoost_${bassPresets[2]}`,
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
      id: `bassCut_${Math.abs(bassCutPresets[0])}`,
      parentId: 'bassCutSubmenu',
      title: `Low (${bassCutPresets[0]}dB)`,
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: `bassCut_${Math.abs(bassCutPresets[1])}`,
      parentId: 'bassCutSubmenu',
      title: `Medium (${bassCutPresets[1]}dB)`,
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: `bassCut_${Math.abs(bassCutPresets[2])}`,
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
      id: `trebleBoost_${treblePresets[0]}`,
      parentId: 'trebleBoostSubmenu',
      title: `Low (+${treblePresets[0]}dB)`,
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: `trebleBoost_${treblePresets[1]}`,
      parentId: 'trebleBoostSubmenu',
      title: `Medium (+${treblePresets[1]}dB)`,
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: `trebleBoost_${treblePresets[2]}`,
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
      id: `trebleCut_${Math.abs(trebleCutPresets[0])}`,
      parentId: 'trebleCutSubmenu',
      title: `Low (${trebleCutPresets[0]}dB)`,
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: `trebleCut_${Math.abs(trebleCutPresets[1])}`,
      parentId: 'trebleCutSubmenu',
      title: `Medium (${trebleCutPresets[1]}dB)`,
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: `trebleCut_${Math.abs(trebleCutPresets[2])}`,
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
      id: `voiceBoost_${voicePresets[0]}`,
      parentId: 'voiceBoostSubmenu',
      title: `Low (+${voicePresets[0]}dB)`,
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: `voiceBoost_${voicePresets[1]}`,
      parentId: 'voiceBoostSubmenu',
      title: `Medium (+${voicePresets[1]}dB)`,
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: `voiceBoost_${voicePresets[2]}`,
      parentId: 'voiceBoostSubmenu',
      title: `High (+${voicePresets[2]}dB)`,
      contexts: MENU_CONTEXTS
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
      id: 'compressor_light',
      parentId: 'rangeSubmenu',
      title: 'Light',
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: 'compressor_medium',
      parentId: 'rangeSubmenu',
      title: 'Medium',
      contexts: MENU_CONTEXTS
    });
    contextMenusAPI.create({
      id: 'compressor_heavy',
      parentId: 'rangeSubmenu',
      title: 'Heavy',
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
    const presetKeys = ['customPresets', 'bassBoostPresets', 'bassCutPresets', 'trebleBoostPresets', 'trebleCutPresets', 'voiceBoostPresets'];
    if (presetKeys.some(key => changes[key])) {
      console.log('[TabVolume] Presets changed, rebuilding context menus');
      createContextMenus();
    }
  }
});

// Handle context menu clicks
if (contextMenusAPI) {
  contextMenusAPI.onClicked.addListener(async (info, tab) => {
    if (!tab || !tab.id) return;

    const menuItemId = String(info.menuItemId);

    // ========== Volume ==========
    if (menuItemId.startsWith('volume_')) {
      const volume = parseInt(menuItemId.replace('volume_', ''), 10);
      const validatedVolume = validateVolume(volume);
      await setTabVolume(tab.id, validatedVolume);
      await updateBadge(tab.id, validatedVolume);
      return;
    }

    // ========== Compressor ==========
    if (menuItemId.startsWith('compressor_')) {
      const preset = menuItemId.replace('compressor_', '');
      try {
        await browserAPI.tabs.sendMessage(tab.id, { type: 'SET_COMPRESSOR', preset });
      } catch (e) {
        console.log('[TabVolume] Could not set compressor:', e.message);
      }
      return;
    }

    // ========== Voice Boost ==========
    if (menuItemId.startsWith('voice_')) {
      const value = menuItemId.replace('voice_', '');
      const gain = value === 'off' ? 0 : parseInt(value, 10);
      try {
        await browserAPI.tabs.sendMessage(tab.id, { type: 'SET_VOICE', gain });
      } catch (e) {
        console.log('[TabVolume] Could not set voice boost:', e.message);
      }
      return;
    }

    // ========== Bass Boost ==========
    if (menuItemId.startsWith('bassBoost_')) {
      const value = menuItemId.replace('bassBoost_', '');
      const gain = value === 'off' ? 0 : parseInt(value, 10);
      try {
        await browserAPI.tabs.sendMessage(tab.id, { type: 'SET_BASS', gain });
      } catch (e) {
        console.log('[TabVolume] Could not set bass boost:', e.message);
      }
      return;
    }

    // ========== Bass Cut ==========
    if (menuItemId.startsWith('bassCut_')) {
      const value = menuItemId.replace('bassCut_', '');
      const gain = value === 'off' ? 0 : -parseInt(value, 10); // Negative for cut
      try {
        await browserAPI.tabs.sendMessage(tab.id, { type: 'SET_BASS', gain });
      } catch (e) {
        console.log('[TabVolume] Could not set bass cut:', e.message);
      }
      return;
    }

    // ========== Treble Boost ==========
    if (menuItemId.startsWith('trebleBoost_')) {
      const value = menuItemId.replace('trebleBoost_', '');
      const gain = value === 'off' ? 0 : parseInt(value, 10);
      try {
        await browserAPI.tabs.sendMessage(tab.id, { type: 'SET_TREBLE', gain });
      } catch (e) {
        console.log('[TabVolume] Could not set treble boost:', e.message);
      }
      return;
    }

    // ========== Treble Cut ==========
    if (menuItemId.startsWith('trebleCut_')) {
      const value = menuItemId.replace('trebleCut_', '');
      const gain = value === 'off' ? 0 : -parseInt(value, 10); // Negative for cut
      try {
        await browserAPI.tabs.sendMessage(tab.id, { type: 'SET_TREBLE', gain });
      } catch (e) {
        console.log('[TabVolume] Could not set treble cut:', e.message);
      }
      return;
    }

    // ========== Balance ==========
    if (menuItemId.startsWith('balance_')) {
      const pan = parseInt(menuItemId.replace('balance_', ''), 10);
      try {
        await browserAPI.tabs.sendMessage(tab.id, { type: 'SET_BALANCE', pan });
      } catch (e) {
        console.log('[TabVolume] Could not set balance:', e.message);
      }
      return;
    }

    // ========== Channel Mode ==========
    if (menuItemId.startsWith('channel_')) {
      const mode = menuItemId.replace('channel_', '');
      try {
        await browserAPI.tabs.sendMessage(tab.id, { type: 'SET_CHANNEL_MODE', mode });
      } catch (e) {
        console.log('[TabVolume] Could not set channel mode:', e.message);
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
            // Disable Focus Mode - unmute all other tabs
            for (const otherTab of allTabs) {
              if (otherTab.id === currentTabId) continue;
              if (!otherTab.mutedInfo?.muted) continue;
              try {
                await browserAPI.tabs.update(otherTab.id, { muted: false });
                if (!isFirefox) {
                  try {
                    await chrome.runtime.sendMessage({
                      type: 'SET_TAB_CAPTURE_VOLUME',
                      tabId: otherTab.id,
                      volume: 100
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
                    try { localStorage.setItem('__tabVolumeControl_disabled_' + d, 'true'); } catch(e) {}
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
              const defaultMode = modeResult.defaultAudioMode || 'tabcapture';

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
                      try { localStorage.removeItem('__tabVolumeControl_disabled_' + d); } catch(e) {}
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
