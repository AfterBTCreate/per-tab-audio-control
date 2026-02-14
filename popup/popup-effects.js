// Per-Tab Audio Control - Effects Module
// Bass, treble, voice boost, compressor, balance, and channel mode

// Effect preset values (loaded from storage)
let bassPresets = [...DEFAULTS.bassBoostPresets];
let bassCutPresets = [...DEFAULTS.bassCutPresets];
let treblePresets = [...DEFAULTS.trebleBoostPresets];
let trebleCutPresets = [...DEFAULTS.trebleCutPresets];
let voicePresets = [...DEFAULTS.voiceBoostPresets];
let speedSlowPresets = [...DEFAULTS.speedSlowPresets];
let speedFastPresets = [...DEFAULTS.speedFastPresets];

// ==================== Effect Presets ====================

// Load effect presets from storage
async function loadEffectPresets() {
  const presets = await getStorageWithDefaults({
    bassBoostPresets: [...DEFAULTS.bassBoostPresets],
    bassCutPresets: [...DEFAULTS.bassCutPresets],
    trebleBoostPresets: [...DEFAULTS.trebleBoostPresets],
    trebleCutPresets: [...DEFAULTS.trebleCutPresets],
    voiceBoostPresets: [...DEFAULTS.voiceBoostPresets],
    speedSlowPresets: [...DEFAULTS.speedSlowPresets],
    speedFastPresets: [...DEFAULTS.speedFastPresets]
  });

  bassPresets = presets.bassBoostPresets;
  bassCutPresets = presets.bassCutPresets;
  treblePresets = presets.trebleBoostPresets;
  trebleCutPresets = presets.trebleCutPresets;
  voicePresets = presets.voiceBoostPresets;
  speedSlowPresets = presets.speedSlowPresets;
  speedFastPresets = presets.speedFastPresets;
  updateEffectButtonLabels();

  // Load balance presets (non-critical — use defaults if storage fails)
  try {
    await loadBalancePresets();
  } catch (e) {
    console.debug('[TabVolume] Could not load balance presets:', e.message);
  }
}

// Update effect button labels with actual dB values
function updateEffectButtonLabels() {
  // Voice buttons (+dB for boost)
  const voiceLow = document.getElementById('voiceLow');
  const voiceMed = document.getElementById('voiceMed');
  const voiceHigh = document.getElementById('voiceHigh');
  if (voiceLow) voiceLow.textContent = `+${voicePresets[0]}dB`;
  if (voiceMed) voiceMed.textContent = `+${voicePresets[1]}dB`;
  if (voiceHigh) voiceHigh.textContent = `+${voicePresets[2]}dB`;

  // Bass boost buttons (short format for combined row)
  const bassLow = document.getElementById('bassLow');
  const bassMed = document.getElementById('bassMed');
  const bassHigh = document.getElementById('bassHigh');
  if (bassLow) bassLow.textContent = `+${bassPresets[0]}`;
  if (bassMed) bassMed.textContent = `+${bassPresets[1]}`;
  if (bassHigh) bassHigh.textContent = `+${bassPresets[2]}`;

  // Bass cut buttons (already negative values from presets)
  const bassCutLow = document.getElementById('bassCutLow');
  const bassCutMed = document.getElementById('bassCutMed');
  const bassCutHigh = document.getElementById('bassCutHigh');
  if (bassCutLow) bassCutLow.textContent = `${bassCutPresets[0]}`;
  if (bassCutMed) bassCutMed.textContent = `${bassCutPresets[1]}`;
  if (bassCutHigh) bassCutHigh.textContent = `${bassCutPresets[2]}`;

  // Treble boost buttons (short format for combined row)
  const trebleLow = document.getElementById('trebleLow');
  const trebleMed = document.getElementById('trebleMed');
  const trebleHigh = document.getElementById('trebleHigh');
  if (trebleLow) trebleLow.textContent = `+${treblePresets[0]}`;
  if (trebleMed) trebleMed.textContent = `+${treblePresets[1]}`;
  if (trebleHigh) trebleHigh.textContent = `+${treblePresets[2]}`;

  // Treble cut buttons (already negative values from presets)
  const trebleCutLow = document.getElementById('trebleCutLow');
  const trebleCutMed = document.getElementById('trebleCutMed');
  const trebleCutHigh = document.getElementById('trebleCutHigh');
  if (trebleCutLow) trebleCutLow.textContent = `${trebleCutPresets[0]}`;
  if (trebleCutMed) trebleCutMed.textContent = `${trebleCutPresets[1]}`;
  if (trebleCutHigh) trebleCutHigh.textContent = `${trebleCutPresets[2]}`;

  // Speed slow buttons (display as rate with x suffix)
  const speedSlowLow = document.getElementById('speedSlowLow');
  const speedSlowMed = document.getElementById('speedSlowMed');
  const speedSlowHigh = document.getElementById('speedSlowHigh');
  if (speedSlowLow) speedSlowLow.textContent = `${speedSlowPresets[0]}x`;
  if (speedSlowMed) speedSlowMed.textContent = `${speedSlowPresets[1]}x`;
  if (speedSlowHigh) speedSlowHigh.textContent = `${speedSlowPresets[2]}x`;

  // Speed fast buttons
  const speedFastLow = document.getElementById('speedFastLow');
  const speedFastMed = document.getElementById('speedFastMed');
  const speedFastHigh = document.getElementById('speedFastHigh');
  if (speedFastLow) speedFastLow.textContent = `${speedFastPresets[0]}x`;
  if (speedFastMed) speedFastMed.textContent = `${speedFastPresets[1]}x`;
  if (speedFastHigh) speedFastHigh.textContent = `${speedFastPresets[2]}x`;
}

// ==================== EQ Control Mode (Presets vs Sliders) ====================

