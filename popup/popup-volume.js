// Per-Tab Audio Control - Volume Module
// Volume slider, presets, mute toggle, keyboard shortcuts

// ==================== Volume Step Settings ====================

// Default step values (overridden by user settings)
let scrollStep = DEFAULTS.volumeSteps.scrollWheel;
let buttonStep = DEFAULTS.volumeSteps.buttons;

// Easter egg timer for 404% volume
let easterEgg404Timer = null;
let easterEgg404Fired = false;
let easterEgg404Active = false; // Suppresses VOLUME_CHANGED UI updates during audio cutoff

// Easter egg: Triple-mute "Mischief Managed"
let muteToggleTimestamps = [];
let mischiefState = 0; // 0 = first trigger shows "solemnly swear", 1 = second shows "mischief managed"

// Restore mischief state from session storage (persists across popup open/close)
browserAPI.storage.session.get('mischiefState').then(result => {
  if (result.mischiefState !== undefined) mischiefState = result.mischiefState;
}).catch(() => {});

// Easter egg: 214% Valentine's message
let easterEgg214Timer = null;

// Load volume step settings from storage
async function loadVolumeSteps() {
  const result = await browserAPI.storage.sync.get(['volumeSteps']);
  const steps = result.volumeSteps || DEFAULTS.volumeSteps;

  scrollStep = steps.scrollWheel;
  buttonStep = steps.buttons;

  // Update button tooltips with current step value
  updateVolumeButtonTooltips();
}

// Update +/- button tooltips dynamically
function updateVolumeButtonTooltips() {
  if (volumeUpBtn) {
    volumeUpBtn.title = `Increase ${buttonStep}%`;
    volumeUpBtn.setAttribute('aria-label', `Increase volume by ${buttonStep}%`);
  }
  if (volumeDownBtn) {
    volumeDownBtn.title = `Decrease ${buttonStep}%`;
    volumeDownBtn.setAttribute('aria-label', `Decrease volume by ${buttonStep}%`);
  }
}

// ==================== Easter Egg: Triple-Mute ====================

// Track mute toggles - 6 within 6 seconds triggers easter egg
function trackMuteToggle() {
  const now = Date.now();
  muteToggleTimestamps.push(now);
  // Keep only timestamps from the last 6 seconds
  muteToggleTimestamps = muteToggleTimestamps.filter(t => now - t <= 6000);

  if (muteToggleTimestamps.length >= 6) {
    muteToggleTimestamps = []; // Reset
    if (mischiefState === 0) {
      showStatus('I solemnly swear this audio is up to no good.', 'info', 4000);
      mischiefState = 1;
    } else {
      showStatus('Mischief managed.', 'info', 4000);
      mischiefState = 0;
    }
    browserAPI.storage.session.set({ mischiefState }).catch(() => {});
  }
}

// ==================== Easter Egg: 214% Valentine ====================

// Start 60-second timer for 214% easter egg (only on a specific YouTube video)
function start214Timer() {
  if (easterEgg214Timer) return;

  // Only activate after "I solemnly swear..." has been triggered (mischiefState === 1)
  if (mischiefState !== 1) return;

  // Only activate on the specific video
  if (!currentTabUrl || !currentTabUrl.includes('youtube.com/watch') || !currentTabUrl.includes('rtOvBOTyX00')) return;

  easterEgg214Timer = setTimeout(async () => {
    easterEgg214Timer = null;
    try {
      // Only trigger if volume is still at 214 and audio is playing
      if (currentVolume !== 214) return;
      if (typeof isTabAudible !== 'function' || !await isTabAudible()) return;

      showStatus('Something magical awaits...', 'info', 5000);
      await browserAPI.storage.session.set({ valentineReady: true });
    } catch (e) {
      // Silently ignore - easter egg is non-critical
    }
  }, 30000); // 30 seconds
}

function stop214Timer() {
  if (easterEgg214Timer) {
    clearTimeout(easterEgg214Timer);
    easterEgg214Timer = null;
  }
}

