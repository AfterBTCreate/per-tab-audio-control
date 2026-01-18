// Per-Tab Audio Control - Tabs Module
// Tab navigation, focus mode, reset tab, site rules, disable domain, storage quota, init

// ==================== Mute Other Tabs ====================

const muteOthersBtn = document.getElementById('muteOthersBtn');

// Update button appearance based on mute state
function updateMuteButtonState(canRestore) {
  if (!muteOthersBtn) return;

  const unmutedIcon = muteOthersBtn.querySelector('.mute-icon-unmuted');
  const mutedIcon = muteOthersBtn.querySelector('.mute-icon-muted');

  if (canRestore) {
    // Active state (others are muted) - show slashed speaker
    muteOthersBtn.classList.add('mute-active');
    muteOthersBtn.title = 'Unmute other tabs';
    muteOthersBtn.setAttribute('aria-label', 'Unmute other tabs');
    if (unmutedIcon) unmutedIcon.style.display = 'none';
    if (mutedIcon) mutedIcon.style.display = 'block';
  } else {
    // Default state (can mute others) - show normal speaker
    muteOthersBtn.classList.remove('mute-active');
    muteOthersBtn.title = 'Mute other tabs';
    muteOthersBtn.setAttribute('aria-label', 'Mute other tabs');
    if (unmutedIcon) unmutedIcon.style.display = 'block';
    if (mutedIcon) mutedIcon.style.display = 'none';
  }
}

// Toggle mute state for other tabs
async function toggleMuteOtherTabs() {
  try {
    // Get current state
    const state = await browserAPI.runtime.sendMessage({
      type: 'GET_MUTE_OTHERS_STATE'
    });

    if (state && state.canRestore) {
      // Currently muted - unmute
      const result = await browserAPI.runtime.sendMessage({
        type: 'UNMUTE_MUTED_TABS'
      });
      if (result && result.success) {
        updateMuteButtonState(false);
        showStatus(`Unmuted ${result.unmutedCount} tab${result.unmutedCount !== 1 ? 's' : ''}`, 'success', 2000);
      }
    } else {
      // Currently unmuted - mute others
      const result = await browserAPI.runtime.sendMessage({
        type: 'MUTE_OTHER_TABS',
        currentTabId: currentTabId
      });
      if (result && result.success) {
        updateMuteButtonState(true);
        showStatus(`Muted ${result.mutedCount} tab${result.mutedCount !== 1 ? 's' : ''}`, 'success', 2000);
      }
    }
  } catch (e) {
    console.debug('Could not toggle mute:', e);
  }
}

// Initialize mute button state on popup open
async function initMuteButtonState() {
  try {
    const state = await browserAPI.runtime.sendMessage({
      type: 'GET_MUTE_OTHERS_STATE'
    });
    if (state) {
      updateMuteButtonState(state.canRestore);
    }
  } catch (e) {
    console.debug('Could not get mute state:', e);
  }
}

// Mute button click handler
if (muteOthersBtn) {
  muteOthersBtn.addEventListener('click', toggleMuteOtherTabs);
}

// Initialize on load
initMuteButtonState();

// ==================== Reset Tab to Defaults ====================

const resetTabBtn = document.getElementById('resetTabBtn');

// Reset all settings for current tab to defaults
async function resetTabToDefaults() {
  if (!currentTabId) return;

  try {
    // Reset volume to 100% using the proper function
    // This handles: state update, UI update, badge update, message to content script
    await setVolume(100);

    // In native mode, only volume is available - skip other resets
    if (!isDomainDisabled) {
      // Reset balance to center using the proper function
      // This handles: state update, UI update, storage, message to content script
      await applyBalance(0);

      // Reset channel mode to stereo using the proper function
      // This handles: state update, UI update, storage, message to content script
      await applyChannelMode('stereo');

      // Turn off compressor using the proper function
      // This handles: state update, UI update, storage, message to content script
      await applyCompressor('off');

      // Turn off all EQ effects using the proper functions
      // These handle: state update, UI update, storage, message to content script
      await applyEffect('bass', 'off');
      await applyEffect('treble', 'off');
      await applyEffect('voice', 'off');

      // Update EQ sliders UI (in case slider mode is active)
      updateEqSlidersUI();

      // Reset device to default using the proper function
      // This handles: storage removal, message to content script
      await setOutputDevice('');
      // Update device select UI to show default
      if (deviceSelect) {
        deviceSelect.value = '';
      }
    }

    // Show success feedback
    showStatus('Reset to defaults', 'success', 2000);

  } catch (e) {
    console.error('[TabVolume Popup] Error resetting tab:', e);
    showError('Could not reset tab settings');
  }
}

// Reset button click handler
if (resetTabBtn) {
  resetTabBtn.addEventListener('click', resetTabToDefaults);
}

// ==================== Tab Navigation ====================

// Fetch audible tabs from background
async function getAudibleTabs() {
  try {
    const response = await browserAPI.runtime.sendMessage({ type: 'GET_AUDIBLE_TABS' });
    return response.tabs || [];
  } catch (e) {
    console.debug('Could not fetch audible tabs:', e);
    return [];
  }
}

// Update navigation button states and tab counter
function updateTabNavigation() {
  const hasMultiple = audibleTabs.length > 1;
  prevTabBtn.disabled = !hasMultiple;
  nextTabBtn.disabled = !hasMultiple;

  // Update tab counter
  if (hasMultiple) {
    tabCounter.textContent = `${currentTabIndex + 1} of ${audibleTabs.length}`;
    tabCounter.classList.add('visible');
  } else {
    tabCounter.classList.remove('visible');
  }
}

// Navigate to previous audible tab
function prevTab() {
  if (audibleTabs.length <= 1) return;
  const newIndex = (currentTabIndex - 1 + audibleTabs.length) % audibleTabs.length;
  switchToTab(newIndex);
}

// Navigate to next audible tab
function nextTab() {
  if (audibleTabs.length <= 1) return;
  const newIndex = (currentTabIndex + 1) % audibleTabs.length;
  switchToTab(newIndex);
}

