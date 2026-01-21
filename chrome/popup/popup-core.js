// Per-Tab Audio Control - Popup Core Module
// Browser API compatibility, state management, DOM references, utilities
// Note: browserAPI, isFirefox, and validation functions loaded from ../shared/

// Debug logging (uses shared createLogger if available, else local)
const popupLogger = typeof createLogger !== 'undefined' ? createLogger('[Popup]') : null;
const log = popupLogger ? popupLogger.log : ((...args) => DEBUG && console.log('[Popup]', ...args));
const logDebug = popupLogger ? popupLogger.debug : ((...args) => DEBUG && console.debug('[Popup]', ...args));

// ==================== State Variables ====================
let currentTabId = null;
let currentVolume = 100;
let previousVolume = 100;
let audioMode = 'boost'; // Always boost mode (0-500% volume with full device switching)
let currentBassBoost = 'off'; // 'off', 'low', 'medium', 'high', 'cut-low', 'cut-medium', 'cut-high'
let currentTrebleBoost = 'off'; // 'off', 'low', 'medium', 'high', 'cut-low', 'cut-medium', 'cut-high'
let currentVoiceBoost = 'off'; // 'off', 'low', 'medium', 'high'
let currentBalance = 0; // -100 to 100 (left to right)
let currentChannelMode = 'stereo'; // 'stereo', 'mono', 'swap'
let currentCompressor = 'off'; // 'off', 'podcast', 'movie', 'maximum'
let audibleTabs = []; // Array of tabs currently playing audio
let currentTabIndex = 0; // Index in audibleTabs array
let currentTabUrl = ''; // Store current tab URL for site rules

// Track if current domain is disabled (native mode)
let isDomainDisabled = false;

// Track if current page is a restricted browser page (no content script)
let isRestrictedPage = false;

// ==================== DOM Elements ====================
const volumeSlider = document.getElementById('volumeSlider');
const volumeValue = document.getElementById('volumeValue');
const sliderFill = document.getElementById('sliderFill');
const tabTitle = document.getElementById('tabTitle');
const tabUrl = document.getElementById('tabUrl');
const tabTitleExternal = document.getElementById('tabTitleExternal');
const muteBtn = document.getElementById('muteBtn');
const presetButtons = document.querySelectorAll('.preset-btn');
const logo = document.querySelector('.logo');
const themeToggle = document.getElementById('themeToggle');
const deviceSelect = document.getElementById('deviceSelect');
const refreshDevicesBtn = document.getElementById('refreshDevices');
const volumeUpBtn = document.getElementById('volumeUp');
const volumeDownBtn = document.getElementById('volumeDown');
const settingsBtn = document.getElementById('settingsBtn');
const prevTabBtn = document.getElementById('prevTabBtn');
const nextTabBtn = document.getElementById('nextTabBtn');
const tabCounter = document.getElementById('tabCounter');
const addSiteRuleBtn = document.getElementById('addSiteRuleBtn');
const ruleDomainCheckbox = document.getElementById('ruleDomainCheckbox');
const ruleStatus = document.getElementById('ruleStatus');
const statusMessage = document.getElementById('statusMessage');
const disableDomainBtn = document.getElementById('disableDomainBtn');
const tabCaptureBtn = document.getElementById('tabCaptureBtn');
const webAudioBtn = document.getElementById('webAudioBtn');
const modeToggle = document.getElementById('modeToggle');

// Effect button elements
const effectButtons = document.querySelectorAll('.effect-btn');

// Balance elements
const balanceSlider = document.getElementById('balanceSlider');
const balanceResetBtn = document.getElementById('balanceReset');
const balanceContainer = document.querySelector('.balance-container');
const stereoToggle = document.getElementById('stereoToggle');
const swapToggle = document.getElementById('swapToggle');
const monoToggle = document.getElementById('monoToggle');