// EQ slider elements
const bassSlider = document.getElementById('bassSlider');
const bassSliderValue = document.getElementById('bassSliderValue');
const trebleSlider = document.getElementById('trebleSlider');
const trebleSliderValue = document.getElementById('trebleSliderValue');
const voiceSlider = document.getElementById('voiceSlider');
const voiceSliderValue = document.getElementById('voiceSliderValue');

// Per-item EQ control mode
const EQ_DUAL_MODE_ITEMS = new Set(['speed', 'bass', 'treble', 'voice', 'range', 'balance']);
let eqControlMode = 'sliders'; // global default
let eqItemControlModes = {}; // per-item overrides from popupSectionsLayout.controlMode

// Load EQ control mode setting (global + per-item overrides)
async function loadEqControlMode() {
  const result = await browserAPI.storage.sync.get(['eqControlMode', 'popupSectionsLayout']);
  eqControlMode = result.eqControlMode || DEFAULTS.eqControlMode;
  eqItemControlModes = (result.popupSectionsLayout && result.popupSectionsLayout.controlMode) || {};
  applyEqControlMode();
}

// Get effective mode for a specific item
function getItemEqMode(itemId) {
  return eqItemControlModes[itemId] || eqControlMode;
}

// Apply EQ control mode per-item (show/hide appropriate rows using classList for CSP compliance)
function applyEqControlMode() {
  for (const itemId of EQ_DUAL_MODE_ITEMS) {
    const mode = getItemEqMode(itemId);
    const wrapper = document.querySelector(`.advanced-item[data-item-id="${itemId}"]`);
    if (!wrapper) continue;

    const presetRows = wrapper.querySelectorAll('.eq-presets-mode');
    const sliderRows = wrapper.querySelectorAll('.eq-slider-mode');

    if (mode === 'sliders') {
      presetRows.forEach(row => row.classList.add('hidden'));
      sliderRows.forEach(row => row.classList.remove('hidden'));
    } else {
      presetRows.forEach(row => row.classList.remove('hidden'));
      sliderRows.forEach(row => row.classList.add('hidden'));
    }
  }
}

// Update EQ slider UI from current values
function updateEqSlidersUI() {
  // Get current bass gain from the level
  let bassGain = 0;
  if (currentBassBoost !== 'off') {
    bassGain = getEffectGain('bass', currentBassBoost);
  }
  if (bassSlider) {
    bassSlider.value = bassGain;
    updateEqSliderValueDisplay(bassSliderValue, bassGain);
  }

  // Get current treble gain from the level
  let trebleGain = 0;
  if (currentTrebleBoost !== 'off') {
    trebleGain = getEffectGain('treble', currentTrebleBoost);
  }
  if (trebleSlider) {
    trebleSlider.value = trebleGain;
    updateEqSliderValueDisplay(trebleSliderValue, trebleGain);
  }

  // Get current voice gain from the level
  let voiceGain = 0;
  if (currentVoiceBoost !== 'off') {
    voiceGain = getEffectGain('voice', currentVoiceBoost);
  }
  if (voiceSlider) {
    voiceSlider.value = voiceGain;
    updateEqSliderValueDisplay(voiceSliderValue, voiceGain, true); // voice is boost-only
  }

  // Sync speed slider from currentSpeedLevel
  updateSpeedUI();
}

// Update slider value display with color coding matching gradient
// boostOnly: for voice slider which only goes 0-18 (no negative)
function updateEqSliderValueDisplay(element, value, boostOnly = false) {
  if (!element) return;

  // Set the text
  if (value === 0) {
    element.textContent = boostOnly ? 'Off' : '0 dB';
  } else if (value > 0) {
    element.textContent = `+${value} dB`;
  } else {
    element.textContent = `${value} dB`;
  }

  // Set color class based on value range
  if (boostOnly) {
    // Voice: 0=off(red), 1-4=low(blue), 5-10=medium(yellow), 11-18=high(orange)
    if (value === 0) {
      element.className = 'eq-slider-value voice-off';
    } else if (value <= 4) {
      element.className = 'eq-slider-value boost-low';
    } else if (value <= 10) {
      element.className = 'eq-slider-value boost-medium';
    } else {
      element.className = 'eq-slider-value boost-high';
    }
  } else {
    // Bass/Treble: color based on range
    if (value === 0) {
      element.className = 'eq-slider-value';
    } else if (value >= 13) {
      element.className = 'eq-slider-value boost-high';    // +13 to +24: orange
    } else if (value >= 7) {
      element.className = 'eq-slider-value boost-medium';  // +7 to +12: yellow
    } else if (value >= 1) {
      element.className = 'eq-slider-value boost-low';     // +1 to +6: blue
    } else if (value >= -6) {
      element.className = 'eq-slider-value cut-low';       // -1 to -6: light purple
    } else if (value >= -12) {
      element.className = 'eq-slider-value cut-medium';    // -7 to -12: purple
    } else {
      element.className = 'eq-slider-value cut-high';      // -13 to -24: magenta
    }
  }
}

// Apply bass gain directly (for slider mode)
async function applyBassGain(gain) {
  if (!currentTabId) return;

  // Determine the level string for storage
  // In slider mode, we store as 'slider:VALUE'
  const level = gain === 0 ? 'off' : `slider:${gain}`;
  const storageKey = getTabStorageKey(currentTabId, TAB_STORAGE.BASS);

  // Save setting
  await browserAPI.storage.local.set({ [storageKey]: level });
  currentBassBoost = level;

  // Update slider display
  updateEqSliderValueDisplay(bassSliderValue, gain);

  // Send to content script (skip on restricted browser pages)
  if (!isRestrictedUrl(currentTabUrl)) {
    try {
      await browserAPI.tabs.sendMessage(currentTabId, {
        type: 'SET_BASS',
        gain: gain
      });
    } catch (e) {
      console.error('[TabVolume Popup] SET_BASS failed:', e.message);
    }
  }

  // Also send to Tab Capture if active
  if (window.isTabCaptureActive && window.isTabCaptureActive()) {
    browserAPI.runtime.sendMessage({
      type: 'SET_TAB_CAPTURE_BASS',
      tabId: currentTabId,
      gain: gain
    }).catch(() => {});
  }
}