// Load all settings for the current tab
async function loadTabSettings() {
  // Get current volume
  const response = await browserAPI.runtime.sendMessage({
    type: 'GET_VOLUME',
    tabId: currentTabId
  });

  currentVolume = response.volume !== undefined ? response.volume : 100;

  // Load previous volume from storage for unmute functionality
  const prevKey = `tab_${currentTabId}_prev`;
  const prevResult = await browserAPI.storage.local.get([prevKey]);
  if (prevResult[prevKey] !== undefined) {
    previousVolume = prevResult[prevKey];
  } else {
    previousVolume = 100;
  }

  updateUI(currentVolume);

  // Load effect settings for this tab
  await loadEffectSettings();

  // Load balance setting for this tab
  await loadBalanceSetting();

  // Load channel mode setting for this tab
  await loadChannelModeSetting();

  // Load audio devices after we have the tab ID
  await loadAudioDevices(isFirefox);
}

// Switch to a different tab in the audible tabs list
async function switchToTab(tabIndex) {
  if (audibleTabs.length === 0) return;

  currentTabIndex = tabIndex;
  const tab = audibleTabs[currentTabIndex];
  currentTabId = tab.id;
  currentTabUrl = tab.url || '';

  // Immediately clear UI state from previous tab
  clearStatus();
  document.body.classList.remove('audio-blocked');

  // Update tab counter display
  updateTabNavigation();

  // Update tab info display
  tabTitle.textContent = tab.title || 'Unknown Tab';
  try {
    tabUrl.textContent = new URL(tab.url).hostname || tab.url;
  } catch (e) {
    tabUrl.textContent = tab.url || 'Unknown URL';
  }

  // Check if this tab's domain is disabled BEFORE resetting visualizer
  // (resetVisualizerState needs this value to show correct UI)
  isDomainDisabled = await checkDomainDisabled();
  await syncLocalStorageFlag(isDomainDisabled);
  updateDisableButtonUI();
  updateDisabledDomainUI();

  // Reset visualizer state for new tab (cleans up port and tabCapture)
  visualizerType = 'bars'; // Reset to default before loading user preference
  if (typeof resetVisualizerState === 'function') {
    resetVisualizerState();
  }

  // Load settings for this tab
  await loadTabSettings();

  // Load visualizer type (global setting)
  await loadVisualizerType();

  // NOTE: autoStartTabCaptureIfNeeded removed - resetVisualizerState() now properly
  // handles Tab Capture auto-start via GET_EFFECTIVE_MODE
}

// Toggle play/pause on current tab's media
async function togglePlayPause() {
  if (!currentTabId) return;

  // If Tab Capture mode is default and not active, start it now (we have user gesture)
  // Do this FIRST to stay within user gesture context
  if (typeof window.isTabCaptureActive === 'function' && !window.isTabCaptureActive()) {
    const currentHostname = currentTabUrl ? new URL(currentTabUrl).hostname : null;
    if (currentHostname) {
      try {
        const response = await browserAPI.runtime.sendMessage({
          type: 'GET_EFFECTIVE_MODE',
          hostname: currentHostname
        });
        if (response && response.success && response.mode === 'tabcapture') {
          console.log('[Tabs] Starting Tab Capture on play/pause click');
          if (typeof window.startTabCaptureMode === 'function') {
            const started = await window.startTabCaptureMode();
            if (started) {
              console.log('[Tabs] Tab Capture started successfully');
              if (typeof window.updateAudioModeToggleUI === 'function') {
                window.updateAudioModeToggleUI();
              }
            } else {
              console.log('[Tabs] Tab Capture failed to start');
            }
          }
        }
      } catch (e) {
        console.debug('Could not check/start Tab Capture:', e.message);
      }
    }
  }

  // Now toggle play/pause - audio will flow through Tab Capture if it started
  try {
    await browserAPI.tabs.sendMessage(currentTabId, { type: 'TOGGLE_PLAY_PAUSE' });
  } catch (e) {
    console.debug('Could not toggle play/pause:', e.message);
  }
}

// Go to the current tab (switch browser focus to it)
async function goToCurrentTab() {
  if (!currentTabId) return;

  try {
    await browserAPI.tabs.update(currentTabId, { active: true });
    // Also focus the window containing this tab
    const tab = await browserAPI.tabs.get(currentTabId);
    if (tab.windowId) {
      await browserAPI.windows.update(tab.windowId, { focused: true });
    }
  } catch (e) {
    console.debug('Could not switch to tab:', e.message);
  }
}

// Media toggle button handler
const mediaToggleBtn = document.getElementById('mediaToggleBtn');
if (mediaToggleBtn) {
  mediaToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent triggering visualizer click
    togglePlayPause();
  });
}

// Tab navigation button handlers
prevTabBtn.addEventListener('click', prevTab);
nextTabBtn.addEventListener('click', nextTab);

// Keyboard navigation for tabs (Left/Right arrow) and play/pause (Space)
document.addEventListener('keydown', (e) => {
  // Don't trigger if focus is on an input element
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    prevTab();
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    nextTab();
  } else if (e.key === ' ') {
    e.preventDefault();
    togglePlayPause();
  }
});

// ==================== Dynamic Keyboard Shortcuts Display ====================

async function updateShortcutHints() {
  try {
    const commands = await browserAPI.commands.getAll();
    const shortcutsMute = document.getElementById('shortcutsMute');
    const shortcutsVolUp = document.getElementById('shortcutsVolUp');
    const shortcutsVolDown = document.getElementById('shortcutsVolDown');
    if (!shortcutsMute || !shortcutsVolUp || !shortcutsVolDown) return;

    let volumeUpKey = '';
    let volumeDownKey = '';
    let muteKey = '';

    commands.forEach(command => {
      if (command.name === 'volume-up' && command.shortcut) {
        volumeUpKey = command.shortcut;
      } else if (command.name === 'volume-down' && command.shortcut) {
        volumeDownKey = command.shortcut;
      } else if (command.name === 'toggle-mute' && command.shortcut) {
        muteKey = command.shortcut;
      }
    });

    // Format shortcut for display (replace Up/Down with arrows)
    const formatKey = (key) => {
      if (!key) return 'Not set';
      return key
        .replace(/Up Arrow/gi, '↑')
        .replace(/Down Arrow/gi, '↓')
        .replace(/\+Up$/i, '+↑')
        .replace(/\+Down$/i, '+↓');
    };

    // Set the key portion of each shortcut
    shortcutsVolUp.textContent = formatKey(volumeUpKey);
    shortcutsVolDown.textContent = formatKey(volumeDownKey);
    shortcutsMute.textContent = formatKey(muteKey);
  } catch (err) {
    console.debug('Could not fetch keyboard shortcuts:', err);
  }
}

// Update shortcuts on load
updateShortcutHints();

// Shortcuts popover toggle
const shortcutsBtn = document.getElementById('shortcutsBtn');
const shortcutsPopover = document.getElementById('shortcutsPopover');