// ==================== Constants ====================
// Note: These defaults are duplicated in options/options-constants.js (separate page context)
const DEFAULT_PRESETS = [50, 100, 200, 300, 500];
const DEFAULT_BASS_PRESETS = [6, 12, 24]; // Low, Medium, High boost in dB
const DEFAULT_BASS_CUT_PRESETS = [-6, -12, -24]; // Low, Medium, High cut in dB
const DEFAULT_TREBLE_PRESETS = [6, 12, 24]; // Low, Medium, High boost in dB
const DEFAULT_TREBLE_CUT_PRESETS = [-6, -12, -24]; // Low, Medium, High cut in dB
const DEFAULT_VOICE_PRESETS = [4, 10, 18]; // Low, Medium, High in dB (max 18)

// Storage quota constants (also defined in options/options-constants.js for options page context)
const SYNC_QUOTA_BYTES = 102400; // chrome.storage.sync quota is ~100KB
const QUOTA_WARNING_THRESHOLD = 0.80; // 80% - show warning
const QUOTA_CRITICAL_THRESHOLD = 0.90; // 90% - block new rules
const CLEANUP_DAYS = 90; // Rules unused for 90+ days

// Extreme volume warning
const EXTREME_VOLUME_THRESHOLD = 350; // Show warning above this level (start of ultra/purple zone)
let extremeVolumeWarningShown = false; // Track if warning already shown this session

// Header layout customization defaults (must match options-constants.js)
const DEFAULT_HEADER_LAYOUT = {
  order: ['spacer1', 'logo', 'tabCapture', 'webAudio', 'offMode', 'focus', 'spacer2', 'modeToggle', 'shortcuts', 'theme', 'settings', 'spacer3', 'companyLogo'],
  hidden: [],
  spacerCount: 3
};
const MAX_SPACERS = 3;

// Popup sections layout customization defaults (must match options-constants.js)
const DEFAULT_POPUP_SECTIONS_LAYOUT = {
  order: ['balance', 'enhancements', 'output', 'siteRule'],
  hidden: []
};

// Map storage section IDs to DOM data-section-id attributes
// (storage uses 'siteRule' but popup HTML uses 'addSite')
const POPUP_SECTION_ID_MAP = {
  balance: 'balance',
  enhancements: 'enhancements',
  output: 'output',
  siteRule: 'addSite'
};

// ==================== Utility Functions ====================

// Fetch storage values with defaults - consolidates common pattern
// Usage: const { customPresets, bassPresets } = await getStorageWithDefaults({
//   customPresets: DEFAULT_PRESETS,
//   bassBoostPresets: DEFAULT_BASS_PRESETS
// });
async function getStorageWithDefaults(keyDefaultPairs, storageArea = 'sync') {
  const keys = Object.keys(keyDefaultPairs);
  const storage = storageArea === 'sync' ? browserAPI.storage.sync : browserAPI.storage.local;
  const result = await storage.get(keys);

  const values = {};
  for (const key of keys) {
    values[key] = result[key] !== undefined ? result[key] : keyDefaultPairs[key];
  }
  return values;
}

// Check storage quota usage and return status
// Returns: { bytesUsed, bytesTotal, percentUsed, status: 'ok' | 'warning' | 'critical' }
async function checkStorageQuota() {
  try {
    const bytesUsed = await browserAPI.storage.sync.getBytesInUse(null);
    const bytesTotal = SYNC_QUOTA_BYTES;
    const percentUsed = bytesUsed / bytesTotal;

    let status = 'ok';
    if (percentUsed >= QUOTA_CRITICAL_THRESHOLD) {
      status = 'critical';
    } else if (percentUsed >= QUOTA_WARNING_THRESHOLD) {
      status = 'warning';
    }

    return { bytesUsed, bytesTotal, percentUsed, status };
  } catch (e) {
    // getBytesInUse might not be available in all contexts
    console.debug('[TabVolume] Could not check storage quota:', e.message);
    return { bytesUsed: 0, bytesTotal: SYNC_QUOTA_BYTES, percentUsed: 0, status: 'ok' };
  }
}

