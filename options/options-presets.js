// Per-Tab Audio Control - Options Presets
// Theme, visualizer, and all preset configurations

// ==================== Theme Toggle ====================

const themeToggle = document.getElementById('themeToggle');

// Load saved theme (synced across devices)
async function loadTheme() {
  const result = await browserAPI.storage.sync.get(['theme']);
  // Default to dark mode for new users (only add light-mode if explicitly set)
  if (result.theme === 'light') {
    document.body.classList.add('light-mode');
  } else {
    document.body.classList.remove('light-mode');
  }
}

// Toggle theme
async function toggleTheme() {
  const isLight = document.body.classList.toggle('light-mode');
  await browserAPI.storage.sync.set({ theme: isLight ? 'light' : 'dark' });
}

// Load theme immediately
loadTheme();

// Theme toggle handler
themeToggle.addEventListener('click', toggleTheme);

// ==================== Default Audio Mode ====================

const defaultAudioModeRadios = document.querySelectorAll('input[name="defaultAudioMode"]');
const defaultModeStatus = document.getElementById('defaultModeStatus');
const defaultModeDesc = document.getElementById('defaultModeDesc');
const tabCaptureSubsection = document.getElementById('tabCaptureSubsection');

// Mode descriptions (using new naming)
const modeDescriptions = {
  tabcapture: 'Tab Capture provides the most reliable audio control across all websites.',
  auto: 'Web Audio intercepts page audio for full features. Works on most sites.',
  native: 'Audio processing is off. Limited to 0-100% volume with no enhancements.'
};

// Load default audio mode
async function loadDefaultAudioMode() {
  const result = await browserAPI.storage.sync.get(['defaultAudioMode']);
  const validModes = ['tabcapture', 'auto', 'native'];
  const mode = validModes.includes(result.defaultAudioMode) ? result.defaultAudioMode : DEFAULT_AUDIO_MODE;

  // Cache in localStorage for synchronous access from popup
  // This enables auto-start Tab Capture on popup open (requires sync read in gesture context)
  try {
    localStorage.setItem('__tabVolumeControl_defaultAudioMode', mode);
  } catch (e) {
    // localStorage might be blocked
  }

  // Select the correct radio button
  const radio = document.querySelector(`input[name="defaultAudioMode"][value="${mode}"]`);
  if (radio) {
    radio.checked = true;
  }
  updateModeDescription(mode);
  updateTabCaptureSectionState(mode);

  // Hide Tab Capture option on Firefox
  if (isFirefox) {
    const tabCaptureLabel = document.querySelector('.mode-button.chrome-only-option');
    if (tabCaptureLabel) {
      tabCaptureLabel.style.display = 'none';
    }
  }
}

// Update the description text based on selected mode
function updateModeDescription(mode) {
  if (defaultModeDesc) {
    defaultModeDesc.textContent = modeDescriptions[mode] || '';
  }
}

// Grey out Tab Capture Sites section when Tab Capture is the default mode
function updateTabCaptureSectionState(mode) {
  if (tabCaptureSubsection) {
    if (mode === 'tabcapture') {
      tabCaptureSubsection.classList.add('disabled-section');
      tabCaptureSubsection.setAttribute('title', 'Tab Capture is the default mode - per-site list is not used');
    } else {
      tabCaptureSubsection.classList.remove('disabled-section');
      tabCaptureSubsection.removeAttribute('title');
    }
  }
}

// Save default audio mode
async function saveDefaultAudioMode(mode) {
  await browserAPI.storage.sync.set({ defaultAudioMode: mode });

  // Cache in localStorage for synchronous access from popup
  try {
    localStorage.setItem('__tabVolumeControl_defaultAudioMode', mode);
  } catch (e) {
    // localStorage might be blocked
  }

  updateModeDescription(mode);
  updateTabCaptureSectionState(mode);

  // Reload site overrides list (shows different overrides per default mode)
  if (typeof loadSiteOverrides === 'function') {
    loadSiteOverrides();
  }

  showStatus(defaultModeStatus, 'Default mode saved!', 'success');
}

// Add listeners to radio buttons
defaultAudioModeRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    if (e.target.checked) {
      saveDefaultAudioMode(e.target.value);
    }
  });
});

// Load default audio mode on init
loadDefaultAudioMode();

// ==================== Visualizer Settings ====================

const visualizerRadios = document.querySelectorAll('input[name="visualizerType"]');
const visualizerStatus = document.getElementById('visualizerStatus');

// Load visualizer type (synced across devices)
async function loadVisualizerType() {
  const result = await browserAPI.storage.sync.get(['visualizerType']);
  const type = result.visualizerType || DEFAULTS.visualizerType;

  const radio = document.querySelector(`input[name="visualizerType"][value="${type}"]`);
  if (radio) {
    radio.checked = true;
  }
}