// ==================== Load Custom Presets ====================

// Load and apply custom presets
async function loadCustomPresets() {
  const { customPresets: presets } = await getStorageWithDefaults({
    customPresets: DEFAULTS.volumePresets
  });

  // Get all non-mute preset buttons (skip the first one which is Mute)
  const presetBtns = document.querySelectorAll('.preset-btn:not(#muteBtn)');

  presetBtns.forEach((btn, index) => {
    if (index < presets.length) {
      const value = presets[index];
      btn.dataset.volume = value;
      btn.textContent = `${value}%`;

      // Update button styling based on value
      btn.classList.remove('reduced', 'boost', 'extreme', 'high');
      if (value >= 201) {
        btn.classList.add('extreme');
      } else if (value >= 101) {
        btn.classList.add('high');
      } else if (value >= 51) {
        btn.classList.add('reduced');
      } else {
        btn.classList.add('boost');
      }
    }
  });
}

// ==================== Update UI ====================

// Get volume bar fill color based on volume level
function getVolumeFillColor(volume) {
  const isLightMode = document.body.classList.contains('light-mode');

  if (volume === 0) {
    return isLightMode ? '#dc2626' : '#ef4444';  // red (muted)
  } else if (volume <= 50) {
    return isLightMode ? '#2563eb' : '#60a5fa';  // blue
  } else if (volume <= 100) {
    return isLightMode ? '#22c55e' : '#4ade80';  // green
  } else if (volume <= 200) {
    return isLightMode ? '#eab308' : '#facc15';  // yellow
  } else if (volume <= 350) {
    return isLightMode ? '#ea580c' : '#fb923c';  // orange
  } else {
    return isLightMode ? '#9333ea' : '#a855f7';  // purple (ultra)
  }
}

// Update all UI elements
function updateUI(volume) {
  // Convert volume to slider position (non-linear scale)
  const position = volumeToPosition(volume);
  volumeSlider.value = position;
  volumeSlider.setAttribute('aria-valuenow', volume);
  volumeValue.textContent = `${volume}%`;

  // Update slider fill using position percentage
  sliderFill.style.width = `${position}%`;

  // Update slider fill color based on volume level
  sliderFill.style.backgroundColor = getVolumeFillColor(volume);

  // Update styling based on volume level (for text/logo colors)
  volumeValue.classList.remove('boosted', 'extreme', 'muted', 'reduced', 'high', 'ultra');
  logo.classList.remove('boosted', 'extreme', 'muted', 'reduced', 'high', 'ultra');

  if (volume === 0) {
    volumeValue.classList.add('muted');
    logo.classList.add('muted');
  } else if (volume >= 351) {
    volumeValue.classList.add('ultra');
    logo.classList.add('ultra');
  } else if (volume >= 201) {
    volumeValue.classList.add('extreme');
    logo.classList.add('extreme');
  } else if (volume >= 101) {
    volumeValue.classList.add('high');
    logo.classList.add('high');
  } else if (volume >= 51) {
    volumeValue.classList.add('reduced');
    logo.classList.add('reduced');
  } else {
    volumeValue.classList.add('boosted');
    logo.classList.add('boosted');
  }

  // Update preset buttons
  presetButtons.forEach(btn => {
    const btnVolume = parseInt(btn.dataset.volume, 10);
    btn.classList.toggle('active', btnVolume === volume);
  });

  // Update mute button
  muteBtn.classList.toggle('muted', volume === 0);

  // Easter egg: 404% volume ("Volume not found") - only triggers if audio is playing
  if (volume === 404) {
    if (!easterEgg404Timer && !easterEgg404Fired) {
      easterEgg404Timer = setTimeout(async () => {
        // Only show if audio is actually playing
        try {
          if (typeof isTabAudible === 'function' && await isTabAudible()) {
            const tabId = currentTabId;
            // Cut audio (bypass UI - slider stays at 404%)
            easterEgg404Active = true;
            browserAPI.runtime.sendMessage({ type: 'SET_VOLUME', tabId, volume: 0 }).catch(() => {});
            if (window.isTabCaptureActive && window.isTabCaptureActive()) {
              browserAPI.runtime.sendMessage({ type: 'SET_TAB_CAPTURE_VOLUME', tabId, volume: 0 }).catch(() => {});
            }
            showStatus('Volume not found...', 'info', 3000);
            // Restore audio after 3 seconds, then show "just kidding"
            setTimeout(() => {
              browserAPI.runtime.sendMessage({ type: 'SET_VOLUME', tabId, volume: 404 }).catch(() => {});
              if (window.isTabCaptureActive && window.isTabCaptureActive()) {
                browserAPI.runtime.sendMessage({ type: 'SET_TAB_CAPTURE_VOLUME', tabId, volume: 404 }).catch(() => {});
              }
              showStatus('Just kidding', 'info', 3000);
              easterEgg404Active = false;
            }, 3000);
          }
        } catch (e) {
          // isTabAudible may fail if tab is closed or restricted - ignore silently
        }
        easterEgg404Timer = null;
        easterEgg404Fired = true;
      }, 4000);
    }
  } else {
    if (easterEgg404Timer) {
      clearTimeout(easterEgg404Timer);
      easterEgg404Timer = null;
    }
  }

  // Easter egg: 214% Valentine's message - 2 minutes of audio at 214%
  if (volume === 214) {
    start214Timer();
  } else {
    stop214Timer();
  }
}

