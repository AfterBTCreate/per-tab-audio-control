// Per-Tab Audio Control - Options Backup
// Reset all settings, backup data, restore from backup

// ==================== Reset All Settings ====================

const resetAllBtn = document.getElementById('resetAllBtn');
const resetStatus = document.getElementById('resetStatus');

// Show reset status message (used by backup/restore too)
function showResetStatus(message, isError = false) {
  resetStatus.textContent = message;
  resetStatus.className = `status ${isError ? 'error' : 'success'}`;

  setTimeout(() => {
    resetStatus.className = 'status';
  }, 3000);
}

// Reset all settings to defaults
async function resetAllSettings() {
  if (!confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
    return;
  }

  // Reset synced settings (presets, site rules, theme, visualizer, UI state, native mode, popup mode, EQ mode, header layout, audio mode, site overrides, popup sections)
  await browserAPI.storage.sync.remove([
    'customPresets',
    'siteVolumeRules',
    'bassBoostPresets',
    'bassCutPresets',
    'trebleBoostPresets',
    'trebleCutPresets',
    'voiceBoostPresets',
    'speedSlowPresets',
    'speedFastPresets',
    'volumeSteps',
    'theme',
    'visualizerType',
    'tabInfoLocation',
    'disabledDomains',
    'nativeModeRefresh',
    'popupMode',
    'eqControlMode',
    'headerLayout',
    'defaultAudioMode',
    'tabCaptureDefault_webAudioSites',
    'webAudioDefault_tabCaptureSites',
    'offDefault_tabCaptureSites',
    'offDefault_webAudioSites',
    'popupSectionsLayout',
    'showShortcutsFooter',
    'showVisualizer',
    'showSeekbar',
    'seekbarTimeDisplay',
    'balancePresets',
    'badgeStyle',
    'visualizerColor'
  ]);

  // Reset local settings (device-specific, dual-written settings, and unbounded maps)
  await browserAPI.storage.local.remove(['useLastDeviceAsDefault', 'globalDefaultDevice', 'visualizerColor', 'visualizerType', 'lastActiveMode', 'tabCaptureSites']);

  // Reset visualizer UI to default (bars)
  const barsRadio = document.querySelector('input[name="visualizerType"][value="bars"]');
  if (barsRadio) {
    barsRadio.checked = true;
  }

  // Reset volume presets UI
  preset1.value = DEFAULT_PRESETS[0];
  preset2.value = DEFAULT_PRESETS[1];
  preset3.value = DEFAULT_PRESETS[2];
  preset4.value = DEFAULT_PRESETS[3];
  preset5.value = DEFAULT_PRESETS[4];

  // Update preset colors
  [preset1, preset2, preset3, preset4, preset5].forEach(updateInputColor);

  // Reset bass boost presets UI
  bassLow.value = DEFAULT_BASS_PRESETS[0];
  bassMed.value = DEFAULT_BASS_PRESETS[1];
  bassHigh.value = DEFAULT_BASS_PRESETS[2];

  // Reset bass cut presets UI (display as positive)
  bassCutLow.value = Math.abs(DEFAULT_BASS_CUT_PRESETS[0]);
  bassCutMed.value = Math.abs(DEFAULT_BASS_CUT_PRESETS[1]);
  bassCutHigh.value = Math.abs(DEFAULT_BASS_CUT_PRESETS[2]);

  // Reset treble boost presets UI
  trebleLow.value = DEFAULT_TREBLE_PRESETS[0];
  trebleMed.value = DEFAULT_TREBLE_PRESETS[1];
  trebleHigh.value = DEFAULT_TREBLE_PRESETS[2];

  // Reset treble cut presets UI (display as positive)
  trebleCutLow.value = Math.abs(DEFAULT_TREBLE_CUT_PRESETS[0]);
  trebleCutMed.value = Math.abs(DEFAULT_TREBLE_CUT_PRESETS[1]);
  trebleCutHigh.value = Math.abs(DEFAULT_TREBLE_CUT_PRESETS[2]);

  // Reset voice boost presets UI
  voiceLow.value = DEFAULT_VOICE_PRESETS[0];
  voiceMed.value = DEFAULT_VOICE_PRESETS[1];
  voiceHigh.value = DEFAULT_VOICE_PRESETS[2];

  // Reset speed fast presets UI
  speedFastLow.value = DEFAULT_SPEED_FAST_PRESETS[0];
  speedFastMed.value = DEFAULT_SPEED_FAST_PRESETS[1];
  speedFastHigh.value = DEFAULT_SPEED_FAST_PRESETS[2];

  // Reset speed slow presets UI
  speedSlowLow.value = DEFAULT_SPEED_SLOW_PRESETS[0];
  speedSlowMed.value = DEFAULT_SPEED_SLOW_PRESETS[1];
  speedSlowHigh.value = DEFAULT_SPEED_SLOW_PRESETS[2];

  // Reset balance presets UI
  if (balancePresetLeft) balancePresetLeft.value = DEFAULTS.balancePresets.left;
  if (balancePresetRight) balancePresetRight.value = DEFAULTS.balancePresets.right;

  // Reset volume steps UI
  stepScroll.value = DEFAULT_VOLUME_STEPS.scrollWheel;
  stepKeyboard.value = DEFAULT_VOLUME_STEPS.keyboard;
  stepButtons.value = DEFAULT_VOLUME_STEPS.buttons;

  // Reset Native Mode Refresh to default (current tab only)
  const nativeModeRefreshSelect = document.getElementById('nativeModeRefresh');
  if (nativeModeRefreshSelect) {
    nativeModeRefreshSelect.value = 'current';
  }

  // Reset Default Audio Device dropdown
  if (defaultDeviceSelect) {
    defaultDeviceSelect.value = '';
  }

  // Reset Shortcuts Footer checkbox
  if (showShortcutsFooterCheckbox) showShortcutsFooterCheckbox.checked = true;

  // Reset Show Visualizer checkbox
  if (showVisualizerCheckbox) {
    showVisualizerCheckbox.checked = true;
  }

  // Reset Show Seekbar checkbox
  if (showSeekbarCheckbox) showSeekbarCheckbox.checked = true;

  // Reset Custom Visualizer Color
  if (useCustomVisualizerColorCheckbox) {
    useCustomVisualizerColorCheckbox.checked = false;
    visualizerColorPicker.value = '#60a5fa';
    visualizerColorPicker.disabled = true;
  }

  // Reset theme to dark mode (default)
  document.body.classList.remove('light-mode');

  // Reset Badge Style radio to default (light)
  const badgeStyleLightRadio = document.querySelector('input[name="badgeStyle"][value="light"]');
  if (badgeStyleLightRadio) badgeStyleLightRadio.checked = true;

  // Reset Seekbar Time Display checkbox
  if (seekbarShowRemainingCheckbox) seekbarShowRemainingCheckbox.checked = false;

  // Reset Popup Mode radios to default
  const defaultPopupModeRadio = document.querySelector(`input[name="popupMode"][value="${DEFAULTS.popupMode}"]`);
  if (defaultPopupModeRadio) defaultPopupModeRadio.checked = true;

  // Reset Default Audio Mode radios to default + clear localStorage cache
  const defaultModeRadio = document.querySelector(`input[name="defaultAudioMode"][value="${DEFAULT_AUDIO_MODE}"]`);
  if (defaultModeRadio) defaultModeRadio.checked = true;
  updateModeDescription(DEFAULT_AUDIO_MODE);
  updateTabCaptureSectionState(DEFAULT_AUDIO_MODE);
  try { localStorage.removeItem('__tabVolumeControl_defaultAudioMode'); } catch (e) {}

  // Reset Tab Title Location radios to default
  const defaultTabInfoRadio = document.querySelector(`input[name="tabInfoLocation"][value="${DEFAULTS.tabInfoLocation}"]`);
  if (defaultTabInfoRadio) defaultTabInfoRadio.checked = true;

  // Update tab info inside state (depends on visualizer + tab info radios being reset above)
  updateTabInfoInsideState();

  // Reset Popup Sections Layout (in-memory state + preview + EQ body class)
  if (typeof popupSectionsLayout !== 'undefined') {
    popupSectionsLayout = {
      order: [...DEFAULT_POPUP_SECTIONS_LAYOUT.order],
      hidden: [...DEFAULT_POPUP_SECTIONS_LAYOUT.hidden],
      controlMode: {}
    };
    cachedGlobalEqMode = DEFAULTS.eqControlMode;
    rebuildPopupSectionsPreview();
    updateEqBodyClass();
  }

  // Reload header layout preview from (now-default) storage
  if (typeof loadHeaderLayout === 'function') loadHeaderLayout();

  // Reload UI lists
  loadRules();
  loadSiteOverrides();

  showResetStatus('All settings have been reset to defaults!');
}