// Save visualizer type
async function saveVisualizerType(type) {
  await browserAPI.storage.sync.set({ visualizerType: type });
  // Also save to local storage so the popup picks it up (popup reads from local)
  await browserAPI.storage.local.set({ visualizerType: type });
  showStatus(visualizerStatus, 'Visualizer style saved!', 'success');
}

// Add listeners to radio buttons
visualizerRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    if (e.target.checked) {
      saveVisualizerType(e.target.value);
    }
  });
});

// Load visualizer type on init
loadVisualizerType();

// Live sync: update radio buttons when popup changes visualizer type
browserAPI.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    if (changes.visualizerType) {
      const type = changes.visualizerType.newValue;
      const radio = document.querySelector(`input[name="visualizerType"][value="${type}"]`);
      if (radio) {
        radio.checked = true;
      }
    }
    if (changes.showVisualizer) {
      showVisualizerCheckbox.checked = changes.showVisualizer.newValue;
      updateTabInfoInsideState();
    }
    if (changes.showSeekbar && showSeekbarCheckbox) {
      showSeekbarCheckbox.checked = changes.showSeekbar.newValue;
    }
    if (changes.seekbarTimeDisplay && seekbarShowRemainingCheckbox) {
      seekbarShowRemainingCheckbox.checked = changes.seekbarTimeDisplay.newValue === 'remaining';
    }
    if (changes.visualizerColor) {
      if (changes.visualizerColor.newValue) {
        useCustomVisualizerColorCheckbox.checked = true;
        visualizerColorPicker.value = changes.visualizerColor.newValue;
        visualizerColorPicker.disabled = false;
      } else {
        useCustomVisualizerColorCheckbox.checked = false;
        visualizerColorPicker.disabled = true;
      }
    }
  }
});

// ==================== Show Visualizer Setting ====================

const showVisualizerCheckbox = document.getElementById('showVisualizer');

async function loadShowVisualizer() {
  const result = await browserAPI.storage.sync.get(['showVisualizer']);
  const show = result.showVisualizer ?? DEFAULTS.showVisualizer;
  showVisualizerCheckbox.checked = show;
  updateTabInfoInsideState();
}

showVisualizerCheckbox.addEventListener('change', async (e) => {
  await browserAPI.storage.sync.set({ showVisualizer: e.target.checked });
  updateTabInfoInsideState();
  showStatus(visualizerStatus, 'Visualizer setting saved!', 'success');
});

// Enable/disable visualizer-dependent radios based on showVisualizer state
function updateTabInfoInsideState() {
  const insideRadio = document.querySelector('input[name="tabInfoLocation"][value="inside"]');
  const belowRadio = document.querySelector('input[name="tabInfoLocation"][value="below"]');
  if (!insideRadio) return;

  const isHidden = !showVisualizerCheckbox.checked;

  // Disable "Inside visualizer" when visualizer is hidden
  insideRadio.disabled = isHidden;
  insideRadio.closest('label').classList.toggle('disabled', isHidden);

  // Disable "Below visualizer" when visualizer is hidden (same position as "above" without visualizer)
  if (belowRadio) {
    belowRadio.disabled = isHidden;
    belowRadio.closest('label').classList.toggle('disabled', isHidden);
  }

  // If a disabled option is selected, switch to "Above"
  if (isHidden && (insideRadio.checked || (belowRadio && belowRadio.checked))) {
    const aboveRadio = document.querySelector('input[name="tabInfoLocation"][value="above"]');
    if (aboveRadio) {
      aboveRadio.checked = true;
      browserAPI.storage.sync.set({ tabInfoLocation: 'above' });
    }
  }
}

loadShowVisualizer();

// ==================== Show Seekbar Setting ====================

const showSeekbarCheckbox = document.getElementById('showSeekbar');

async function loadShowSeekbar() {
  const result = await browserAPI.storage.sync.get(['showSeekbar']);
  const show = result.showSeekbar ?? DEFAULTS.showSeekbar;
  if (showSeekbarCheckbox) showSeekbarCheckbox.checked = show;
}

const seekbarStatus = document.getElementById('seekbarStatus');

if (showSeekbarCheckbox) {
  showSeekbarCheckbox.addEventListener('change', async (e) => {
    await browserAPI.storage.sync.set({ showSeekbar: e.target.checked });
    showStatus(seekbarStatus, 'Seekbar setting saved!', 'success');
  });
}

loadShowSeekbar();

// ==================== Seekbar Time Display Setting ====================

const seekbarShowRemainingCheckbox = document.getElementById('seekbarShowRemaining');

async function loadSeekbarTimeDisplay() {
  const result = await browserAPI.storage.sync.get(['seekbarTimeDisplay']);
  const pref = result.seekbarTimeDisplay ?? DEFAULTS.seekbarTimeDisplay;
  if (seekbarShowRemainingCheckbox) seekbarShowRemainingCheckbox.checked = pref === 'remaining';
}

