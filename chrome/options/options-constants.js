// Per-Tab Audio Control - Options Constants
// Options-page-specific constants (ranges, labels, UI config)
// Note: All default values are centralized in shared/constants.js (DEFAULTS object)
// Note: browserAPI, isFirefox loaded from ../shared/browser-api.js
// Note: DEFAULT_AUDIO_MODE, DEFAULT_VOLUME_STEPS loaded from ../shared/constants.js

// Default preset aliases for options page (reference DEFAULTS)
const DEFAULT_PRESETS = DEFAULTS.volumePresets;
const DEFAULT_BASS_PRESETS = DEFAULTS.bassBoostPresets;
const DEFAULT_TREBLE_PRESETS = DEFAULTS.trebleBoostPresets;
const DEFAULT_VOICE_PRESETS = DEFAULTS.voiceBoostPresets;
const DEFAULT_VOICE_CUT_PRESETS = DEFAULTS.voiceCutPresets;
const DEFAULT_BASS_CUT_PRESETS = DEFAULTS.bassCutPresets;
const DEFAULT_TREBLE_CUT_PRESETS = DEFAULTS.trebleCutPresets;

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

// Voice cut ranges (positive values for UI, stored as negative)
const VOICE_CUT_RANGES = {
  low: { min: 1, max: 6 },
  medium: { min: 7, max: 12 },
  high: { min: 13, max: 18 }
};

const DEFAULT_SPEED_SLOW_PRESETS = DEFAULTS.speedSlowPresets;
const DEFAULT_SPEED_FAST_PRESETS = DEFAULTS.speedFastPresets;

const SPEED_SLOW_RANGES = {
  low: { min: 0.70, max: 0.95 },
  medium: { min: 0.30, max: 0.65 },
  high: { min: 0.05, max: 0.25 }
};
const SPEED_FAST_RANGES = {
  low: { min: 1.05, max: 1.45 },
  medium: { min: 1.50, max: 2.45 },
  high: { min: 2.50, max: 5.00 }
};

// Storage quota constants
const SYNC_QUOTA_BYTES = 102400; // chrome.storage.sync quota is ~100KB
const QUOTA_WARNING_THRESHOLD = 0.80; // 80%
const QUOTA_CRITICAL_THRESHOLD = 0.90; // 90%
const CLEANUP_DAYS = 90; // Rules unused for 90+ days

// Header layout customization constants
const DEFAULT_HEADER_LAYOUT = DEFAULTS.headerLayout;
// LOCKED_HEADER_ITEMS, REQUIRED_HEADER_ITEMS, HIDEABLE_HEADER_ITEMS, MAX_SPACERS, MIN_SPACERS defined in shared/constants.js
const HEADER_ITEM_LABELS = {
  companyLogo: 'ABTC Logo',
  brandText: 'Brand Text',
  audioMode: 'Audio Mode',
  focus: 'Focus',
  spacer1: 'Spacer',
  modeToggle: 'Basic/Advanced Toggle',
  theme: 'Theme',
  settings: 'Settings',
  logo: 'Volume Icon'
};

// Popup sections layout customization constants (individual advanced controls)
const DEFAULT_POPUP_SECTIONS_LAYOUT = DEFAULTS.popupSectionsLayout;

// POPUP_SECTION_DATA, EQ_DUAL_MODE_ITEMS, MIN_VISIBLE_POPUP_SECTIONS are in shared/constants.js

const HIDEABLE_POPUP_SECTIONS = ['balance', 'bass', 'treble', 'voice', 'range', 'speed', 'output', 'siteRule', 'sleepTimer'];

// Sleep timer preset defaults and ranges
const DEFAULT_SLEEP_TIMER_PRESETS = DEFAULTS.sleepTimerPresets;
const SLEEP_TIMER_RANGES = {
  quick: { min: 1, max: 10 },
  short: { min: 5, max: 30 },
  medium: { min: 15, max: 60 },
  long: { min: 30, max: 120 }
};

// EQ_DUAL_MODE_ITEMS defined in shared/constants.js