if (shortcutsBtn && shortcutsPopover) {
  shortcutsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    shortcutsPopover.classList.toggle('visible');
  });

  // Close popover when clicking outside
  document.addEventListener('click', (e) => {
    if (!shortcutsPopover.contains(e.target) && e.target !== shortcutsBtn) {
      shortcutsPopover.classList.remove('visible');
    }
  });
}

// ==================== Disable Domain Feature ====================

// Check if current domain should use Off (bypass) mode
// Uses background script's getEffectiveModeForDomain which considers both:
// - The default audio mode setting (tabcapture/webaudio/native)
// - Site-specific overrides (disabledDomains, etc.)
async function checkDomainDisabled() {
  if (!currentTabUrl) return false;

  const domain = extractDomain(currentTabUrl);
  if (!domain) return false;

  try {
    // Ask background script for the effective mode (considers default + overrides)
    const response = await browserAPI.runtime.sendMessage({
      type: 'GET_EFFECTIVE_MODE',
      hostname: domain
    });

    if (response && response.success && response.mode) {
      return response.mode === 'off';
    }

    // Fallback: check disabledDomains directly if message failed
    const result = await browserAPI.storage.sync.get(['disabledDomains']);
    const disabledDomains = result.disabledDomains || [];
    return disabledDomains.includes(domain);
  } catch (e) {
    console.error('[TabVolume Popup] Error checking disabled domains:', e);
    return false;
  }
}

// Sync localStorage flag with disabledDomains storage (clears orphaned flags)
// This fixes state mismatches where localStorage flag exists but domain isn't in sync storage
// Returns true if a mismatch was found and fixed (page will be reloaded)
async function syncLocalStorageFlag(shouldBeDisabled) {
  if (!currentTabId || !currentTabUrl) return false;

  const domain = extractDomain(currentTabUrl);
  if (!domain) return false;

  try {
    // Use scripting.executeScript to check and potentially clear the localStorage flag
    const results = await browserAPI.scripting.executeScript({
      target: { tabId: currentTabId },
      world: 'MAIN',
      func: (d, shouldBeDisabled) => {
        const key = '__tabVolumeControl_disabled_' + d;
        const flagExists = localStorage.getItem(key) === 'true';

        if (!shouldBeDisabled && flagExists) {
          // Orphaned flag: domain not in disabledDomains but localStorage flag is set
          localStorage.removeItem(key);
          console.log('[TabVolume Popup] Cleared orphaned localStorage flag for', d);
          return { cleared: true, domain: d };
        } else if (shouldBeDisabled && !flagExists) {
          // Missing flag: domain is in disabledDomains but localStorage flag not set
          localStorage.setItem(key, 'true');
          console.log('[TabVolume Popup] Set missing localStorage flag for', d);
          return { set: true, domain: d };
        }
        return { synced: true };
      },
      args: [domain, shouldBeDisabled]
    });

    if (results && results[0] && results[0].result) {
      const result = results[0].result;
      if (result.cleared) {
        console.log('[TabVolume Popup] Cleared orphaned localStorage flag for', result.domain, '- reloading page');
        // Reload page so the fix takes effect (page-script runs at load time)
        browserAPI.tabs.reload(currentTabId);
        window.close();
        return true;
      } else if (result.set) {
        console.log('[TabVolume Popup] Set missing localStorage flag for', result.domain, '- reloading page');
        // Reload page so native mode takes effect
        browserAPI.tabs.reload(currentTabId);
        window.close();
        return true;
      }
    }
    return false;
  } catch (e) {
    // Scripting may fail on restricted pages - that's OK
    console.debug('[TabVolume Popup] Could not sync localStorage flag:', e.message);
    return false;
  }
}

// ==================== Audio Mode UI Updates ====================
// Two separate controls:
// 1. Audio Mode Toggle (Tab Capture / Web Audio) - switches between active processing modes
// 2. Off Button - enables/disables audio processing entirely

// Update the Audio Mode Toggle button UI (Tab Capture / Web Audio)
async function updateAudioModeToggleUI() {
  if (!audioModeToggle) return;

  const isFirefox = typeof browser !== 'undefined';

  // Remove all state classes first
  audioModeToggle.classList.remove('tabcapture-active', 'webaudio-active', 'disabled');

  // Disable toggle when Off mode is active (applies to both browsers)
  if (isDomainDisabled) {
    audioModeToggle.classList.add('disabled');
    audioModeToggle.title = 'Disabled (Bypass active)';
    return;
  }

  // Firefox: Tab Capture not available - always show Web Audio active
  if (isFirefox) {
    audioModeToggle.classList.add('webaudio-active');
    audioModeToggle.title = 'Web Audio mode (Tab Capture is Chrome-only)';
    return;
  }

  // Chrome: Get effective mode from background (considers default + overrides)
  const hostname = extractDomain(currentTabUrl);
  if (hostname) {
    try {
      const response = await browserAPI.runtime.sendMessage({
        type: 'GET_EFFECTIVE_MODE',
        hostname: hostname
      });

      if (response && response.success && response.mode === 'tabcapture') {
        // Tab Capture is the effective mode - blue with capture icon
        audioModeToggle.classList.add('tabcapture-active');
        audioModeToggle.title = 'Tab Capture mode (click to switch to Web Audio)';
        return;
      }
    } catch (e) {
      console.debug('[TabVolume Popup] Could not get effective mode:', e);
    }
  }

  // Default: Web Audio active - gray with waveform icon
  audioModeToggle.classList.add('webaudio-active');
  audioModeToggle.title = 'Web Audio mode (click to switch to Tab Capture)';
}

// Update the Off (Bypass) button UI
async function updateDisableButtonUI() {
  if (!disableDomainBtn) return;

  // Remove all state classes
  disableDomainBtn.classList.remove('tab-capture', 'native-mode', 'off-active');

  if (isDomainDisabled) {
    // Off mode active - orange
    disableDomainBtn.classList.add('off-active');
    disableDomainBtn.setAttribute('aria-pressed', 'true');
    disableDomainBtn.title = 'Bypass active (click to return to previous mode)';
  } else {
    // Normal mode - not pressed
    disableDomainBtn.setAttribute('aria-pressed', 'false');
    disableDomainBtn.title = 'Enable Bypass (skip audio processing)';
  }

  // Also update the audio mode toggle (it should be disabled when Off is active)
  updateAudioModeToggleUI();
}