if (seekbarShowRemainingCheckbox) {
  seekbarShowRemainingCheckbox.addEventListener('change', async (e) => {
    await browserAPI.storage.sync.set({ seekbarTimeDisplay: e.target.checked ? 'remaining' : 'total' });
    showStatus(seekbarStatus, 'Seekbar time display saved!', 'success');
  });
}

loadSeekbarTimeDisplay();

// ==================== Custom Visualizer Color Setting ====================

const useCustomVisualizerColorCheckbox = document.getElementById('useCustomVisualizerColor');
const visualizerColorPicker = document.getElementById('visualizerColorPicker');

async function loadVisualizerColor() {
  const result = await browserAPI.storage.sync.get(['visualizerColor']);
  if (result.visualizerColor) {
    useCustomVisualizerColorCheckbox.checked = true;
    visualizerColorPicker.value = result.visualizerColor;
    visualizerColorPicker.disabled = false;
  } else {
    useCustomVisualizerColorCheckbox.checked = false;
    visualizerColorPicker.disabled = true;
  }
}

useCustomVisualizerColorCheckbox.addEventListener('change', async (e) => {
  if (e.target.checked) {
    visualizerColorPicker.disabled = false;
    const color = visualizerColorPicker.value;
    // Write sync first (try/catch so local always runs even if sync rate-limited)
    try { await browserAPI.storage.sync.set({ visualizerColor: color }); } catch (e) {}
    await browserAPI.storage.local.set({ visualizerColor: color });
  } else {
    visualizerColorPicker.disabled = true;
    try { await browserAPI.storage.sync.remove(['visualizerColor']); } catch (e) {}
    await browserAPI.storage.local.remove(['visualizerColor']);
  }
  showStatus(visualizerStatus, 'Visualizer color saved!', 'success');
});

// Live color dragging - only write to local (storage.sync has 120 writes/min limit)
visualizerColorPicker.addEventListener('input', async () => {
  if (useCustomVisualizerColorCheckbox.checked) {
    const color = visualizerColorPicker.value;
    await browserAPI.storage.local.set({ visualizerColor: color });
  }
});

// Final color commit (picker closed) - persist to sync for cross-device
visualizerColorPicker.addEventListener('change', async () => {
  if (useCustomVisualizerColorCheckbox.checked) {
    const color = visualizerColorPicker.value;
    try { await browserAPI.storage.sync.set({ visualizerColor: color }); } catch (e) {}
    await browserAPI.storage.local.set({ visualizerColor: color });
  }
});

loadVisualizerColor();

// ==================== Tab Info Location Setting ====================

const tabInfoLocationRadios = document.querySelectorAll('input[name="tabInfoLocation"]');
const tabInfoStatus = document.getElementById('tabInfoStatus');

// Load setting
async function loadTabInfoLocation() {
  const result = await browserAPI.storage.sync.get(['tabInfoLocation']);
  // Default to 'inside' if not set
  const location = result.tabInfoLocation || DEFAULTS.tabInfoLocation;
  tabInfoLocationRadios.forEach(radio => {
    radio.checked = radio.value === location;
  });
}

// Save setting
async function saveTabInfoLocation(location) {
  await browserAPI.storage.sync.set({ tabInfoLocation: location });
  showStatus(tabInfoStatus, 'Tab title location saved!', 'success');
}

// Add listeners
tabInfoLocationRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    if (e.target.checked) {
      saveTabInfoLocation(e.target.value);
    }
  });
});

// Load on init
loadTabInfoLocation();

// ==================== Reset Visualizer Settings ====================

const resetVisualizerBtn = document.getElementById('resetVisualizerBtn');
if (resetVisualizerBtn) {
  resetVisualizerBtn.addEventListener('click', async () => {
    // Reset visualizer-only settings to defaults
    await browserAPI.storage.sync.set({
      visualizerType: DEFAULTS.visualizerType,
      showVisualizer: DEFAULTS.showVisualizer
    });
    // Also update local storage for popup
    await browserAPI.storage.local.set({ visualizerType: DEFAULTS.visualizerType });

    // Remove custom visualizer color from both storage areas
    await browserAPI.storage.sync.remove(['visualizerColor']);
    await browserAPI.storage.local.remove(['visualizerColor']);

    // Update UI to match defaults
    const defaultRadio = document.querySelector(`input[name="visualizerType"][value="${DEFAULTS.visualizerType}"]`);
    if (defaultRadio) defaultRadio.checked = true;

    showVisualizerCheckbox.checked = DEFAULTS.showVisualizer;

    // Reset custom color UI
    useCustomVisualizerColorCheckbox.checked = false;
    visualizerColorPicker.value = '#60a5fa';
    visualizerColorPicker.disabled = true;

    updateTabInfoInsideState();
    showStatus(visualizerStatus, 'Visualizer settings reset to defaults!', 'success');
  });
}

// ==================== EQ Control Mode ====================
// Per-item S/P toggles are handled by options-popup-sections.js
// The body class (sliders-mode) is managed by updateEqBodyClass() there

// ==================== Popup Mode (Basic/Advanced) ====================

