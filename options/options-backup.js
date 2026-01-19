// Per-Tab Audio Control - Options Backup
// Reset all settings, backup data, restore from backup

// ==================== Reset All Settings ====================

const resetAllBtn = document.getElementById('resetAllBtn');
const resetStatus = document.getElementById('resetStatus');

// Show reset status message (used by backup/restore too)
function showResetStatus(message, isError = false) {
  resetStatus.textContent = message;
  resetStatus.className = 'status ' + (isError ? 'error' : 'success');

  setTimeout(() => {
    resetStatus.className = 'status';
  }, 3000);
}

// Reset all settings to defaults
async function resetAllSettings() {
  if (!confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
    return;
  }

  // Reset synced settings (presets, site rules, theme, visualizer, UI state, native mode, popup mode, EQ mode, header layout)
  await browserAPI.storage.sync.remove([
    'customPresets',
    'siteVolumeRules',
    'bassBoostPresets',
    'bassCutPresets',
    'trebleBoostPresets',
    'trebleCutPresets',
    'voiceBoostPresets',
    'volumeSteps',
    'theme',
    'visualizerType',
    'expandedSections',
    'disabledDomains',
    'nativeModeRefresh',
    'popupMode',
    'eqControlMode',
    'headerLayout'
  ]);

  // Reset local settings (device-specific)
  await browserAPI.storage.local.remove(['useLastDeviceAsDefault', 'globalDefaultDevice']);

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

  // Update preset colors
  [preset1, preset2, preset3, preset4].forEach(updateInputColor);

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

  // Reload UI lists
  loadRules();
  loadDisabledDomains();

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
      str = "'" + str;
    }

    // Standard CSV escaping for special characters
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes("'")) {
      return '"' + str.replace(/"/g, '""') + '"';
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
  lines.push('Preset 1,Preset 2,Preset 3,Preset 4');
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
  const steps = syncData.volumeSteps || { scrollWheel: 5, keyboard: 1, buttons: 1 };
  lines.push(`${steps.scrollWheel || 5},${steps.keyboard || 1},${steps.buttons || 1}`);
  lines.push('');

  // Theme (from sync storage)
  lines.push('[Theme]');
  lines.push('Mode');
  lines.push(syncData.theme || 'dark');
  lines.push('');

  // Visualizer Style
  lines.push('[Visualizer]');
  lines.push('Style');
  lines.push(syncData.visualizerType || 'bars');
  lines.push('');

  // EQ Control Mode
  lines.push('[EQ Control Mode]');
  lines.push('Mode');
  lines.push(syncData.eqControlMode || 'sliders');
  lines.push('');

  // Popup Mode (Basic/Advanced)
  lines.push('[Popup Mode]');
  lines.push('Mode');
  lines.push(syncData.popupMode || 'basic');
  lines.push('');

  // Native Mode Refresh Behavior
  lines.push('[Native Mode Refresh]');
  lines.push('Behavior');
  lines.push(syncData.nativeModeRefresh || 'current');
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
  lines.push('Pattern,Is Domain,Volume,Device Label,Bass Boost,Voice Boost,Balance');
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
        rule.voiceBoost || 'off',
        rule.balance ?? 0
      ].join(','));
    }
  }
  lines.push('');

  // ===== NATIVE MODE =====
  lines.push('# ===== NATIVE MODE =====');
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
    // Remove formula injection protection prefix
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
          if (presets.length === 4) {
            restoredData.sync.customPresets = presets;
          }
        }
        break;

      case 'Bass Boost Presets':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const presets = parseCSVLine(trimmedLine).map(v => parseInt(v, 10)).filter(v => !isNaN(v));
          if (presets.length === 3) {
            restoredData.sync.bassBoostPresets = presets;
          }
        }
        break;

      case 'Bass Cut Presets':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const presets = parseCSVLine(trimmedLine).map(v => parseInt(v, 10)).filter(v => !isNaN(v));
          if (presets.length === 3) {
            restoredData.sync.bassCutPresets = presets;
          }
        }
        break;

      case 'Treble Boost Presets':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const presets = parseCSVLine(trimmedLine).map(v => parseInt(v, 10)).filter(v => !isNaN(v));
          if (presets.length === 3) {
            restoredData.sync.trebleBoostPresets = presets;
          }
        }
        break;

      case 'Treble Cut Presets':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const presets = parseCSVLine(trimmedLine).map(v => parseInt(v, 10)).filter(v => !isNaN(v));
          if (presets.length === 3) {
            restoredData.sync.trebleCutPresets = presets;
          }
        }
        break;

      case 'Voice Boost Presets':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const presets = parseCSVLine(trimmedLine).map(v => parseInt(v, 10)).filter(v => !isNaN(v));
          if (presets.length === 3) {
            restoredData.sync.voiceBoostPresets = presets;
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
              scrollWheel: parseInt(values[0], 10) || 5,
              keyboard: parseInt(values[1], 10) || 1,
              buttons: parseInt(values[2], 10) || 1
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

      case 'EQ Control Mode':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const mode = trimmedLine.trim();
          if (mode === 'sliders' || mode === 'presets') {
            restoredData.sync.eqControlMode = mode;
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
            const layout = {
              order: values[0].split('|').filter(v => v),
              hidden: values[1] ? values[1].split('|').filter(v => v) : [],
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
            if (!restoredData.sync.siteVolumeRules) {
              restoredData.sync.siteVolumeRules = [];
            }
            const rule = {
              pattern: values[0],
              isDomain: values[1] === 'true',
              volume: parseInt(values[2], 10) || 100
            };
            if (values[3]) rule.deviceLabel = values[3];
            if (values[4] && values[4] !== 'off') rule.bassBoost = values[4];
            if (values[5] && values[5] !== 'off') rule.voiceBoost = values[5];
            if (values[6]) rule.balance = parseInt(values[6], 10) || 0;
            restoredData.sync.siteVolumeRules.push(rule);
          }
        }
        break;

      case 'Native Mode Domains':
        if (!headerRow) {
          headerRow = trimmedLine;
        } else {
          const domain = parseCSVValue(trimmedLine);
          if (domain && !domain.startsWith('#')) {
            if (!restoredData.sync.disabledDomains) {
              restoredData.sync.disabledDomains = [];
            }
            restoredData.sync.disabledDomains.push(domain);
          }
        }
        break;
    }
  }

  // Apply restored data to storage
  if (Object.keys(restoredData.sync).length > 0) {
    await browserAPI.storage.sync.set(restoredData.sync);
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

    // Basic validation - check for backup header
    if (!content.includes('Per-Tab Audio Control') || !content.includes('Data Backup')) {
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
    if (restored.sync.volumeSteps) counts.push('volume steps');
    if (restored.sync.siteVolumeRules) counts.push(`${restored.sync.siteVolumeRules.length} site rules`);
    if (restored.sync.disabledDomains) counts.push(`${restored.sync.disabledDomains.length} native mode domains`);
    if (restored.sync.theme) counts.push('theme');
    if (restored.sync.visualizerType) counts.push('visualizer');
    if (restored.sync.eqControlMode) counts.push('EQ mode');
    if (restored.sync.popupMode) counts.push('popup mode');
    if (restored.sync.nativeModeRefresh) counts.push('native refresh');
    if (restored.sync.headerLayout) counts.push('header layout');
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
