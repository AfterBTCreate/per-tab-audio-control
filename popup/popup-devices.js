// Per-Tab Audio Control - Devices Module
// Audio device enumeration and output switching

// ==================== Storage Format Migration ====================
// The device storage format changed in v3.0:
//   Old format (pre-v3): tab_123_device = "device-id-string"
//   New format (v3+):    tab_123_device = { deviceId: "...", deviceLabel: "..." }
// Code supports both formats for backward compatibility with existing user data.
// The parseSavedDevice() and findMatchingDevice() helpers handle this transparently.

// ==================== Device Matching Utilities ====================

// Parse saved device from storage (handles both old string and new object formats)
function parseSavedDevice(savedDevice) {
  if (typeof savedDevice === 'string') {
    return { deviceId: savedDevice, deviceLabel: '' };
  }
  return {
    deviceId: savedDevice.deviceId || '',
    deviceLabel: savedDevice.deviceLabel || ''
  };
}

// Find a matching device by ID first, then by label (case-insensitive)
function findMatchingDevice(audioOutputs, savedDevice) {
  const { deviceId, deviceLabel } = parseSavedDevice(savedDevice);

  // Try to find by exact ID match first
  let matched = audioOutputs.find(d => d.deviceId === deviceId);

  // Fall back to label matching (handles device ID changes across sessions)
  if (!matched && deviceLabel) {
    const normalizedLabel = deviceLabel.toLowerCase().trim();
    matched = audioOutputs.find(d =>
      d.label && d.label.toLowerCase().trim() === normalizedLabel
    );
  }

  return matched;
}

// ==================== Device Enumeration ====================

