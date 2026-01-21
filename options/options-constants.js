// Per-Tab Audio Control - Options Constants
// Shared constants and browser API compatibility layer
// Note: browserAPI, isFirefox loaded from ../shared/browser-api.js

// Default audio mode (Chrome: tabcapture, Firefox: auto)
const DEFAULT_AUDIO_MODE = isFirefox ? 'auto' : 'tabcapture';

// Default presets
const DEFAULT_PRESETS = [50, 100, 200, 300, 500];
const DEFAULT_BASS_PRESETS = [6, 12, 24]; // Low, Medium, High in dB (max 24)
const DEFAULT_TREBLE_PRESETS = [6, 12, 24]; // Low, Medium, High in dB (max 24)
const DEFAULT_VOICE_PRESETS = [4, 10, 18]; // Low, Medium, High in dB (max 18)
const DEFAULT_BASS_CUT_PRESETS = [-6, -12, -24];
const DEFAULT_TREBLE_CUT_PRESETS = [-6, -12, -24];
// Note: DEFAULT_VOLUME_STEPS is defined in shared/constants.js
const VOLUME_STEP_RANGE = { min: 1, max: 20 };

// Level-specific ranges to maintain Low < Medium < High meaning
const BASS_BOOST_RANGES = {
  low: { min: 1, max: 8 },
  medium: { min: 9, max: 16 },
  high: { min: 17, max: 24 }
};

// Bass cut ranges (positive values for UI, stored as negative)
const BASS_CUT_RANGES = {
  low: { min: 1, max: 8 },
  medium: { min: 9, max: 16 },
  high: { min: 17, max: 24 }
};

// Treble boost ranges
const TREBLE_BOOST_RANGES = {
  low: { min: 1, max: 8 },
  medium: { min: 9, max: 16 },
  high: { min: 17, max: 24 }
};

// Treble cut ranges (positive values for UI, stored as negative)
const TREBLE_CUT_RANGES = {
  low: { min: 1, max: 8 },
  medium: { min: 9, max: 16 },
  high: { min: 17, max: 24 }
};

const VOICE_BOOST_RANGES = {
  low: { min: 1, max: 6 },
  medium: { min: 7, max: 12 },
  high: { min: 13, max: 18 }
};

// Storage quota constants
const SYNC_QUOTA_BYTES = 102400; // chrome.storage.sync quota is ~100KB
const QUOTA_WARNING_THRESHOLD = 0.80; // 80%
const QUOTA_CRITICAL_THRESHOLD = 0.90; // 90%
const CLEANUP_DAYS = 90; // Rules unused for 90+ days

// Header layout customization constants
const DEFAULT_HEADER_LAYOUT = {
  order: ['spacer1', 'logo', 'tabCapture', 'webAudio', 'offMode', 'focus', 'spacer2', 'modeToggle', 'shortcuts', 'theme', 'settings', 'spacer3', 'companyLogo'],
  hidden: [],
  spacerCount: 3
};
const HIDEABLE_HEADER_ITEMS = ['focus', 'shortcuts', 'theme'];
const REQUIRED_HEADER_ITEMS = ['tabCapture', 'webAudio', 'offMode', 'modeToggle', 'settings', 'logo'];
const LOCKED_HEADER_ITEMS = ['companyLogo']; // Items that cannot be moved (ABTC logo stays at end)
const MAX_SPACERS = 3;
const HEADER_ITEM_LABELS = {
  companyLogo: 'ABTC Logo',
  tabCapture: 'Tab Capture',
  webAudio: 'Web Audio',
  offMode: 'Disable',
  focus: 'Focus',
  spacer1: 'Spacer',
  modeToggle: 'Basic/Advanced Toggle',
  shortcuts: 'Shortcuts',
  theme: 'Theme',
  settings: 'Settings',
  logo: 'Volume Icon'
};

// Popup sections layout customization constants
const DEFAULT_POPUP_SECTIONS_LAYOUT = {
  order: ['balance', 'enhancements', 'output', 'siteRule'],
  hidden: []
};

const POPUP_SECTION_DATA = {
  balance: { name: 'Balance', description: 'Balance slider and Stereo/Mono/Swap controls' },
  enhancements: { name: 'Enhancements', description: 'Bass, Treble, Voice, and Range controls' },
  output: { name: 'Output', description: 'Audio output device selector' },
  siteRule: { name: 'Site Rule', description: 'Add site-specific volume rules' }
};

// Map section IDs to popup data-section-id attributes
const POPUP_SECTION_ID_MAP = {
  balance: 'balance',
  enhancements: 'enhancements',
  output: 'output',
  siteRule: 'addSite'  // The popup uses 'addSite' for the site rule section
};

const HIDEABLE_POPUP_SECTIONS = ['balance', 'enhancements', 'output', 'siteRule'];
const MIN_VISIBLE_POPUP_SECTIONS = 1; // At least one section must be visible

// Visualizer settings
const DEFAULT_TAB_INFO_LOCATION = 'inside'; // 'inside' = in visualizer, 'below' = below visualizer
