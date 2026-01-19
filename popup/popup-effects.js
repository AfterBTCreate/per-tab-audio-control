// Per-Tab Audio Control - Effects Module
// Bass, treble, voice boost, compressor, balance, and channel mode

// Effect preset values (loaded from storage)
let bassPresets = [...DEFAULT_BASS_PRESETS];
let bassCutPresets = [...DEFAULT_BASS_CUT_PRESETS];
let treblePresets = [...DEFAULT_TREBLE_PRESETS];
let trebleCutPresets = [...DEFAULT_TREBLE_CUT_PRESETS];
let voicePresets = [...DEFAULT_VOICE_PRESETS];

// ==================== Effect Presets ====================

// Load effect presets from storage
async function loadEffectPresets() {
  const presets = await getStorageWithDefaults({
    bassBoostPresets: [...DEFAULT_BASS_PRESETS],
    bassCutPresets: [...DEFAULT_BASS_CUT_PRESETS],
    trebleBoostPresets: [...DEFAULT_TREBLE_PRESETS],
    trebleCutPresets: [...DEFAULT_TREBLE_CUT_PRESETS],
    voiceBoostPresets: [...DEFAULT_VOICE_PRESETS]
  });

  bassPresets = presets.bassBoostPresets;
  bassCutPresets = presets.bassCutPresets;
  treblePresets = presets.trebleBoostPresets;
  trebleCutPresets = presets.trebleCutPresets;
  voicePresets = presets.voiceBoostPresets;
  updateEffectButtonLabels();
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
}

// ==================== EQ Control Mode (Presets vs Sliders) ====================

// EQ slider elements
const bassSlider = document.getElementById('bassSlider');
const bassSliderValue = document.getElementById('bassSliderValue');
const trebleSlider = document.getElementById('trebleSlider');
const trebleSliderValue = document.getElementById('trebleSliderValue');
const voiceSlider = document.getElementById('voiceSlider');
const voiceSliderValue = document.getElementById('voiceSliderValue');

// EQ mode rows
const eqPresetsRows = document.querySelectorAll('.eq-presets-mode');
const eqSliderRows = document.querySelectorAll('.eq-slider-mode');

// Current EQ control mode
let eqControlMode = 'sliders';

// Load EQ control mode setting
async function loadEqControlMode() {
  const result = await browserAPI.storage.sync.get(['eqControlMode']);
  eqControlMode = result.eqControlMode || 'sliders';
  applyEqControlMode();
}

// Apply EQ control mode (show/hide appropriate rows using classList for CSP compliance)
function applyEqControlMode() {
  if (eqControlMode === 'sliders') {
    // Show sliders, hide presets
    eqPresetsRows.forEach(row => row.classList.add('hidden'));
    eqSliderRows.forEach(row => row.classList.remove('hidden'));
  } else {
    // Show presets, hide sliders (default)
    eqPresetsRows.forEach(row => row.classList.remove('hidden'));
    eqSliderRows.forEach(row => row.classList.add('hidden'));
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
    // Voice: 0=off, 1-4=low(blue), 5-10=medium(yellow), 11-18=high(orange)
    if (value === 0) {
      element.className = 'eq-slider-value';
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
  const storageKey = `tab_${currentTabId}_bass`;

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
  const storageKey = `tab_${currentTabId}_treble`;

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
    const gain = parseInt(e.target.value);
    applyBassGain(gain);
  });
}

// Treble slider input handler
if (trebleSlider) {
  trebleSlider.addEventListener('input', (e) => {
    const gain = parseInt(e.target.value);
    applyTrebleGain(gain);
  });
}

// Apply voice gain directly (for slider mode)
async function applyVoiceGain(gain) {
  if (!currentTabId) return;

  // Determine the level string for storage
  const level = gain === 0 ? 'off' : `slider:${gain}`;
  const storageKey = `tab_${currentTabId}_voice`;

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
    const gain = parseInt(e.target.value);
    applyVoiceGain(gain);
  });
}

// ==================== EQ Slider Mousewheel Support ====================

// Mousewheel on bass slider
if (bassSlider) {
  bassSlider.parentElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = 1;
    const currentValue = parseInt(bassSlider.value);
    const delta = e.deltaY < 0 ? step : -step;
    const newValue = Math.max(-24, Math.min(24, currentValue + delta));
    bassSlider.value = newValue;
    applyBassGain(newValue);
  }, { passive: false });
}

// Mousewheel on treble slider
if (trebleSlider) {
  trebleSlider.parentElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = 1;
    const currentValue = parseInt(trebleSlider.value);
    const delta = e.deltaY < 0 ? step : -step;
    const newValue = Math.max(-24, Math.min(24, currentValue + delta));
    trebleSlider.value = newValue;
    applyTrebleGain(newValue);
  }, { passive: false });
}