// Enumerate devices directly in popup (fallback for Firefox)
async function enumerateDevicesDirectly(requestPermission = false) {
  try {
    if (!navigator.mediaDevices) {
      return { success: false, error: 'mediaDevices not available' };
    }

    // Request permission if needed (this can show the prompt from popup context)
    if (requestPermission) {
      try {
        console.log('[TabVolume Popup] Requesting microphone permission...');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        console.log('[TabVolume Popup] Permission granted');
      } catch (e) {
        console.log('[TabVolume Popup] Permission request failed:', e.name, e.message);
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

    // Check if we have real labels (not placeholders)
    const hasRealLabels = audioOutputs.some(d => d.label && !d.label.includes('Audio Device'));

    console.log('[TabVolume Popup] Direct enumeration found:', audioOutputs, 'hasRealLabels:', hasRealLabels);
    return { success: true, devices: audioOutputs, hasRealLabels };
  } catch (e) {
    console.error('[TabVolume Popup] Direct enumeration error:', e);
    return { success: false, error: e.message };
  }
}

// Check if devices have real labels (not placeholders)
function hasRealDeviceLabels(devices) {
  return devices && devices.some(d => d.label && !d.label.includes('Audio Device'));
}

// ==================== Load Audio Devices ====================

// Audio device handling - uses offscreen document via background script (Chrome)
// or direct enumeration in popup (Firefox)
async function loadAudioDevices(requestPermission = false) {
  if (!currentTabId) return;

  console.log('[TabVolume Popup] loadAudioDevices called, requestPermission:', requestPermission);

  try {
    if (requestPermission) {
      refreshDevicesBtn.classList.add('spinning');
    }

    let response;

    // Firefox: always use direct enumeration (background can't enumerate reliably)
    if (isFirefox) {
      console.log('[TabVolume Popup] Firefox: using direct enumeration...');
      response = await enumerateDevicesDirectly(requestPermission);
    } else {
      // Chrome: use background script (offscreen document)
      console.log('[TabVolume Popup] Requesting devices via background...');
      try {
        response = await browserAPI.runtime.sendMessage({
          type: 'REQUEST_AUDIO_DEVICES',
          requestPermission: requestPermission
        });
      } catch (e) {
        console.error('[TabVolume Popup] sendMessage error:', e);
        response = await enumerateDevicesDirectly(requestPermission);
      }
    }

    console.log('[TabVolume Popup] Response:', response);

    if (requestPermission) {
      refreshDevicesBtn.classList.remove('spinning');
    }

    // If failed, try direct enumeration as fallback (Chrome only, Firefox already used it)
    if (!isFirefox && (!response || !response.success)) {
      console.log('[TabVolume Popup] Background response failed, trying direct...');
      response = await enumerateDevicesDirectly(requestPermission);
      console.log('[TabVolume Popup] Direct response:', response);
    }

    if (!response || !response.success) {
      console.error('[TabVolume Popup] Failed to get devices:', response?.error);
      return;
    }

    const audioOutputs = response.devices || [];
    console.log('[TabVolume Popup] Audio outputs:', audioOutputs);

    // Check if there's a saved device for this tab
    const deviceKey = getTabStorageKey(currentTabId, TAB_STORAGE.DEVICE);
    const result = await browserAPI.storage.local.get([deviceKey]);
    let hasSavedDevice = !!result[deviceKey];

    // If no tab-specific device, check for global default
    let globalDefault = null;
    if (!hasSavedDevice) {
      const settings = await browserAPI.storage.sync.get(['useLastDeviceAsDefault', 'globalDefaultDevice']);
      if (settings.useLastDeviceAsDefault && settings.globalDefaultDevice) {
        globalDefault = settings.globalDefaultDevice;
        console.log('[TabVolume Popup] Using global default device:', globalDefault.deviceLabel);
      }
    }

    // Clear existing options using safe DOM method
    while (deviceSelect.firstChild) {
      deviceSelect.removeChild(deviceSelect.firstChild);
    }

    // Always include "Default (System Audio)" option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Default (System Audio)';
    deviceSelect.appendChild(defaultOption);

    // Add all enumerated devices
    audioOutputs.forEach(device => {
      console.log('[TabVolume Popup] Adding device:', device.deviceId, device.label);
      // Skip the "default" pseudo-device
      if (device.deviceId === 'default') return;

      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Audio Device ${device.deviceId.slice(0, 8)}...`;
      deviceSelect.appendChild(option);
    });

    // Load and select saved device
    if (result[deviceKey]) {
      const savedDevice = result[deviceKey];
      const { deviceId: savedDeviceId, deviceLabel: savedDeviceLabel } = parseSavedDevice(savedDevice);
      const matchedDevice = findMatchingDevice(audioOutputs, savedDevice);

      console.log('[TabVolume Popup] Saved device:', savedDeviceId, savedDeviceLabel);
      console.log('[TabVolume Popup] Matched device:', matchedDevice);

      if (matchedDevice) {
        deviceSelect.value = matchedDevice.deviceId;
        // Update storage if we matched by label (ID might have changed)
        if (matchedDevice.deviceId !== savedDeviceId) {
          await browserAPI.storage.local.set({
            [deviceKey]: { deviceId: matchedDevice.deviceId, deviceLabel: matchedDevice.label }
          });
        }
      } else {
        // Device no longer exists - clear stale entry and select Default
        console.log('[TabVolume Popup] Saved device no longer available, clearing');
        console.log('[TabVolume Popup] Available devices:', audioOutputs.map(d => d.label));
        await browserAPI.storage.local.remove([deviceKey]);
        deviceSelect.value = '';

        // Notify content script to reset to default
        try {
          await browserAPI.tabs.sendMessage(currentTabId, {
            type: 'SET_DEVICE',
            deviceId: '',
            deviceLabel: ''
          });
        } catch (e) {
          // Content script might not be ready
        }
      }
    } else if (globalDefault) {
      // No tab-specific device, but we have a global default - apply it
      const globalDeviceLabel = globalDefault.deviceLabel;
      const normalizedGlobalLabel = globalDeviceLabel.toLowerCase().trim();

      // Find the device by label
      const matchedDevice = audioOutputs.find(d =>
        d.label && d.label.toLowerCase().trim() === normalizedGlobalLabel
      );

      if (matchedDevice) {
        console.log('[TabVolume Popup] Applying global default device:', matchedDevice.label);
        deviceSelect.value = matchedDevice.deviceId;

        // Save as tab-specific device
        await browserAPI.storage.local.set({
          [deviceKey]: { deviceId: matchedDevice.deviceId, deviceLabel: matchedDevice.label }
        });

        // Notify content script to apply this device
        try {
          await browserAPI.tabs.sendMessage(currentTabId, {
            type: 'SET_DEVICE',
            deviceId: matchedDevice.deviceId,
            deviceLabel: matchedDevice.label
          });
        } catch (e) {
          // Content script might not be ready
        }
      } else {
        console.log('[TabVolume Popup] Global default device not found in available devices');
        // Select the default option
        deviceSelect.value = '';
      }
    }
  } catch (e) {
    console.error('[TabVolume Popup] Error getting audio devices:', e);
    if (requestPermission) {
      refreshDevicesBtn.classList.remove('spinning');
      showError('Cannot load devices. Check permissions.');
    }
  }
}

// ==================== Device Selection ====================

// Populate device dropdown with given devices (simplified version for refresh button)
// Note: Similar DOM manipulation exists in loadAudioDevices but with additional logic
// for global defaults, storage updates on device ID changes, and content script notifications.
// Keeping separate for clarity and to avoid breaking the more complex initialization flow.
async function populateDeviceDropdown(audioOutputs) {
  const deviceKey = getTabStorageKey(currentTabId, TAB_STORAGE.DEVICE);
  const result = await browserAPI.storage.local.get([deviceKey]);

  // Clear existing options using safe DOM method
  while (deviceSelect.firstChild) {
    deviceSelect.removeChild(deviceSelect.firstChild);
  }

  // Always include "Default (System Audio)" option
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Default (System Audio)';
  deviceSelect.appendChild(defaultOption);

  // Add all enumerated devices
  audioOutputs.forEach(device => {
    // Skip the "default" pseudo-device
    if (device.deviceId === 'default') return;

    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = device.label || `Audio Device ${device.deviceId.slice(0, 8)}...`;
    deviceSelect.appendChild(option);
  });

  // Select saved device if exists
  if (result[deviceKey]) {
    const matchedDevice = findMatchingDevice(audioOutputs, result[deviceKey]);
    if (matchedDevice) {
      deviceSelect.value = matchedDevice.deviceId;
    }
  }

  console.log('[TabVolume Popup] Populated dropdown with', audioOutputs.length, 'devices');
}

// Set output device for current tab
async function setOutputDevice(deviceId) {
  if (!currentTabId) return;

  const deviceKey = getTabStorageKey(currentTabId, TAB_STORAGE.DEVICE);

  // Find the device label for cross-context matching
  // Use iteration instead of querySelector to handle special characters in deviceId
  let deviceLabel = '';
  for (const option of deviceSelect.options) {
    if (option.value === deviceId) {
      deviceLabel = option.textContent;
      break;
    }
  }

  if (deviceId) {
    await browserAPI.storage.local.set({
      [deviceKey]: { deviceId, deviceLabel }
    });
  } else {
    await browserAPI.storage.local.remove([deviceKey]);
  }

  console.log('[TabVolume Popup] Sending SET_DEVICE to tab', currentTabId, 'deviceId:', deviceId, 'label:', deviceLabel);

  // If Tab Capture is active, send to offscreen document for audio context routing
  const isTabCapture = typeof window.isTabCaptureActive === 'function' && window.isTabCaptureActive();
  console.log('[TabVolume Popup] isTabCaptureActive:', isTabCapture);
  if (isTabCapture) {
    try {
      const response = await browserAPI.runtime.sendMessage({
        type: 'SET_TAB_CAPTURE_DEVICE',
        tabId: currentTabId,
        deviceId: deviceId,
        deviceLabel: deviceLabel
      });
      console.log('[TabVolume Popup] SET_TAB_CAPTURE_DEVICE response:', response);
      if (response && response.success) {
        return; // Success - no need to also send to content script
      }
    } catch (e) {
      console.error('[TabVolume Popup] SET_TAB_CAPTURE_DEVICE failed:', e.message);
      // Fall through to try content script as backup
    }
  }

  // Send to content script (for normal mode or as fallback)
  try {
    const response = await browserAPI.tabs.sendMessage(currentTabId, {
      type: 'SET_DEVICE',
      deviceId: deviceId,
      deviceLabel: deviceLabel
    });
    console.log('[TabVolume Popup] SET_DEVICE response:', response);
  } catch (e) {
    console.error('[TabVolume Popup] SET_DEVICE failed:', e.message);
    showError('Device change failed. Refresh page.');
  }
}

// ==================== Event Handlers ====================

// Device select handler
deviceSelect.addEventListener('change', (e) => {
  setOutputDevice(e.target.value);
});

// Refresh devices button handler
refreshDevicesBtn.addEventListener('click', async () => {
  refreshDevicesBtn.classList.add('spinning');

  let response;
  let permissionGranted = false;

  // Firefox: enumerate directly in popup (background can't show permission prompts)
  if (isFirefox) {
    console.log('[TabVolume Popup] Firefox: using direct enumeration with permission request...');
    response = await enumerateDevicesDirectly(true);
    // For Firefox, check if we got real labels (indicates permission was granted)
    permissionGranted = response && response.success && response.hasRealLabels;
  } else {
    // Chrome/Chromium: use background script (offscreen document)
    try {
      response = await browserAPI.runtime.sendMessage({
        type: 'REQUEST_AUDIO_DEVICES',
        requestPermission: true
      });
      console.log('[TabVolume Popup] Background response:', response);
      // Use the permissionGranted flag from background script
      permissionGranted = response && response.permissionGranted;
    } catch (e) {
      console.log('[TabVolume Popup] Background request failed:', e.message);
      response = null;
    }
  }

  refreshDevicesBtn.classList.remove('spinning');

  if (permissionGranted && response.devices && response.devices.length > 0) {
    // Permission granted and we have devices - populate dropdown
    await populateDeviceDropdown(response.devices);
  } else {
    // Permission not granted or no devices - open permissions page
    console.log('[TabVolume Popup] Permission not granted, opening permissions page');
    browserAPI.tabs.create({
      url: browserAPI.runtime.getURL('permissions/permissions.html')
    });
  }
});

// Load audio mode setting - always boost mode (0-500% volume)
async function loadAudioModeSettings() {
  audioMode = 'boost';
}
