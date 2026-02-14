// Per-Tab Audio Control - Popup Core Module
// Browser API compatibility, state management, DOM references, utilities
// Note: browserAPI, isFirefox, and validation functions loaded from ../shared/

// Debug logging (uses shared createLogger if available, else local)
const popupLogger = typeof createLogger !== 'undefined' ? createLogger('[Popup]') : null;
const log = popupLogger ? popupLogger.log : ((...args) => DEBUG && console.log('[Popup]', ...args));
const logDebug = popupLogger ? popupLogger.debug : ((...args) => DEBUG && console.debug('[Popup]', ...args));

// ==================== State Variables ====================
let currentTabId = null;
let currentVolume = VOLUME_DEFAULT;
let previousVolume = VOLUME_DEFAULT;
let audioMode = 'boost'; // Always boost mode (0-500% volume with full device switching)
let currentBassBoost = 'off'; // 'off', 'low', 'medium', 'high', 'cut-low', 'cut-medium', 'cut-high'
let currentTrebleBoost = 'off'; // 'off', 'low', 'medium', 'high', 'cut-low', 'cut-medium', 'cut-high'
let currentVoiceBoost = 'off'; // 'off', 'low', 'medium', 'high'
let currentBalance = 0; // -100 to 100 (left to right)
let currentChannelMode = 'stereo'; // 'stereo', 'mono', 'swap'
let currentCompressor = 'off'; // 'off', 'podcast', 'movie', 'maximum'
let currentSpeedLevel = 'off'; // 'off', 'slow-low/medium/high', 'fast-low/medium/high', 'slider:RATE'
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
const audioModeToggle = document.getElementById('audioModeToggle');
const modeToggle = document.getElementById('modeToggle');

// Effect button elements
const effectButtons = document.querySelectorAll('.effect-btn');

// Balance elements
const balanceSlider = document.getElementById('balanceSlider');
const balanceResetBtn = document.getElementById('balanceReset');
const stereoToggle = document.getElementById('stereoToggle');
const swapToggle = document.getElementById('swapToggle');
const monoToggle = document.getElementById('monoToggle');

// ==================== Constants ====================
// Note: All default values are centralized in shared/constants.js (DEFAULTS object)

// Storage quota constants (also defined in options/options-constants.js for options page context)
const SYNC_QUOTA_BYTES = 102400; // chrome.storage.sync quota is ~100KB
const QUOTA_WARNING_THRESHOLD = 0.80; // 80% - show warning
const QUOTA_CRITICAL_THRESHOLD = 0.90; // 90% - block new rules
const CLEANUP_DAYS = 90; // Rules unused for 90+ days

// High volume warning
const EXTREME_VOLUME_THRESHOLD = 100; // Show warning above 100% (boosted volume)
// Flag is loaded from chrome.storage.session in initVolumeWarningState()

const MAX_SPACERS = 4;

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
        showStatus('Storage nearly full. Delete old rules.', 'error', 5000);
      }
      console.warn(`[TabVolume] Storage critical: ${Math.round(quota.percentUsed * 100)}% used`);
      return { success: false, quotaStatus: 'critical' };
    }
  }

  try {
    await browserAPI.storage.sync.set(data);

    // Show warning after successful write if approaching limit
    if (quota.status === 'warning' && showWarnings && typeof showStatus === 'function') {
      showStatus(`Storage ${Math.round(quota.percentUsed * 100)}% full. Clean up old rules.`, 'warning', 4000);
    }

    return { success: true, quotaStatus: quota.status };
  } catch (e) {
    if (e.message?.includes('QUOTA_BYTES')) {
      if (showWarnings && typeof showStatus === 'function') {
        showStatus('Storage full. Delete old rules.', 'error', 5000);
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
  let pos;
  if (volume <= 100) {
    pos = volume / 2; // 0-100 volume → 0-50 position
  } else {
    pos = 50 + (volume - 100) / 8; // 100-500 volume → 50-100 position
  }
  return Math.min(100, Math.max(0, pos));
}

function positionToVolume(position) {
  // Validate input - return 100 (default) if invalid
  if (!Number.isFinite(position)) {
    return VOLUME_DEFAULT;
  }
  // Clamp position to valid range
  position = Math.min(100, Math.max(0, position));
  // Native mode: linear 1:1 mapping (0-100)
  if (isDomainDisabled) {
    return Math.min(VOLUME_DEFAULT, Math.max(VOLUME_MIN, Math.round(position)));
  }
  // Full mode: non-linear mapping for boost
  let vol;
  if (position <= 50) {
    vol = position * 2; // 0-50 position → 0-100 volume
  } else {
    vol = 100 + (position - 50) * 8; // 50-100 position → 100-500 volume
  }
  return Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, Math.round(vol)));
}