// Expose globally for popup-visualizer.js to call after Tab Capture changes
window.updateDisableButtonUI = updateDisableButtonUI;
window.updateAudioModeToggleUI = updateAudioModeToggleUI;

// Expose mode override functions for popup-visualizer.js "Enable Tab Capture" button
window.addToModeOverrideList = async (domain, overrideMode) => {
  if (typeof addToOverrideList === 'function') {
    await addToOverrideList(domain, overrideMode);
  }
};
window.removeFromModeOverrideList = async (domain, overrideMode) => {
  if (typeof removeFromOverrideList === 'function') {
    await removeFromOverrideList(domain, overrideMode);
  }
};
window.saveDomainLastActiveMode = async (domain, mode) => {
  if (typeof saveLastActiveMode === 'function') {
    await saveLastActiveMode(domain, mode);
  }
};

// Gray out controls for restricted browser pages (chrome://, about:, etc.)
// Content scripts can't run on these pages, so audio control is not available
// Uses the existing audio-blocked CSS class for consistent grayed-out appearance
function updateRestrictedPageUI() {
  if (!isRestrictedPage) return;
  document.body.classList.add('audio-blocked');
}

// Hide/show controls based on disabled domain state
// When in native mode, show limited controls (0-100% only, no enhancements)
// Native mode = manual disable OR auto-detected fallback (future feature)
function updateDisabledDomainUI() {
  const volumeDisplay = document.querySelector('.volume-display');
  const nativeModeStatus = document.getElementById('nativeModeStatus');
  const sliderContainer = document.querySelector('.slider-container');
  const presets = document.querySelector('.presets');
  const sliderMarkers = document.querySelector('.slider-markers');

  // Elements to completely hide in native mode (require AudioContext)
  const elementsToHideInNativeMode = [
    document.querySelector('.balance-container'),
    document.querySelector('.enhancements-section'),
    document.querySelector('.device-selector'),
    document.querySelector('.add-rule-section')
  ];

  if (isDomainDisabled) {
    // NATIVE MODE: Show limited controls

    // Show volume display
    if (volumeDisplay) volumeDisplay.style.display = '';

    // Show slider container
    if (sliderContainer) sliderContainer.style.display = '';

    // Show presets container
    if (presets) presets.style.display = '';

    // Hide boost presets (200%+), show others
    const presetBtns = document.querySelectorAll('.preset-btn');
    presetBtns.forEach(btn => {
      const volume = parseInt(btn.dataset.volume);
      if (volume > 100) {
        btn.style.display = 'none';
      } else {
        btn.style.display = '';
      }
    });

    // Hide boost markers and reposition remaining markers for linear scale
    if (sliderMarkers) {
      const markers = sliderMarkers.querySelectorAll('.marker');
      markers.forEach(marker => {
        const value = parseInt(marker.dataset.value);
        if (value > 100) {
          // Hide boost markers
          marker.style.visibility = 'hidden';
        } else {
          // Reposition 0-100 markers for linear scale (value% = position%)
          marker.style.visibility = '';
          marker.style.left = `${value}%`;
          // Adjust transform for edge markers
          if (value === 0) {
            marker.style.transform = 'translateX(0)';
          } else if (value === 100) {
            marker.style.transform = 'translateX(-100%)';
          } else {
            marker.style.transform = 'translateX(-50%)';
          }
        }
      });
    }

    // Show native mode status message (full width below presets)
    if (nativeModeStatus) {
      const domain = extractDomain(currentTabUrl);
      nativeModeStatus.textContent = `Bypass mode on ${domain} (0-100% only). Click ⊘ to enable full controls.`;
      nativeModeStatus.style.display = 'block';
    }

    // Hide enhancement controls (they require AudioContext routing)
    elementsToHideInNativeMode.forEach(el => {
      if (el) el.style.display = 'none';
    });

    // Cap current volume at 100% if higher, and refresh slider (mapping changes in native mode)
    if (currentVolume > 100) {
      currentVolume = 100;
      setVolume(100);
    }
    // Always refresh UI to update slider position for linear mapping
    updateUI(currentVolume);

  } else {
    // FULL MODE: Show all controls

    // Show volume display
    if (volumeDisplay) volumeDisplay.style.display = '';

    // Show slider container
    if (sliderContainer) sliderContainer.style.display = '';

    // Show all presets
    if (presets) presets.style.display = '';
    const presetBtns = document.querySelectorAll('.preset-btn');
    presetBtns.forEach(btn => {
      btn.style.display = '';
    });

    // Show all markers and restore original positions for non-linear scale
    if (sliderMarkers) {
      const markers = sliderMarkers.querySelectorAll('.marker');
      // Original non-linear positions from CSS
      const originalPositions = {
        0: { left: '0', transform: 'translateX(0)' },
        25: { left: '12.5%', transform: 'translateX(-50%)' },
        50: { left: '25%', transform: 'translateX(-50%)' },
        75: { left: '37.5%', transform: 'translateX(-50%)' },
        100: { left: '50%', transform: 'translateX(-50%)' },
        150: { left: '62.5%', transform: 'translateX(-50%)' },
        200: { left: '75%', transform: 'translateX(-50%)' },
        250: { left: '87.5%', transform: 'translateX(-50%)' },
        300: { left: '100%', transform: 'translateX(-100%)' }
      };
      markers.forEach(marker => {
        const value = parseInt(marker.dataset.value);
        marker.style.visibility = '';
        // Restore original CSS positions
        if (originalPositions[value]) {
          marker.style.left = originalPositions[value].left;
          marker.style.transform = originalPositions[value].transform;
        }
      });
    }

    // Hide native mode status
    if (nativeModeStatus) {
      nativeModeStatus.style.display = 'none';
    }

    // Show all enhancement controls
    elementsToHideInNativeMode.forEach(el => {
      if (el) el.style.display = '';
    });

    // Refresh UI to update slider position for non-linear mapping
    updateUI(currentVolume);
  }

  // Update visualizer tooltip - handled by updateVisualizerTooltip() which checks all conditions
  updateVisualizerTooltip();
}

// ==================== Per-Default Mode Override System ====================
// Each default mode has its own override lists (except Off which is shared)
//
// Storage keys:
//   disabledDomains: []                    - Shared Off list
//   tabCaptureDefault_webAudioSites: []    - Web Audio overrides when Tab Capture is default

//   webAudioDefault_tabCaptureSites: []    - Tab Capture overrides when Web Audio is default
//   offDefault_tabCaptureSites: []         - Tab Capture overrides when Off is default
//   offDefault_webAudioSites: []           - Web Audio overrides when Off is default