const popupModeRadios = document.querySelectorAll('input[name="popupMode"]');
const popupModeStatus = document.getElementById('popupModeStatus');

async function loadPopupMode() {
  const result = await browserAPI.storage.sync.get(['popupMode']);
  const mode = result.popupMode || DEFAULTS.popupMode;
  const radio = document.querySelector(`input[name="popupMode"][value="${mode}"]`);
  if (radio) radio.checked = true;
}

popupModeRadios.forEach(radio => {
  radio.addEventListener('change', async (e) => {
    await browserAPI.storage.sync.set({ popupMode: e.target.value });
    showStatus(popupModeStatus, 'Popup mode saved!', 'success');
  });
});

// Live sync: update if changed from popup while options page is open
browserAPI.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.popupMode) {
    const radio = document.querySelector(`input[name="popupMode"][value="${changes.popupMode.newValue}"]`);
    if (radio) radio.checked = true;
  }
});

loadPopupMode();

// ==================== Shortcuts Footer Setting ====================

const showShortcutsFooterCheckbox = document.getElementById('showShortcutsFooter');
const showShortcutsFooterStatus = document.getElementById('showShortcutsFooterStatus');

async function loadShowShortcutsFooter() {
  const result = await browserAPI.storage.sync.get(['showShortcutsFooter']);
  const show = result.showShortcutsFooter ?? DEFAULTS.showShortcutsFooter;
  showShortcutsFooterCheckbox.checked = show;
}

showShortcutsFooterCheckbox.addEventListener('change', async (e) => {
  await browserAPI.storage.sync.set({ showShortcutsFooter: e.target.checked });
  showStatus(showShortcutsFooterStatus, 'Shortcuts footer setting saved!', 'success');
});

loadShowShortcutsFooter();

// ==================== Badge Style Setting ====================

const badgeStyleRadios = document.querySelectorAll('input[name="badgeStyle"]');
const badgeStyleStatus = document.getElementById('badgeStyleStatus');

async function loadBadgeStyle() {
  const result = await browserAPI.storage.sync.get(['badgeStyle']);
  const style = result.badgeStyle || DEFAULTS.badgeStyle;
  const radio = document.querySelector(`input[name="badgeStyle"][value="${style}"]`);
  if (radio) radio.checked = true;
}

badgeStyleRadios.forEach(radio => {
  radio.addEventListener('change', async (e) => {
    if (e.target.checked) {
      await browserAPI.storage.sync.set({ badgeStyle: e.target.value });
      showStatus(badgeStyleStatus, 'Badge style saved!', 'success');
    }
  });
});

loadBadgeStyle();

// ==================== Volume Presets ====================

const preset1 = document.getElementById('preset1');
const preset2 = document.getElementById('preset2');
const preset3 = document.getElementById('preset3');
const preset4 = document.getElementById('preset4');
const preset5 = document.getElementById('preset5');
const resetBtn = document.getElementById('resetBtn');
const status = document.getElementById('status');

// Load saved presets
async function loadPresets() {
  const result = await browserAPI.storage.sync.get(['customPresets']);
  const presets = result.customPresets || DEFAULT_PRESETS;

  preset1.value = presets[0];
  preset2.value = presets[1];
  preset3.value = presets[2];
  preset4.value = presets[3];
  preset5.value = presets[4];

  // Update colors
  [preset1, preset2, preset3, preset4, preset5].forEach(updateInputColor);
}

// Save presets (auto-save)
async function savePresets() {
  // Clamp all values to valid range
  [preset1, preset2, preset3, preset4, preset5].forEach(clampVolumeInput);

  let v1 = parseInt(preset1.value);
  let v2 = parseInt(preset2.value);
  let v3 = parseInt(preset3.value);
  let v4 = parseInt(preset4.value);
  let v5 = parseInt(preset5.value);

  // Enforce strict ascending order (no duplicates: each must be at least +1 from previous)
  // Cap v1 at 496 to ensure room for v2, v3, v4, v5
  if (v1 > 496) { v1 = 496; preset1.value = v1; }

  // v2 must be > v1 and <= 497
  if (v2 <= v1) { v2 = v1 + 1; }
  if (v2 > 497) { v2 = 497; }
  preset2.value = v2;

  // v3 must be > v2 and <= 498
  if (v3 <= v2) { v3 = v2 + 1; }
  if (v3 > 498) { v3 = 498; }
  preset3.value = v3;

  // v4 must be > v3 and <= 499
  if (v4 <= v3) { v4 = v3 + 1; }
  if (v4 > 499) { v4 = 499; }
  preset4.value = v4;

  // v5 must be > v4 and <= 500
  if (v5 <= v4) { v5 = v4 + 1; }
  if (v5 > 500) { v5 = 500; }
  preset5.value = v5;

  // Update colors after potential adjustments
  [preset1, preset2, preset3, preset4, preset5].forEach(updateInputColor);

  const values = [v1, v2, v3, v4, v5];
  await browserAPI.storage.sync.set({ customPresets: values });
}