// Safe storage set with quota checking - warns user if approaching limits
// Returns: { success: boolean, quotaStatus: string }
async function safeStorageSet(data, showWarnings = true) {
  const quota = await checkStorageQuota();

  // Block writes if critically full (unless it's a delete/reduce operation)
  if (quota.status === 'critical') {
    const dataSize = JSON.stringify(data).length;
    if (dataSize > 100) { // Allow small operations like toggling booleans
      if (showWarnings && typeof showStatus === 'function') {
        showStatus('Storage nearly full. Delete some site rules to continue.', 'error', 5000);
      }
      console.warn('[TabVolume] Storage critical:', Math.round(quota.percentUsed * 100) + '% used');
      return { success: false, quotaStatus: 'critical' };
    }
  }

  try {
    await browserAPI.storage.sync.set(data);

    // Show warning after successful write if approaching limit
    if (quota.status === 'warning' && showWarnings && typeof showStatus === 'function') {
      showStatus(`Storage ${Math.round(quota.percentUsed * 100)}% full. Consider removing old site rules.`, 'warning', 4000);
    }

    return { success: true, quotaStatus: quota.status };
  } catch (e) {
    if (e.message?.includes('QUOTA_BYTES')) {
      if (showWarnings && typeof showStatus === 'function') {
        showStatus('Storage full. Delete some site rules to continue.', 'error', 5000);
      }
      return { success: false, quotaStatus: 'full' };
    }
    throw e; // Re-throw unexpected errors
  }
}

// Throttle helper for slider (limits message rate while maintaining responsiveness)
function throttle(func, limit) {
  let inThrottle;
  let lastValue;
  return function(...args) {
    lastValue = args;
    if (!inThrottle) {
      func.apply(this, lastValue);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        // Fire one last time with most recent value to ensure final position is set
        if (lastValue) {
          func.apply(this, lastValue);
          lastValue = null;
        }
      }, limit);
    }
  };
}

// Non-linear slider conversion functions
// In full mode (boost capable):
//   Slider position 0-50 maps to volume 0-100 (fine control for normal range)
//   Slider position 50-100 maps to volume 100-500 (boost range)
// In native mode (0-100% only):
//   Slider position 0-100 maps directly to volume 0-100 (linear)
function volumeToPosition(volume) {
  // Native mode: linear 1:1 mapping (0-100)
  if (isDomainDisabled) {
    return Math.min(100, Math.max(0, volume));
  }
  // Full mode: non-linear mapping for boost
  if (volume <= 100) {
    return volume / 2; // 0-100 volume → 0-50 position
  } else {
    return 50 + (volume - 100) / 8; // 100-500 volume → 50-100 position
  }
}

function positionToVolume(position) {
  // Validate input - return 100 (default) if invalid
  if (!Number.isFinite(position)) {
    return 100;
  }
  // Native mode: linear 1:1 mapping (0-100)
  if (isDomainDisabled) {
    return Math.min(100, Math.max(0, Math.round(position)));
  }
  // Full mode: non-linear mapping for boost
  if (position <= 50) {
    return position * 2; // 0-50 position → 0-100 volume
  } else {
    return 100 + (position - 50) * 8; // 50-100 position → 100-500 volume
  }
}

// Extract domain from URL
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return url;
  }
}

// Check if URL is a restricted browser page where content scripts can't run
// Used to silently skip messaging on these pages instead of logging errors
const restrictedUrlPatterns = [
  /^chrome:\/\//,
  /^chrome-extension:\/\//,
  /^about:/,
  /^edge:\/\//,
  /^moz-extension:\/\//,
  /^file:\/\//,
  /^brave:\/\//,
  /^vivaldi:\/\//
];

function isRestrictedUrl(url) {
  if (!url) return true;
  return restrictedUrlPatterns.some(pattern => pattern.test(url));
}

// ==================== Status Messages ====================