// Get the default audio mode from settings
async function getDefaultAudioMode() {
  try {
    const result = await browserAPI.storage.sync.get(['defaultAudioMode']);
    return result.defaultAudioMode || 'tabcapture';
  } catch (e) {
    return 'tabcapture';
  }
}

// Get the storage key for an override mode based on current default mode
function getOverrideStorageKey(defaultMode, overrideMode) {
  if (overrideMode === 'off') {
    return 'disabledDomains'; // Shared across Tab Capture and Web Audio defaults
  }

  if (defaultMode === 'tabcapture') {
    if (overrideMode === 'webaudio') return 'tabCaptureDefault_webAudioSites';
  } else if (defaultMode === 'auto') {
    if (overrideMode === 'tabcapture') return 'webAudioDefault_tabCaptureSites';
  } else if (defaultMode === 'native') {
    if (overrideMode === 'tabcapture') return 'offDefault_tabCaptureSites';
    if (overrideMode === 'webaudio') return 'offDefault_webAudioSites';
  }

  return null;
}

// Check if domain has an override for a specific mode
async function isDomainInOverrideList(domain, overrideMode) {
  try {
    const defaultMode = await getDefaultAudioMode();
    const storageKey = getOverrideStorageKey(defaultMode, overrideMode);
    if (!storageKey) return false;

    const result = await browserAPI.storage.sync.get([storageKey]);
    const domains = result[storageKey] || [];
    return domains.includes(domain);
  } catch (e) {
    return false;
  }
}

// Legacy wrapper - check if domain is in Web Audio override list
async function isDomainInAutoMode(domain) {
  return isDomainInOverrideList(domain, 'webaudio');
}

// Add domain to an override list for the current default mode
async function addToOverrideList(domain, overrideMode) {
  try {
    const defaultMode = await getDefaultAudioMode();
    const storageKey = getOverrideStorageKey(defaultMode, overrideMode);
    if (!storageKey) return;

    const result = await browserAPI.storage.sync.get([storageKey]);
    let domains = result[storageKey] || [];
    if (!domains.includes(domain)) {
      domains.push(domain);
      // Use safe storage with quota checking (suppress warnings for background operations)
      await safeStorageSet({ [storageKey]: domains }, false);
    }
  } catch (e) {
    console.error('[TabVolume Popup] Failed to add domain to override list:', e);
  }
}

// Remove domain from an override list for the current default mode
async function removeFromOverrideList(domain, overrideMode) {
  try {
    const defaultMode = await getDefaultAudioMode();
    const storageKey = getOverrideStorageKey(defaultMode, overrideMode);
    if (!storageKey) return;

    const result = await browserAPI.storage.sync.get([storageKey]);
    let domains = result[storageKey] || [];
    domains = domains.filter(d => d !== domain);
    await browserAPI.storage.sync.set({ [storageKey]: domains });
  } catch (e) {
    console.error('[TabVolume Popup] Failed to remove domain from override list:', e);
  }
}

// Legacy wrappers for compatibility
async function addDomainToAutoMode(domain) {
  await addToOverrideList(domain, 'webaudio');
}

async function removeDomainFromAutoMode(domain) {
  await removeFromOverrideList(domain, 'webaudio');
}

// ==================== Audio Mode Handlers ====================
// Two separate controls:
// 1. audioModeToggle - Toggle between Tab Capture and Web Audio
// 2. disableDomainBtn - Toggle Off mode on/off

// Storage key for remembering last active mode (Tab Capture or Web Audio) per domain
const LAST_ACTIVE_MODE_KEY = 'lastActiveMode';

// Get last active mode for a domain (defaults to 'tabcapture')
async function getLastActiveMode(domain) {
  try {
    const result = await browserAPI.storage.local.get([LAST_ACTIVE_MODE_KEY]);
    const lastActiveModes = result[LAST_ACTIVE_MODE_KEY] || {};
    return lastActiveModes[domain] || 'tabcapture';
  } catch (e) {
    return 'tabcapture';
  }
}

// Save last active mode for a domain
async function saveLastActiveMode(domain, mode) {
  try {
    const result = await browserAPI.storage.local.get([LAST_ACTIVE_MODE_KEY]);
    const lastActiveModes = result[LAST_ACTIVE_MODE_KEY] || {};
    lastActiveModes[domain] = mode;
    await browserAPI.storage.local.set({ [LAST_ACTIVE_MODE_KEY]: lastActiveModes });
  } catch (e) {
    console.error('[TabVolume Popup] Failed to save last active mode:', e);
  }
}

// Toggle between Tab Capture and Web Audio modes
async function toggleAudioMode() {
  console.log('[TabVolume Popup] toggleAudioMode called');

  if (!currentTabUrl) return;

  const domain = extractDomain(currentTabUrl);
  const isFirefox = typeof browser !== 'undefined';

  if (!domain) {
    showError('Unable to get domain');
    return;
  }

  // Firefox: Tab Capture not available
  if (isFirefox) {
    showStatus('Tab Capture requires Chrome', 'info', 3000);
    return;
  }

  // Don't toggle if Off mode is active
  if (isDomainDisabled) {
    showStatus('Disable Bypass first', 'info', 2000);
    return;
  }

  // Get effective mode from background (same as what UI shows)
  let effectiveMode = 'webaudio';
  try {
    const response = await browserAPI.runtime.sendMessage({
      type: 'GET_EFFECTIVE_MODE',
      hostname: domain
    });
    if (response && response.success && response.mode) {
      effectiveMode = response.mode;
    }
  } catch (e) {
    console.debug('[TabVolume Popup] Could not get effective mode:', e);
  }

  console.log('[TabVolume Popup] Current effective mode:', effectiveMode);

  if (effectiveMode === 'tabcapture') {
    // Currently Tab Capture → Switch to Web Audio
    console.log('[TabVolume Popup] Tab Capture → Web Audio');

    // Save preference and update override lists
    await saveLastActiveMode(domain, 'webaudio');
    await addToOverrideList(domain, 'webaudio');
    await removeFromOverrideList(domain, 'tabcapture');

    // Also clear Tab Capture site preference (legacy system used by autoStartTabCaptureIfNeeded)
    try {
      await browserAPI.runtime.sendMessage({
        type: 'SET_TAB_CAPTURE_PREF',
        hostname: domain,
        enabled: false
      });
    } catch (e) {
      console.debug('[TabVolume Popup] Could not clear Tab Capture pref:', e);
    }

    // Stop Tab Capture if running and refresh
    if (typeof window.stopTabCaptureMode === 'function') {
      await window.stopTabCaptureMode();
    }
    await refreshTabsForDomain(domain);
    window.close();
  } else {
    // Currently Web Audio → Switch to Tab Capture
    console.log('[TabVolume Popup] Web Audio → Tab Capture');

    // Save preference and update override lists
    await saveLastActiveMode(domain, 'tabcapture');
    await addToOverrideList(domain, 'tabcapture');
    await removeFromOverrideList(domain, 'webaudio');

    // Also set Tab Capture site preference (legacy system used by autoStartTabCaptureIfNeeded)
    try {
      await browserAPI.runtime.sendMessage({
        type: 'SET_TAB_CAPTURE_PREF',
        hostname: domain,
        enabled: true
      });
    } catch (e) {
      console.debug('[TabVolume Popup] Could not set Tab Capture pref:', e);
    }

    // Start Tab Capture
    await switchToTabCapture();
  }
}