// Apply treble gain directly (for slider mode)
async function applyTrebleGain(gain) {
  if (!currentTabId) return;

  // Determine the level string for storage
  const level = gain === 0 ? 'off' : `slider:${gain}`;
  const storageKey = getTabStorageKey(currentTabId, TAB_STORAGE.TREBLE);

  // Save setting
  await browserAPI.storage.local.set({ [storageKey]: level });
  currentTrebleBoost = level;

  // Update slider display
  updateEqSliderValueDisplay(trebleSliderValue, gain);

  // Send to content script (skip on restricted browser pages)
  if (!isRestrictedUrl(currentTabUrl)) {
    try {
      await browserAPI.tabs.sendMessage(currentTabId, {
        type: 'SET_TREBLE',
        gain: gain
      });
    } catch (e) {
      console.error('[TabVolume Popup] SET_TREBLE failed:', e.message);
    }
  }

  // Also send to Tab Capture if active
  if (window.isTabCaptureActive && window.isTabCaptureActive()) {
    browserAPI.runtime.sendMessage({
      type: 'SET_TAB_CAPTURE_TREBLE',
      tabId: currentTabId,
      gain: gain
    }).catch(() => {});
  }
}

// Bass slider input handler
if (bassSlider) {
  bassSlider.addEventListener('input', (e) => {
    const rawGain = parseInt(e.target.value, 10);
    if (isNaN(rawGain)) return;
    // Clamp to valid range
    const gain = Math.max(EFFECT_RANGES.bass.min, Math.min(EFFECT_RANGES.bass.max, rawGain));
    applyBassGain(gain);
  });
}

// Treble slider input handler
if (trebleSlider) {
  trebleSlider.addEventListener('input', (e) => {
    const rawGain = parseInt(e.target.value, 10);
    if (isNaN(rawGain)) return;
    // Clamp to valid range
    const gain = Math.max(EFFECT_RANGES.treble.min, Math.min(EFFECT_RANGES.treble.max, rawGain));
    applyTrebleGain(gain);
  });
}

// Apply voice gain directly (for slider mode)
async function applyVoiceGain(gain) {
  if (!currentTabId) return;

  // Determine the level string for storage
  const level = gain === 0 ? 'off' : `slider:${gain}`;
  const storageKey = getTabStorageKey(currentTabId, TAB_STORAGE.VOICE);

  // Save setting
  await browserAPI.storage.local.set({ [storageKey]: level });
  currentVoiceBoost = level;

  // Update slider display
  updateEqSliderValueDisplay(voiceSliderValue, gain, true);

  // Send to content script (skip on restricted browser pages)
  if (!isRestrictedUrl(currentTabUrl)) {
    try {
      await browserAPI.tabs.sendMessage(currentTabId, {
        type: 'SET_VOICE',
        gain: gain
      });
    } catch (e) {
      console.error('[TabVolume Popup] SET_VOICE failed:', e.message);
    }
  }

  // Also send to Tab Capture if active
  if (window.isTabCaptureActive && window.isTabCaptureActive()) {
    browserAPI.runtime.sendMessage({
      type: 'SET_TAB_CAPTURE_VOICE',
      tabId: currentTabId,
      gain: gain
    }).catch(() => {});
  }
}

// Voice slider input handler
if (voiceSlider) {
  voiceSlider.addEventListener('input', (e) => {
    const rawGain = parseInt(e.target.value, 10);
    if (isNaN(rawGain)) return;
    // Clamp to valid voice range
    const gain = Math.max(EFFECT_RANGES.voice.min, Math.min(EFFECT_RANGES.voice.max, rawGain));
    applyVoiceGain(gain);
  });
}

// ==================== EQ Slider Mousewheel Support ====================

// Mousewheel on bass slider
if (bassSlider) {
  bassSlider.parentElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = 1;
    const currentValue = parseInt(bassSlider.value, 10) || 0;
    const delta = e.deltaY < 0 ? step : -step;
    const newValue = Math.max(EFFECT_RANGES.bass.min, Math.min(EFFECT_RANGES.bass.max, currentValue + delta));
    bassSlider.value = newValue;
    applyBassGain(newValue);
  }, { passive: false });
}

// Mousewheel on treble slider
if (trebleSlider) {
  trebleSlider.parentElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = 1;
    const currentValue = parseInt(trebleSlider.value, 10) || 0;
    const delta = e.deltaY < 0 ? step : -step;
    const newValue = Math.max(EFFECT_RANGES.treble.min, Math.min(EFFECT_RANGES.treble.max, currentValue + delta));
    trebleSlider.value = newValue;
    applyTrebleGain(newValue);
  }, { passive: false });
}

// Mousewheel on voice slider
if (voiceSlider) {
  voiceSlider.parentElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = 1;
    const currentValue = parseInt(voiceSlider.value, 10) || 0;
    const delta = e.deltaY < 0 ? step : -step;
    const newValue = Math.max(EFFECT_RANGES.voice.min, Math.min(EFFECT_RANGES.voice.max, currentValue + delta));
    voiceSlider.value = newValue;
    applyVoiceGain(newValue);
  }, { passive: false });
}

// ==================== EQ Reset Buttons (Slider Mode) ====================

// Bass reset button
const bassReset = document.getElementById('bassReset');
if (bassReset) {
  bassReset.addEventListener('click', () => {
    if (bassSlider) {
      bassSlider.value = 0;
      updateEqSliderValueDisplay(bassSliderValue, 0);
    }
    applyBassGain(0);
  });
}