// Reset to defaults
async function resetPresets() {
  await browserAPI.storage.sync.remove(['customPresets']);
  preset1.value = DEFAULT_PRESETS[0];
  preset2.value = DEFAULT_PRESETS[1];
  preset3.value = DEFAULT_PRESETS[2];
  preset4.value = DEFAULT_PRESETS[3];
  preset5.value = DEFAULT_PRESETS[4];

  // Update colors
  [preset1, preset2, preset3, preset4, preset5].forEach(updateInputColor);

  showStatus(status, 'Reset to defaults', 'success');
}

// Event listeners (auto-save on change)
resetBtn.addEventListener('click', resetPresets);

[preset1, preset2, preset3, preset4, preset5].forEach(input => {
  input.addEventListener('input', () => updateInputColor(input));
  input.addEventListener('change', savePresets);
});

// ==================== Bass Boost Presets ====================

const bassLow = document.getElementById('bassLow');
const bassMed = document.getElementById('bassMed');
const bassHigh = document.getElementById('bassHigh');
const resetBassBtn = document.getElementById('resetBassBtn');
const bassStatus = document.getElementById('bassStatus');

// Load saved bass presets
async function loadBassPresets() {
  const result = await browserAPI.storage.sync.get(['bassBoostPresets']);
  const presets = result.bassBoostPresets || DEFAULT_BASS_PRESETS;

  bassLow.value = presets[0];
  bassMed.value = presets[1];
  bassHigh.value = presets[2];
}

// Save bass presets (auto-save)
async function saveBassPresets() {
  clampRangeInput(bassLow, 'low', BASS_BOOST_RANGES);
  clampRangeInput(bassMed, 'medium', BASS_BOOST_RANGES);
  clampRangeInput(bassHigh, 'high', BASS_BOOST_RANGES);

  const values = [
    parseInt(bassLow.value),
    parseInt(bassMed.value),
    parseInt(bassHigh.value)
  ];

  await browserAPI.storage.sync.set({ bassBoostPresets: values });
}

// Reset bass presets to defaults
async function resetBassPresets() {
  await browserAPI.storage.sync.remove(['bassBoostPresets']);
  bassLow.value = DEFAULT_BASS_PRESETS[0];
  bassMed.value = DEFAULT_BASS_PRESETS[1];
  bassHigh.value = DEFAULT_BASS_PRESETS[2];
  showStatus(bassStatus, 'Reset to defaults', 'success');
}

// Event listeners for bass presets (auto-save on change)
resetBassBtn.addEventListener('click', resetBassPresets);

[bassLow, bassMed, bassHigh].forEach(input => {
  input.addEventListener('change', saveBassPresets);
});

// ==================== Bass Cut Presets ====================

const bassCutLow = document.getElementById('bassCutLow');
const bassCutMed = document.getElementById('bassCutMed');
const bassCutHigh = document.getElementById('bassCutHigh');
const resetBassCutBtn = document.getElementById('resetBassCutBtn');
const bassCutStatus = document.getElementById('bassCutStatus');

// Load saved bass cut presets (stored as negative, display as positive)
async function loadBassCutPresets() {
  const result = await browserAPI.storage.sync.get(['bassCutPresets']);
  const presets = result.bassCutPresets || DEFAULT_BASS_CUT_PRESETS;

  // Negate stored values to display as positive
  bassCutLow.value = Math.abs(presets[0]);
  bassCutMed.value = Math.abs(presets[1]);
  bassCutHigh.value = Math.abs(presets[2]);
}

// Save bass cut presets (auto-save) - display as positive, store as negative
async function saveBassCutPresets() {
  clampRangeInput(bassCutLow, 'low', BASS_CUT_RANGES);
  clampRangeInput(bassCutMed, 'medium', BASS_CUT_RANGES);
  clampRangeInput(bassCutHigh, 'high', BASS_CUT_RANGES);

  // Negate positive input values to store as negative
  const values = [
    -Math.abs(parseInt(bassCutLow.value)),
    -Math.abs(parseInt(bassCutMed.value)),
    -Math.abs(parseInt(bassCutHigh.value))
  ];

  await browserAPI.storage.sync.set({ bassCutPresets: values });
}

// Reset bass cut presets to defaults (display as positive)
async function resetBassCutPresets() {
  await browserAPI.storage.sync.remove(['bassCutPresets']);
  bassCutLow.value = Math.abs(DEFAULT_BASS_CUT_PRESETS[0]);
  bassCutMed.value = Math.abs(DEFAULT_BASS_CUT_PRESETS[1]);
  bassCutHigh.value = Math.abs(DEFAULT_BASS_CUT_PRESETS[2]);
  showStatus(bassCutStatus, 'Reset to defaults', 'success');
}

// Event listeners for bass cut presets (auto-save on change)
resetBassCutBtn.addEventListener('click', resetBassCutPresets);