// ==================== Set Volume ====================

// Set volume
async function setVolume(volume, isMuteToggle = false) {
  // Skip on restricted browser pages where content scripts can't run
  if (isRestrictedPage) return;

  // Capture tab ID at entry to prevent race conditions during async operations
  const tabId = currentTabId;

  // Validate tab ID to prevent silent failures during rapid popup opens
  // Must be a positive integer (0, negative, NaN, undefined all rejected)
  if (!Number.isInteger(tabId) || tabId <= 0) {
    console.warn('[TabVolume Popup] Cannot set volume: invalid tab ID', tabId);
    return;
  }

  volume = validateVolume(volume);

  const prevKey = getTabStorageKey(tabId, TAB_STORAGE.PREV);

  // Handle mute: save current volume for later unmute
  if (isMuteToggle && volume === 0 && currentVolume !== 0) {
    previousVolume = currentVolume;
    await browserAPI.storage.local.set({ [prevKey]: currentVolume });
  }

  // Handle unmute: clear stored previous volume
  if (isMuteToggle && volume !== 0 && currentVolume === 0) {
    await browserAPI.storage.local.remove([prevKey]);
  }

  // Track previous volume for non-mute operations (slider, presets)
  if (!isMuteToggle && volume !== 0 && currentVolume !== 0) {
    previousVolume = currentVolume;
  }

  currentVolume = volume;
  updateUI(volume);

  // Show one-time warning for boosted volume levels (persists across popup opens via chrome.storage.session)
  if (volume > EXTREME_VOLUME_THRESHOLD) {
    const result = await browserAPI.storage.session.get('extremeVolumeWarningShown');
    if (!result.extremeVolumeWarningShown) {
      await browserAPI.storage.session.set({ extremeVolumeWarningShown: true });
      showStatus('High volume may damage hearing. Use carefully.', 'warning', 5000);
    }
  }

  // Add visual feedback
  volumeValue.classList.add('changing');
  setTimeout(() => volumeValue.classList.remove('changing'), 300);

  // Send to background script (content script)
  await browserAPI.runtime.sendMessage({
    type: 'SET_VOLUME',
    tabId: tabId,
    volume: volume
  });

  // Also send to Tab Capture if active (for sites like Spotify where content script can't control audio)
  if (window.isTabCaptureActive && window.isTabCaptureActive()) {
    browserAPI.runtime.sendMessage({
      type: 'SET_TAB_CAPTURE_VOLUME',
      tabId: tabId,
      volume: volume
    }).catch(() => {}); // Suppress unhandled promise rejection
  }
}

