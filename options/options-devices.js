// Per-Tab Audio Control - Options Devices
// Default audio device, microphone settings, keyboard shortcuts

// ==================== Microphone Settings ====================

const openMicSettingsChrome = document.getElementById('openMicSettingsChrome');
const openMicSettingsFirefox = document.getElementById('openMicSettingsFirefox');
const micPermissionChrome = document.getElementById('micPermissionChrome');
const micPermissionFirefox = document.getElementById('micPermissionFirefox');
const micSettingsStatus = document.getElementById('micSettingsStatus');

// Show only the relevant browser section and button
if (isFirefox) {
  openMicSettingsChrome.style.display = 'none';
  micPermissionChrome.style.display = 'none';
} else {
  openMicSettingsFirefox.style.display = 'none';
  micPermissionFirefox.style.display = 'none';
}

openMicSettingsChrome.addEventListener('click', async (e) => {
  e.preventDefault();
  const url = 'chrome://settings/content/microphone';

  try {
    await navigator.clipboard.writeText(url);
    micSettingsStatus.textContent = 'URL copied! Paste in address bar to configure permissions.';
    micSettingsStatus.className = 'status success';
    setTimeout(() => {
      micSettingsStatus.className = 'status';
    }, 3000);
  } catch (err) {
    micSettingsStatus.textContent = `Copy this URL: ${url}`;
    micSettingsStatus.className = 'status';
  }
});

openMicSettingsFirefox.addEventListener('click', async (e) => {
  e.preventDefault();
  const url = 'about:preferences#privacy';

  try {
    await navigator.clipboard.writeText(url);
    micSettingsStatus.textContent = 'URL copied! Paste in address bar to configure permissions.';
    micSettingsStatus.className = 'status success';
    setTimeout(() => {
      micSettingsStatus.className = 'status';
    }, 3000);
  } catch (err) {
    micSettingsStatus.textContent = `Copy this URL: ${url}`;
    micSettingsStatus.className = 'status';
  }
});

// ==================== Default Audio Device ====================

const devicePermissionPrompt = document.getElementById('devicePermissionPrompt');
const defaultDeviceSelector = document.getElementById('defaultDeviceSelector');
const grantDevicePermissionBtn = document.getElementById('grantDevicePermission');