// Treble reset button
const trebleReset = document.getElementById('trebleReset');
if (trebleReset) {
  trebleReset.addEventListener('click', () => {
    if (trebleSlider) {
      trebleSlider.value = 0;
      updateEqSliderValueDisplay(trebleSliderValue, 0);
    }
    applyTrebleGain(0);
  });
}

// Voice reset button
const voiceReset = document.getElementById('voiceReset');
if (voiceReset) {
  voiceReset.addEventListener('click', () => {
    if (voiceSlider) {
      voiceSlider.value = 0;
      updateEqSliderValueDisplay(voiceSliderValue, 0);
    }
    applyVoiceGain(0);
  });
}

// ==================== Effect Settings ====================

// Load effect settings for current tab
async function loadEffectSettings() {
  if (!currentTabId) return;

  const bassKey = getTabStorageKey(currentTabId, TAB_STORAGE.BASS);
  const trebleKey = getTabStorageKey(currentTabId, TAB_STORAGE.TREBLE);
  const voiceKey = getTabStorageKey(currentTabId, TAB_STORAGE.VOICE);
  const compressorKey = getTabStorageKey(currentTabId, TAB_STORAGE.COMPRESSOR);
  const speedKey = getTabStorageKey(currentTabId, TAB_STORAGE.SPEED);
  const result = await browserAPI.storage.local.get([bassKey, trebleKey, voiceKey, compressorKey, speedKey]);

  currentBassBoost = result[bassKey] || 'off';
  currentTrebleBoost = result[trebleKey] || 'off';
  currentVoiceBoost = result[voiceKey] || 'off';
  currentCompressor = result[compressorKey] || 'off';

  // Speed migration: existing stored values are raw numbers, new format is level strings
  const speedValue = result[speedKey];
  if (typeof speedValue === 'number') {
    currentSpeedLevel = speedValue === 1 ? 'off' : `slider:${speedValue}`;
  } else {
    currentSpeedLevel = speedValue || 'off';
  }

  updateEffectsUI();
  updateEqSlidersUI();
  updateEffectsDisabledState();
  updateSpeedUI();
  updateCompressorSliderFromPreset(currentCompressor);
  updateBalancePresetButtons();
}

// Update effect buttons UI
function updateEffectsUI() {
  effectButtons.forEach(btn => {
    const effect = btn.dataset.effect;
    const level = btn.dataset.level;

    if (effect === 'bass') {
      btn.classList.toggle('active', level === currentBassBoost);
    } else if (effect === 'treble') {
      btn.classList.toggle('active', level === currentTrebleBoost);
    } else if (effect === 'voice') {
      btn.classList.toggle('active', level === currentVoiceBoost);
    } else if (effect === 'compressor') {
      btn.classList.toggle('active', level === currentCompressor);
    } else if (effect === 'speed') {
      btn.classList.toggle('active', level === currentSpeedLevel);
    }
  });
}

// Update bass, treble and voice boost disabled state based on compressor
function updateEffectsDisabledState() {
  const compressorActive = currentCompressor !== 'off';
  const bassButtons = document.querySelectorAll('.effect-btn[data-effect="bass"]');
  const trebleButtons = document.querySelectorAll('.effect-btn[data-effect="treble"]');
  const voiceButtons = document.querySelectorAll('.effect-btn[data-effect="voice"]');
  const effectLabels = document.querySelectorAll('.effect-row .effect-label');

  // Disable bass buttons
  bassButtons.forEach(btn => {
    btn.disabled = compressorActive;
    btn.classList.toggle('disabled', compressorActive);
  });

  // Disable treble buttons
  trebleButtons.forEach(btn => {
    btn.disabled = compressorActive;
    btn.classList.toggle('disabled', compressorActive);
  });

  // Disable voice buttons
  voiceButtons.forEach(btn => {
    btn.disabled = compressorActive;
    btn.classList.toggle('disabled', compressorActive);
  });

  // Disable EQ sliders
  if (bassSlider) {
    bassSlider.disabled = compressorActive;
    bassSlider.classList.toggle('disabled', compressorActive);
  }
  if (trebleSlider) {
    trebleSlider.disabled = compressorActive;
    trebleSlider.classList.toggle('disabled', compressorActive);
  }
  if (voiceSlider) {
    voiceSlider.disabled = compressorActive;
    voiceSlider.classList.toggle('disabled', compressorActive);
  }

  // Update effect row labels to show disabled state
  effectLabels.forEach(label => {
    if (label.textContent.includes('Bass') || label.textContent.includes('Treble') || label.textContent.includes('Voice')) {
      label.classList.toggle('disabled', compressorActive);
      if (compressorActive) {
        label.title = 'Disabled while compressor is active';
      } else {
        label.title = '';
      }
    }
  });
}

// Get gain value for effect level
function getEffectGain(effect, level) {
  if (level === 'off') return 0;

  // Handle slider mode values (slider:VALUE format)
  if (level.startsWith('slider:')) {
    return parseInt(level.split(':')[1], 10) || 0;
  }

  // Handle bass cut levels
  if (effect === 'bass' && level.startsWith('cut-')) {
    const cutLevel = level.replace('cut-', '');
    const index = cutLevel === 'low' ? 0 : cutLevel === 'medium' ? 1 : cutLevel === 'high' ? 2 : -1;
    return (index >= 0 && index < bassCutPresets.length) ? bassCutPresets[index] : 0;
  }

  // Handle treble cut levels
  if (effect === 'treble' && level.startsWith('cut-')) {
    const cutLevel = level.replace('cut-', '');
    const index = cutLevel === 'low' ? 0 : cutLevel === 'medium' ? 1 : cutLevel === 'high' ? 2 : -1;
    return (index >= 0 && index < trebleCutPresets.length) ? trebleCutPresets[index] : 0;
  }

  // Select appropriate presets array
  let presets;
  if (effect === 'bass') {
    presets = bassPresets;
  } else if (effect === 'treble') {
    presets = treblePresets;
  } else {
    presets = voicePresets;
  }

  const index = level === 'low' ? 0 : level === 'medium' ? 1 : level === 'high' ? 2 : -1;
  return (index >= 0 && index < presets.length) ? presets[index] : 0;
}