// Mousewheel on voice slider
if (voiceSlider) {
  voiceSlider.parentElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = 1;
    const currentValue = parseInt(voiceSlider.value);
    const delta = e.deltaY < 0 ? step : -step;
    const newValue = Math.max(0, Math.min(18, currentValue + delta));
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

  const bassKey = `tab_${currentTabId}_bass`;
  const trebleKey = `tab_${currentTabId}_treble`;
  const voiceKey = `tab_${currentTabId}_voice`;
  const compressorKey = `tab_${currentTabId}_compressor`;
  const result = await browserAPI.storage.local.get([bassKey, trebleKey, voiceKey, compressorKey]);

  currentBassBoost = result[bassKey] || 'off';
  currentTrebleBoost = result[trebleKey] || 'off';
  currentVoiceBoost = result[voiceKey] || 'off';
  currentCompressor = result[compressorKey] || 'off';

  updateEffectsUI();
  updateEqSlidersUI();
  updateEffectsDisabledState();
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
    return parseInt(level.split(':')[1]) || 0;
  }

  // Handle bass cut levels
  if (effect === 'bass' && level.startsWith('cut-')) {
    const cutLevel = level.replace('cut-', '');
    const index = cutLevel === 'low' ? 0 : cutLevel === 'medium' ? 1 : 2;
    return bassCutPresets[index] || 0;
  }

  // Handle treble cut levels
  if (effect === 'treble' && level.startsWith('cut-')) {
    const cutLevel = level.replace('cut-', '');
    const index = cutLevel === 'low' ? 0 : cutLevel === 'medium' ? 1 : 2;
    return trebleCutPresets[index] || 0;
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

  const index = level === 'low' ? 0 : level === 'medium' ? 1 : 2;
  return presets[index] || 0;
}

// Apply effect to content script
async function applyEffect(effect, level) {
  if (!currentTabId) return;

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
      showError('Audio effect failed. Try refreshing the page.');
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

  const storageKey = `tab_${currentTabId}_compressor`;

  // Save setting
  await browserAPI.storage.local.set({ [storageKey]: preset });

  // Update state
  currentCompressor = preset;

  // If compressor is enabled, disable bass, treble, and voice boost
  if (preset !== 'off') {
    // Disable bass boost if active
    if (currentBassBoost !== 'off') {
      const bassKey = `tab_${currentTabId}_bass`;
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
    }

    // Disable treble boost if active
    if (currentTrebleBoost !== 'off') {
      const trebleKey = `tab_${currentTabId}_treble`;
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
    }

    // Disable voice boost if active
    if (currentVoiceBoost !== 'off') {
      const voiceKey = `tab_${currentTabId}_voice`;
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
    }
  }

  // Update UI
  updateEffectsUI();
  updateEffectsDisabledState();

  // Send to content script (skip on restricted browser pages)
  if (!isRestrictedUrl(currentTabUrl)) {
    try {
      await browserAPI.tabs.sendMessage(currentTabId, {
        type: 'SET_COMPRESSOR',
        preset: preset
      });
    } catch (e) {
      console.error('[TabVolume Popup] SET_COMPRESSOR failed:', e.message);
      showError('Compression effect failed. Try refreshing the page.');
    }
  }
}

// Effect button click handlers
effectButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const effect = btn.dataset.effect;
    const level = btn.dataset.level;

    if (effect === 'compressor') {
      applyCompressor(level);
    } else {
      applyEffect(effect, level);
    }
  });
});

// ==================== Stereo Balance ====================

// Load balance setting for current tab
async function loadBalanceSetting() {
  if (!currentTabId) return;

  const balanceKey = `tab_${currentTabId}_balance`;
  const result = await browserAPI.storage.local.get([balanceKey]);

  currentBalance = result[balanceKey] !== undefined ? result[balanceKey] : 0;
  updateBalanceUI();
}

// Update balance slider UI
function updateBalanceUI() {
  balanceSlider.value = currentBalance;
}

// Apply balance to content script
async function applyBalance(balance) {
  if (!currentTabId) return;

  currentBalance = balance;
  updateBalanceUI();

  // Save setting
  const balanceKey = `tab_${currentTabId}_balance`;
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
      showError('Balance change failed. Try refreshing the page.');
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
  const balance = parseInt(e.target.value);
  applyBalance(balance);
});

// Balance reset button handler
balanceResetBtn.addEventListener('click', () => {
  applyBalance(0);
});

// Balance container wheel handler
balanceContainer.addEventListener('wheel', (e) => {
  e.preventDefault();
  const step = 5; // Adjust by 5 per scroll
  const delta = e.deltaY > 0 ? -step : step; // Scroll down = left, scroll up = right
  const newBalance = Math.max(-100, Math.min(100, currentBalance + delta));
  applyBalance(newBalance);
}, { passive: false });

// ==================== Channel Mode (Stereo/Mono/Swap) ====================

// Load channel mode setting for current tab
async function loadChannelModeSetting() {
  if (!currentTabId) return;

  const modeKey = `tab_${currentTabId}_channelMode`;
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
}

// Apply channel mode to content script
async function applyChannelMode(mode) {
  if (!currentTabId) return;

  currentChannelMode = mode;
  updateChannelModeUI();

  // Save setting
  const modeKey = `tab_${currentTabId}_channelMode`;
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
      showError('Channel mode change failed. Try refreshing the page.');
    }
  }
}

// Channel mode button handlers
stereoToggle.addEventListener('click', () => applyChannelMode('stereo'));
swapToggle.addEventListener('click', () => {
  // Toggle swap: if already swap, go back to stereo
  applyChannelMode(currentChannelMode === 'swap' ? 'stereo' : 'swap');
});
monoToggle.addEventListener('click', () => applyChannelMode('mono'));