// Extract domain from URL (returns null on invalid URL instead of raw input)
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return null;
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

// Check if URL is a known DRM-protected streaming site
// These sites use Encrypted Media Extensions that prevent raw audio access
function isDrmSite(url) {
  if (!url) return false;
  const hostname = extractDomain(url);
  if (!hostname) return false;
  // Check exact match
  if (DRM_DOMAINS.has(hostname)) return true;
  // Check if any DRM domain is a suffix (e.g., "watch.sling.com" matches "sling.com")
  const parts = hostname.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join('.');
    if (DRM_DOMAINS.has(parent)) return true;
  }
  return false;
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
  statusMessage.className = `status-message ${type}`;

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
  // Don't clear persistent notifications - they have their own lifecycle
  // Active Tab Audio: persists until user disables focus mode
  // DRM site hint: auto-dismisses after 8 seconds
  if (statusMessage.textContent.includes('Active Tab Audio') ||
      statusMessage.textContent.includes('DRM site')) {
    return;
  }
  if (statusTimeout) {
    clearTimeout(statusTimeout);
    statusTimeout = null;
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
  ruleStatus.className = `rule-status ${isError ? 'error' : 'success'}`;

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
  } else {
    document.body.classList.remove('light-mode');
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

// Apply setting for tab info placement (inside, below, above, or off)
async function applyTabInfoLocation() {
  try {
    const result = await browserAPI.storage.sync.get(['tabInfoLocation']);
    let location = result.tabInfoLocation || DEFAULTS.tabInfoLocation;
    const tabInfoWrapper = document.querySelector('.tab-info-wrapper');

    // If visualizer is hidden, 'inside' is invalid — treat as 'above'
    if (document.body.classList.contains('visualizer-hidden') && location === 'inside') {
      location = 'above';
    }

    if (location === 'inside') {
      // Show title and URL inside visualizer
      if (tabTitle) tabTitle.style.visibility = '';
      if (tabUrl) tabUrl.style.visibility = '';
      if (tabTitleExternal) {
        tabTitleExternal.classList.remove('visible', 'above');
        // Ensure external element is after wrapper (for transition from 'above')
        if (tabInfoWrapper) {
          tabInfoWrapper.parentNode.insertBefore(tabTitleExternal, tabInfoWrapper.nextSibling);
        }
      }
    } else if (location === 'below') {
      // Show title below visualizer (hide internal, show external)
      if (tabTitle) tabTitle.style.visibility = 'hidden';
      if (tabUrl) tabUrl.style.visibility = 'hidden';
      if (tabTitleExternal) {
        tabTitleExternal.textContent = tabTitle ? tabTitle.textContent : '';
        tabTitleExternal.classList.add('visible');
        tabTitleExternal.classList.remove('above');
        // Ensure external element is after wrapper (for transition from 'above')
        if (tabInfoWrapper) {
          tabInfoWrapper.parentNode.insertBefore(tabTitleExternal, tabInfoWrapper.nextSibling);
        }
      }
    } else if (location === 'above') {
      // Show title above visualizer
      if (tabTitle) tabTitle.style.visibility = 'hidden';
      if (tabUrl) tabUrl.style.visibility = 'hidden';
      if (tabTitleExternal && tabInfoWrapper) {
        tabTitleExternal.textContent = tabTitle ? tabTitle.textContent : '';
        tabInfoWrapper.parentNode.insertBefore(tabTitleExternal, tabInfoWrapper);
        tabTitleExternal.classList.add('visible', 'above');
      }
    } else if (location === 'off') {
      // Hide title entirely
      if (tabTitle) tabTitle.style.visibility = 'hidden';
      if (tabUrl) tabUrl.style.visibility = 'hidden';
      if (tabTitleExternal) tabTitleExternal.classList.remove('visible', 'above');
    }
  } catch (error) {
    console.error('Error applying tab info location setting:', error);
  }
}

// Load setting immediately
applyTabInfoLocation();

// ==================== Show Visualizer Setting ====================

async function applyShowVisualizer() {
  try {
    const result = await browserAPI.storage.sync.get(['showVisualizer']);
    const show = result.showVisualizer ?? DEFAULTS.showVisualizer;
    document.body.classList.toggle('visualizer-hidden', !show);

    // If visualizer is hidden and tab info is set to 'inside', re-apply to force 'above'
    if (!show) {
      const locResult = await browserAPI.storage.sync.get(['tabInfoLocation']);
      if ((locResult.tabInfoLocation || DEFAULTS.tabInfoLocation) === 'inside') {
        applyTabInfoLocation();
      }
    }
  } catch (error) {
    console.error('Error applying show visualizer setting:', error);
  }
}

// Load setting immediately
applyShowVisualizer();

// ==================== Show Seekbar Setting ====================

async function applyShowSeekbar() {
  try {
    const result = await browserAPI.storage.sync.get(['showSeekbar']);
    const show = result.showSeekbar ?? DEFAULTS.showSeekbar;
    document.body.classList.toggle('seekbar-hidden', !show);
  } catch (error) {
    console.error('Error applying show seekbar setting:', error);
  }
}

// Load setting immediately
applyShowSeekbar();

// ==================== Shortcuts Footer Visibility ====================

async function applyShortcutsFooterVisibility() {
  try {
    const result = await browserAPI.storage.sync.get(['showShortcutsFooter']);
    const show = result.showShortcutsFooter ?? DEFAULTS.showShortcutsFooter;
    const footer = document.getElementById('shortcutsFooter');
    if (footer) {
      footer.classList.toggle('hidden', !show);
    }
  } catch (error) {
    console.error('Error applying shortcuts footer visibility:', error);
  }
}

// Load setting immediately
applyShortcutsFooterVisibility();

// Keep external title in sync when internal title changes
if (tabTitle && tabTitleExternal) {
  const titleObserver = new MutationObserver(() => {
    if (tabTitleExternal.classList.contains('visible')) {
      tabTitleExternal.textContent = tabTitle.textContent;
    }
  });
  titleObserver.observe(tabTitle, { childList: true, characterData: true, subtree: true });
}

// Listen for storage changes to update popup in real-time
// (e.g., user changes settings in options page while popup is open)
browserAPI.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    if (changes.popupMode) loadPopupMode();
    if (changes.showVisualizer) applyShowVisualizer();
    if (changes.tabInfoLocation) applyTabInfoLocation();
    if (changes.showSeekbar) applyShowSeekbar();
    if (changes.showShortcutsFooter) applyShortcutsFooterVisibility();
    if (changes.theme) loadTheme();
    if (changes.headerLayout) applyHeaderLayout();
    if (changes.popupSectionsLayout) { applyPopupSectionsLayout(); loadEqControlMode(); }
    if (changes.customPresets) loadCustomPresets();
    if (changes.volumeSteps) loadVolumeSteps();
    if (changes.visualizerColor !== undefined) {
      customVisualizerColor = changes.visualizerColor.newValue || null;
    }
    if (changes.eqControlMode) loadEqControlMode();
    if (changes.bassBoostPresets || changes.bassCutPresets ||
        changes.trebleBoostPresets || changes.trebleCutPresets ||
        changes.voiceBoostPresets ||
        changes.speedSlowPresets || changes.speedFastPresets) {
      loadEffectPresets();
    }
  }
  if (area === 'local') {
    if (changes.visualizerType) loadVisualizerType();
    if (changes.visualizerColor !== undefined) {
      customVisualizerColor = changes.visualizerColor.newValue || null;
    }
  }
});