[bassCutLow, bassCutMed, bassCutHigh].forEach(input => {
  input.addEventListener('change', saveBassCutPresets);
});

// ==================== Treble Boost Presets ====================

const trebleLow = document.getElementById('trebleLow');
const trebleMed = document.getElementById('trebleMed');
const trebleHigh = document.getElementById('trebleHigh');
const resetTrebleBtn = document.getElementById('resetTrebleBtn');
const trebleStatus = document.getElementById('trebleStatus');

// Load saved treble presets
async function loadTreblePresets() {
  const result = await browserAPI.storage.sync.get(['trebleBoostPresets']);
  const presets = result.trebleBoostPresets || DEFAULT_TREBLE_PRESETS;

  trebleLow.value = presets[0];
  trebleMed.value = presets[1];
  trebleHigh.value = presets[2];
}

// Save treble presets (auto-save)
async function saveTreblePresets() {
  clampRangeInput(trebleLow, 'low', TREBLE_BOOST_RANGES);
  clampRangeInput(trebleMed, 'medium', TREBLE_BOOST_RANGES);
  clampRangeInput(trebleHigh, 'high', TREBLE_BOOST_RANGES);

  const values = [
    parseInt(trebleLow.value),
    parseInt(trebleMed.value),
    parseInt(trebleHigh.value)
  ];

  await browserAPI.storage.sync.set({ trebleBoostPresets: values });
}

// Reset treble presets to defaults
async function resetTreblePresets() {
  await browserAPI.storage.sync.remove(['trebleBoostPresets']);
  trebleLow.value = DEFAULT_TREBLE_PRESETS[0];
  trebleMed.value = DEFAULT_TREBLE_PRESETS[1];
  trebleHigh.value = DEFAULT_TREBLE_PRESETS[2];
  showStatus(trebleStatus, 'Reset to defaults', 'success');
}

// Event listeners for treble presets (auto-save on change)
resetTrebleBtn.addEventListener('click', resetTreblePresets);

[trebleLow, trebleMed, trebleHigh].forEach(input => {
  input.addEventListener('change', saveTreblePresets);
});

// ==================== Treble Cut Presets ====================

const trebleCutLow = document.getElementById('trebleCutLow');
const trebleCutMed = document.getElementById('trebleCutMed');
const trebleCutHigh = document.getElementById('trebleCutHigh');
const resetTrebleCutBtn = document.getElementById('resetTrebleCutBtn');
const trebleCutStatus = document.getElementById('trebleCutStatus');

// Load saved treble cut presets (stored as negative, display as positive)
async function loadTrebleCutPresets() {
  const result = await browserAPI.storage.sync.get(['trebleCutPresets']);
  const presets = result.trebleCutPresets || DEFAULT_TREBLE_CUT_PRESETS;

  // Negate stored values to display as positive
  trebleCutLow.value = Math.abs(presets[0]);
  trebleCutMed.value = Math.abs(presets[1]);
  trebleCutHigh.value = Math.abs(presets[2]);
}

// Save treble cut presets (auto-save) - display as positive, store as negative
async function saveTrebleCutPresets() {
  clampRangeInput(trebleCutLow, 'low', TREBLE_CUT_RANGES);
  clampRangeInput(trebleCutMed, 'medium', TREBLE_CUT_RANGES);
  clampRangeInput(trebleCutHigh, 'high', TREBLE_CUT_RANGES);

  // Negate positive input values to store as negative
  const values = [
    -Math.abs(parseInt(trebleCutLow.value)),
    -Math.abs(parseInt(trebleCutMed.value)),
    -Math.abs(parseInt(trebleCutHigh.value))
  ];

  await browserAPI.storage.sync.set({ trebleCutPresets: values });
}

// Reset treble cut presets to defaults (display as positive)
async function resetTrebleCutPresets() {
  await browserAPI.storage.sync.remove(['trebleCutPresets']);
  trebleCutLow.value = Math.abs(DEFAULT_TREBLE_CUT_PRESETS[0]);
  trebleCutMed.value = Math.abs(DEFAULT_TREBLE_CUT_PRESETS[1]);
  trebleCutHigh.value = Math.abs(DEFAULT_TREBLE_CUT_PRESETS[2]);
  showStatus(trebleCutStatus, 'Reset to defaults', 'success');
}

// Event listeners for treble cut presets (auto-save on change)
resetTrebleCutBtn.addEventListener('click', resetTrebleCutPresets);

[trebleCutLow, trebleCutMed, trebleCutHigh].forEach(input => {
  input.addEventListener('change', saveTrebleCutPresets);
});

// ==================== Voice Boost Presets ====================

const voiceLow = document.getElementById('voiceLow');
const voiceMed = document.getElementById('voiceMed');
const voiceHigh = document.getElementById('voiceHigh');
const resetVoiceBtn = document.getElementById('resetVoiceBtn');
const voiceStatus = document.getElementById('voiceStatus');