// Show global status message at the bottom of popup
// Types: 'info', 'success', 'warning', 'error'
let statusTimeout = null;
let onStatusExpiredCallback = null; // Set by popup-tabs.js to restore focus reminder
function showStatus(message, type = 'info', duration = 4000) {
  // Clear any existing timeout
  if (statusTimeout) {
    clearTimeout(statusTimeout);
    statusTimeout = null;
  }

  // Don't let other persistent messages overwrite Active Tab Audio reminder
  // (but allow Active Tab Audio messages and temporary messages through)
  if (statusMessage.textContent.includes('Active Tab Audio') &&
      !message.includes('Active Tab Audio') &&
      duration === 0) {
    return;
  }

  statusMessage.textContent = message;
  statusMessage.className = 'status-message ' + type;

  // Auto-scroll to show the status message if it causes overflow
  statusMessage.scrollIntoView({ behavior: 'smooth', block: 'end' });

  // Auto-hide after duration (0 = persistent)
  if (duration > 0) {
    statusTimeout = setTimeout(() => {
      statusMessage.className = 'status-message';
      statusTimeout = null;
      // After temporary message expires, restore focus reminder if active
      if (onStatusExpiredCallback) {
        onStatusExpiredCallback();
      }
    }, duration);
  }
}

// Clear any status message (preserves Active Tab Audio reminder if active)
function clearStatus() {
  if (statusTimeout) {
    clearTimeout(statusTimeout);
    statusTimeout = null;
  }
  // Don't clear the Active Tab Audio reminder - it should persist until disabled
  if (statusMessage.textContent.includes('Active Tab Audio')) {
    return;
  }
  statusMessage.textContent = '';
  statusMessage.className = 'status-message';
}

// Convenience function for errors
function showError(message, duration = 5000) {
  showStatus(message, 'error', duration);
}

// Show rule status message
function showRuleStatus(message, isError = false) {
  ruleStatus.textContent = message;
  ruleStatus.className = 'rule-status ' + (isError ? 'error' : 'success');

  setTimeout(() => {
    ruleStatus.className = 'rule-status';
  }, 3000);
}

// ==================== Theme Handling ====================

// Theme handling (synced across devices)
async function loadTheme() {
  const result = await browserAPI.storage.sync.get(['theme']);
  // Default to dark mode for new users
  if (result.theme === 'light') {
    document.body.classList.add('light-mode');
  }
}

async function toggleTheme() {
  const isLight = document.body.classList.toggle('light-mode');
  await browserAPI.storage.sync.set({ theme: isLight ? 'light' : 'dark' });
}

// Load theme immediately
loadTheme();

// Theme toggle handler
themeToggle.addEventListener('click', toggleTheme);

// ==================== Tab Info Location Setting ====================

// Apply setting for tab info placement (inside visualizer or below)
async function applyTabInfoLocation() {
  try {
    const result = await browserAPI.storage.sync.get(['tabInfoLocation']);
    // Default to 'below' if not set
    const location = result.tabInfoLocation || 'below';

    if (location === 'inside') {
      // Show title and URL inside visualizer
      if (tabTitle) tabTitle.style.visibility = '';
      if (tabUrl) tabUrl.style.visibility = '';
      if (tabTitleExternal) tabTitleExternal.classList.remove('visible');
    } else {
      // Show title below visualizer (hide internal, show external)
      if (tabTitle) tabTitle.style.visibility = 'hidden';
      if (tabUrl) tabUrl.style.visibility = 'hidden';
      if (tabTitleExternal) {
        // Copy the title text to external element
        tabTitleExternal.textContent = tabTitle ? tabTitle.textContent : '';
        tabTitleExternal.classList.add('visible');
      }
    }
  } catch (error) {
    console.error('Error applying tab info location setting:', error);
  }
}

// Load setting immediately
applyTabInfoLocation();