// Apply effect to content script
async function applyEffect(effect, level) {
  if (!currentTabId) return;

  // Defense-in-depth: prevent bass/treble/voice changes while compressor is active
  // (buttons should already be disabled, but this catches any edge cases)
  if (currentCompressor !== 'off' && (effect === 'bass' || effect === 'treble' || effect === 'voice')) {
    return;
  }

  const gain = getEffectGain(effect, level);
  const storageKey = `tab_${currentTabId}_${effect}`;

  // Save setting
  await browserAPI.storage.local.set({ [storageKey]: level });

  // Update state
  if (effect === 'bass') {
    currentBassBoost = level;
  } else if (effect === 'treble') {
    currentTrebleBoost = level;
  } else {
    currentVoiceBoost = level;
  }

  // Update UI
  updateEffectsUI();

  // Send to content script
  let messageType;
  let tabCaptureType;
  if (effect === 'bass') {
    messageType = 'SET_BASS';
    tabCaptureType = 'SET_TAB_CAPTURE_BASS';
  } else if (effect === 'treble') {
    messageType = 'SET_TREBLE';
    tabCaptureType = 'SET_TAB_CAPTURE_TREBLE';
  } else {
    messageType = 'SET_VOICE';
    tabCaptureType = 'SET_TAB_CAPTURE_VOICE';
  }

  // Send to content script (skip on restricted browser pages)
  if (!isRestrictedUrl(currentTabUrl)) {
    try {
      await browserAPI.tabs.sendMessage(currentTabId, {
        type: messageType,
        gain: gain
      });
    } catch (e) {
      console.error(`[TabVolume Popup] ${messageType} failed:`, e.message);
      showError('Audio effect failed. Refresh page.');
    }
  }

  // Also send to Tab Capture if active
  if (window.isTabCaptureActive && window.isTabCaptureActive()) {
    browserAPI.runtime.sendMessage({
      type: tabCaptureType,
      tabId: currentTabId,
      gain: gain
    }).catch(() => {});
  }
}

// Apply compressor preset to content script
async function applyCompressor(preset) {
  if (!currentTabId) return;

  const storageKey = getTabStorageKey(currentTabId, TAB_STORAGE.COMPRESSOR);

  // Save setting
  await browserAPI.storage.local.set({ [storageKey]: preset });

  // Update state
  currentCompressor = preset;

  // If compressor is enabled, disable bass, treble, and voice boost
  if (preset !== 'off') {
    const isTabCapture = window.isTabCaptureActive && window.isTabCaptureActive();

    // Disable bass boost if active
    if (currentBassBoost !== 'off') {
      const bassKey = getTabStorageKey(currentTabId, TAB_STORAGE.BASS);
      await browserAPI.storage.local.set({ [bassKey]: 'off' });
      currentBassBoost = 'off';

      if (!isRestrictedUrl(currentTabUrl)) {
        try {
          await browserAPI.tabs.sendMessage(currentTabId, {
            type: 'SET_BASS',
            gain: 0
          });
        } catch (e) {
          console.error('[TabVolume Popup] SET_BASS (off) failed:', e.message);
        }
      }
      if (isTabCapture) {
        browserAPI.runtime.sendMessage({
          type: 'SET_TAB_CAPTURE_BASS',
          tabId: currentTabId,
          gain: 0
        }).catch(() => {});
      }
    }

    // Disable treble boost if active
    if (currentTrebleBoost !== 'off') {
      const trebleKey = getTabStorageKey(currentTabId, TAB_STORAGE.TREBLE);
      await browserAPI.storage.local.set({ [trebleKey]: 'off' });
      currentTrebleBoost = 'off';

      if (!isRestrictedUrl(currentTabUrl)) {
        try {
          await browserAPI.tabs.sendMessage(currentTabId, {
            type: 'SET_TREBLE',
            gain: 0
          });
        } catch (e) {
          console.error('[TabVolume Popup] SET_TREBLE (off) failed:', e.message);
        }
      }
      if (isTabCapture) {
        browserAPI.runtime.sendMessage({
          type: 'SET_TAB_CAPTURE_TREBLE',
          tabId: currentTabId,
          gain: 0
        }).catch(() => {});
      }
    }

    // Disable voice boost if active
    if (currentVoiceBoost !== 'off') {
      const voiceKey = getTabStorageKey(currentTabId, TAB_STORAGE.VOICE);
      await browserAPI.storage.local.set({ [voiceKey]: 'off' });
      currentVoiceBoost = 'off';

      if (!isRestrictedUrl(currentTabUrl)) {
        try {
          await browserAPI.tabs.sendMessage(currentTabId, {
            type: 'SET_VOICE',
            gain: 0
          });
        } catch (e) {
          console.error('[TabVolume Popup] SET_VOICE (off) failed:', e.message);
        }
      }
      if (isTabCapture) {
        browserAPI.runtime.sendMessage({
          type: 'SET_TAB_CAPTURE_VOICE',
          tabId: currentTabId,
          gain: 0
        }).catch(() => {});
      }
    }
  }

  // Update UI
  updateEffectsUI();
  updateEffectsDisabledState();

  // Sync compressor slider from preset
  updateCompressorSliderFromPreset(preset);

  // Send to content script (skip on restricted browser pages)
  if (!isRestrictedUrl(currentTabUrl)) {
    try {
      await browserAPI.tabs.sendMessage(currentTabId, {
        type: 'SET_COMPRESSOR',
        preset: preset
      });
    } catch (e) {
      console.error('[TabVolume Popup] SET_COMPRESSOR failed:', e.message);
      showError('Compression failed. Refresh page.');
    }
  }

  // Also send to Tab Capture if active
  if (window.isTabCaptureActive && window.isTabCaptureActive()) {
    browserAPI.runtime.sendMessage({
      type: 'SET_TAB_CAPTURE_COMPRESSOR',
      tabId: currentTabId,
      preset: preset
    }).catch(() => {});
  }
}