// ==================== Header Layout Customization ====================

// Apply custom header layout from storage
async function applyHeaderLayout() {
  try {
    const result = await browserAPI.storage.sync.get(['headerLayout']);
    const layout = result.headerLayout || JSON.parse(JSON.stringify(DEFAULTS.headerLayout));

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

    // Migration: remove shortcuts from header (v4.3.21 - moved to footer)
    if (layout.order) {
      layout.order = layout.order.filter(id => id !== 'shortcuts');
    }
    if (layout.hidden) {
      layout.hidden = layout.hidden.filter(id => id !== 'shortcuts');
    }

    // Migration: tabCapture + webAudio + offMode → audioMode (v4.3.21)
    if (layout.order && (layout.order.includes('tabCapture') || layout.order.includes('webAudio') || layout.order.includes('offMode'))) {
      // Find position of first audio mode item to insert the combined toggle there
      const audioModeItems = ['tabCapture', 'webAudio', 'offMode'];
      let insertIdx = layout.order.findIndex(id => audioModeItems.includes(id));
      layout.order = layout.order.filter(id => !audioModeItems.includes(id));
      if (insertIdx >= 0 && !layout.order.includes('audioMode')) {
        layout.order.splice(insertIdx, 0, 'audioMode');
      }
      if (layout.hidden) {
        layout.hidden = layout.hidden.filter(id => !audioModeItems.includes(id));
      }
    }

    const header = document.querySelector('.header');
    if (!header) return;

    // Collect all header items by data attribute
    const items = {};
    header.querySelectorAll('[data-header-item]').forEach(el => {
      items[el.dataset.headerItem] = el;
    });

    // Required items that must always be visible and in order
    const requiredItems = ['companyLogo', 'brandText', 'audioMode', 'modeToggle', 'settings'];

    // Validate order - ensure all DOM items are in the order
    const orderSet = new Set(layout.order);
    for (const itemId of Object.keys(items)) {
      if (!orderSet.has(itemId) && !itemId.startsWith('spacer')) {
        // Item exists in DOM but not in order - add it at the end
        layout.order.push(itemId);
      }
    }

    // Handle spacers: ensure we have the right number
    // Minimum 1 spacer (spacer1 is locked between logo and brand text)
    const spacerCount = Math.min(Math.max(1, layout.spacerCount ?? 4), MAX_SPACERS);
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

    // Apply visibility: remove hidden class from all non-spacer items first, then hide as needed
    const hiddenSet = new Set(layout.hidden || []);
    for (const [itemId, el] of Object.entries(items)) {
      if (!itemId.startsWith('spacer')) {
        el.classList.toggle('header-item-hidden', hiddenSet.has(itemId) && !requiredItems.includes(itemId));
      }
    }

  } catch (e) {
    console.debug('[Popup] Could not apply header layout:', e.message);
  }
}