// Load saved voice presets
async function loadVoicePresets() {
  const result = await browserAPI.storage.sync.get(['voiceBoostPresets']);
  const presets = result.voiceBoostPresets || DEFAULT_VOICE_PRESETS;

  voiceLow.value = presets[0];
  voiceMed.value = presets[1];
  voiceHigh.value = presets[2];
}

// Save voice presets (auto-save)
async function saveVoicePresets() {
  clampRangeInput(voiceLow, 'low', VOICE_BOOST_RANGES);
  clampRangeInput(voiceMed, 'medium', VOICE_BOOST_RANGES);
  clampRangeInput(voiceHigh, 'high', VOICE_BOOST_RANGES);

  const values = [
    parseInt(voiceLow.value),
    parseInt(voiceMed.value),
    parseInt(voiceHigh.value)
  ];

  await browserAPI.storage.sync.set({ voiceBoostPresets: values });
}

// Reset voice presets to defaults
async function resetVoicePresets() {
  await browserAPI.storage.sync.remove(['voiceBoostPresets']);
  voiceLow.value = DEFAULT_VOICE_PRESETS[0];
  voiceMed.value = DEFAULT_VOICE_PRESETS[1];
  voiceHigh.value = DEFAULT_VOICE_PRESETS[2];
  showStatus(voiceStatus, 'Reset to defaults', 'success');
}

// Event listeners for voice presets (auto-save on change)
resetVoiceBtn.addEventListener('click', resetVoicePresets);

[voiceLow, voiceMed, voiceHigh].forEach(input => {
  input.addEventListener('change', saveVoicePresets);
});

// ==================== Speed Fast Presets ====================

const speedFastLow = document.getElementById('speedFastLow');
const speedFastMed = document.getElementById('speedFastMed');
const speedFastHigh = document.getElementById('speedFastHigh');
const resetSpeedFastBtn = document.getElementById('resetSpeedFastBtn');
const speedFastStatus = document.getElementById('speedFastStatus');

// Load saved speed fast presets
async function loadSpeedFastPresets() {
  const result = await browserAPI.storage.sync.get(['speedFastPresets']);
  const presets = result.speedFastPresets || DEFAULT_SPEED_FAST_PRESETS;

  speedFastLow.value = presets[0];
  speedFastMed.value = presets[1];
  speedFastHigh.value = presets[2];
}

// Save speed fast presets (auto-save)
async function saveSpeedFastPresets() {
  clampFloatRangeInput(speedFastLow, 'low', SPEED_FAST_RANGES);
  clampFloatRangeInput(speedFastMed, 'medium', SPEED_FAST_RANGES);
  clampFloatRangeInput(speedFastHigh, 'high', SPEED_FAST_RANGES);

  const values = [
    parseFloat(speedFastLow.value),
    parseFloat(speedFastMed.value),
    parseFloat(speedFastHigh.value)
  ];

  await browserAPI.storage.sync.set({ speedFastPresets: values });
}

// Reset speed fast presets to defaults
async function resetSpeedFastPresets() {
  await browserAPI.storage.sync.remove(['speedFastPresets']);
  speedFastLow.value = DEFAULT_SPEED_FAST_PRESETS[0];
  speedFastMed.value = DEFAULT_SPEED_FAST_PRESETS[1];
  speedFastHigh.value = DEFAULT_SPEED_FAST_PRESETS[2];
  showStatus(speedFastStatus, 'Reset to defaults', 'success');
}

// Event listeners for speed fast presets (auto-save on change)
resetSpeedFastBtn.addEventListener('click', resetSpeedFastPresets);

[speedFastLow, speedFastMed, speedFastHigh].forEach(input => {
  input.addEventListener('change', saveSpeedFastPresets);
});

// ==================== Speed Slow Presets ====================

const speedSlowLow = document.getElementById('speedSlowLow');
const speedSlowMed = document.getElementById('speedSlowMed');
const speedSlowHigh = document.getElementById('speedSlowHigh');
const resetSpeedSlowBtn = document.getElementById('resetSpeedSlowBtn');
const speedSlowStatus = document.getElementById('speedSlowStatus');

// Load saved speed slow presets
async function loadSpeedSlowPresets() {
  const result = await browserAPI.storage.sync.get(['speedSlowPresets']);
  const presets = result.speedSlowPresets || DEFAULT_SPEED_SLOW_PRESETS;

  speedSlowLow.value = presets[0];
  speedSlowMed.value = presets[1];
  speedSlowHigh.value = presets[2];
}

// Save speed slow presets (auto-save)
async function saveSpeedSlowPresets() {
  clampFloatRangeInput(speedSlowLow, 'low', SPEED_SLOW_RANGES);
  clampFloatRangeInput(speedSlowMed, 'medium', SPEED_SLOW_RANGES);
  clampFloatRangeInput(speedSlowHigh, 'high', SPEED_SLOW_RANGES);

  const values = [
    parseFloat(speedSlowLow.value),
    parseFloat(speedSlowMed.value),
    parseFloat(speedSlowHigh.value)
  ];

  await browserAPI.storage.sync.set({ speedSlowPresets: values });
}