// Effect button click handlers
effectButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const effect = btn.dataset.effect;
    const level = btn.dataset.level;

    if (effect === 'compressor') {
      applyCompressor(level);
    } else if (effect === 'speed') {
      applySpeedPreset(level);
    } else if (effect === 'balance') {
      applyBalancePreset(level);
    } else {
      applyEffect(effect, level);
    }
  });
});

// ==================== Stereo Balance ====================

// Load balance setting for current tab
async function loadBalanceSetting() {
  if (!currentTabId) return;

  const balanceKey = getTabStorageKey(currentTabId, TAB_STORAGE.BALANCE);
  const result = await browserAPI.storage.local.get([balanceKey]);

  currentBalance = result[balanceKey] !== undefined ? result[balanceKey] : 0;
  updateBalanceUI();
}

// Update balance slider UI
function updateBalanceUI() {
  balanceSlider.value = currentBalance;
  balanceSlider.setAttribute('aria-valuenow', currentBalance);
  updateBalancePresetButtons();
}

// Apply balance to content script
async function applyBalance(balance) {
  if (!currentTabId) return;

  currentBalance = balance;
  updateBalanceUI();

  // Save setting
  const balanceKey = getTabStorageKey(currentTabId, TAB_STORAGE.BALANCE);
  await browserAPI.storage.local.set({ [balanceKey]: balance });

  // Convert from -100..100 to -1..1 for StereoPannerNode
  const pan = balance / 100;

  // Send to content script (skip on restricted browser pages)
  if (!isRestrictedUrl(currentTabUrl)) {
    try {
      await browserAPI.tabs.sendMessage(currentTabId, {
        type: 'SET_BALANCE',
        pan: pan
      });
    } catch (e) {
      console.error('[TabVolume Popup] SET_BALANCE failed:', e.message);
      showError('Balance failed. Refresh page.');
    }
  }

  // Also send to Tab Capture if active
  if (window.isTabCaptureActive && window.isTabCaptureActive()) {
    browserAPI.runtime.sendMessage({
      type: 'SET_TAB_CAPTURE_BALANCE',
      tabId: currentTabId,
      pan: pan
    }).catch(() => {});
  }
}

// Balance slider input handler
balanceSlider.addEventListener('input', (e) => {
  const balance = parseInt(e.target.value, 10);
  if (!isNaN(balance)) applyBalance(balance);
});

// Balance reset button handler
balanceResetBtn.addEventListener('click', () => {
  applyBalance(0);
});

// Balance container wheel handler (attach to all balance rows for both modes)
document.querySelectorAll('.balance-row').forEach(row => {
  row.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = 5; // Adjust by 5 per scroll
    const delta = e.deltaY > 0 ? -step : step; // Scroll down = left, scroll up = right
    const newBalance = Math.max(-100, Math.min(100, currentBalance + delta));
    applyBalance(newBalance);
  }, { passive: false });
});

// ==================== Channel Mode (Stereo/Mono/Swap) ====================

// Load channel mode setting for current tab
async function loadChannelModeSetting() {
  if (!currentTabId) return;

  const modeKey = getTabStorageKey(currentTabId, TAB_STORAGE.CHANNEL_MODE);
  const result = await browserAPI.storage.local.get([modeKey]);

  currentChannelMode = result[modeKey] || 'stereo';
  updateChannelModeUI();
}

// Update channel mode button UI
function updateChannelModeUI() {
  // Reset all button states
  stereoToggle.classList.remove('active');
  swapToggle.classList.remove('active', 'swap');
  monoToggle.classList.remove('active');

  // Get balance labels
  const leftLabel = document.getElementById('balanceLabelLeft');
  const rightLabel = document.getElementById('balanceLabelRight');

  if (currentChannelMode === 'swap') {
    swapToggle.classList.add('active', 'swap'); // 'swap' class gives orange color
    // Swap the labels to reflect swapped channels
    if (leftLabel) leftLabel.textContent = 'R';
    if (rightLabel) rightLabel.textContent = 'L';
  } else if (currentChannelMode === 'mono') {
    monoToggle.classList.add('active');
    // Reset labels to normal
    if (leftLabel) leftLabel.textContent = 'L';
    if (rightLabel) rightLabel.textContent = 'R';
  } else {
    // Stereo mode (default)
    stereoToggle.classList.add('active');
    // Reset labels to normal
    if (leftLabel) leftLabel.textContent = 'L';
    if (rightLabel) rightLabel.textContent = 'R';
  }

  // Disable balance slider when mono is active (panning mono does nothing useful)
  const disableBalance = currentChannelMode === 'mono';
  balanceSlider.disabled = disableBalance;
  balanceSlider.style.opacity = disableBalance ? '0.5' : '1';

  // Sync presets-mode channel buttons
  syncChannelModeButtons();
}

// Apply channel mode to content script
async function applyChannelMode(mode) {
  if (!currentTabId) return;

  currentChannelMode = mode;
  updateChannelModeUI();

  // Save setting
  const modeKey = getTabStorageKey(currentTabId, TAB_STORAGE.CHANNEL_MODE);
  await browserAPI.storage.local.set({ [modeKey]: mode });

  // Send to content script (skip on restricted browser pages)
  if (!isRestrictedUrl(currentTabUrl)) {
    try {
      await browserAPI.tabs.sendMessage(currentTabId, {
        type: 'SET_CHANNEL_MODE',
        mode: mode
      });
    } catch (e) {
      console.error('[TabVolume Popup] SET_CHANNEL_MODE failed:', e.message);
      showError('Channel mode failed. Refresh page.');
    }
    // Forward to Tab Capture
    try {
      await browserAPI.runtime.sendMessage({
        type: 'SET_TAB_CAPTURE_CHANNEL_MODE',
        tabId: currentTabId,
        mode: mode
      });
    } catch (e) { /* Tab Capture may not be active */ }
  }
}

