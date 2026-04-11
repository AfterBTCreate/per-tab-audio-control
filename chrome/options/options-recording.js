// Per-Tab Audio Control - Options Recording Settings Module
// Handles recording format, bitrate, and sample rate preferences

'use strict';

// ==================== DOM References ====================
const recordingFormatSelect = document.getElementById('recordingFormat');
const recordingBitrateSelect = document.getElementById('recordingBitrate');
const recordingSampleRateSelect = document.getElementById('recordingSampleRate');
const recordingResetBtn = document.getElementById('resetRecordingBtn');
const recordingStatusEl = document.getElementById('recordingSettingsStatus');
const recordingBitrateRow = document.getElementById('recordingBitrateRow');

// Default bitrate per format when switching (mp3 references DEFAULTS; webm has no DEFAULTS entry)
const DEFAULT_BITRATES = {
  mp3: DEFAULTS.recordingBitrate,
  webm: 128
};

// ==================== Functions ====================

function showRecordingStatus(message, type = 'info') {
  if (!recordingStatusEl) return;
  recordingStatusEl.textContent = message;
  recordingStatusEl.className = `status ${type}`;
  setTimeout(() => {
    recordingStatusEl.textContent = '';
    recordingStatusEl.className = 'status';
  }, 3000);
}

function updateBitrateOptions(format) {
  if (!recordingBitrateSelect || !recordingBitrateRow) return;

  if (format === 'wav') {
    // WAV has no bitrate option
    recordingBitrateRow.classList.add('hidden');
    return;
  }

  recordingBitrateRow.classList.remove('hidden');
  const options = RECORDING_BITRATES[format] || RECORDING_BITRATES.mp3;
  const currentValue = parseInt(recordingBitrateSelect.value, 10);

  // Clear existing options using DOM methods (safe - no innerHTML)
  while (recordingBitrateSelect.firstChild) {
    recordingBitrateSelect.removeChild(recordingBitrateSelect.firstChild);
  }
  for (const rate of options) {
    const opt = document.createElement('option');
    opt.value = rate;
    opt.textContent = rate + ' kbps';
    recordingBitrateSelect.appendChild(opt);
  }

  // Preserve current value if it exists in new options, otherwise use default
  if (options.includes(currentValue)) {
    recordingBitrateSelect.value = currentValue;
  } else {
    recordingBitrateSelect.value = DEFAULT_BITRATES[format] || options[Math.floor(options.length / 2)];
  }
}

async function loadRecordingSettings() {
  try {
    const result = await browserAPI.storage.sync.get([
      'recordingFormat', 'recordingBitrate', 'recordingSampleRate'
    ]);

    const format = result.recordingFormat ?? DEFAULTS.recordingFormat;
    const bitrate = result.recordingBitrate ?? DEFAULTS.recordingBitrate;
    const sampleRate = result.recordingSampleRate ?? DEFAULTS.recordingSampleRate;

    if (recordingFormatSelect) recordingFormatSelect.value = format;
    updateBitrateOptions(format);
    if (recordingBitrateSelect) recordingBitrateSelect.value = bitrate;
    if (recordingSampleRateSelect) recordingSampleRateSelect.value = sampleRate;
  } catch (e) {
    console.error('Error loading recording settings:', e);
  }
}

async function saveRecordingSettings() {
  if (!recordingFormatSelect) return;

  const format = recordingFormatSelect.value;
  const sampleRate = recordingSampleRateSelect ? parseInt(recordingSampleRateSelect.value, 10) : 44100;
  const settings = {
    recordingFormat: format,
    recordingSampleRate: sampleRate
  };

  // Always save bitrate to keep storage consistent (WAV ignores it at record time,
  // but preserving the value means it's restored when switching back to MP3/WebM)
  if (recordingBitrateSelect) {
    settings.recordingBitrate = parseInt(recordingBitrateSelect.value, 10) || DEFAULTS.recordingBitrate;
  }

  try {
    await browserAPI.storage.sync.set(settings);
    showRecordingStatus('Settings saved', 'success');
  } catch (e) {
    showRecordingStatus('Failed to save', 'error');
  }
}

async function resetRecordingSettings() {
  try {
    await browserAPI.storage.sync.set({
      recordingFormat: DEFAULTS.recordingFormat,
      recordingBitrate: DEFAULTS.recordingBitrate,
      recordingSampleRate: DEFAULTS.recordingSampleRate
    });
    await loadRecordingSettings();
    showRecordingStatus('Reset to defaults', 'success');
  } catch (e) {
    showRecordingStatus('Reset failed', 'error');
  }
}

// ==================== Event Listeners ====================

if (recordingFormatSelect) {
  recordingFormatSelect.addEventListener('change', () => {
    updateBitrateOptions(recordingFormatSelect.value);
    saveRecordingSettings();
  });
}

if (recordingBitrateSelect) {
  recordingBitrateSelect.addEventListener('change', saveRecordingSettings);
}

if (recordingSampleRateSelect) {
  recordingSampleRateSelect.addEventListener('change', saveRecordingSettings);
}

if (recordingResetBtn) {
  recordingResetBtn.addEventListener('click', resetRecordingSettings);
}

// Load on init
loadRecordingSettings();