resetAllBtn.addEventListener('click', resetAllSettings);

// ==================== Backup All Data ====================

const backupDataBtn = document.getElementById('backupDataBtn');

// Generate CSV content from all extension data
async function generateBackupCSV() {
  const lines = [];

  // Helper to escape CSV values (with formula injection protection)
  const escapeCSV = (val) => {
    if (val === null || val === undefined) return '';
    let str = String(val);

    // Prevent CSV formula injection - prefix dangerous characters with single quote
    // These characters can trigger formula execution in Excel/Sheets: = + - @ tab
    const firstChar = str.charAt(0);
    if (firstChar === '=' || firstChar === '+' || firstChar === '-' || firstChar === '@' || firstChar === '\t') {
      str = `'${str}`;
    }

    // Standard CSV escaping for special characters
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes("'")) {
      return `"${str.replace(/"/g, '""')}"`;

    }
    return str;
  };

  // Get all data from storage
  const syncData = await browserAPI.storage.sync.get(null);
  const localData = await browserAPI.storage.local.get(null);

  // Header
  lines.push('# Per-Tab Audio Control - Data Backup');
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push('');

  // ===== SETTINGS =====
  lines.push('# ===== SETTINGS =====');
  lines.push('');

  // Volume Presets
  lines.push('[Volume Presets]');
  lines.push('Preset 1,Preset 2,Preset 3,Preset 4,Preset 5');
  const presets = syncData.customPresets || DEFAULT_PRESETS;
  lines.push(presets.join(','));
  lines.push('');

  // Bass Boost Presets
  lines.push('[Bass Boost Presets]');
  lines.push('Low,Medium,High');
  const bassPresets = syncData.bassBoostPresets || DEFAULT_BASS_PRESETS;
  lines.push(bassPresets.join(','));
  lines.push('');

  // Bass Cut Presets
  lines.push('[Bass Cut Presets]');
  lines.push('Low,Medium,High');
  const bassCutPresets = syncData.bassCutPresets || DEFAULT_BASS_CUT_PRESETS;
  lines.push(bassCutPresets.join(','));
  lines.push('');

  // Treble Boost Presets
  lines.push('[Treble Boost Presets]');
  lines.push('Low,Medium,High');
  const treblePresets = syncData.trebleBoostPresets || DEFAULT_TREBLE_PRESETS;
  lines.push(treblePresets.join(','));
  lines.push('');

  // Treble Cut Presets
  lines.push('[Treble Cut Presets]');
  lines.push('Low,Medium,High');
  const trebleCutPresets = syncData.trebleCutPresets || DEFAULT_TREBLE_CUT_PRESETS;
  lines.push(trebleCutPresets.join(','));
  lines.push('');

  // Voice Boost Presets
  lines.push('[Voice Boost Presets]');
  lines.push('Low,Medium,High');
  const voicePresets = syncData.voiceBoostPresets || DEFAULT_VOICE_PRESETS;
  lines.push(voicePresets.join(','));
  lines.push('');

  // Balance Presets
  lines.push('[Balance Presets]');
  lines.push('Direction,Value');
  const balPresets = syncData.balancePresets || DEFAULTS.balancePresets;
  lines.push(`Left,${balPresets.left}`);
  lines.push(`Right,${balPresets.right}`);
  lines.push('');

  // Speed Slow Presets
  lines.push('[Speed Slow Presets]');
  lines.push('Low,Medium,High');
  const speedSlowPresetsData = syncData.speedSlowPresets || DEFAULT_SPEED_SLOW_PRESETS;
  lines.push(speedSlowPresetsData.join(','));
  lines.push('');

  // Speed Fast Presets
  lines.push('[Speed Fast Presets]');
  lines.push('Low,Medium,High');
  const speedFastPresetsData = syncData.speedFastPresets || DEFAULT_SPEED_FAST_PRESETS;
  lines.push(speedFastPresetsData.join(','));
  lines.push('');

  // Default Audio Device (from local storage - device-specific)
  lines.push('[Default Audio Device]');
  lines.push('Use Default Device,Device ID,Device Label');
  const useDefault = localData.useLastDeviceAsDefault ? 'true' : 'false';
  const deviceId = localData.globalDefaultDevice?.deviceId || '';
  const deviceLabel = localData.globalDefaultDevice?.deviceLabel || '';
  lines.push(`${useDefault},${escapeCSV(deviceId)},${escapeCSV(deviceLabel)}`);
  lines.push('');

  // Volume Steps
  lines.push('[Volume Steps]');
  lines.push('Scroll Wheel,Keyboard,Buttons');
  const steps = syncData.volumeSteps || DEFAULTS.volumeSteps;
  lines.push(`${steps.scrollWheel || DEFAULTS.volumeSteps.scrollWheel},${steps.keyboard || DEFAULTS.volumeSteps.keyboard},${steps.buttons || DEFAULTS.volumeSteps.buttons}`);
  lines.push('');

  // Theme (from sync storage)
  lines.push('[Theme]');
  lines.push('Mode');
  lines.push(syncData.theme || DEFAULTS.theme);
  lines.push('');

  // Visualizer Style
  lines.push('[Visualizer]');
  lines.push('Style');
  lines.push(syncData.visualizerType || DEFAULTS.visualizerType);
  lines.push('');

  // Tab Title Location
  lines.push('[Tab Title Location]');
  lines.push('Location');
  lines.push(syncData.tabInfoLocation || DEFAULTS.tabInfoLocation);
  lines.push('');

  // Shortcuts Footer
  lines.push('[Shortcuts Footer]');
  lines.push('Show');
  lines.push(String(syncData.showShortcutsFooter ?? DEFAULTS.showShortcutsFooter));
  lines.push('');

  // Show Visualizer
  lines.push('[Show Visualizer]');
  lines.push('Show');
  lines.push(String(syncData.showVisualizer ?? DEFAULTS.showVisualizer));
  lines.push('');

  // Show Seekbar
  lines.push('[Show Seekbar]');
  lines.push('Show');
  lines.push(String(syncData.showSeekbar ?? DEFAULTS.showSeekbar));
  lines.push('');

  // Seekbar Time Display
  lines.push('[Seekbar Time Display]');
  lines.push('Mode');
  lines.push(syncData.seekbarTimeDisplay || DEFAULTS.seekbarTimeDisplay);
  lines.push('');

  // Visualizer Color
  lines.push('[Visualizer Color]');
  lines.push('Color');
  lines.push(syncData.visualizerColor || 'none');
  lines.push('');

  // Badge Style
  lines.push('[Badge Style]');
  lines.push('Style');
  lines.push(syncData.badgeStyle || DEFAULTS.badgeStyle);
  lines.push('');

  // EQ Control Mode (global default + per-item overrides)
  lines.push('[EQ Control Mode]');
  lines.push('Item,Mode');
  lines.push(`Default,${syncData.eqControlMode || DEFAULTS.eqControlMode}`);
  const controlMode = (syncData.popupSectionsLayout && syncData.popupSectionsLayout.controlMode) || {};
  for (const [itemId, mode] of Object.entries(controlMode)) {
    lines.push(`${escapeCSV(itemId)},${escapeCSV(mode)}`);
  }
  lines.push('');

  // Default Audio Mode
  lines.push('[Default Audio Mode]');
  lines.push('Mode');
  lines.push(syncData.defaultAudioMode || DEFAULT_AUDIO_MODE);
  lines.push('');

  // Popup Mode (Basic/Advanced)
  lines.push('[Popup Mode]');
  lines.push('Mode');
  lines.push(syncData.popupMode || DEFAULTS.popupMode);
  lines.push('');

  // Native Mode Refresh Behavior
  lines.push('[Native Mode Refresh]');
  lines.push('Behavior');
  lines.push(syncData.nativeModeRefresh || 'current');
  lines.push('');

  // Popup Sections Layout (order and hidden)
  lines.push('[Popup Sections Layout]');
  lines.push('Order,Hidden');
  const popupLayout = syncData.popupSectionsLayout || DEFAULT_POPUP_SECTIONS_LAYOUT;
  lines.push([
    escapeCSV(popupLayout.order?.join('|') || ''),
    escapeCSV(popupLayout.hidden?.join('|') || '')
  ].join(','));
  lines.push('');

  // Header Layout
  lines.push('[Header Layout]');
  lines.push('Order,Hidden,Spacer Count');
  const headerLayout = syncData.headerLayout || DEFAULT_HEADER_LAYOUT;
  lines.push([
    escapeCSV(headerLayout.order?.join('|') || ''),
    escapeCSV(headerLayout.hidden?.join('|') || ''),
    headerLayout.spacerCount ?? 3
  ].join(','));
  lines.push('');

  // ===== SITE RULES =====
  lines.push('# ===== SITE RULES =====');
  lines.push('');
  lines.push('[Site Volume Rules]');
  lines.push('Pattern,Is Domain,Volume,Device Label,Bass Boost,Treble Boost,Voice Boost,Compressor,Balance,Channel Mode,Speed');
  const rules = syncData.siteVolumeRules || [];
  if (rules.length === 0) {
    lines.push('# No site rules configured');
  } else {
    for (const rule of rules) {
      lines.push([
        escapeCSV(rule.pattern),
        rule.isDomain ? 'true' : 'false',
        rule.volume,
        escapeCSV(rule.deviceLabel || ''),
        rule.bassBoost || 'off',
        rule.trebleBoost || 'off',
        rule.voiceBoost || 'off',
        rule.compressor || 'off',
        rule.balance ?? 0,
        rule.channelMode || 'stereo',
        rule.speed || 'off'
      ].join(','));
    }
  }
  lines.push('');

  // ===== AUDIO MODE OVERRIDES =====
  lines.push('# ===== AUDIO MODE OVERRIDES =====');
  lines.push('');
  lines.push('[Native Mode Domains]');
  lines.push('Domain');
  const disabledDomains = syncData.disabledDomains || [];
  if (disabledDomains.length === 0) {
    lines.push('# No domains in Native Mode');
  } else {
    for (const domain of disabledDomains) {
      lines.push(escapeCSV(domain));
    }
  }
  lines.push('');

  // Site audio mode overrides (per-site Tab Capture / Web Audio / Off overrides)
  lines.push('[Site Audio Mode Overrides]');
  lines.push('Storage Key,Domains');
  const overrideKeys = [
    'tabCaptureDefault_webAudioSites',
    'webAudioDefault_tabCaptureSites',
    'offDefault_tabCaptureSites',
    'offDefault_webAudioSites'
  ];
  let hasOverrides = false;
  for (const key of overrideKeys) {
    const domains = syncData[key] || [];
    if (domains.length > 0) {
      hasOverrides = true;
      lines.push(`${key},${domains.map(d => escapeCSV(d)).join('|')}`);
    }
  }
  if (!hasOverrides) {
    lines.push('# No site audio mode overrides');
  }

  return lines.join('\n');
}