// Channel mode button handlers
stereoToggle.addEventListener('click', () => applyChannelMode('stereo'));
swapToggle.addEventListener('click', () => {
  // Toggle swap: if already swap, go back to stereo
  applyChannelMode(currentChannelMode === 'swap' ? 'stereo' : 'swap');
});
monoToggle.addEventListener('click', () => applyChannelMode('mono'));

// ==================== Playback Speed ====================

// Speed slider elements
const speedSlider = document.getElementById('speedSlider');
const speedValueEl = document.getElementById('speedValue');
const speedReset = document.getElementById('speedReset');

// Piecewise exponential: slider position (0-100) → playback rate (0.05-5)
// Lower half (0→50): speed = 0.05 × 20^(pos/50) → 0.05x to 1.0x
// Upper half (50→100): speed = 5^((pos-50)/50) → 1.0x to 5.0x
function speedPositionToRate(pos) {
  pos = Math.max(0, Math.min(100, pos));
  if (pos <= 50) {
    return 0.05 * Math.pow(20, pos / 50);
  }
  return Math.pow(5, (pos - 50) / 50);
}

// Inverse: playback rate → slider position
function speedRateToPosition(rate) {
  rate = Math.max(EFFECT_RANGES.speed.min, Math.min(EFFECT_RANGES.speed.max, rate));
  if (rate <= 1) {
    return 50 * Math.log(rate / 0.05) / Math.log(20);
  }
  return 50 + 50 * Math.log(rate) / Math.log(5);
}

// Resolve speed level string to numeric rate
function getSpeedRate(level) {
  if (!level || level === 'off') return 1;
  if (level === 'slow-low') return speedSlowPresets[0];
  if (level === 'slow-medium') return speedSlowPresets[1];
  if (level === 'slow-high') return speedSlowPresets[2];
  if (level === 'fast-low') return speedFastPresets[0];
  if (level === 'fast-medium') return speedFastPresets[1];
  if (level === 'fast-high') return speedFastPresets[2];
  if (level.startsWith('slider:')) return parseFloat(level.split(':')[1]) || 1;
  return 1;
}

// Update speed slider UI (position, value text, color class)
function updateSpeedUI() {
  if (!speedSlider || !speedValueEl) return;

  const rate = getSpeedRate(currentSpeedLevel);
  const pos = speedRateToPosition(rate);
  speedSlider.value = Math.round(pos);
  speedSlider.title = `Speed: ${rate.toFixed(2)}x`;
  speedValueEl.textContent = `${rate.toFixed(2)}x`;

  // Color class: slow (<0.9), normal (0.9-1.1), fast (>1.1)
  if (rate < 0.9) {
    speedValueEl.className = 'eq-slider-value speed-slow';
  } else if (rate > 1.1) {
    speedValueEl.className = 'eq-slider-value speed-fast';
  } else {
    speedValueEl.className = 'eq-slider-value speed-normal';
  }
}

// Apply speed from slider: clamp, round, update state, save as level string, send to content script
async function applySpeed(rate) {
  if (!currentTabId) return;

  // Clamp to valid range and round to 2 decimal places
  rate = Math.max(EFFECT_RANGES.speed.min, Math.min(EFFECT_RANGES.speed.max, rate));
  rate = Math.round(rate * 100) / 100;

  // Store as level string for consistency
  currentSpeedLevel = rate === 1 ? 'off' : `slider:${rate}`;
  updateSpeedUI();

  // Save per-tab setting as level string
  const storageKey = getTabStorageKey(currentTabId, TAB_STORAGE.SPEED);
  await browserAPI.storage.local.set({ [storageKey]: currentSpeedLevel });

  // Send to content script (skip on restricted browser pages)
  if (!isRestrictedUrl(currentTabUrl)) {
    try {
      await browserAPI.tabs.sendMessage(currentTabId, {
        type: 'SET_SPEED',
        rate: rate
      });
    } catch (e) {
      console.error('[TabVolume Popup] SET_SPEED failed:', e.message);
    }
  }
}

// Apply speed from preset button
async function applySpeedPreset(level) {
  if (!currentTabId) return;

  const rate = getSpeedRate(level);
  currentSpeedLevel = level;
  updateSpeedUI();
  updateEffectsUI();

  // Save per-tab setting as level string
  const storageKey = getTabStorageKey(currentTabId, TAB_STORAGE.SPEED);
  await browserAPI.storage.local.set({ [storageKey]: level });

  // Send resolved rate to content script (skip on restricted browser pages)
  if (!isRestrictedUrl(currentTabUrl)) {
    try {
      await browserAPI.tabs.sendMessage(currentTabId, {
        type: 'SET_SPEED',
        rate: rate
      });
    } catch (e) {
      console.error('[TabVolume Popup] SET_SPEED failed:', e.message);
    }
  }
}

// Throttled input handler for speed slider
const throttledApplySpeed = throttle((pos) => {
  const rate = speedPositionToRate(pos);
  applySpeed(rate);
}, 30);