// Toggle Off mode on/off
async function toggleDomainDisabled() {
  console.log('[TabVolume Popup] toggleOffMode called');

  if (!currentTabUrl) return;

  const domain = extractDomain(currentTabUrl);

  if (!domain) {
    showError('Unable to get domain');
    return;
  }

  if (isDomainDisabled) {
    // Currently Off → Return to last known mode (Tab Capture or Web Audio)
    console.log('[TabVolume Popup] Off → Returning to previous mode');

    const lastMode = await getLastActiveMode(domain);
    console.log('[TabVolume Popup] Last active mode:', lastMode);

    // Remove from disabled list first
    await switchToDefaultMode(domain);

    // If last mode was Tab Capture, start it (otherwise Web Audio is default)
    if (lastMode === 'tabcapture' && typeof window.startTabCaptureMode === 'function') {
      // Note: Page was refreshed by switchToDefaultMode, Tab Capture will need to be started fresh
      // The popup will close, so we can't start Tab Capture here
      // User will need to click the TC/WA toggle to start Tab Capture
    }
  } else {
    // Currently active → Switch to Off mode
    console.log('[TabVolume Popup] Active → Off');

    // Save current mode before going to Off
    const isTabCapture = typeof window.isTabCaptureActive === 'function' && window.isTabCaptureActive();
    await saveLastActiveMode(domain, isTabCapture ? 'tabcapture' : 'webaudio');

    await switchToNativeMode(domain);
  }
}

// Switch to Tab Capture mode (no page refresh needed)
async function switchToTabCapture() {
  if (typeof window.startTabCaptureMode !== 'function') {
    showError('Tab Capture not available');
    return;
  }

  const success = await window.startTabCaptureMode();
  if (success) {
    updateDisableButtonUI();
    showStatus('Tab Capture enabled', 'success', 2000);
  } else {
    // Get detailed error if available
    const errorDetail = typeof window.getLastTabCaptureError === 'function'
      ? window.getLastTabCaptureError()
      : null;
    const errorMsg = errorDetail
      ? `Failed to start Tab Capture: ${errorDetail}`
      : 'Failed to start Tab Capture';
    showError(errorMsg);
    console.error('[TabVolume Popup] Tab Capture failed:', errorDetail);
  }
}

// Switch to Native Mode / Enable Off (page refresh needed)
// This enables Off mode for the specified domain
async function switchToNativeMode(domain) {
  // Update UI immediately
  isDomainDisabled = true;
  updateDisableButtonUI();
  updateDisabledDomainUI();

  try {
    // Get the default audio mode to know how to handle this
    const settings = await browserAPI.storage.sync.get([
      'defaultAudioMode',
      'disabledDomains',
      'offDefault_tabCaptureSites',
      'offDefault_webAudioSites'
    ]);
    const defaultMode = settings.defaultAudioMode || 'tabcapture';

    if (defaultMode === 'native') {
      // Default is Off - remove from any override lists to let default Off apply
      let tcSites = settings.offDefault_tabCaptureSites || [];
      let waSites = settings.offDefault_webAudioSites || [];
      tcSites = tcSites.filter(d => d !== domain);
      waSites = waSites.filter(d => d !== domain);
      await browserAPI.storage.sync.set({
        offDefault_tabCaptureSites: tcSites,
        offDefault_webAudioSites: waSites
      });
    } else {
      // Default is Tab Capture or Web Audio - add to disabledDomains
      let disabledDomains = settings.disabledDomains || [];
      if (!disabledDomains.includes(domain)) {
        disabledDomains.push(domain);
      }

      // Use safe storage with quota checking
      const saveResult = await safeStorageSet({ disabledDomains }, false);
      if (!saveResult.success) {
        showError('Storage full - cannot add site to native mode');
        return;
      }
    }

    // Set localStorage flag on the page
    try {
      await browserAPI.scripting.executeScript({
        target: { tabId: currentTabId },
        world: 'MAIN',
        func: (d) => {
          try { localStorage.setItem('__tabVolumeControl_disabled_' + d, 'true'); } catch(e) {}
        },
        args: [domain]
      });
    } catch (e) {
      console.debug('[TabVolume Popup] Could not set localStorage flag:', e);
    }

    // Remove from Tab Capture sites list (since we're now using Native Mode)
    try {
      await browserAPI.runtime.sendMessage({
        type: 'SET_TAB_CAPTURE_PREF',
        hostname: domain,
        enabled: false
      });
    } catch (e) {
      console.debug('[TabVolume Popup] Could not clear Tab Capture preference:', e);
    }

    // Stop visualizer before refresh to cancel any pending reconnect timers
    if (typeof window.stopVisualizer === 'function') {
      window.stopVisualizer();
    }

    // Refresh based on setting
    await refreshTabsForDomain(domain);
    window.close();
  } catch (e) {
    console.error('[TabVolume Popup] Error switching to native mode:', e);
    showError('Failed to enable native mode');
  }
}