// Check if microphone permission has been granted
async function checkMicrophonePermission() {
  try {
    if (!navigator.mediaDevices) {
      return false;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

    // If any device has a non-empty label, permission has been granted
    // Empty labels mean permission hasn't been granted yet
    const hasPermission = audioOutputs.some(d => d.label && d.label.length > 0);

    return hasPermission;
  } catch (e) {
    console.log('[TabVolume Options] Permission check failed:', e.message);
    return false;
  }
}

// Update UI based on permission status
async function updateDevicePermissionUI() {
  const hasPermission = await checkMicrophonePermission();

  if (hasPermission) {
    // Hide permission prompt, show device selector
    devicePermissionPrompt.style.display = 'none';
    defaultDeviceSelector.style.display = '';
  } else {
    // Show permission prompt, hide device selector
    devicePermissionPrompt.style.display = '';
    defaultDeviceSelector.style.display = 'none';
  }

  return hasPermission;
}

// Handle grant permission button click
grantDevicePermissionBtn.addEventListener('click', () => {
  // Open the permissions page
  browserAPI.tabs.create({
    url: browserAPI.runtime.getURL('permissions/permissions.html')
  });
});

// Enumerate audio devices directly using mediaDevices API
async function enumerateDevicesDirectly(requestPermission = false) {
  try {
    if (!navigator.mediaDevices) {
      return { success: false, error: 'mediaDevices not available' };
    }

    // Request permission if needed
    if (requestPermission) {
      try {
        console.log('[TabVolume Options] Requesting microphone permission...');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        console.log('[TabVolume Options] Permission granted');
      } catch (e) {
        console.log('[TabVolume Options] Permission request failed:', e.name, e.message);
        // Continue anyway - user may have already granted permission before
      }
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioOutputs = devices
      .filter(d => d.kind === 'audiooutput')
      .map(d => ({
        deviceId: d.deviceId,
        label: d.label || `Audio Device ${d.deviceId.slice(0, 8) || 'Unknown'}...`
      }));

    console.log('[TabVolume Options] Direct enumeration found:', audioOutputs.length, 'devices');

    return { success: true, devices: audioOutputs };
  } catch (e) {
    console.log('[TabVolume Options] Direct enumeration failed:', e.message);
    return { success: false, error: e.message };
  }
}

const defaultDeviceSelect = document.getElementById('defaultDeviceSelect');
const refreshDefaultDevicesBtn = document.getElementById('refreshDefaultDevices');
const defaultDeviceStatus = document.getElementById('defaultDeviceStatus');

// Show default device status message
function showDefaultDeviceStatus(message, isError = false) {
  defaultDeviceStatus.textContent = message;
  defaultDeviceStatus.className = 'status ' + (isError ? 'error' : 'success');

  setTimeout(() => {
    defaultDeviceStatus.className = 'status';
  }, 3000);
}

// Load default device settings (local - devices differ per machine)
async function loadDefaultDeviceSettings() {
  const result = await browserAPI.storage.local.get(['globalDefaultDevice']);
  await loadDefaultDeviceDropdown(result.globalDefaultDevice);
}

// Load devices into the default device dropdown
async function loadDefaultDeviceDropdown(savedDevice) {
  // Clear and show loading state
  while (defaultDeviceSelect.firstChild) {
    defaultDeviceSelect.removeChild(defaultDeviceSelect.firstChild);
  }

  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = 'Default (System Audio)';
  defaultDeviceSelect.appendChild(defaultOpt);

  const loadingOpt = document.createElement('option');
  loadingOpt.value = '';
  loadingOpt.disabled = true;
  loadingOpt.textContent = 'Loading devices...';
  defaultDeviceSelect.appendChild(loadingOpt);

  let response;

  // Use direct enumeration (works for both Firefox and Chrome in options context)
  if (isFirefox) {
    response = await enumerateDevicesDirectly(false);
  } else {
    try {
      response = await browserAPI.runtime.sendMessage({
        type: 'REQUEST_AUDIO_DEVICES',
        requestPermission: false
      });
    } catch (e) {
      response = await enumerateDevicesDirectly(false);
    }

    if (!response || !response.success) {
      response = await enumerateDevicesDirectly(false);
    }
  }

  // Clear and start with the default option
  while (defaultDeviceSelect.firstChild) {
    defaultDeviceSelect.removeChild(defaultDeviceSelect.firstChild);
  }

  // Add the default system audio option
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Default (System Audio)';
  defaultDeviceSelect.appendChild(defaultOption);

  if (!response || !response.success || !response.devices || response.devices.length === 0) {
    // No devices found, but still have the default option
    return;
  }

  // Filter out the default pseudo-device and add real devices
  const audioOutputs = response.devices.filter(d => d.deviceId !== 'default');

  audioOutputs.forEach(device => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = device.label || `Audio Device ${device.deviceId.slice(0, 8)}...`;
    defaultDeviceSelect.appendChild(option);
  });

  // Select the saved device if it exists
  if (savedDevice && savedDevice.deviceLabel) {
    const normalizedSavedLabel = savedDevice.deviceLabel.toLowerCase().trim();

    // Try to find by deviceId first, then by label
    let matchedDevice = audioOutputs.find(d => d.deviceId === savedDevice.deviceId);
    if (!matchedDevice) {
      matchedDevice = audioOutputs.find(d =>
        d.label && d.label.toLowerCase().trim() === normalizedSavedLabel
      );
    }

    if (matchedDevice) {
      defaultDeviceSelect.value = matchedDevice.deviceId;
    }
  }
}

// Handle device selection change
defaultDeviceSelect.addEventListener('change', async () => {
  const selectedOption = defaultDeviceSelect.options[defaultDeviceSelect.selectedIndex];

  if (selectedOption && selectedOption.value) {
    // A specific device was selected - enable default device feature (local - devices differ per machine)
    await browserAPI.storage.local.set({
      useLastDeviceAsDefault: true,
      globalDefaultDevice: {
        deviceId: selectedOption.value,
        deviceLabel: selectedOption.textContent
      }
    });
    showDefaultDeviceStatus('Default device saved.');
  } else {
    // "Default (System Audio)" selected - disable the feature
    await browserAPI.storage.local.set({ useLastDeviceAsDefault: false });
    await browserAPI.storage.local.remove(['globalDefaultDevice']);
    showDefaultDeviceStatus('Using system default audio.');
  }
});

// Handle refresh button
refreshDefaultDevicesBtn.addEventListener('click', async () => {
  refreshDefaultDevicesBtn.classList.add('spinning');
  refreshDefaultDevicesBtn.disabled = true;

  // Request permission if needed
  let response;
  if (isFirefox) {
    response = await enumerateDevicesDirectly(true);
  } else {
    try {
      response = await browserAPI.runtime.sendMessage({
        type: 'REQUEST_AUDIO_DEVICES',
        requestPermission: true
      });
    } catch (e) {
      response = await enumerateDevicesDirectly(true);
    }
  }

  refreshDefaultDevicesBtn.classList.remove('spinning');
  refreshDefaultDevicesBtn.disabled = false;

  if (response && response.success && response.devices && response.devices.length > 0) {
    const result = await browserAPI.storage.local.get(['globalDefaultDevice']);
    await loadDefaultDeviceDropdown(result.globalDefaultDevice);
    showDefaultDeviceStatus('Devices refreshed.');
  } else {
    // Open permissions page if no devices found
    browserAPI.tabs.create({
      url: browserAPI.runtime.getURL('permissions/permissions.html')
    });
  }
});

// Load settings on init (only if permission granted)
async function initDefaultDeviceSection() {
  const hasPermission = await updateDevicePermissionUI();
  if (hasPermission) {
    loadDefaultDeviceSettings();
  }
}

initDefaultDeviceSection();

// ==================== Keyboard Shortcuts ====================

const shortcutVolumeUp = document.getElementById('shortcutVolumeUp');
const shortcutVolumeDown = document.getElementById('shortcutVolumeDown');
const shortcutToggleMute = document.getElementById('shortcutToggleMute');
const openShortcutsChrome = document.getElementById('openShortcutsChrome');
const openShortcutsFirefox = document.getElementById('openShortcutsFirefox');
const shortcutsStatus = document.getElementById('shortcutsStatus');

// Show only the relevant browser button
if (isFirefox) {
  openShortcutsChrome.style.display = 'none';
} else {
  openShortcutsFirefox.style.display = 'none';
}

// Load and display current shortcuts
async function loadShortcuts() {
  try {
    const commands = await browserAPI.commands.getAll();

    commands.forEach(command => {
      const shortcut = command.shortcut || null;

      if (command.name === 'volume-up') {
        if (shortcut) {
          shortcutVolumeUp.textContent = shortcut;
          shortcutVolumeUp.classList.remove('not-set');
        } else {
          shortcutVolumeUp.textContent = 'Not set';
          shortcutVolumeUp.classList.add('not-set');
        }
      } else if (command.name === 'volume-down') {
        if (shortcut) {
          shortcutVolumeDown.textContent = shortcut;
          shortcutVolumeDown.classList.remove('not-set');
        } else {
          shortcutVolumeDown.textContent = 'Not set';
          shortcutVolumeDown.classList.add('not-set');
        }
      } else if (command.name === 'toggle-mute') {
        if (shortcut) {
          shortcutToggleMute.textContent = shortcut;
          shortcutToggleMute.classList.remove('not-set');
        } else {
          shortcutToggleMute.textContent = 'Not set';
          shortcutToggleMute.classList.add('not-set');
        }
      }
    });
  } catch (err) {
    console.debug('Could not load shortcuts:', err);
    shortcutVolumeUp.textContent = 'Error loading';
    shortcutVolumeDown.textContent = 'Error loading';
    shortcutToggleMute.textContent = 'Error loading';
  }
}

// Load shortcuts on page load
loadShortcuts();

// Chrome shortcuts settings
openShortcutsChrome.addEventListener('click', async (e) => {
  e.preventDefault();
  const url = 'chrome://extensions/shortcuts';

  try {
    await navigator.clipboard.writeText(url);
    shortcutsStatus.textContent = 'URL copied! Paste in address bar to configure shortcuts.';
    shortcutsStatus.className = 'status success';
    setTimeout(() => {
      shortcutsStatus.className = 'status';
    }, 4000);
  } catch (err) {
    shortcutsStatus.textContent = `Copy this URL: ${url}`;
    shortcutsStatus.className = 'status';
  }
});

// Firefox shortcuts settings
openShortcutsFirefox.addEventListener('click', async (e) => {
  e.preventDefault();
  const url = 'about:addons';

  try {
    await navigator.clipboard.writeText(url);
    shortcutsStatus.textContent = 'URL copied! Paste in address bar, then click the gear icon and select "Manage Extension Shortcuts".';
    shortcutsStatus.className = 'status success';
    setTimeout(() => {
      shortcutsStatus.className = 'status';
    }, 6000);
  } catch (err) {
    shortcutsStatus.textContent = 'Go to about:addons → gear icon → Manage Extension Shortcuts';
    shortcutsStatus.className = 'status';
  }
});