if (speedSlider) {
  speedSlider.addEventListener('input', (e) => {
    const pos = parseInt(e.target.value, 10);
    if (isNaN(pos)) return;
    throttledApplySpeed(pos);
  });

  // Mousewheel support for speed slider (scroll by exact 0.05x rate increments)
  speedSlider.parentElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    const currentRate = getSpeedRate(currentSpeedLevel);
    // Snap to nearest 0.05 to prevent drift from preset values
    const snapped = Math.round(currentRate * 20) / 20;
    const newRate = e.deltaY < 0 ? snapped + 0.05 : snapped - 0.05;
    const clamped = Math.max(EFFECT_RANGES.speed.min, Math.min(EFFECT_RANGES.speed.max, newRate));
    applySpeed(clamped);
  }, { passive: false });
}

// Speed reset button
if (speedReset) {
  speedReset.addEventListener('click', () => {
    applySpeed(1);
  });
}

// ==================== Compressor (Range) Slider Mode ====================

const COMPRESSOR_SLIDER_PRESETS = ['off', 'podcast', 'movie', 'maximum'];
const COMPRESSOR_SLIDER_LABELS = { off: 'Off', podcast: 'Podcast', movie: 'Movie', maximum: 'Max' };

const compressorSlider = document.getElementById('compressorSlider');
const compressorSliderValue = document.getElementById('compressorSliderValue');

// Update compressor slider position and label from a preset name
function updateCompressorSliderFromPreset(preset) {
  if (!compressorSlider || !compressorSliderValue) return;
  const index = COMPRESSOR_SLIDER_PRESETS.indexOf(preset);
  if (index === -1) return;
  compressorSlider.value = index;
  compressorSlider.title = `Range: ${COMPRESSOR_SLIDER_LABELS[preset]}`;
  compressorSliderValue.textContent = COMPRESSOR_SLIDER_LABELS[preset];

  // Apply color class
  compressorSliderValue.className = `eq-slider-value range-value range-${preset}`;
}

// Compressor slider input handler
if (compressorSlider) {
  compressorSlider.addEventListener('input', (e) => {
    const pos = parseInt(e.target.value, 10);
    if (isNaN(pos) || pos < 0 || pos > 3) return;
    const preset = COMPRESSOR_SLIDER_PRESETS[pos];
    applyCompressor(preset);
    updateCompressorSliderFromPreset(preset);
  });

  // Mousewheel support on compressor slider
  compressorSlider.parentElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    const currentPos = parseInt(compressorSlider.value, 10) || 0;
    const delta = e.deltaY < 0 ? 1 : -1;
    const newPos = Math.max(0, Math.min(3, currentPos + delta));
    compressorSlider.value = newPos;
    const preset = COMPRESSOR_SLIDER_PRESETS[newPos];
    applyCompressor(preset);
    updateCompressorSliderFromPreset(preset);
  }, { passive: false });
}

// Compressor slider reset button
const compressorReset = document.getElementById('compressorReset');
if (compressorReset) {
  compressorReset.addEventListener('click', () => {
    applyCompressor('off');
    updateCompressorSliderFromPreset('off');
  });
}

// ==================== Balance Presets Mode ====================

let balancePresets = { left: 100, right: 100 };

// Balance preset elements (in presets mode)
const stereoTogglePresets = document.getElementById('stereoTogglePresets');
const monoTogglePresets = document.getElementById('monoTogglePresets');
const swapTogglePresets = document.getElementById('swapTogglePresets');
const balanceResetPresets = document.getElementById('balanceResetPresets');

// Load balance presets from storage
async function loadBalancePresets() {
  const result = await browserAPI.storage.sync.get(['balancePresets']);
  balancePresets = result.balancePresets || { ...DEFAULTS.balancePresets };
}

// Apply balance preset (left/center/right)
function applyBalancePreset(level) {
  let balance;
  if (level === 'left') {
    balance = -balancePresets.left;
  } else if (level === 'right') {
    balance = balancePresets.right;
  } else {
    balance = 0; // center
  }
  applyBalance(balance);
  updateBalancePresetButtons();
}

// Update which balance preset button is highlighted
function updateBalancePresetButtons() {
  const presetBtns = document.querySelectorAll('.balance-presets .effect-btn');
  presetBtns.forEach(btn => {
    const level = btn.dataset.level;
    let isActive = false;
    if (level === 'left' && currentBalance === -balancePresets.left) {
      isActive = true;
    } else if (level === 'center' && currentBalance === 0) {
      isActive = true;
    } else if (level === 'right' && currentBalance === balancePresets.right) {
      isActive = true;
    }
    btn.classList.toggle('active', isActive);
  });
}

// Balance preset button click handlers
document.querySelectorAll('.balance-presets .effect-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const level = btn.dataset.level;
    applyBalancePreset(level);
  });
});

// Sync channel mode buttons between slider and presets modes
function syncChannelModeButtons() {
  // Sync presets mode buttons from current state
  if (stereoTogglePresets) {
    stereoTogglePresets.classList.toggle('active', currentChannelMode === 'stereo');
    stereoTogglePresets.classList.remove('swap');
  }
  if (monoTogglePresets) {
    monoTogglePresets.classList.toggle('active', currentChannelMode === 'mono');
  }
  if (swapTogglePresets) {
    swapTogglePresets.classList.remove('active', 'swap');
    if (currentChannelMode === 'swap') {
      swapTogglePresets.classList.add('active', 'swap');
    }
  }
}

// Presets mode channel button handlers
if (stereoTogglePresets) {
  stereoTogglePresets.addEventListener('click', () => {
    applyChannelMode('stereo');
    syncChannelModeButtons();
  });
}
if (swapTogglePresets) {
  swapTogglePresets.addEventListener('click', () => {
    applyChannelMode(currentChannelMode === 'swap' ? 'stereo' : 'swap');
    syncChannelModeButtons();
  });
}
if (monoTogglePresets) {
  monoTogglePresets.addEventListener('click', () => {
    applyChannelMode('mono');
    syncChannelModeButtons();
  });
}
if (balanceResetPresets) {
  balanceResetPresets.addEventListener('click', () => {
    applyBalance(0);
    updateBalancePresetButtons();
  });
}