// Reset speed slow presets to defaults
async function resetSpeedSlowPresets() {
  await browserAPI.storage.sync.remove(['speedSlowPresets']);
  speedSlowLow.value = DEFAULT_SPEED_SLOW_PRESETS[0];
  speedSlowMed.value = DEFAULT_SPEED_SLOW_PRESETS[1];
  speedSlowHigh.value = DEFAULT_SPEED_SLOW_PRESETS[2];
  showStatus(speedSlowStatus, 'Reset to defaults', 'success');
}

// Event listeners for speed slow presets (auto-save on change)
resetSpeedSlowBtn.addEventListener('click', resetSpeedSlowPresets);

[speedSlowLow, speedSlowMed, speedSlowHigh].forEach(input => {
  input.addEventListener('change', saveSpeedSlowPresets);
});

// ==================== Balance Presets ====================

const balancePresetLeft = document.getElementById('balancePresetLeft');
const balancePresetRight = document.getElementById('balancePresetRight');
const resetBalancePresetsBtn = document.getElementById('resetBalancePresetsBtn');
const balancePresetsStatus = document.getElementById('balancePresetsStatus');

// Load saved balance presets
async function loadBalancePresetsOptions() {
  const result = await browserAPI.storage.sync.get(['balancePresets']);
  const presets = result.balancePresets || DEFAULTS.balancePresets;

  balancePresetLeft.value = presets.left;
  balancePresetRight.value = presets.right;
}

// Save balance presets (auto-save)
async function saveBalancePresets() {
  let left = parseInt(balancePresetLeft.value, 10);
  let right = parseInt(balancePresetRight.value, 10);

  // Clamp to valid range
  if (isNaN(left) || left < 1) left = 1;
  if (left > 100) left = 100;
  if (isNaN(right) || right < 1) right = 1;
  if (right > 100) right = 100;

  balancePresetLeft.value = left;
  balancePresetRight.value = right;

  await browserAPI.storage.sync.set({ balancePresets: { left, right } });
}

// Reset balance presets to defaults
async function resetBalancePresetsDefaults() {
  await browserAPI.storage.sync.remove(['balancePresets']);
  balancePresetLeft.value = DEFAULTS.balancePresets.left;
  balancePresetRight.value = DEFAULTS.balancePresets.right;
  showStatus(balancePresetsStatus, 'Reset to defaults', 'success');
}

// Event listeners for balance presets (auto-save on change)
resetBalancePresetsBtn.addEventListener('click', resetBalancePresetsDefaults);

[balancePresetLeft, balancePresetRight].forEach(input => {
  input.addEventListener('change', saveBalancePresets);
});

// ==================== Volume Steps ====================

const stepScroll = document.getElementById('stepScroll');
const stepKeyboard = document.getElementById('stepKeyboard');
const stepButtons = document.getElementById('stepButtons');
const resetStepsBtn = document.getElementById('resetStepsBtn');
const stepsStatus = document.getElementById('stepsStatus');

// Clamp step input to valid range (1-20)
function clampStepInput(input) {
  let value = parseInt(input.value);
  if (isNaN(value) || value < VOLUME_STEP_RANGE.min) value = VOLUME_STEP_RANGE.min;
  if (value > VOLUME_STEP_RANGE.max) value = VOLUME_STEP_RANGE.max;
  input.value = value;
}

// Load saved volume steps
async function loadVolumeSteps() {
  const result = await browserAPI.storage.sync.get(['volumeSteps']);
  const steps = result.volumeSteps || DEFAULT_VOLUME_STEPS;

  stepScroll.value = steps.scrollWheel;
  stepKeyboard.value = steps.keyboard;
  stepButtons.value = steps.buttons;
}

// Save volume steps (auto-save)
async function saveVolumeSteps() {
  clampStepInput(stepScroll);
  clampStepInput(stepKeyboard);
  clampStepInput(stepButtons);

  const steps = {
    scrollWheel: parseInt(stepScroll.value),
    keyboard: parseInt(stepKeyboard.value),
    buttons: parseInt(stepButtons.value)
  };

  await browserAPI.storage.sync.set({ volumeSteps: steps });
}

// Reset volume steps to defaults
async function resetVolumeSteps() {
  await browserAPI.storage.sync.remove(['volumeSteps']);
  stepScroll.value = DEFAULT_VOLUME_STEPS.scrollWheel;
  stepKeyboard.value = DEFAULT_VOLUME_STEPS.keyboard;
  stepButtons.value = DEFAULT_VOLUME_STEPS.buttons;
  showStatus(stepsStatus, 'Reset to defaults', 'success');
}

// Event listeners for volume steps (auto-save on change)
resetStepsBtn.addEventListener('click', resetVolumeSteps);

[stepScroll, stepKeyboard, stepButtons].forEach(input => {
  input.addEventListener('change', saveVolumeSteps);
});