// Download CSV file
function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Backup all data
async function backupAllData() {
  try {
    const csv = await generateBackupCSV();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `tab-volume-control-backup-${timestamp}.csv`;
    downloadCSV(csv, filename);
    showResetStatus('Backup downloaded successfully!');
  } catch (e) {
    console.error('Backup failed:', e);
    showResetStatus(`Backup failed: ${e.message}`, true);
  }
}

backupDataBtn.addEventListener('click', backupAllData);

// ==================== Restore from Backup ====================

const restoreDataBtn = document.getElementById('restoreDataBtn');
const restoreFileInput = document.getElementById('restoreFileInput');

// Parse CSV backup file and restore settings
async function restoreFromBackup(csvContent) {
  const lines = csvContent.split('\n');
  let currentSection = null;
  let headerRow = null;

  const restoredData = {
    sync: {},
    local: {}
  };

  // Parse CSV value (handle quoted strings and escaped quotes)
  const parseCSVValue = (val) => {
    if (!val) return '';
    val = val.trim();
    // Strip CSV formula injection prefix added during export.
    // The ' prefix is a CSV-format concern (tells Excel to treat as text).
    // Storage holds raw data; the export function re-adds the prefix.
    if (val.startsWith("'") && (val.charAt(1) === '=' || val.charAt(1) === '+' || val.charAt(1) === '-' || val.charAt(1) === '@')) {
      val = val.substring(1);
    }
    // Handle quoted strings
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1).replace(/""/g, '"');
    }
    return val;
  };

  // Parse a CSV line into values
  const parseCSVLine = (line) => {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(parseCSVValue(current));
        current = '';
      } else {
        current += char;
      }
    }
    values.push(parseCSVValue(current));
    return values;
  };

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;

    // Check for section headers
    if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
      currentSection = trimmedLine.slice(1, -1);
      headerRow = null;
      continue;
    }

    // Process based on current section
    switch (currentSection) {
      case 'Volume Presets':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const presets = parseCSVLine(trimmedLine).map(v => parseInt(v, 10)).filter(v => !isNaN(v));
          if (presets.length === 5) {
            restoredData.sync.customPresets = presets.map(v => Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, v)));
          }
        }
        break;

      case 'Bass Boost Presets':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const presets = parseCSVLine(trimmedLine).map(v => parseInt(v, 10)).filter(v => !isNaN(v));
          if (presets.length === 3) {
            restoredData.sync.bassBoostPresets = presets.map(v => Math.max(0, Math.min(EFFECT_RANGES.bass.max, v)));
          }
        }
        break;

      case 'Bass Cut Presets':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const presets = parseCSVLine(trimmedLine).map(v => parseInt(v, 10)).filter(v => !isNaN(v));
          if (presets.length === 3) {
            restoredData.sync.bassCutPresets = presets.map(v => Math.max(EFFECT_RANGES.bass.min, Math.min(0, v)));
          }
        }
        break;

      case 'Treble Boost Presets':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const presets = parseCSVLine(trimmedLine).map(v => parseInt(v, 10)).filter(v => !isNaN(v));
          if (presets.length === 3) {
            restoredData.sync.trebleBoostPresets = presets.map(v => Math.max(0, Math.min(EFFECT_RANGES.treble.max, v)));
          }
        }
        break;

      case 'Treble Cut Presets':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const presets = parseCSVLine(trimmedLine).map(v => parseInt(v, 10)).filter(v => !isNaN(v));
          if (presets.length === 3) {
            restoredData.sync.trebleCutPresets = presets.map(v => Math.max(EFFECT_RANGES.treble.min, Math.min(0, v)));
          }
        }
        break;

      case 'Voice Boost Presets':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const presets = parseCSVLine(trimmedLine).map(v => parseInt(v, 10)).filter(v => !isNaN(v));
          if (presets.length === 3) {
            restoredData.sync.voiceBoostPresets = presets.map(v => Math.max(EFFECT_RANGES.voice.min, Math.min(EFFECT_RANGES.voice.max, v)));
          }
        }
        break;

      case 'Balance Presets':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const values = parseCSVLine(trimmedLine);
          if (values.length >= 2) {
            const direction = values[0];
            const val = parseInt(values[1], 10);
            if (!isNaN(val) && val >= 1 && val <= 100) {
              if (!restoredData.sync.balancePresets) {
                restoredData.sync.balancePresets = { left: 100, right: 100 };
              }
              if (direction === 'Left') restoredData.sync.balancePresets.left = val;
              if (direction === 'Right') restoredData.sync.balancePresets.right = val;
            }
          }
        }
        break;

      case 'Speed Slow Presets':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const presets = parseCSVLine(trimmedLine).map(v => parseFloat(v)).filter(v => !isNaN(v));
          if (presets.length === 3) {
            restoredData.sync.speedSlowPresets = presets.map(v => Math.max(EFFECT_RANGES.speed.min, Math.min(1.0, v)));
          }
        }
        break;

      case 'Speed Fast Presets':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const presets = parseCSVLine(trimmedLine).map(v => parseFloat(v)).filter(v => !isNaN(v));
          if (presets.length === 3) {
            restoredData.sync.speedFastPresets = presets.map(v => Math.max(1.0, Math.min(EFFECT_RANGES.speed.max, v)));
          }
        }
        break;

      case 'Default Audio Device':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const values = parseCSVLine(trimmedLine);
          if (values.length >= 1) {
            restoredData.local.useLastDeviceAsDefault = values[0] === 'true';
            if (values[1] || values[2]) {
              restoredData.local.globalDefaultDevice = {
                deviceId: values[1] || '',
                deviceLabel: values[2] || ''
              };
            }
          }
        }
        break;

      case 'Volume Steps':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const values = parseCSVLine(trimmedLine);
          if (values.length >= 3) {
            restoredData.sync.volumeSteps = {
              scrollWheel: Math.max(VOLUME_STEP_RANGE.min, Math.min(VOLUME_STEP_RANGE.max, parseInt(values[0], 10) || DEFAULTS.volumeSteps.scrollWheel)),
              keyboard: Math.max(VOLUME_STEP_RANGE.min, Math.min(VOLUME_STEP_RANGE.max, parseInt(values[1], 10) || DEFAULTS.volumeSteps.keyboard)),
              buttons: Math.max(VOLUME_STEP_RANGE.min, Math.min(VOLUME_STEP_RANGE.max, parseInt(values[2], 10) || DEFAULTS.volumeSteps.buttons))
            };
          }
        }
        break;

      case 'Theme':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const theme = trimmedLine.trim();
          if (theme === 'light' || theme === 'dark') {
            restoredData.sync.theme = theme;
          }
        }
        break;

      case 'Visualizer':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const style = trimmedLine.trim();
          if (['bars', 'waveform', 'mirrored', 'curve', 'dots', 'off'].includes(style)) {
            restoredData.sync.visualizerType = style;
          }
        }
        break;

      case 'Tab Title Location':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const loc = trimmedLine.trim();
          if (['inside', 'below', 'above', 'off'].includes(loc)) {
            restoredData.sync.tabInfoLocation = loc;
          }
        }
        break;

      case 'Shortcuts Footer':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const show = trimmedLine.trim();
          if (show === 'true' || show === 'false') {
            restoredData.sync.showShortcutsFooter = show === 'true';
          }
        }
        break;

      case 'Show Visualizer':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const showVis = trimmedLine.trim();
          if (showVis === 'true' || showVis === 'false') {
            restoredData.sync.showVisualizer = showVis === 'true';
          }
        }
        break;

      case 'Show Seekbar':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const showSb = trimmedLine.trim();
          if (showSb === 'true' || showSb === 'false') {
            restoredData.sync.showSeekbar = showSb === 'true';
          }
        }
        break;

      case 'Seekbar Time Display':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const mode = trimmedLine.trim();
          if (mode === 'total' || mode === 'remaining') {
            restoredData.sync.seekbarTimeDisplay = mode;
          }
        }
        break;

      case 'Visualizer Color':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const color = trimmedLine.trim();
          if (color !== 'none' && /^#[0-9a-fA-F]{6}$/.test(color)) {
            restoredData.sync.visualizerColor = color;
          }
        }
        break;

      case 'Badge Style':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const badgeStyle = trimmedLine.trim();
          if (['light', 'dark', 'color'].includes(badgeStyle)) {
            restoredData.sync.badgeStyle = badgeStyle;
          }
        }
        break;

      case 'EQ Control Mode':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const values = parseCSVLine(trimmedLine);
          if (values.length >= 2) {
            // New format: Item,Mode (e.g. "Default,sliders" or "bass,presets")
            const itemId = values[0];
            const mode = values[1];
            if (mode === 'sliders' || mode === 'presets') {
              if (itemId === 'Default') {
                restoredData.sync.eqControlMode = mode;
              } else {
                // Per-item override — store for later merge into popupSectionsLayout
                if (!restoredData._eqControlModeOverrides) {
                  restoredData._eqControlModeOverrides = {};
                }
                restoredData._eqControlModeOverrides[itemId] = mode;
              }
            }
          } else {
            // Old format: single value (backward compatible)
            const mode = trimmedLine.trim();
            if (mode === 'sliders' || mode === 'presets') {
              restoredData.sync.eqControlMode = mode;
            }
          }
        }
        break;

      case 'Default Audio Mode':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const mode = trimmedLine.trim();
          if (['tabcapture', 'auto', 'native'].includes(mode)) {
            restoredData.sync.defaultAudioMode = mode;
          }
        }
        break;

      case 'Popup Sections Layout':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const values = parseCSVLine(trimmedLine);
          if (values[0]) {
            const validSectionIds = ['balance', 'speed', 'bass', 'treble', 'voice', 'range', 'output', 'siteRule'];
            const layout = {
              order: values[0].split('|').filter(v => validSectionIds.includes(v)),
              hidden: values[1] ? values[1].split('|').filter(v => validSectionIds.includes(v)) : [],
              controlMode: {}
            };
            if (layout.order.length > 0) {
              restoredData.sync.popupSectionsLayout = layout;
            }
          }
        }
        break;

      case 'Popup Mode':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const mode = trimmedLine.trim();
          if (mode === 'basic' || mode === 'advanced') {
            restoredData.sync.popupMode = mode;
          }
        }
        break;

      case 'Native Mode Refresh':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const behavior = trimmedLine.trim();
          if (behavior === 'current' || behavior === 'all') {
            restoredData.sync.nativeModeRefresh = behavior;
          }
        }
        break;

      case 'Header Layout':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const values = parseCSVLine(trimmedLine);
          if (values[0]) {
            const validHeaderIds = ['companyLogo', 'brandText', 'audioMode', 'focus', 'modeToggle', 'theme', 'settings', 'logo'];
            // Spacer IDs are dynamic (spacer1, spacer2, etc.)
            const isValidHeaderId = (id) => validHeaderIds.includes(id) || /^spacer\d+$/.test(id);
            const layout = {
              order: values[0].split('|').filter(v => isValidHeaderId(v)),
              hidden: values[1] ? values[1].split('|').filter(v => isValidHeaderId(v)) : [],
              spacerCount: parseInt(values[2], 10) || 3
            };
            // Validate order has items
            if (layout.order.length > 0) {
              restoredData.sync.headerLayout = layout;
            }
          }
        }
        break;

      case 'Site Volume Rules':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const values = parseCSVLine(trimmedLine);
          if (values[0] && !values[0].startsWith('#')) {
            // Validate pattern: sanitize hostnames, reject invalid patterns
            const isDomain = values[1] === 'true';
            let pattern = values[0];
            if (isDomain) {
              pattern = sanitizeHostname(pattern);
              if (!pattern) break; // Skip invalid hostname
            } else {
              // URL patterns: validate length and basic format
              if (pattern.length > 2048) break;
              try { new URL(pattern); } catch { break; } // Skip invalid URLs
            }
            if (!restoredData.sync.siteVolumeRules) {
              restoredData.sync.siteVolumeRules = [];
            }
            const rule = {
              pattern,
              isDomain,
              volume: Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, parseInt(values[2], 10) || 100))
            };
            if (values[3]) rule.deviceLabel = values[3].slice(0, 500);
            // Validate effect levels against allowed values
            const validEqLevels = ['low', 'medium', 'high', 'cut-low', 'cut-medium', 'cut-high'];
            const validVoiceLevels = ['low', 'medium', 'high'];
            const validCompressorModes = ['podcast', 'movie', 'max'];
            const validChannelModes = ['mono', 'swap'];
            const validSpeedLevels = ['slow-low', 'slow-medium', 'slow-high', 'fast-low', 'fast-medium', 'fast-high'];
            if (values[4] && values[4] !== 'off' && validEqLevels.includes(values[4])) rule.bassBoost = values[4];
            if (values[5] && values[5] !== 'off' && validEqLevels.includes(values[5])) rule.trebleBoost = values[5];
            if (values[6] && values[6] !== 'off' && validVoiceLevels.includes(values[6])) rule.voiceBoost = values[6];
            if (values[7] && values[7] !== 'off' && validCompressorModes.includes(values[7])) rule.compressor = values[7];
            if (values[8]) rule.balance = Math.max(-100, Math.min(100, parseInt(values[8], 10) || 0));
            if (values[9] && values[9] !== 'stereo' && validChannelModes.includes(values[9])) rule.channelMode = values[9];
            if (values[10] && values[10] !== 'off') {
              // Speed can be a preset level or 'slider:N' with a valid float
              if (validSpeedLevels.includes(values[10])) {
                rule.speed = values[10];
              } else if (values[10].startsWith('slider:')) {
                const rate = parseFloat(values[10].split(':')[1]);
                if (Number.isFinite(rate) && rate >= EFFECT_RANGES.speed.min && rate <= EFFECT_RANGES.speed.max) {
                  rule.speed = values[10];
                }
              }
            }
            restoredData.sync.siteVolumeRules.push(rule);
          }
        }
        break;

      case 'Native Mode Domains':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const domain = parseCSVValue(trimmedLine);
          if (domain && !domain.startsWith('#') && typeof isValidHostname === 'function' && isValidHostname(domain)) {
            if (!restoredData.sync.disabledDomains) {
              restoredData.sync.disabledDomains = [];
            }
            restoredData.sync.disabledDomains.push(domain);
          }
        }
        break;

      case 'Site Audio Mode Overrides':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          if (trimmedLine.startsWith('#')) break;
          const commaIdx = trimmedLine.indexOf(',');
          if (commaIdx === -1) break;
          const storageKey = trimmedLine.substring(0, commaIdx).trim();
          const domainsStr = trimmedLine.substring(commaIdx + 1).trim();
          const validKeys = [
            'tabCaptureDefault_webAudioSites',
            'webAudioDefault_tabCaptureSites',
            'offDefault_tabCaptureSites',
            'offDefault_webAudioSites'
          ];
          if (validKeys.includes(storageKey) && domainsStr) {
            const domains = domainsStr.split('|').map(d => d.trim()).filter(d => d && (typeof isValidHostname === 'function' ? isValidHostname(d) : true));
            if (domains.length > 0) {
              restoredData.sync[storageKey] = domains;
            }
          }
        }
        break;
    }
  }

  // Merge per-item EQ control mode overrides into popupSectionsLayout
  if (restoredData._eqControlModeOverrides) {
    if (!restoredData.sync.popupSectionsLayout) {
      // Read existing layout from storage to merge into
      const existing = await browserAPI.storage.sync.get(['popupSectionsLayout']);
      restoredData.sync.popupSectionsLayout = existing.popupSectionsLayout || { ...DEFAULTS.popupSectionsLayout };
    }
    restoredData.sync.popupSectionsLayout.controlMode = restoredData._eqControlModeOverrides;
    delete restoredData._eqControlModeOverrides;
  }

  // Apply restored data to storage
  if (Object.keys(restoredData.sync).length > 0) {
    await browserAPI.storage.sync.set(restoredData.sync);
    // Dual-write visualizerColor and visualizerType to local storage for popup access
    if (restoredData.sync.visualizerColor) {
      await browserAPI.storage.local.set({ visualizerColor: restoredData.sync.visualizerColor });
    }
    if (restoredData.sync.visualizerType) {
      await browserAPI.storage.local.set({ visualizerType: restoredData.sync.visualizerType });
    }
  }
  if (Object.keys(restoredData.local).length > 0) {
    await browserAPI.storage.local.set(restoredData.local);
  }

  return restoredData;
}