// Keep external title in sync when internal title changes
if (tabTitle && tabTitleExternal) {
  const titleObserver = new MutationObserver(() => {
    if (tabTitleExternal.classList.contains('visible')) {
      tabTitleExternal.textContent = tabTitle.textContent;
    }
  });
  titleObserver.observe(tabTitle, { childList: true, characterData: true, subtree: true });
}

// Listen for storage changes to update in real-time
browserAPI.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.tabInfoLocation) {
    applyTabInfoLocation();
  }
});

// ==================== Header Layout Customization ====================

// Apply custom header layout from storage
async function applyHeaderLayout() {
  try {
    const result = await browserAPI.storage.sync.get(['headerLayout']);
    const layout = result.headerLayout || DEFAULT_HEADER_LAYOUT;

    // Migration: pauseOthers → muteOthers → focus (v3.3.25, v4.1.4)
    if (layout.order) {
      layout.order = layout.order.map(id => {
        if (id === 'pauseOthers' || id === 'muteOthers') return 'focus';
        return id;
      });
    }
    if (layout.hidden) {
      layout.hidden = layout.hidden.map(id => {
        if (id === 'pauseOthers' || id === 'muteOthers') return 'focus';
        return id;
      });
    }

    // Migration: audioMode → tabCapture + webAudio (v4.1.19)
    if (layout.order && layout.order.includes('audioMode')) {
      const newOrder = [];
      for (const id of layout.order) {
        if (id === 'audioMode') {
          newOrder.push('tabCapture', 'webAudio');
        } else {
          newOrder.push(id);
        }
      }
      layout.order = newOrder;
    }
    if (layout.hidden) {
      layout.hidden = layout.hidden.filter(id => id !== 'audioMode');
    }

    const header = document.querySelector('.header');
    if (!header) return;

    // Collect all header items by data attribute
    const items = {};
    header.querySelectorAll('[data-header-item]').forEach(el => {
      items[el.dataset.headerItem] = el;
    });

    // Required items that must always be visible and in order
    const requiredItems = ['companyLogo', 'tabCapture', 'webAudio', 'offMode', 'modeToggle', 'settings', 'logo'];

    // Validate order - ensure all DOM items are in the order
    const orderSet = new Set(layout.order);
    for (const itemId of Object.keys(items)) {
      if (!orderSet.has(itemId) && !itemId.startsWith('spacer')) {
        // Item exists in DOM but not in order - add it at the end
        layout.order.push(itemId);
      }
    }

    // Handle spacers: ensure we have the right number
    // Use ?? instead of || so that spacerCount of 0 is respected (0 is falsy with ||)
    const spacerCount = Math.min(Math.max(0, layout.spacerCount ?? 3), MAX_SPACERS);
    const existingSpacer = items.spacer1;

    // Create additional spacers if needed
    for (let i = 2; i <= spacerCount; i++) {
      const spacerId = `spacer${i}`;
      if (!items[spacerId] && existingSpacer) {
        const newSpacer = existingSpacer.cloneNode(true);
        newSpacer.dataset.headerItem = spacerId;
        items[spacerId] = newSpacer;
      }
    }

    // Build the ordered list, filtering out spacers beyond spacerCount
    const orderedItems = [];
    for (const itemId of layout.order) {
      // Skip extra spacers
      if (itemId.startsWith('spacer')) {
        const spacerNum = parseInt(itemId.replace('spacer', ''), 10);
        if (spacerNum > spacerCount) continue;
      }

      if (items[itemId]) {
        orderedItems.push(items[itemId]);
      }
    }

    // Show/hide spacers based on spacerCount (use classList for CSP compliance)
    for (let i = 1; i <= MAX_SPACERS; i++) {
      const spacerId = `spacer${i}`;
      if (items[spacerId]) {
        items[spacerId].classList.toggle('header-item-hidden', i > spacerCount);
      }
    }

    // Reorder elements by appending in order
    orderedItems.forEach(el => {
      header.appendChild(el);
    });

    // Hide items in the hidden array (but never hide required items)
    const hiddenSet = new Set(layout.hidden || []);
    for (const [itemId, el] of Object.entries(items)) {
      if (hiddenSet.has(itemId) && !requiredItems.includes(itemId)) {
        el.classList.add('header-item-hidden');
      }
    }

  } catch (e) {
    console.debug('[Popup] Could not apply header layout:', e.message);
  }
}