// Switch away from Native Mode / Disable Off (page refresh needed)
// This disables Off mode for the specified domain, returning to audio processing
async function switchToDefaultMode(domain) {
  // Update UI immediately
  isDomainDisabled = false;
  updateDisableButtonUI();

  try {
    // Get the default audio mode and last active mode to know how to handle this
    const settings = await browserAPI.storage.sync.get([
      'defaultAudioMode',
      'disabledDomains',
      'offDefault_tabCaptureSites',
      'offDefault_webAudioSites'
    ]);
    const defaultMode = settings.defaultAudioMode || 'tabcapture';

    if (defaultMode === 'native') {
      // Default is Off - add to an override list to enable audio processing
      // Use the last active mode to determine which override list
      const lastMode = await getLastActiveMode(domain);
      const targetMode = lastMode === 'tabcapture' ? 'tabcapture' : 'webaudio';

      if (targetMode === 'tabcapture') {
        let tcSites = settings.offDefault_tabCaptureSites || [];
        if (!tcSites.includes(domain)) {
          tcSites.push(domain);
        }
        const saveResult = await safeStorageSet({ offDefault_tabCaptureSites: tcSites }, false);
        if (!saveResult.success) {
          showError('Storage full - cannot add site override');
          return;
        }
      } else {
        let waSites = settings.offDefault_webAudioSites || [];
        if (!waSites.includes(domain)) {
          waSites.push(domain);
        }
        const saveResult = await safeStorageSet({ offDefault_webAudioSites: waSites }, false);
        if (!saveResult.success) {
          showError('Storage full - cannot add site override');
          return;
        }
      }
    } else {
      // Default is Tab Capture or Web Audio - remove from disabledDomains
      let disabledDomains = settings.disabledDomains || [];
      disabledDomains = disabledDomains.filter(d => d !== domain);
      await browserAPI.storage.sync.set({ disabledDomains });
    }

    // Remove localStorage flag on the page
    try {
      await browserAPI.scripting.executeScript({
        target: { tabId: currentTabId },
        world: 'MAIN',
        func: (d) => {
          try { localStorage.removeItem('__tabVolumeControl_disabled_' + d); } catch(e) {}
        },
        args: [domain]
      });
    } catch (e) {
      console.debug('[TabVolume Popup] Could not clear localStorage flag:', e);
    }

    // Stop visualizer before refresh to cancel any pending reconnect timers
    if (typeof window.stopVisualizer === 'function') {
      window.stopVisualizer();
    }

    // Refresh based on setting
    await refreshTabsForDomain(domain);
    window.close();
  } catch (e) {
    console.error('[TabVolume Popup] Error switching to default mode:', e);
    showError('Failed to return to default mode');
  }
}

// Helper: Refresh tabs based on nativeModeRefresh setting
async function refreshTabsForDomain(domain) {
  const settings = await browserAPI.storage.sync.get(['nativeModeRefresh']);
  const refreshBehavior = settings.nativeModeRefresh || 'current';

  if (refreshBehavior === 'current') {
    browserAPI.tabs.reload(currentTabId);
  } else {
    // Reload all tabs matching this domain
    const allTabs = await browserAPI.tabs.query({});
    const matchingTabs = allTabs.filter(tab => {
      try {
        const tabDomain = new URL(tab.url).hostname;
        return tabDomain === domain || tabDomain.endsWith('.' + domain);
      } catch (e) {
        return false;
      }
    });
    for (const tab of matchingTabs) {
      browserAPI.tabs.reload(tab.id);
    }
  }
}

// Audio mode toggle button handler (Tab Capture / Web Audio)
if (audioModeToggle) {
  audioModeToggle.addEventListener('click', toggleAudioMode);
}

// Disable domain button handler (Off mode)
if (disableDomainBtn) {
  disableDomainBtn.addEventListener('click', toggleDomainDisabled);
}

// ==================== Storage Quota Management ====================

// checkStorageQuota() is defined in popup-core.js

// Show storage quota warning if needed
async function showQuotaWarningIfNeeded() {
  const { percentUsed } = await checkStorageQuota();
  const percentDisplay = Math.round(percentUsed * 100);

  if (percentUsed >= QUOTA_CRITICAL_THRESHOLD) {
    showStatus(`Storage ${percentDisplay}% full. Remove unused rules to add new ones.`, 'error', 0);
    showCleanupButton(true);
  } else if (percentUsed >= QUOTA_WARNING_THRESHOLD) {
    showStatus(`Storage ${percentDisplay}% full. Consider cleaning up old site rules.`, 'warning', 0);
    showCleanupButton(true);
  } else {
    showCleanupButton(false);
  }
}

// Show/hide the cleanup button (use classList for CSP compliance)
function showCleanupButton(show) {
  const cleanupBtn = document.getElementById('cleanupRulesBtn');
  if (cleanupBtn) {
    cleanupBtn.classList.toggle('hidden', !show);
  }
}

// Clean up rules unused for 90+ days
async function cleanupOldRules() {
  const result = await browserAPI.storage.sync.get(['siteVolumeRules']);
  const rules = result.siteVolumeRules || [];

  const now = Date.now();
  const cutoffTime = now - (CLEANUP_DAYS * 24 * 60 * 60 * 1000); // 90 days in ms

  // Find old rules (rules without lastUsed are treated as current to give them grace period)
  const oldRules = rules.filter(r => r.lastUsed && r.lastUsed < cutoffTime);

  if (oldRules.length === 0) {
    showStatus('No rules older than 90 days found.', 'info');
    return;
  }

  // Confirm deletion
  const confirmMsg = `Remove ${oldRules.length} rule${oldRules.length > 1 ? 's' : ''} unused for 90+ days?`;
  if (!confirm(confirmMsg)) {
    return;
  }

  // Filter out old rules
  const newRules = rules.filter(r => !r.lastUsed || r.lastUsed >= cutoffTime);
  await browserAPI.storage.sync.set({ siteVolumeRules: newRules });

  showStatus(`Removed ${oldRules.length} old rule${oldRules.length > 1 ? 's' : ''}.`, 'success');
  showCleanupButton(false);

  // Re-check quota after cleanup
  setTimeout(showQuotaWarningIfNeeded, 1000);
}

// ==================== Add Site Rule ====================

