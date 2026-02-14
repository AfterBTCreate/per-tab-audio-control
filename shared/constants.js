// Shared Constants
// Used by: popup, options, background, content

'use strict';

// Volume constants
const VOLUME_MIN = 0;
const VOLUME_MAX = 500;
const VOLUME_DEFAULT = 100;

// Volume color thresholds
const VOLUME_THRESHOLDS = {
  MUTED: 0,
  LOW: 50,
  NORMAL: 100,
  BOOST: 200,
  HIGH: 300,
  ULTRA: 500
};

// ==================== Single Source of Truth for All Defaults ====================
// Used by popup and options pages (loaded via <script> tag in both).
// background.js (service worker) maintains its own copy since it can't import shared files.
const DEFAULTS = {
  // Appearance
  theme: 'dark',
  visualizerType: 'bars',
  showVisualizer: true,
  showSeekbar: true,
  seekbarTimeDisplay: 'total',
  tabInfoLocation: 'inside',
  popupMode: 'basic',
  eqControlMode: 'sliders',
  showShortcutsFooter: true,
  badgeStyle: 'light',

  // Audio mode (Chrome uses Tab Capture, Firefox uses Web Audio)
  audioMode: { chrome: 'tabcapture', firefox: 'auto' },

  // Volume
  volumePresets: [50, 100, 200, 300, 500],
  volumeSteps: { scrollWheel: 5, keyboard: 1, buttons: 1 },

  // EQ presets (Low, Medium, High)
  bassBoostPresets: [6, 12, 24],
  bassCutPresets: [-6, -12, -24],
  trebleBoostPresets: [6, 12, 24],
  trebleCutPresets: [-6, -12, -24],
  voiceBoostPresets: [4, 10, 18],
  speedSlowPresets: [0.75, 0.50, 0.25],
  speedFastPresets: [1.25, 1.50, 2.00],

  // Header layout
  headerLayout: {
    order: ['companyLogo', 'spacer1', 'brandText', 'spacer2', 'audioMode', 'focus', 'spacer3', 'modeToggle', 'theme', 'settings', 'spacer4', 'logo'],
    hidden: [],
    spacerCount: 4
  },

  // Balance presets (values 1-100, applied as negative/positive pan)
  balancePresets: { left: 100, right: 100 },

  // Popup sections layout (individual advanced controls)
  popupSectionsLayout: {
    order: ['balance', 'speed', 'bass', 'treble', 'voice', 'range', 'output', 'siteRule'],
    hidden: [],
    controlMode: {}  // per-item overrides, e.g. { speed: 'presets', bass: 'sliders' }
  }
};

// Legacy aliases (used by background.js which can't access DEFAULTS)
const DEFAULT_VOLUME_PRESETS = DEFAULTS.volumePresets;
const DEFAULT_VOLUME_STEPS = DEFAULTS.volumeSteps;

// Derived: browser-specific audio mode default
// isFirefox is defined in shared/browser-api.js (loaded before this file by popup/options)
const DEFAULT_AUDIO_MODE = typeof isFirefox !== 'undefined' && isFirefox
  ? DEFAULTS.audioMode.firefox : DEFAULTS.audioMode.chrome;

// Effect ranges
const EFFECT_RANGES = {
  bass: { min: -24, max: 24, default: 0 },
  treble: { min: -24, max: 24, default: 0 },
  voice: { min: 0, max: 18, default: 0 },
  speed: { min: 0.05, max: 5, default: 1 }
};

// Compressor presets
const COMPRESSOR_PRESETS = {
  off: { threshold: -50, knee: 40, ratio: 1, attack: 0, release: 0.25 },
  podcast: { threshold: -24, knee: 20, ratio: 4, attack: 0.003, release: 0.25 },
  movie: { threshold: -30, knee: 30, ratio: 8, attack: 0.001, release: 0.5 },
  max: { threshold: -40, knee: 40, ratio: 20, attack: 0.001, release: 1.0 }
};

// Storage keys
const STORAGE_KEYS = {
  // Sync storage
  VOLUME_PRESETS: 'volumePresets',
  VOLUME_STEPS: 'volumeSteps',
  SITE_RULES: 'siteVolumeRules',
  DEFAULT_DEVICE: 'defaultAudioDevice',
  THEME: 'theme',
  POPUP_MODE: 'popupMode',
  DEFAULT_AUDIO_MODE: 'defaultAudioMode',
  EQ_CONTROL_MODE: 'eqControlMode',
  // NATIVE_MODE_REFRESH removed in v4.1.17 - mode switches work without refresh
  HEADER_LAYOUT: 'headerLayout',
  DISABLED_DOMAINS: 'disabledDomains',

  // Local storage (per-tab)
  TAB_PREFIX: 'tab_'
};

// Tab storage suffixes (used with getTabStorageKey helper)
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

// Known DRM-protected streaming domains (EME/Encrypted Media Extensions)
// These sites use DRM that prevents the extension from accessing raw audio data.
// Used to show a proactive info hint when the popup opens on these sites.
const DRM_DOMAINS = new Set([
  // Video streaming
  'netflix.com',
  'disneyplus.com',
  'hulu.com',
  'max.com',
  'play.max.com',
  'peacocktv.com',
  'paramountplus.com',
  'primevideo.com',
  'tv.apple.com',
  'crunchyroll.com',
  'funimation.com',
  'discoveryplus.com',
  'player.vimeo.com',
  'tv.youtube.com',
  // Music streaming
  'open.spotify.com',
  'music.apple.com',
  'music.youtube.com',
  'tidal.com',
  'listen.tidal.com',
  'music.amazon.com',
  'deezer.com',
  // Live TV / sports
  'sling.com',
  'watch.sling.com',
  'fubo.tv',
  'espnplus.com',
  'plus.espn.com',
  'watch.espn.com',
  'dazn.com',
]);

// Helper to generate consistent tab storage keys
// Usage: getTabStorageKey(123, TAB_STORAGE.BASS) → 'tab_123_bass'
//        getTabStorageKey(123) → 'tab_123' (volume)
function getTabStorageKey(tabId, suffix = '') {
  if (suffix) {
    return `${STORAGE_KEYS.TAB_PREFIX}${tabId}_${suffix}`;
  }
  return `${STORAGE_KEYS.TAB_PREFIX}${tabId}`;
}