// Apply header layout immediately (before visible)
applyHeaderLayout();

// ==================== Popup Sections Layout Customization ====================

// Apply custom popup sections layout from storage (order and visibility of individual items)
async function applyPopupSectionsLayout() {
  try {
    const result = await browserAPI.storage.sync.get(['popupSectionsLayout']);
    const layout = result.popupSectionsLayout || DEFAULTS.popupSectionsLayout;

    // Validate layout structure
    if (!layout.order || !Array.isArray(layout.order)) {
      layout.order = [...DEFAULTS.popupSectionsLayout.order];
    }
    if (!layout.hidden || !Array.isArray(layout.hidden)) {
      layout.hidden = [];
    }

    // Collect advanced items by data-item-id
    const items = {};
    document.querySelectorAll('[data-item-id]').forEach(el => {
      items[el.dataset.itemId] = el;
    });

    if (Object.keys(items).length === 0) return;

    // Migrate: remove stale IDs not in DOM, add missing DOM IDs
    const validItemIds = new Set(Object.keys(items));
    layout.order = layout.order.filter(id => validItemIds.has(id));
    for (const itemId of validItemIds) {
      if (!layout.order.includes(itemId)) {
        layout.order.push(itemId);
      }
    }
    layout.hidden = layout.hidden.filter(id => validItemIds.has(id));

    // Apply CSS order based on layout.order
    let orderIndex = 1;
    for (const itemId of layout.order) {
      if (items[itemId]) {
        items[itemId].style.order = orderIndex;
        orderIndex++;
      }
    }

    // Apply hidden class based on layout.hidden
    const hiddenSet = new Set(layout.hidden);
    for (const [itemId, el] of Object.entries(items)) {
      el.classList.toggle('section-hidden', hiddenSet.has(itemId));
    }

    // Manage dividers: hide all, then show for visible items except the first
    const visibleItems = layout.order
      .filter(id => items[id] && !hiddenSet.has(id));

    for (const [, el] of Object.entries(items)) {
      const divider = el.querySelector('.effects-divider');
      if (divider) divider.classList.add('hidden');
    }

    for (let i = 0; i < visibleItems.length; i++) {
      const divider = items[visibleItems[i]].querySelector('.effects-divider');
      if (divider && i > 0) {
        divider.classList.remove('hidden');
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
  const mode = result.popupMode || DEFAULTS.popupMode;
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