// Add site rule with current settings
async function addSiteRule() {
  if (!currentTabUrl) {
    showError('Unable to get page URL');
    return;
  }

  const isDomain = ruleDomainCheckbox.checked;
  const volume = currentVolume;

  // Get selected device label (without the star prefix)
  let deviceLabel = '';
  const selectedOption = deviceSelect.options[deviceSelect.selectedIndex];
  if (selectedOption && selectedOption.value) {
    deviceLabel = selectedOption.textContent.replace(/^★\s*/, ''); // Remove star if present
  }

  // Determine pattern
  let pattern;
  if (isDomain) {
    pattern = extractDomain(currentTabUrl);
  } else {
    pattern = currentTabUrl;
  }

  // Load existing rules
  const result = await browserAPI.storage.sync.get(['siteVolumeRules']);
  const rules = result.siteVolumeRules || [];

  // Check for duplicate
  const existingIndex = rules.findIndex(r => r.pattern === pattern && r.isDomain === isDomain);

  // Check quota before adding new rule (updates are always allowed)
  if (existingIndex === -1) {
    const { percentUsed } = await checkStorageQuota();
    if (percentUsed >= QUOTA_CRITICAL_THRESHOLD) {
      showError('Cannot add rule. Storage full. Clean up old rules first.', 0);
      showCleanupButton(true);
      return;
    }
  }

  // Create the new rule with lastUsed timestamp for cleanup tracking
  const newRule = { pattern, volume, isDomain, lastUsed: Date.now() };
  if (deviceLabel) {
    newRule.deviceLabel = deviceLabel;
  }
  if (currentBassBoost !== 'off') {
    newRule.bassBoost = currentBassBoost;
  }
  if (currentTrebleBoost !== 'off') {
    newRule.trebleBoost = currentTrebleBoost;
  }
  if (currentVoiceBoost !== 'off') {
    newRule.voiceBoost = currentVoiceBoost;
  }
  if (currentCompressor !== 'off') {
    newRule.compressor = currentCompressor;
  }
  if (currentBalance !== 0) {
    newRule.balance = currentBalance;
  }
  if (currentChannelMode !== 'stereo') {
    newRule.channelMode = currentChannelMode;
  }

  if (existingIndex !== -1) {
    // Update existing rule
    rules[existingIndex] = newRule;
  } else {
    // Add new rule
    rules.push(newRule);
  }

  // Use safe storage set with quota checking
  const saveResult = await safeStorageSet({ siteVolumeRules: rules });
  if (saveResult.success) {
    showStatus(existingIndex !== -1 ? 'Site rule updated' : 'Site rule saved', 'success');
  }
  // If failed, safeStorageSet already showed error message
}

// Add Site Rule button handler
if (addSiteRuleBtn) {
  addSiteRuleBtn.addEventListener('click', addSiteRule);
}

// Cleanup old rules button handler
const cleanupRulesBtn = document.getElementById('cleanupRulesBtn');
if (cleanupRulesBtn) {
  cleanupRulesBtn.addEventListener('click', cleanupOldRules);
}

// ==================== Initialize Popup ====================

// Initialize popup
async function init() {
  try {
    // Load audio mode first (affects UI behavior)
    await loadAudioModeSettings();

    // Load custom presets
    await loadCustomPresets();

    // Load volume step settings
    await loadVolumeSteps();

    // Load effect presets (bass/voice boost)
    await loadEffectPresets();

    // Load EQ control mode (presets vs sliders)
    await loadEqControlMode();

    // Get current active tab first
    const [activeTab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) return;

    // Get all audible tabs
    audibleTabs = await getAudibleTabs();

    // Find active tab in audible list
    const activeTabIndex = audibleTabs.findIndex(t => t.id === activeTab.id);

    // If active tab is not in audible list, add it at the beginning
    if (activeTabIndex < 0) {
      audibleTabs.unshift(activeTab);
      currentTabIndex = 0;
    } else {
      currentTabIndex = activeTabIndex;
    }

    // Set current tab info
    const tab = audibleTabs[currentTabIndex];
    currentTabId = tab.id;
    currentTabUrl = tab.url || '';

    // Check for restricted pages where content script can't run
    // Uses isRestrictedUrl() from popup-core.js which includes all browser URL patterns
    isRestrictedPage = isRestrictedUrl(currentTabUrl);

    // Update tab info display
    tabTitle.textContent = tab.title || 'Unknown Tab';
    try {
      tabUrl.textContent = new URL(tab.url).hostname || tab.url;
    } catch (e) {
      tabUrl.textContent = tab.url || 'Unknown URL';
    }

    // Update navigation buttons
    updateTabNavigation();

    // For restricted pages, show warning and hide all controls
    if (isRestrictedPage) {
      showStatus('Audio control not available on browser pages', 'warning', 0);
      updateRestrictedPageUI();
      document.body.classList.remove('initializing');
      return; // Don't try to load settings or start visualizer
    }

    // Load all settings for this tab
    await loadTabSettings();

    // Check if domain is disabled
    isDomainDisabled = await checkDomainDisabled();
    await syncLocalStorageFlag(isDomainDisabled); // Sync localStorage with storage state
    updateDisableButtonUI();
    updateDisabledDomainUI();

    // Remove initializing class - controls are now either:
    // - Visible (domain not disabled) via CSS cascade
    // - Hidden (domain disabled) via inline styles from updateDisabledDomainUI()
    document.body.classList.remove('initializing');

    // Check storage quota and show warning if needed (only if domain not disabled)
    if (!isDomainDisabled) {
      await showQuotaWarningIfNeeded();
    }

    // Start visualizer (must be after currentTabId is set)
    // Use setTimeout to ensure canvas has been laid out
    await loadVisualizerType();
    setTimeout(startVisualizer, 50);

    // NOTE: autoStartTabCaptureIfNeeded removed - it used legacy storage check
    // and caused race conditions with startVisualizer() which now properly handles
    // Tab Capture auto-start via GET_EFFECTIVE_MODE
  } catch (e) {
    console.error('[TabVolume Popup] Init error:', e);
    tabTitle.textContent = 'Unable to access tab';
    tabUrl.textContent = 'Extension may not work on this page';
    showError('Cannot control audio on this page', 0); // Persistent error
  }
}

// Listen for tab updates to refresh title/URL when media changes (e.g., Spotify song change)
browserAPI.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only update if it's the current tab and title changed
  if (tabId === currentTabId && changeInfo.title) {
    tabTitle.textContent = changeInfo.title || 'Unknown Tab';
  }
  // Update URL if it changed (rare but possible)
  if (tabId === currentTabId && changeInfo.url) {
    try {
      tabUrl.textContent = new URL(changeInfo.url).hostname || changeInfo.url;
    } catch (e) {
      tabUrl.textContent = changeInfo.url || 'Unknown URL';
    }
    currentTabUrl = changeInfo.url;
  }
});

// Listen for tab close to clean up blocked state cache
browserAPI.tabs.onRemoved.addListener((tabId) => {
  if (typeof window.clearBlockedTabCache === 'function') {
    window.clearBlockedTabCache(tabId);
  }
});

// Initialize
init();
