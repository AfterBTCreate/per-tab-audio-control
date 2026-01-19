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
  const mode = result.defaultAudioMode || DEFAULT_AUDIO_MODE;

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
  const type = result.visualizerType || 'bars';

  const radio = document.querySelector(`input[name="visualizerType"][value="${type}"]`);
  if (radio) {
    radio.checked = true;
  }
}

// Save visualizer type
async function saveVisualizerType(type) {
  await browserAPI.storage.sync.set({ visualizerType: type });
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

// ==================== EQ Control Mode (Presets vs Sliders) ====================

const eqControlModeRadios = document.querySelectorAll('input[name="eqControlMode"]');
const eqControlModeStatus = document.getElementById('eqControlModeStatus');

// Apply EQ control mode (toggle body class to show/hide preset sections)
function applyEqControlModeUI(mode) {
  if (mode === 'sliders') {
    document.body.classList.add('sliders-mode');
  } else {
    document.body.classList.remove('sliders-mode');
  }
}

// Load EQ control mode (synced across devices)
async function loadEqControlMode() {
  const result = await browserAPI.storage.sync.get(['eqControlMode']);
  const mode = result.eqControlMode || 'sliders';

  const radio = document.querySelector(`input[name="eqControlMode"][value="${mode}"]`);
  if (radio) {
    radio.checked = true;
  }
  applyEqControlModeUI(mode);
}

// Save EQ control mode
async function saveEqControlMode(mode) {
  await browserAPI.storage.sync.set({ eqControlMode: mode });
  applyEqControlModeUI(mode);
  showStatus(eqControlModeStatus, 'Control style saved!', 'success');
}

// Add listeners to radio buttons
eqControlModeRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    if (e.target.checked) {
      saveEqControlMode(e.target.value);
    }
  });
});

// Load EQ control mode on init
loadEqControlMode();

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
