// Per-Tab Audio Control - Background Service Worker
// Cross-browser compatible (Chrome & Firefox)
//
// Note: This file intentionally duplicates some utilities from shared/validation.js
// (sanitizeHostname, validateVolume) because service workers can't easily share code
// via HTML script tags. Keep these in sync with the shared versions.

// Debug flag - set to true for verbose logging during development
const DEBUG = false;
const log = (...args) => DEBUG && console.log('[BG]', ...args);
const logDebug = (...args) => DEBUG && console.debug('[BG]', ...args);

const DEFAULT_VOLUME = 100;

// Volume step for keyboard shortcuts (loaded from storage)
let keyboardStep = 1;

// Mute Others feature state
let mutedByExtension = new Set(); // Tab IDs we muted

// Load keyboard step from storage
async function loadKeyboardStep() {
  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
  try {
    const result = await browserAPI.storage.sync.get(['volumeSteps']);
    const steps = result.volumeSteps || { scrollWheel: 5, keyboard: 1, buttons: 1 };
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
    const steps = changes.volumeSteps.newValue || { scrollWheel: 5, keyboard: 1, buttons: 1 };
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

// Track tabs that have reported having media (for tab navigation including paused media)
const tabsWithMedia = new Set();

// Log version on startup to verify refresh is working
console.log('[TabVolume] Service worker starting - version', browserAPI.runtime.getManifest().version, isFirefox ? '(Firefox)' : '(Chrome)');

// Note: We intentionally do NOT close the offscreen document on service worker startup.
// The offscreen document holds persistent Tab Capture sessions that should survive
// service worker sleep/wake cycles. Closing it would reset audio to default.
// The offscreen document IS closed on extension update (see onInstalled handler)
// to ensure fresh code is loaded.

// Check if a URL matches any site volume rule
async function getMatchingSiteRule(url) {
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
      url.startsWith('moz-extension://') || url.startsWith('about:')) {
    return null;
  }

  const result = await browserAPI.storage.sync.get(['siteVolumeRules']);
  const rules = result.siteVolumeRules || [];

  if (rules.length === 0) {
    return null;
  }

  try {
    const hostname = getValidatedHostname(url);
    if (!hostname) {
      return null;
    }

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      // Sanitize rule pattern for security
      const sanitizedPattern = rule.isDomain ? sanitizeHostname(rule.pattern) : rule.pattern;
      if (!sanitizedPattern) continue;

      let matched = false;
      if (rule.isDomain) {
        // Domain match: check if hostname matches or is subdomain
        if (hostname === sanitizedPattern || hostname.endsWith('.' + sanitizedPattern)) {
          matched = true;
        }
      } else {
        // Exact URL match
        if (url === sanitizedPattern || url.replace(/\/$/, '') === sanitizedPattern.replace(/\/$/, '')) {
          matched = true;
        }
      }

      if (matched) {
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
  } catch (e) {
    // Invalid URL, skip matching
  }

  return null;
}

// Update badge for a specific tab
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

    // Set badge - simple black/white for maximum visibility
    const bgColor = '#000000'; // Black background
    const textColor = '#ffffff'; // White text
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
  const key = `tab_${tabId}`;
  const result = await browserAPI.storage.local.get([key]);
  return result[key] !== undefined ? validateVolume(result[key]) : DEFAULT_VOLUME;
}

// Set volume for a tab
async function setTabVolume(tabId, volume) {
  const key = `tab_${tabId}`;
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
  const key = `tab_${tabId}`;
  const prevKey = `tab_${tabId}_prev`;
  const deviceKey = `tab_${tabId}_device`;
  const ruleAppliedKey = `tab_${tabId}_ruleAppliedDomain`;
  await browserAPI.storage.local.remove([key, prevKey, deviceKey, ruleAppliedKey]);

  // Remove from tabs with media tracking
  tabsWithMedia.delete(tabId);

  // Remove from muted tabs tracking
  mutedByExtension.delete(tabId);

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

// Handle tab updates (navigation, refresh)
browserAPI.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    let volume = await getTabVolume(tabId);

    // Check for site volume rules - only apply on first visit to a domain, not on navigation within site
    let ruleDeviceLabel = '';
    if (tab.url) {
      try {
        const currentDomain = getValidatedHostname(tab.url);
        if (!currentDomain) {
          // Invalid URL, skip rule application
          return;
        }

        const ruleAppliedKey = `tab_${tabId}_ruleAppliedDomain`;
        const ruleResult = await browserAPI.storage.local.get([ruleAppliedKey]);
        const lastAppliedDomain = ruleResult[ruleAppliedKey];

        // Only apply rule if this is a new domain (not navigation within same site)
        if (lastAppliedDomain !== currentDomain) {
          const matchingRule = await getMatchingSiteRule(tab.url);
          if (matchingRule) {
            volume = matchingRule.volume;
            await setTabVolume(tabId, volume);

            // Apply device from rule if specified
            if (matchingRule.deviceLabel) {
              ruleDeviceLabel = matchingRule.deviceLabel;
              // Save device preference for this tab
              const deviceKey = `tab_${tabId}_device`;
              await browserAPI.storage.local.set({
                [deviceKey]: { deviceId: '', deviceLabel: matchingRule.deviceLabel }
              });
            }

            // Apply bass boost from rule if specified
            if (matchingRule.bassBoost) {
              const bassKey = `tab_${tabId}_bass`;
              await browserAPI.storage.local.set({ [bassKey]: matchingRule.bassBoost });
            }

            // Apply treble boost from rule if specified
            if (matchingRule.trebleBoost) {
              const trebleKey = `tab_${tabId}_treble`;
              await browserAPI.storage.local.set({ [trebleKey]: matchingRule.trebleBoost });
            }

            // Apply voice boost from rule if specified
            if (matchingRule.voiceBoost) {
              const voiceKey = `tab_${tabId}_voice`;
              await browserAPI.storage.local.set({ [voiceKey]: matchingRule.voiceBoost });
            }

            // Apply compressor from rule if specified
            if (matchingRule.compressor) {
              const compressorKey = `tab_${tabId}_compressor`;
              await browserAPI.storage.local.set({ [compressorKey]: matchingRule.compressor });
              // If compressor is enabled, disable bass, treble, and voice boost
              if (matchingRule.compressor !== 'off') {
                const bassKey = `tab_${tabId}_bass`;
                const trebleKey = `tab_${tabId}_treble`;
                const voiceKey = `tab_${tabId}_voice`;
                await browserAPI.storage.local.set({
                  [bassKey]: 'off',
                  [trebleKey]: 'off',
                  [voiceKey]: 'off'
                });
              }
            }

            // Apply balance from rule if specified
            if (matchingRule.balance !== undefined && matchingRule.balance !== 0) {
              const balanceKey = `tab_${tabId}_balance`;
              await browserAPI.storage.local.set({ [balanceKey]: matchingRule.balance });
            }

            // Apply channel mode from rule if specified
            if (matchingRule.channelMode) {
              const channelKey = `tab_${tabId}_channelMode`;
              await browserAPI.storage.local.set({ [channelKey]: matchingRule.channelMode });
            }

          }
          // Remember this domain so we don't re-apply on navigation within site
          await browserAPI.storage.local.set({ [ruleAppliedKey]: currentDomain });
        }
      } catch (e) {
        // Invalid URL, skip rule application
      }
    }

    await updateBadge(tabId, volume);

    // Get saved device for this tab (handles both old string format and new object format)
    const deviceKey = `tab_${tabId}_device`;
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
      const bassKey = `tab_${tabId}_bass`;
      const trebleKey = `tab_${tabId}_treble`;
      const voiceKey = `tab_${tabId}_voice`;
      const compressorKey = `tab_${tabId}_compressor`;
      const balanceKey = `tab_${tabId}_balance`;
      const channelKey = `tab_${tabId}_channelMode`;
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
let creatingOffscreenDocument = null;

async function setupOffscreenDocument() {
  // Only available in Chrome
  if (isFirefox || !chrome.offscreen) {
    return false;
  }

  const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');

  // Check if already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) {
    return true;
  }

  // If another call is already creating the document, wait for it
  if (creatingOffscreenDocument) {
    await creatingOffscreenDocument;
    return true;
  }

  // Create the document - assign promise BEFORE awaiting to prevent race condition
  try {
    creatingOffscreenDocument = chrome.offscreen.createDocument({
      url: offscreenUrl,
      reasons: ['USER_MEDIA'],
      justification: 'Enumerate audio output devices and Tab Capture for visualizer'
    });
    await creatingOffscreenDocument;
    // Small delay to ensure the offscreen JS has loaded and registered its listeners
    await new Promise(resolve => setTimeout(resolve, 100));
    return true;
  } catch (e) {
    // Document may already exist (created by another caller in rare race)
    if (e.message && e.message.includes('single offscreen')) {
      return true;
    }
    throw e;
  } finally {
    creatingOffscreenDocument = null;
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
  'MUTE_OTHER_TABS', 'UNMUTE_MUTED_TABS', 'GET_MUTE_OTHERS_STATE',
  'HAS_MEDIA', 'CONTENT_READY', 'VOLUME_CHANGED',
  'START_TAB_CAPTURE_VISUALIZER', 'GET_TAB_CAPTURE_PREF', 'SET_TAB_CAPTURE_PREF',
  // Persistent visualizer Tab Capture (offscreen document)
  'START_PERSISTENT_VISUALIZER_CAPTURE', 'STOP_PERSISTENT_VISUALIZER_CAPTURE',
  'GET_PERSISTENT_VISUALIZER_DATA', 'GET_PERSISTENT_VISUALIZER_STATUS',
  // Tab Capture audio control (offscreen document)
  'SET_TAB_CAPTURE_VOLUME', 'SET_TAB_CAPTURE_BASS', 'SET_TAB_CAPTURE_TREBLE',
  'SET_TAB_CAPTURE_VOICE', 'SET_TAB_CAPTURE_BALANCE', 'SET_TAB_CAPTURE_DEVICE',
  'GET_TAB_CAPTURE_MODE', 'GET_EFFECTIVE_MODE'
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
    for (const [k, v] of messageThrottles) {
      if (v < cutoff) messageThrottles.delete(k);
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
      const deviceKey = `tab_${tabId}_device`;
      browserAPI.storage.local.remove([deviceKey]).then(() => {
        console.log('[TabVolume] Cleared stale device ID for tab:', tabId);
      });
    }
    sendResponse({ success: true });
    return true;
  }

  if (request.type === 'GET_VOLUME') {
    const tabId = request.tabId;
    getTabVolume(tabId).then(volume => {
      sendResponse({ volume });
    });
    return true;
  }

  if (request.type === 'SET_VOLUME') {
    const tabId = request.tabId;
    const volume = request.volume;
    setTabVolume(tabId, volume).then(() => {
      sendResponse({ success: true });
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
    browserAPI.tabs.get(request.tabId).then(tab => {
      sendResponse({
        title: tab.title,
        url: tab.url
      });
    }).catch(() => {
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

  // Mute Other Tabs - mute all tabs except current
  if (request.type === 'MUTE_OTHER_TABS') {
    (async () => {
      try {
        const currentTabId = request.currentTabId;
        const tabs = await browserAPI.tabs.query({});

        // Clear previous state
        mutedByExtension.clear();

        // Mute all other tabs that aren't already muted
        let mutedCount = 0;
        for (const tab of tabs) {
          if (tab.id === currentTabId) {
            continue;
          }
          if (tab.mutedInfo?.muted) {
            continue;
          }
          try {
            // Browser-level mute
            await browserAPI.tabs.update(tab.id, { muted: true });
            mutedByExtension.add(tab.id);
            mutedCount++;

            // Also mute media elements directly (for sites like Twitch that bypass browser mute)
            try {
              await browserAPI.tabs.sendMessage(tab.id, { type: 'MUTE_MEDIA' });
            } catch (msgErr) {
              // Content script might not be loaded on this tab - that's OK
            }
          } catch (muteErr) {
            console.error('[TabVolume] Failed to mute tab:', tab.id, muteErr.message);
          }
        }

        console.log('[TabVolume] Muted', mutedCount, 'other tabs');
        sendResponse({ success: true, mutedCount });
      } catch (e) {
        console.error('[TabVolume] Mute other tabs failed:', e);
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  // Unmute tabs that we muted (restore)
  if (request.type === 'UNMUTE_MUTED_TABS') {
    (async () => {
      try {
        if (mutedByExtension.size === 0) {
          sendResponse({ success: false, reason: 'Nothing to restore' });
          return;
        }

        let unmutedCount = 0;
        for (const tabId of mutedByExtension) {
          try {
            // Browser-level unmute
            await browserAPI.tabs.update(tabId, { muted: false });
            unmutedCount++;

            // Also unmute media elements directly
            try {
              await browserAPI.tabs.sendMessage(tabId, { type: 'UNMUTE_MEDIA' });
            } catch (msgErr) {
              // Content script might not be loaded on this tab - that's OK
            }
          } catch (e) {
            // Tab might have been closed
          }
        }

        // Clear state
        mutedByExtension.clear();

        console.log('[TabVolume] Unmuted', unmutedCount, 'tabs');
        sendResponse({ success: true, unmutedCount });
      } catch (e) {
        console.error('[TabVolume] Unmute tabs failed:', e);
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  // Get current mute state for popup
  if (request.type === 'GET_MUTE_OTHERS_STATE') {
    sendResponse({
      success: true,
      canRestore: mutedByExtension.size > 0,
      mutedCount: mutedByExtension.size
    });
    return false;
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
      request.type === 'SET_TAB_CAPTURE_DEVICE') {
    (async () => {
      if (isFirefox) {
        sendResponse({ success: false, error: 'Not supported in Firefox' });
        return;
      }

      try {
        // Route directly to offscreen
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
    const deviceKey = `tab_${tabId}_device`;
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
        const prevKey = `tab_${tab.id}_prev`;
        const result = await browserAPI.storage.local.get([prevKey]);
        volume = result[prevKey] || 100;
        await browserAPI.storage.local.remove([prevKey]);
      } else {
        const prevKey = `tab_${tab.id}_prev`;
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
      id: 'muteOtherTabs',
      parentId: 'tabVolumeParent',
      title: 'Mute Other Tabs',
      contexts: MENU_CONTEXTS
    });

    contextMenusAPI.create({
      id: 'unmuteOtherTabs',
      parentId: 'tabVolumeParent',
      title: 'Unmute Other Tabs',
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
      title: 'Enable Bypass Mode',
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

      case 'muteOtherTabs':
        // Mute all other tabs using browser API
        const allTabsToMute = await browserAPI.tabs.query({});
        for (const otherTab of allTabsToMute) {
          if (otherTab.id !== tab.id && !otherTab.mutedInfo?.muted) {
            try {
              await browserAPI.tabs.update(otherTab.id, { muted: true });
              // Also mute media elements directly for sites that bypass browser mute
              try {
                await browserAPI.tabs.sendMessage(otherTab.id, { type: 'MUTE_MEDIA' });
              } catch (e) {
                // Tab might not have content script
              }
            } catch (e) {
              // Tab might not support muting
            }
          }
        }
        break;

      case 'unmuteOtherTabs':
        // Unmute all other tabs using browser API
        const allTabsToUnmute = await browserAPI.tabs.query({});
        for (const otherTab of allTabsToUnmute) {
          if (otherTab.id !== tab.id && otherTab.mutedInfo?.muted) {
            try {
              await browserAPI.tabs.update(otherTab.id, { muted: false });
              // Also unmute media elements directly
              try {
                await browserAPI.tabs.sendMessage(otherTab.id, { type: 'UNMUTE_MEDIA' });
              } catch (e) {
                // Tab might not have content script
              }
            } catch (e) {
              // Tab might not support unmuting
            }
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
