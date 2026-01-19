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

// Default volume presets
const DEFAULT_VOLUME_PRESETS = [50, 100, 200, 300, 500];

// Default volume steps
const DEFAULT_VOLUME_STEPS = {
  scrollWheel: 5,
  keyboard: 1,
  buttons: 1
};

// Effect ranges
const EFFECT_RANGES = {
  bass: { min: -24, max: 24, default: 0 },
  treble: { min: -24, max: 24, default: 0 },
  voice: { min: 0, max: 18, default: 0 }
};

// Compressor presets
const COMPRESSOR_PRESETS = {
  off: { threshold: -50, knee: 40, ratio: 1, attack: 0, release: 0.25 },
  podcast: { threshold: -24, knee: 20, ratio: 4, attack: 0.003, release: 0.25 },
  movie: { threshold: -30, knee: 30, ratio: 8, attack: 0.001, release: 0.5 },
  max: { threshold: -40, knee: 40, ratio: 20, attack: 0.001, release: 1.0 }
};

// Message types (for type safety and documentation)
const MESSAGE_TYPES = {
  // Volume
  GET_VOLUME: 'GET_VOLUME',
  SET_VOLUME: 'SET_VOLUME',
  VOLUME_CHANGED: 'VOLUME_CHANGED',

  // Media
  HAS_MEDIA: 'HAS_MEDIA',
  GET_MEDIA_STATE: 'GET_MEDIA_STATE',
  TOGGLE_PLAY_PAUSE: 'TOGGLE_PLAY_PAUSE',

  // Effects
  SET_BASS: 'SET_BASS',
  SET_TREBLE: 'SET_TREBLE',
  SET_VOICE: 'SET_VOICE',
  SET_COMPRESSOR: 'SET_COMPRESSOR',
  SET_BALANCE: 'SET_BALANCE',
  SET_CHANNEL_MODE: 'SET_CHANNEL_MODE',

  // Device
  SET_DEVICE: 'SET_DEVICE',
  GET_DEVICES: 'GET_DEVICES',

  // Mode
  GET_EFFECTIVE_MODE: 'GET_EFFECTIVE_MODE',
  CHECK_DOMAIN_DISABLED: 'CHECK_DOMAIN_DISABLED',

  // Tab Capture
  START_PERSISTENT_VISUALIZER_CAPTURE: 'START_PERSISTENT_VISUALIZER_CAPTURE',
  STOP_PERSISTENT_VISUALIZER_CAPTURE: 'STOP_PERSISTENT_VISUALIZER_CAPTURE',
  GET_PERSISTENT_VISUALIZER_DATA: 'GET_PERSISTENT_VISUALIZER_DATA',

  // Visualizer
  GET_FREQUENCY_DATA: 'GET_FREQUENCY_DATA',

  // Reset
  RESET_TAB: 'RESET_TAB',
  RESET_ALL: 'RESET_ALL'
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
  NATIVE_MODE_REFRESH: 'nativeModeRefresh',
  HEADER_LAYOUT: 'headerLayout',
  DISABLED_DOMAINS: 'disabledDomains',

  // Local storage (per-tab)
  TAB_PREFIX: 'tab_'
};