// ==================== Slider Handlers ====================

// Slider input handler (throttled to ~30 updates/sec for performance on slower devices)
const throttledSetVolume = throttle((position) => {
  const volume = Math.round(positionToVolume(position));
  setVolume(volume);
}, 30);

volumeSlider.addEventListener('input', (e) => {
  const position = parseFloat(e.target.value);
  // Update UI immediately for responsiveness
  const volume = Math.round(positionToVolume(position));
  updateUI(volume);
  // Throttle the actual message sending
  throttledSetVolume(position);
});

// ==================== Preset Button Handlers ====================

// Preset button handlers
presetButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const volume = parseInt(btn.dataset.volume, 10);

    // Toggle mute
    if (volume === 0) {
      trackMuteToggle();
      if (currentVolume === 0) {
        // Unmute - restore previous volume
        setVolume(previousVolume || VOLUME_DEFAULT, true);
      } else {
        setVolume(0, true);
      }
    } else {
      setVolume(volume);
    }
  });
});

// ==================== Keyboard Shortcuts ====================

// Keyboard shortcuts in popup (volume up/down and mute)
document.addEventListener('keydown', (e) => {
  // Don't trigger if focus is on an input element
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    setVolume(currentVolume + buttonStep);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    setVolume(currentVolume - buttonStep);
  } else if (e.key === 'm' || e.key === 'M') {
    e.preventDefault();
    trackMuteToggle();
    if (currentVolume === 0) {
      setVolume(previousVolume || VOLUME_DEFAULT, true);
    } else {
      setVolume(0, true);
    }
  }
});

// ==================== Mouse Wheel Volume Control ====================

// Volume bar elements for wheel detection
const volumeRow = document.querySelector('.volume-row');
const sliderContainer = document.querySelector('.slider-container');
const presetsRow = document.querySelector('.presets');

// Mouse wheel on volume bar area adjusts volume (works in all modes)
document.addEventListener('wheel', (e) => {
  // Only adjust volume when mouse is over volume-related elements
  const isOverVolumeArea =
    (volumeRow && volumeRow.contains(e.target)) ||
    (sliderContainer && sliderContainer.contains(e.target)) ||
    (presetsRow && presetsRow.contains(e.target));

  if (!isOverVolumeArea) {
    return;
  }

  e.preventDefault();
  const delta = e.deltaY < 0 ? scrollStep : -scrollStep;
  setVolume(currentVolume + delta);
}, { passive: false });

// ==================== Volume +/- Buttons ====================

// Volume +/- button handlers with hold-to-repeat
let holdInterval = null;
let holdTimeout = null;

function startHold(delta) {
  setVolume(currentVolume + delta);
  // Start repeating after 300ms delay
  holdTimeout = setTimeout(() => {
    holdInterval = setInterval(() => {
      setVolume(currentVolume + delta);
    }, 75); // Repeat every 75ms while held
  }, 300);
}

function stopHold() {
  if (holdTimeout) {
    clearTimeout(holdTimeout);
    holdTimeout = null;
  }
  if (holdInterval) {
    clearInterval(holdInterval);
    holdInterval = null;
  }
}

volumeUpBtn.addEventListener('mousedown', () => startHold(buttonStep));
volumeUpBtn.addEventListener('mouseup', stopHold);
volumeUpBtn.addEventListener('mouseleave', stopHold);

volumeDownBtn.addEventListener('mousedown', () => startHold(-buttonStep));
volumeDownBtn.addEventListener('mouseup', stopHold);
volumeDownBtn.addEventListener('mouseleave', stopHold);

// ==================== Volume Change Listener ====================

// Listen for volume changes from background (keyboard shortcuts)
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'VOLUME_CHANGED' && request.tabId === currentTabId) {
    // Suppress UI updates during 404% easter egg audio cutoff
    if (easterEgg404Active) return;
    currentVolume = request.volume;
    updateUI(request.volume);
  }
});