// Handle restore button click
restoreDataBtn.addEventListener('click', () => {
  restoreFileInput.click();
});

// Handle file selection
restoreFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Reset file input so same file can be selected again
  restoreFileInput.value = '';

  // Validate file type
  if (!file.name.endsWith('.csv')) {
    showResetStatus('Please select a CSV backup file', true);
    return;
  }

  try {
    const content = await file.text();

    // Validate exact backup header format (not just substring presence)
    const headerLines = content.split('\n');
    if (headerLines.length < 2 ||
        !headerLines[0].trim().startsWith('# Per-Tab Audio Control - Data Backup') ||
        !headerLines[1].trim().startsWith('# Generated:')) {
      showResetStatus('Invalid backup file format', true);
      return;
    }

    const restored = await restoreFromBackup(content);

    // Count what was restored
    const counts = [];
    if (restored.sync.customPresets) counts.push('volume presets');
    if (restored.sync.bassBoostPresets) counts.push('bass boost presets');
    if (restored.sync.bassCutPresets) counts.push('bass cut presets');
    if (restored.sync.trebleBoostPresets) counts.push('treble boost presets');
    if (restored.sync.trebleCutPresets) counts.push('treble cut presets');
    if (restored.sync.voiceBoostPresets) counts.push('voice presets');
    if (restored.sync.speedSlowPresets) counts.push('speed slow presets');
    if (restored.sync.speedFastPresets) counts.push('speed fast presets');
    if (restored.sync.balancePresets) counts.push('balance presets');
    if (restored.sync.volumeSteps) counts.push('volume steps');
    if (restored.sync.siteVolumeRules) counts.push(`${restored.sync.siteVolumeRules.length} site rules`);
    if (restored.sync.disabledDomains) counts.push(`${restored.sync.disabledDomains.length} native mode domains`);
    const overrideCount = ['tabCaptureDefault_webAudioSites', 'webAudioDefault_tabCaptureSites', 'offDefault_tabCaptureSites', 'offDefault_webAudioSites']
      .reduce((sum, key) => sum + (restored.sync[key]?.length || 0), 0);
    if (overrideCount > 0) counts.push(`${overrideCount} audio mode overrides`);
    if (restored.sync.theme) counts.push('theme');
    if (restored.sync.visualizerType) counts.push('visualizer');
    if (restored.sync.eqControlMode) counts.push('EQ mode');
    if (restored.sync.popupSectionsLayout?.controlMode && Object.keys(restored.sync.popupSectionsLayout.controlMode).length > 0) counts.push('per-item EQ modes');
    if (restored.sync.popupMode) counts.push('popup mode');
    if (restored.sync.nativeModeRefresh) counts.push('native refresh');
    if (restored.sync.headerLayout) counts.push('header layout');
    if (restored.sync.tabInfoLocation) counts.push('tab title location');
    if (restored.sync.showShortcutsFooter !== undefined) counts.push('shortcuts footer');
    if (restored.sync.showVisualizer !== undefined) counts.push('show visualizer');
    if (restored.sync.showSeekbar !== undefined) counts.push('show seekbar');
    if (restored.sync.seekbarTimeDisplay) counts.push('seekbar time display');
    if (restored.sync.defaultAudioMode) counts.push('default audio mode');
    if (restored.sync.popupSectionsLayout?.order) counts.push('popup sections layout');
    if (restored.sync.visualizerColor) counts.push('visualizer color');
    if (restored.sync.badgeStyle) counts.push('badge style');
    if (restored.local.globalDefaultDevice) counts.push('default device');

    if (counts.length > 0) {
      // Save restore flag to sessionStorage and reload immediately
      sessionStorage.setItem('restoreSuccess', 'true');
      location.reload();
    } else {
      showResetStatus('No settings found in backup file', true);
    }
  } catch (err) {
    console.error('Restore failed:', err);
    showResetStatus(`Restore failed: ${err.message}`, true);
  }
});

// ==================== Restore Banner Display ====================

// Check for pending restore message on page load
(function checkRestoreMessage() {
  if (sessionStorage.getItem('restoreSuccess')) {
    sessionStorage.removeItem('restoreSuccess');
    const banner = document.getElementById('restoreBanner');
    if (banner) {
      banner.textContent = 'Backup restored successfully!';
      banner.hidden = false;
      // Auto-hide after 5 seconds
      setTimeout(() => { banner.hidden = true; }, 5000);
    }
  }
})();