// Apply header layout immediately (before visible)
applyHeaderLayout();

// ==================== Popup Sections Layout Customization ====================

// Apply custom popup sections layout from storage (order and visibility)
async function applyPopupSectionsLayout() {
  try {
    const result = await browserAPI.storage.sync.get(['popupSectionsLayout']);
    const layout = result.popupSectionsLayout || DEFAULT_POPUP_SECTIONS_LAYOUT;

    // Validate layout structure
    if (!layout.order || !Array.isArray(layout.order)) {
      layout.order = [...DEFAULT_POPUP_SECTIONS_LAYOUT.order];
    }
    if (!layout.hidden || !Array.isArray(layout.hidden)) {
      layout.hidden = [];
    }

    // Collect sections by data-section-id
    // Includes static sections, compact sections (no collapsible sections anymore)
    const sections = {};
    document.querySelectorAll('[data-section-id].static-section, [data-section-id].compact-section').forEach(el => {
      sections[el.dataset.sectionId] = el;
    });

    if (Object.keys(sections).length === 0) return;

    // Apply CSS order based on layout.order
    // Order values start at 1 so unstyled items (order: 0) appear first
    let orderIndex = 1;
    for (const storageId of layout.order) {
      const domId = POPUP_SECTION_ID_MAP[storageId];
      if (domId && sections[domId]) {
        sections[domId].style.order = orderIndex;
        orderIndex++;
      }
    }

    // Handle sections that may exist in DOM but not in stored order (defensive)
    for (const [domId, el] of Object.entries(sections)) {
      if (!el.style.order) {
        el.style.order = orderIndex;
        orderIndex++;
      }
    }

    // Apply hidden class based on layout.hidden
    const hiddenSet = new Set(layout.hidden || []);
    for (const [storageId, domId] of Object.entries(POPUP_SECTION_ID_MAP)) {
      if (sections[domId]) {
        if (hiddenSet.has(storageId)) {
          sections[domId].classList.add('section-hidden');
        } else {
          sections[domId].classList.remove('section-hidden');
        }
      }
    }

  } catch (e) {
    console.debug('[Popup] Could not apply popup sections layout:', e.message);
  }
}

// Apply popup sections layout immediately (before visible)
applyPopupSectionsLayout();

// ==================== Basic/Advanced Mode Toggle ====================

// Load popup mode (synced across devices)
async function loadPopupMode() {
  const result = await browserAPI.storage.sync.get(['popupMode']);
  const mode = result.popupMode || 'basic'; // Default to basic for new users
  if (mode === 'basic') {
    document.body.classList.add('basic-mode');
    modeToggle.title = 'Switch to Advanced mode';
  } else {
    document.body.classList.remove('basic-mode');
    modeToggle.title = 'Switch to Basic mode';
  }
}

// Toggle between basic and advanced mode
async function togglePopupMode() {
  const isBasic = document.body.classList.toggle('basic-mode');
  const mode = isBasic ? 'basic' : 'advanced';
  modeToggle.title = isBasic ? 'Switch to Advanced mode' : 'Switch to Basic mode';
  await browserAPI.storage.sync.set({ popupMode: mode });
}

// Load mode immediately
loadPopupMode();

// Mode toggle handler
modeToggle.addEventListener('click', togglePopupMode);

// Settings button handler
settingsBtn.addEventListener('click', () => {
  // Open with query param so options page knows to start with sections collapsed
  browserAPI.tabs.create({ url: browserAPI.runtime.getURL('options/options.html?from=popup') });
  window.close();
});
