// Per-Tab Audio Control - Visualizer Module
// Canvas rendering, animation loop, audio visualization
// Uses port-based streaming for better performance on heavy sites
// Falls back to tabCapture for sites where content script method fails

// ==================== Visualizer State ====================

const visualizerCanvas = document.getElementById('visualizer');
const visualizerCtx = visualizerCanvas ? visualizerCanvas.getContext('2d') : null;
let visualizerAnimationId = null;
let lastFrequencyData = null;
let lastWaveformData = null;
let visualizerType = 'bars'; // 'bars', 'waveform', 'mirrored', 'curve', 'dots', 'off'

// Port-based streaming (more efficient than polling)
let visualizerPort = null;
let portReconnectTimer = null; // Timer for auto-reconnect after disconnect
let lastDataReceiveTime = 0; // Track when we last received data

// Auto-detection of failed audio capture (CORS issues)
let visualizerAutoDisabled = false; // True if we auto-disabled due to capture failure
let activeTabPermissionError = false; // True if Tab Capture failed due to activeTab permission (tab switcher)
let zeroDataCount = 0; // Count of data pushes with zero frequency data while media is playing
let noDataCount = 0; // Count of render frames with no data received
let hasEverHadData = false; // True if we've ever received audio data from current tab (reset on tab switch)
const ZERO_DATA_THRESHOLD = 40; // ~2 seconds worth of data pushes before auto-disabling
const NO_DATA_THRESHOLD = 180; // ~3 seconds at 60fps render - frames before showing blocked

// Tab audible detection (for Web Audio API sites without media elements)
let audibleCheckInterval = null; // Interval for checking tab.audible
let audibleNoDataCount = 0; // Count of checks where tab is audible but no visualizer data
const AUDIBLE_CHECK_INTERVAL = 500; // Check every 500ms
const AUDIBLE_NO_DATA_THRESHOLD = 6; // ~3 seconds of audible + no data before prompting

// tabCapture fallback state
let tabCaptureActive = false; // True if using tabCapture for visualizer
let tabCaptureAudioContext = null; // Separate AudioContext for local tabCapture (when offscreen not available)
let tabCaptureAnalyser = null; // AnalyserNode for local tabCapture
let tabCaptureStream = null; // MediaStream from local tabCapture
let tabCaptureFreqArray = null; // Reusable frequency array for local tabCapture
let tabCaptureWaveArray = null; // Reusable waveform array for local tabCapture
let showEnablePrompt = false; // True when we should show the enable button
const isFirefoxBrowser = typeof browser !== 'undefined';

// Persistent Tab Capture state (managed by offscreen document)
let persistentCaptureActive = false; // True when using offscreen-managed capture
let persistentDataPollInterval = null; // Interval for polling data from offscreen

// Cache of blocked state per tab (avoids re-detection delay when switching tabs)
// Key: tabId, Value: true (blocked) or false (not blocked/working)
const blockedTabsCache = new Map();

// Expose cache cleanup for tab close events (called from popup-tabs.js)
window.clearBlockedTabCache = (tabId) => blockedTabsCache.delete(tabId);
const PERSISTENT_DATA_POLL_RATE = 50; // Poll every 50ms (~20fps, smooth enough for visualization)

// Expose Tab Capture status and control for other popup modules (volume, effects, etc.)
window.isTabCaptureActive = () => persistentCaptureActive;
window.startTabCaptureMode = async () => {
  if (isFirefoxBrowser) return false;
  return await startTabCapture();
};
window.stopTabCaptureMode = async () => {
  if (isFirefoxBrowser) return true;

  // Stop local state
  stopTabCapture();

  // Also stop the offscreen capture
  if (currentTabId) {
    try {
      await browserAPI.runtime.sendMessage({
        type: 'STOP_PERSISTENT_VISUALIZER_CAPTURE',
        tabId: currentTabId
      });
      console.log('[Visualizer] Stopped persistent capture for tab', currentTabId);
    } catch (e) {
      console.debug('[Visualizer] Could not stop persistent capture:', e);
    }
  }
  return true;
};

// Available visualizer types (off is last so it cycles: bars -> ... -> dots -> off -> bars)
const visualizerTypeList = ['bars', 'waveform', 'mirrored', 'curve', 'dots', 'off'];

// ==================== Visualizer Preferences ====================

// Load visualizer type preference
async function loadVisualizerType() {
  try {
    // Load global visualizer setting (same for all tabs)
    const result = await browserAPI.storage.local.get(['visualizerType']);
    if (result.visualizerType) {
      visualizerType = result.visualizerType;
    } else {
      // No saved preference - use default 'bars'
      // This also fixes the case where visualizerType was set to 'off' by auto-disable
      visualizerType = 'bars';
    }
    // Update indicator visibility based on loaded preference
    updateVisualizerUnavailableMessage();
  } catch (e) {}
}

// Save visualizer type preference (global - same for all tabs)
async function saveVisualizerType() {
  try {
    await browserAPI.storage.local.set({ visualizerType: visualizerType });
  } catch (e) {}
}

// Cycle to next visualizer type
function cycleVisualizerType() {
  const currentIndex = visualizerTypeList.indexOf(visualizerType);
  const nextIndex = (currentIndex + 1) % visualizerTypeList.length;
  visualizerType = visualizerTypeList[nextIndex];

  // Reset auto-disabled state when user explicitly changes style
  // This lets them "try again" if they want to use the visualizer
  if (visualizerAutoDisabled) {
    visualizerAutoDisabled = false;
    zeroDataCount = 0;
    noDataCount = 0;
  }

  // Update indicators (shows "off" when user turns it off)
  updateVisualizerUnavailableMessage();
  saveVisualizerType();
}

// ==================== Canvas Event Handlers ====================

// Visualizer click (play/pause) and long-press (cycle style) handlers
if (visualizerCanvas) {
  visualizerCanvas.style.cursor = 'pointer';

  let longPressTimer = null;
  let isLongPress = false;
  const LONG_PRESS_DURATION = 500; // ms

  visualizerCanvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Only left click
    isLongPress = false;
    // Don't enable long-press style cycling when visualizer is blocked or on restricted pages
    // Native mode (isDomainDisabled) only blocks on Firefox - Chrome has Tab Capture fallback
    if ((isDomainDisabled && isFirefoxBrowser) || visualizerAutoDisabled || isRestrictedPage) return;
    longPressTimer = setTimeout(() => {
      isLongPress = true;
      cycleVisualizerType();
    }, LONG_PRESS_DURATION);
  });

  visualizerCanvas.addEventListener('mouseup', () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    // If it wasn't a long press, it's a click - go to that tab
    if (!isLongPress) {
      goToCurrentTab();
    }
  });

  visualizerCanvas.addEventListener('mouseleave', () => {
    // Cancel long press if mouse leaves
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  });
}

// ==================== Canvas Setup ====================

// Set canvas size to match container
function resizeVisualizer() {
  if (!visualizerCanvas) return;

  const container = visualizerCanvas.parentElement;
  const rect = container.getBoundingClientRect();

  // Set canvas size (use device pixel ratio for crisp rendering)
  const dpr = window.devicePixelRatio || 1;
  visualizerCanvas.width = rect.width * dpr;
  visualizerCanvas.height = rect.height * dpr;
  visualizerCtx.scale(dpr, dpr);

  // Store logical dimensions for drawing
  visualizerCanvas.logicalWidth = rect.width;
  visualizerCanvas.logicalHeight = rect.height;
}

// Get visualizer color based on volume state
function getVisualizerColor() {
  const isLightMode = document.body.classList.contains('light-mode');

  if (currentVolume === 0) {
    return isLightMode ? '#dc2626' : '#ef4444'; // muted - red
  } else if (currentVolume <= 50) {
    return isLightMode ? '#22c55e' : '#4ade80'; // low - green
  } else if (currentVolume <= 100) {
    return isLightMode ? '#2563eb' : '#60a5fa'; // normal - blue
  } else if (currentVolume <= 200) {
    return isLightMode ? '#eab308' : '#facc15'; // high - yellow
  } else if (currentVolume <= 350) {
    return isLightMode ? '#ea580c' : '#fb923c'; // extreme - orange
  } else {
    return isLightMode ? '#9333ea' : '#a855f7'; // ultra - purple
  }
}

// ==================== Draw Functions ====================

// Draw frequency bars on canvas
function drawBars(frequencyData) {
  if (!visualizerCtx || !visualizerCanvas) return;

  const width = visualizerCanvas.logicalWidth || visualizerCanvas.width;
  const height = visualizerCanvas.logicalHeight || visualizerCanvas.height;

  // Clear canvas
  visualizerCtx.clearRect(0, 0, width, height);

  if (!frequencyData || frequencyData.length === 0) return;

  // Number of bars to display
  const barCount = Math.min(24, frequencyData.length);
  const barWidth = width / barCount;
  const barGap = 1;

  const barColor = getVisualizerColor();

  // Sample from lower frequencies (bass/mids) which have more energy
  const maxIndex = Math.floor(frequencyData.length * 0.6);

  for (let i = 0; i < barCount; i++) {
    // Sample from the lower 60% of frequency range (bass and mids)
    const dataIndex = Math.floor(i * maxIndex / barCount);
    const value = frequencyData[dataIndex] || 0;

    // Amplify and normalize (boost sensitivity)
    const amplified = Math.min(255, value * 2.5);
    const normalized = amplified / 255;

    // Apply slight curve for more dynamic response
    const curved = Math.pow(normalized, 0.7);

    // Calculate bar height (full height available)
    const barHeight = curved * height * 0.95;

    // Draw bar from bottom
    const x = i * barWidth + barGap / 2;
    const y = height - barHeight;

    visualizerCtx.fillStyle = barColor;
    visualizerCtx.fillRect(x, y, barWidth - barGap, barHeight);
  }
}

// Draw waveform on canvas
function drawWaveform(waveformData) {
  if (!visualizerCtx || !visualizerCanvas) return;

  const width = visualizerCanvas.logicalWidth || visualizerCanvas.width;
  const height = visualizerCanvas.logicalHeight || visualizerCanvas.height;
  const centerY = height / 2;

  // Clear canvas
  visualizerCtx.clearRect(0, 0, width, height);

  if (!waveformData || waveformData.length === 0) return;

  const waveColor = getVisualizerColor();

  // Thicker line for visibility
  visualizerCtx.lineWidth = 2.5;
  visualizerCtx.strokeStyle = waveColor;
  visualizerCtx.lineCap = 'round';
  visualizerCtx.lineJoin = 'round';
  visualizerCtx.beginPath();

  // Sample fewer points for smoother line
  const sampleCount = Math.min(waveformData.length, 128);
  const sliceWidth = width / sampleCount;
  let x = 0;

  for (let i = 0; i < sampleCount; i++) {
    const dataIndex = Math.floor(i * waveformData.length / sampleCount);
    // Waveform data is 0-255, centered at 128
    const value = waveformData[dataIndex];

    // Calculate deviation from center and amplify
    const deviation = (value - 128) / 128;
    const amplified = deviation * 3.5; // Amplify the movement for better reactivity
    const clamped = Math.max(-1, Math.min(1, amplified));

    // Map to canvas height
    const y = centerY - (clamped * centerY * 0.9);

    if (i === 0) {
      visualizerCtx.moveTo(x, y);
    } else {
      visualizerCtx.lineTo(x, y);
    }

    x += sliceWidth;
  }

  visualizerCtx.stroke();
}

// Draw mirrored bars (symmetric from center)
function drawMirroredBars(frequencyData) {
  if (!visualizerCtx || !visualizerCanvas) return;

  const width = visualizerCanvas.logicalWidth || visualizerCanvas.width;
  const height = visualizerCanvas.logicalHeight || visualizerCanvas.height;
  const centerY = height / 2;

  // Clear canvas
  visualizerCtx.clearRect(0, 0, width, height);

  if (!frequencyData || frequencyData.length === 0) return;

  const barCount = Math.min(24, frequencyData.length);
  const barWidth = width / barCount;
  const barGap = 1;

  const barColor = getVisualizerColor();

  // Sample from lower frequencies
  const maxIndex = Math.floor(frequencyData.length * 0.6);

  for (let i = 0; i < barCount; i++) {
    const dataIndex = Math.floor(i * maxIndex / barCount);
    const value = frequencyData[dataIndex] || 0;

    // Amplify for sensitivity
    const amplified = Math.min(255, value * 2.5);
    const normalized = amplified / 255;
    const curved = Math.pow(normalized, 0.7);

    // Calculate bar height (half height since mirrored)
    const barHeight = curved * centerY * 0.9;

    const x = i * barWidth + barGap / 2;

    visualizerCtx.fillStyle = barColor;
    // Draw top bar (going up from center)
    visualizerCtx.fillRect(x, centerY - barHeight, barWidth - barGap, barHeight);
    // Draw bottom bar (going down from center)
    visualizerCtx.fillRect(x, centerY, barWidth - barGap, barHeight);
  }
}

// Draw smooth frequency curve with fill
function drawCurve(frequencyData) {
  if (!visualizerCtx || !visualizerCanvas) return;

  const width = visualizerCanvas.logicalWidth || visualizerCanvas.width;
  const height = visualizerCanvas.logicalHeight || visualizerCanvas.height;

  // Clear canvas
  visualizerCtx.clearRect(0, 0, width, height);

  if (!frequencyData || frequencyData.length === 0) return;

  const curveColor = getVisualizerColor();

  // Sample points for smooth curve
  const pointCount = Math.min(32, frequencyData.length);
  const maxIndex = Math.floor(frequencyData.length * 0.6);
  const points = [];

  for (let i = 0; i < pointCount; i++) {
    const dataIndex = Math.floor(i * maxIndex / pointCount);
    const value = frequencyData[dataIndex] || 0;

    const amplified = Math.min(255, value * 2.5);
    const normalized = amplified / 255;
    const curved = Math.pow(normalized, 0.7);

    const x = (i / (pointCount - 1)) * width;
    const y = height - (curved * height * 0.9);
    points.push({ x, y });
  }

  // Draw filled area
  visualizerCtx.beginPath();
  visualizerCtx.moveTo(0, height);

  // Draw smooth curve through points using quadratic curves
  for (let i = 0; i < points.length; i++) {
    if (i === 0) {
      visualizerCtx.lineTo(points[i].x, points[i].y);
    } else {
      // Use midpoint for smoother curves
      const prevPoint = points[i - 1];
      const currPoint = points[i];
      const midX = (prevPoint.x + currPoint.x) / 2;
      const midY = (prevPoint.y + currPoint.y) / 2;
      visualizerCtx.quadraticCurveTo(prevPoint.x, prevPoint.y, midX, midY);
    }
  }

  // Connect to last point and close
  if (points.length > 0) {
    const lastPoint = points[points.length - 1];
    visualizerCtx.lineTo(lastPoint.x, lastPoint.y);
  }
  visualizerCtx.lineTo(width, height);
  visualizerCtx.closePath();

  // Fill with gradient
  const gradient = visualizerCtx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, curveColor);
  gradient.addColorStop(1, 'transparent');
  visualizerCtx.fillStyle = gradient;
  visualizerCtx.fill();

  // Draw line on top
  visualizerCtx.beginPath();
  for (let i = 0; i < points.length; i++) {
    if (i === 0) {
      visualizerCtx.moveTo(points[i].x, points[i].y);
    } else {
      const prevPoint = points[i - 1];
      const currPoint = points[i];
      const midX = (prevPoint.x + currPoint.x) / 2;
      const midY = (prevPoint.y + currPoint.y) / 2;
      visualizerCtx.quadraticCurveTo(prevPoint.x, prevPoint.y, midX, midY);
    }
  }
  if (points.length > 0) {
    visualizerCtx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  }
  visualizerCtx.strokeStyle = curveColor;
  visualizerCtx.lineWidth = 2;
  visualizerCtx.stroke();
}

// Draw bouncing dots
function drawDots(frequencyData) {
  if (!visualizerCtx || !visualizerCanvas) return;

  const width = visualizerCanvas.logicalWidth || visualizerCanvas.width;
  const height = visualizerCanvas.logicalHeight || visualizerCanvas.height;

  // Clear canvas
  visualizerCtx.clearRect(0, 0, width, height);

  if (!frequencyData || frequencyData.length === 0) return;

  const dotColor = getVisualizerColor();

  // Number of dots
  const dotCount = 16;
  const spacing = width / dotCount;
  const maxRadius = Math.min(spacing * 0.4, height * 0.25);
  const minRadius = 2;

  // Sample from lower frequencies
  const maxIndex = Math.floor(frequencyData.length * 0.6);

  for (let i = 0; i < dotCount; i++) {
    const dataIndex = Math.floor(i * maxIndex / dotCount);
    const value = frequencyData[dataIndex] || 0;

    // Amplify for sensitivity
    const amplified = Math.min(255, value * 2.5);
    const normalized = amplified / 255;
    const curved = Math.pow(normalized, 0.6);

    // Calculate dot size based on frequency
    const radius = minRadius + (curved * (maxRadius - minRadius));

    // Calculate vertical position (dots bounce up from bottom)
    const maxBounce = height * 0.8;
    const bounceHeight = curved * maxBounce;
    const x = spacing * i + spacing / 2;
    const y = height - radius - bounceHeight;

    // Draw dot
    visualizerCtx.beginPath();
    visualizerCtx.arc(x, y, radius, 0, Math.PI * 2);
    visualizerCtx.fillStyle = dotColor;
    visualizerCtx.fill();

    // Add subtle glow effect for larger dots
    if (radius > maxRadius * 0.5) {
      visualizerCtx.beginPath();
      visualizerCtx.arc(x, y, radius * 1.3, 0, Math.PI * 2);
      visualizerCtx.fillStyle = dotColor.replace(')', ', 0.3)').replace('rgb', 'rgba').replace('#', '');
      // Simple alpha version
      visualizerCtx.globalAlpha = 0.3;
      visualizerCtx.fill();
      visualizerCtx.globalAlpha = 1;
    }
  }
}

// ==================== Main Draw Function ====================

// Main draw function - calls appropriate visualizer
function drawVisualizer() {
  switch (visualizerType) {
    case 'off':
      // Clear canvas when visualizer is off
      if (visualizerCtx && visualizerCanvas) {
        const dpr = window.devicePixelRatio || 1;
        visualizerCtx.clearRect(0, 0, visualizerCanvas.width / dpr, visualizerCanvas.height / dpr);
      }
      break;
    case 'waveform':
      drawWaveform(lastWaveformData);
      break;
    case 'mirrored':
      drawMirroredBars(lastFrequencyData);
      break;
    case 'curve':
      drawCurve(lastFrequencyData);
      break;
    case 'dots':
      drawDots(lastFrequencyData);
      break;
    default:
      drawBars(lastFrequencyData);
  }
}

// ==================== Audio Data Detection ====================

// Check if frequency data contains actual audio (not all zeros)
function hasAudioData(frequencyData) {
  if (!frequencyData || frequencyData.length === 0) return false;
  // Sum the first half (lower frequencies where most energy is)
  const sum = frequencyData.slice(0, Math.floor(frequencyData.length / 2))
    .reduce((a, b) => a + b, 0);
  return sum > 10; // Threshold to account for noise floor
}

// Note: isRestrictedPage variable is set in popup-tabs.js init() and declared in popup-core.js
// It uses isRestrictedUrl() from popup-core.js which includes all browser URL patterns

// Update visualizer tooltip based on whether long-press is available
function updateVisualizerTooltip() {
  const visualizer = document.getElementById('visualizer');
  if (!visualizer) return;

  // Long-press is disabled when: visualizer blocked, restricted page, or native mode on Firefox
  // Native mode on Chrome allows long-press since Tab Capture enables visualizer
  const longPressDisabled = (isDomainDisabled && isFirefoxBrowser) || visualizerAutoDisabled || isRestrictedPage;

  visualizer.title = longPressDisabled
    ? 'Click: Go to tab'
    : 'Click: Go to tab | Long-press: Change style';
}

// Update the visualizer status indicators visibility
async function updateVisualizerUnavailableMessage() {
  const unavailableMsg = document.getElementById('visualizerUnavailable');
  const offMsg = document.getElementById('visualizerOff');
  const enableTabCaptureBtn = document.getElementById('enableTabCaptureBtn');
  const nativeModeBtn = document.getElementById('enableNativeModeBtn');

  // Hide all indicators and buttons first (use classList for CSP compliance)
  if (unavailableMsg) unavailableMsg.classList.remove('visible');
  if (offMsg) offMsg.classList.remove('visible');
  if (enableTabCaptureBtn) enableTabCaptureBtn.classList.add('hidden');
  if (nativeModeBtn) nativeModeBtn.classList.add('hidden');

  // If tabCapture is active, don't show any blocked indicators
  if (tabCaptureActive) {
    showEnablePrompt = false;
    document.body.classList.remove('audio-blocked');
    clearStatus(); // Clear any "cannot access audio" message
    // Update tooltip to reflect long-press availability
    updateVisualizerTooltip();
    return;
  }

  // Check if tabCapture feature is globally enabled
  const featureEnabled = await isTabCaptureFeatureEnabled();

  // Special case: activeTab permission error (tab switcher limitation)
  // Show helpful message without the "Enable Tab Capture" button (it won't help here)
  if (activeTabPermissionError && !isDomainDisabled) {
    showEnablePrompt = false; // Don't show the button - it won't work
    showStatus('Open popup on this tab first to enable Tab Capture', 'info', 0);
    document.body.classList.add('audio-blocked');
    if (unavailableMsg) {
      unavailableMsg.classList.add('visible');
    }
  } else if (visualizerAutoDisabled && !isFirefoxBrowser && featureEnabled && !isDomainDisabled) {
    // Chrome: show status message + Tab Capture button at bottom + indicator
    // Only show if NOT in Off mode (isDomainDisabled) - Off mode is intentional, not an error
    showEnablePrompt = true;
    showStatus('Extension cannot access audio on this site.', 'info', 0);
    document.body.classList.add('audio-blocked');
    if (enableTabCaptureBtn) {
      enableTabCaptureBtn.classList.remove('hidden');
    }
    if (unavailableMsg) {
      unavailableMsg.classList.add('visible');
    }
  } else if (visualizerAutoDisabled && isFirefoxBrowser && !isDomainDisabled) {
    // Firefox: show status message + Native Mode button at bottom + indicator (only if not already in native mode)
    showEnablePrompt = true;
    showStatus('Extension cannot access audio on this site.', 'info', 0);
    document.body.classList.add('audio-blocked');
    if (nativeModeBtn) {
      nativeModeBtn.classList.remove('hidden');
    }
    if (unavailableMsg) {
      unavailableMsg.classList.add('visible');
    }
  } else if (visualizerAutoDisabled && !isDomainDisabled) {
    // Feature disabled but not in Off mode: show blocked indicator
    showEnablePrompt = false;
    document.body.classList.add('audio-blocked');
    if (unavailableMsg) {
      unavailableMsg.classList.add('visible');
    }
  } else if (isDomainDisabled) {
    // Off mode is intentional - don't show error, don't block controls
    showEnablePrompt = false;
    document.body.classList.remove('audio-blocked');
    // Don't show unavailable indicator - Off mode has its own status via updateDisabledDomainUI()
  } else {
    showEnablePrompt = false;
    document.body.classList.remove('audio-blocked');
    clearStatus(); // Clear any lingering blocked message
  }

  // Show "off" indicator if user turned it off (not auto-disabled)
  if (offMsg) {
    if (visualizerType === 'off' && !visualizerAutoDisabled && !showEnablePrompt) {
      offMsg.classList.add('visible');
    }
  }

  // Update tooltip to reflect long-press availability
  updateVisualizerTooltip();
}

// ==================== tabCapture Fallback ====================

// Get hostname from current tab URL
function getCurrentHostname() {
  if (!currentTabUrl) return null;
  try {
    const url = new URL(currentTabUrl);
    return url.hostname;
  } catch (e) {
    return null;
  }
}

// Tab Capture fallback is always enabled (no global toggle)
async function isTabCaptureFeatureEnabled() {
  return true;
}

// Check if tabCapture is enabled for current site
async function checkTabCapturePreference() {
  const hostname = getCurrentHostname();
  if (!hostname) return false;

  // First check if the feature is globally enabled
  const featureEnabled = await isTabCaptureFeatureEnabled();
  if (!featureEnabled) return false;

  try {
    const response = await browserAPI.runtime.sendMessage({
      type: 'GET_TAB_CAPTURE_PREF',
      hostname: hostname
    });
    return response && response.enabled;
  } catch (e) {
    return false;
  }
}

// Save tabCapture preference for current site
async function saveTabCapturePreference(enabled) {
  const hostname = getCurrentHostname();
  if (!hostname) return;

  try {
    await browserAPI.runtime.sendMessage({
      type: 'SET_TAB_CAPTURE_PREF',
      hostname: hostname,
      enabled: enabled
    });
  } catch (e) {
    console.error('[Visualizer] Failed to save tabCapture preference:', e);
  }
}

// Track last Tab Capture error for debugging
let lastTabCaptureError = null;
window.getLastTabCaptureError = () => lastTabCaptureError;

// Start tabCapture for visualizer (uses persistent capture via offscreen document)
async function startTabCapture() {
  // Check early return conditions and log which one triggered
  if (tabCaptureActive) {
    lastTabCaptureError = 'tabCaptureActive is already true';
    console.log('[Visualizer] Cannot start - tabCaptureActive is already true');
    return false;
  }
  if (persistentCaptureActive) {
    lastTabCaptureError = 'persistentCaptureActive is already true';
    console.log('[Visualizer] Cannot start - persistentCaptureActive is already true');
    return false;
  }
  if (!currentTabId) {
    lastTabCaptureError = 'No currentTabId';
    console.log('[Visualizer] Cannot start - no currentTabId');
    return false;
  }
  if (isFirefoxBrowser) {
    lastTabCaptureError = 'Firefox does not support Tab Capture';
    return false;
  }

  try {
    // IMPORTANT: Stop render loop during mode switch to prevent drawing with mixed data
    // This matches the fresh popup open behavior where render starts AFTER capture is ready
    stopVisualizerLoop();

    // Disconnect Web Audio port to prevent race condition
    disconnectVisualizerPort();

    // Stop audible detection (not needed for Tab Capture)
    stopAudibleDetection();

    // Request persistent capture via background -> offscreen
    console.log('[Visualizer] Requesting persistent capture for tab', currentTabId);
    const response = await browserAPI.runtime.sendMessage({
      type: 'START_PERSISTENT_VISUALIZER_CAPTURE',
      tabId: currentTabId
    });

    if (!response || !response.success) {
      lastTabCaptureError = response?.error || 'Unknown error from background';
      console.log('[Visualizer] Persistent capture failed:', lastTabCaptureError);

      // Check if this is an activeTab permission error (tab switcher limitation)
      if (lastTabCaptureError.includes('not been invoked') || lastTabCaptureError.includes('activeTab')) {
        activeTabPermissionError = true;
        visualizerAutoDisabled = true;
        document.body.classList.add('audio-blocked');
        updateVisualizerUnavailableMessage();
      }

      // Restart render loop for Web Audio fallback
      startVisualizerLoop();
      return false;
    }

    // WARMUP: Wait for stable data BEFORE enabling Tab Capture rendering
    // Poll until we get consecutive valid data frames, with a maximum wait time
    const MAX_WARMUP_TIME = 500; // Max 500ms warmup
    const WARMUP_POLL_INTERVAL = 30; // Poll every 30ms
    const REQUIRED_VALID_FRAMES = 3; // Need 3 consecutive valid frames

    const warmupStart = performance.now();
    let validFrameCount = 0;

    while (performance.now() - warmupStart < MAX_WARMUP_TIME) {
      try {
        const dataResponse = await browserAPI.runtime.sendMessage({
          type: 'GET_PERSISTENT_VISUALIZER_DATA',
          tabId: currentTabId
        });

        if (dataResponse && dataResponse.success && dataResponse.frequencyData) {
          // Check if data has actual audio content (not all zeros)
          const hasAudio = dataResponse.frequencyData.some(v => v > 10);
          if (hasAudio) {
            validFrameCount++;
            lastFrequencyData = dataResponse.frequencyData;
            lastWaveformData = dataResponse.waveformData;
            lastDataReceiveTime = performance.now();

            if (validFrameCount >= REQUIRED_VALID_FRAMES) {
              console.log('[Visualizer] Warmup complete - got', validFrameCount, 'valid frames');
              break;
            }
          } else {
            validFrameCount = 0; // Reset if we get empty frame
          }
        }
      } catch (e) {
        // Ignore - keep trying
      }

      await new Promise(resolve => setTimeout(resolve, WARMUP_POLL_INTERVAL));
    }

    console.log('[Visualizer] Warmup finished after', Math.round(performance.now() - warmupStart), 'ms');

    // Start continuous polling BEFORE setting flags
    startPersistentDataPolling();

    // Load visualizer type BEFORE setting flags (ensures type is 'bars' not 'off')
    await loadVisualizerType();

    // NOW mark as active - visualizer loop will start using Tab Capture data
    persistentCaptureActive = true;
    tabCaptureActive = true;

    // Re-enable visualizer state
    visualizerAutoDisabled = false;
    showEnablePrompt = false;
    blockedTabsCache.set(currentTabId, false); // Tab is no longer blocked
    clearStatus(); // Clear "Extension cannot access audio" message

    // Update UI to reflect new state
    updateVisualizerUnavailableMessage();

    // Restart render loop now that Tab Capture is fully ready
    startVisualizerLoop();

    // Save preference for this site (but not when Tab Capture is the default mode,
    // and not in native mode - Tab Capture is only needed because of native mode)
    const settings = await browserAPI.storage.sync.get(['defaultAudioMode']);
    const defaultMode = settings.defaultAudioMode || 'tabcapture';
    if (defaultMode !== 'tabcapture' && !isDomainDisabled) {
      await saveTabCapturePreference(true);
    }

    console.log('[Visualizer] Persistent capture started successfully');
    return true;

  } catch (e) {
    lastTabCaptureError = e.message || 'Exception during capture start';
    console.error('[Visualizer] Persistent capture error:', e);
    stopTabCapture();
    // Restart render loop even on failure (for Web Audio fallback)
    startVisualizerLoop();
    return false;
  }
}

// Start polling for data from offscreen document
function startPersistentDataPolling() {
  if (persistentDataPollInterval) return;

  persistentDataPollInterval = setInterval(async () => {
    if (!persistentCaptureActive || !currentTabId) return;

    try {
      const response = await browserAPI.runtime.sendMessage({
        type: 'GET_PERSISTENT_VISUALIZER_DATA',
        tabId: currentTabId
      });

      if (response && response.success && response.frequencyData) {
        lastFrequencyData = response.frequencyData;
        lastWaveformData = response.waveformData;
        lastDataReceiveTime = performance.now();
      }
    } catch (e) {
      // Ignore polling errors
    }
  }, PERSISTENT_DATA_POLL_RATE);
}

// Stop polling for persistent data
function stopPersistentDataPolling() {
  if (persistentDataPollInterval) {
    clearInterval(persistentDataPollInterval);
    persistentDataPollInterval = null;
  }
}

// Stop tabCapture and clean up local resources
// Note: Persistent capture in offscreen continues running - we just stop polling
function stopTabCapture() {
  // Stop polling for persistent data
  stopPersistentDataPolling();

  // Clean up local capture resources (if any)
  if (tabCaptureStream) {
    tabCaptureStream.getTracks().forEach(track => track.stop());
    tabCaptureStream = null;
  }

  if (tabCaptureAudioContext) {
    tabCaptureAudioContext.close().catch(() => {});
    tabCaptureAudioContext = null;
  }

  tabCaptureAnalyser = null;
  tabCaptureFreqArray = null;
  tabCaptureWaveArray = null;

  // Clear local state but DON'T stop the offscreen capture
  // The offscreen capture persists across popup opens for this tab
  tabCaptureActive = false;
  persistentCaptureActive = false;
}

// Get frequency data from tabCapture analyser
function getTabCaptureData() {
  if (!tabCaptureActive || !tabCaptureAnalyser) return null;

  tabCaptureAnalyser.getByteFrequencyData(tabCaptureFreqArray);
  tabCaptureAnalyser.getByteTimeDomainData(tabCaptureWaveArray);

  return {
    frequencyData: Array.from(tabCaptureFreqArray),
    waveformData: Array.from(tabCaptureWaveArray)
  };
}

// Auto-start tabCapture if preference is saved for this site
async function autoStartTabCaptureIfNeeded() {
  if (tabCaptureActive || isFirefoxBrowser) return;

  const enabled = await checkTabCapturePreference();
  if (enabled) {
    console.log('[Visualizer] Auto-starting tabCapture for site');
    // Delay slightly to ensure tab is ready
    setTimeout(async () => {
      const success = await startTabCapture();
      if (success) {
        // Update the header toggle to show Tab Capture mode
        if (typeof window.updateAudioModeToggleUI === 'function') {
          window.updateAudioModeToggleUI();
        }
      }
    }, 500);
  }
}

// Handle Tab Capture button click (Chrome only - shown at bottom of popup)
const enableTabCaptureBtn = document.getElementById('enableTabCaptureBtn');
if (enableTabCaptureBtn) {
  enableTabCaptureBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    enableTabCaptureBtn.classList.add('hidden');

    const success = await startTabCapture();
    if (success) {
      // Save Tab Capture as the mode override for this domain
      // This ensures the preference persists across page refresh
      // Uses the same functions as the header toggle for consistency
      const hostname = getCurrentHostname();
      if (hostname) {
        try {
          // Save last active mode
          if (typeof window.saveDomainLastActiveMode === 'function') {
            await window.saveDomainLastActiveMode(hostname, 'tabcapture');
          }
          // Add to Tab Capture override list
          if (typeof window.addToModeOverrideList === 'function') {
            await window.addToModeOverrideList(hostname, 'tabcapture');
          }
          // Remove from Web Audio override list (in case it was there)
          if (typeof window.removeFromModeOverrideList === 'function') {
            await window.removeFromModeOverrideList(hostname, 'webaudio');
          }
          // Also set legacy Tab Capture preference
          await browserAPI.runtime.sendMessage({
            type: 'SET_TAB_CAPTURE_PREF',
            hostname: hostname,
            enabled: true
          });
        } catch (e) {
          console.debug('[Visualizer] Could not save mode override:', e);
        }
      }

      // Update the header icon to show Tab Capture mode
      if (typeof window.updateDisableButtonUI === 'function') {
        window.updateDisableButtonUI();
      }
      // Also update the toggle button UI
      if (typeof window.updateAudioModeToggleUI === 'function') {
        window.updateAudioModeToggleUI();
      }
    } else {
      // Show error feedback
      showStatus('Failed to enable Tab Capture', 'error', 3000);
    }
  });
}

// Handle Native Mode button click (Firefox only - shown at bottom of popup)
const enableNativeModeBtn = document.getElementById('enableNativeModeBtn');
if (enableNativeModeBtn) {
  enableNativeModeBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    enableNativeModeBtn.classList.add('hidden');

    // Call toggleDomainDisabled to enable Native Mode
    // This function is defined in popup-tabs.js
    if (typeof toggleDomainDisabled === 'function') {
      await toggleDomainDisabled();
      // The page will reload after toggling, so no need to update UI
    } else {
      console.error('[Visualizer] toggleDomainDisabled not available');
      showStatus('Failed to enable Native Mode', 'error', 3000);
    }
  });
}

// ==================== Tab Audible Detection ====================
// Detects sites using Web Audio API directly (no media elements)
// by checking if the tab is audible but we have no visualizer data

// Check if current tab is audible
async function isTabAudible() {
  if (!currentTabId) return false;

  try {
    const tab = await browserAPI.tabs.get(currentTabId);
    return tab && tab.audible === true;
  } catch (e) {
    return false;
  }
}

// Start monitoring tab audible state
// Works on both Chrome (offers Tab Capture) and Firefox (offers Native Mode)
function startAudibleDetection() {
  if (audibleCheckInterval) return;

  audibleCheckInterval = setInterval(async () => {
    // Skip if already using tabCapture or auto-disabled
    if (tabCaptureActive || visualizerAutoDisabled) {
      audibleNoDataCount = 0;
      return;
    }

    // Skip if visualizer is off
    if (visualizerType === 'off') {
      audibleNoDataCount = 0;
      return;
    }

    // Check if we've ever had data - if yes, content script method works
    if (hasEverHadData) {
      audibleNoDataCount = 0;
      return;
    }

    // Check if tab is audible
    const audible = await isTabAudible();

    if (audible) {
      // Tab is making sound but we have no visualizer data
      audibleNoDataCount++;
      console.log(`[Visualizer] Tab audible but no data: ${audibleNoDataCount}/${AUDIBLE_NO_DATA_THRESHOLD}`);

      if (audibleNoDataCount >= AUDIBLE_NO_DATA_THRESHOLD) {
        // Tab has been audible for ~3 seconds with no visualizer data
        // This indicates Web Audio API or other non-media-element audio
        // Chrome: will show Tab Capture prompt, Firefox: will show Native Mode prompt
        // Note: Can't auto-start Tab Capture here - requires user gesture
        console.log('[Visualizer] Tab audible detection triggered - showing fallback prompt');
        visualizerAutoDisabled = true;
        visualizerType = 'off';
        blockedTabsCache.set(currentTabId, true); // Cache for instant re-apply on tab switch
        updateVisualizerUnavailableMessage();
        stopAudibleDetection();
      }
    } else {
      // Tab not audible, reset counter
      audibleNoDataCount = 0;
    }
  }, AUDIBLE_CHECK_INTERVAL);
}

// Stop monitoring tab audible state
function stopAudibleDetection() {
  if (audibleCheckInterval) {
    clearInterval(audibleCheckInterval);
    audibleCheckInterval = null;
  }
  audibleNoDataCount = 0;
}

// ==================== Port-Based Data Streaming ====================

// Connect to content script via port for efficient data streaming
function connectVisualizerPort() {
  // Skip if already connected, no tab, restricted page, or domain is in Off mode
  if (visualizerPort || !currentTabId || isRestrictedPage || isDomainDisabled) return;

  try {
    visualizerPort = browserAPI.tabs.connect(currentTabId, { name: 'visualizer' });

    visualizerPort.onMessage.addListener((message) => {
      if (message.type === 'FREQUENCY_DATA') {
        lastDataReceiveTime = performance.now();

        if (message.frequencyData) {
          lastFrequencyData = message.frequencyData;
        }
        if (message.waveformData) {
          lastWaveformData = message.waveformData;
        }

        const hasData = hasAudioData(message.frequencyData);
        const isPlaying = message.isPlaying;
        const isMuted = message.isMuted;

        // Handle data detection and auto-disable logic
        if (hasData) {
          hasEverHadData = true;
          zeroDataCount = 0;
          noDataCount = 0;
          if (visualizerAutoDisabled) {
            visualizerAutoDisabled = false;
            updateVisualizerUnavailableMessage();
            loadVisualizerType();
          }
        } else if (visualizerType !== 'off' && !visualizerAutoDisabled) {
          // Only trigger auto-disable if:
          // 1. Media is actively playing (not paused)
          // 2. Media is not muted (volume > 0 and not muted)
          // 3. We're getting zero frequency data despite the above
          //
          // If media is paused or muted, zero data is expected - don't prompt
          if (isPlaying && !isMuted) {
            zeroDataCount++;
            if (zeroDataCount >= ZERO_DATA_THRESHOLD) {
              visualizerAutoDisabled = true;
              visualizerType = 'off';
              blockedTabsCache.set(currentTabId, true); // Cache for instant re-apply on tab switch
              updateVisualizerUnavailableMessage();
            }
          } else {
            // Media is paused or muted - reset counter, don't accumulate
            zeroDataCount = 0;
          }
        }
      }
    });

    visualizerPort.onDisconnect.addListener(() => {
      // Check lastError to suppress Chrome's "Could not establish connection" console message
      // Accessing lastError tells Chrome we've handled the error
      const error = browserAPI.runtime.lastError;
      if (error) {
        console.debug('[Visualizer] Port disconnected:', error.message);
      }

      visualizerPort = null;
      // Try to reconnect after a short delay (store timer so it can be cancelled)
      portReconnectTimer = setTimeout(() => {
        portReconnectTimer = null;
        if (currentTabId && visualizerAnimationId) {
          connectVisualizerPort();
        }
      }, 500);
    });

  } catch (e) {
    visualizerPort = null;
  }
}

// Disconnect port and cancel any pending reconnect
function disconnectVisualizerPort() {
  // Cancel any pending reconnect timer first
  if (portReconnectTimer) {
    clearTimeout(portReconnectTimer);
    portReconnectTimer = null;
  }

  if (visualizerPort) {
    try {
      visualizerPort.disconnect();
    } catch (e) {}
    visualizerPort = null;
  }
}

// ==================== Animation Loop ====================

// Render loop - just draws using latest cached data
// Data is pushed from content script via port (no polling overhead)
// Or polled from offscreen when using persistent Tab Capture
// Uses setInterval instead of requestAnimationFrame for consistent timing
// (requestAnimationFrame can get erratic when popup is over video-heavy pages like Spotify)
function updateVisualizer() {
  if (!visualizerCanvas) {
    return;
  }

  // If persistent Tab Capture is active, data comes from polling interval
  // (lastFrequencyData/lastWaveformData updated by startPersistentDataPolling)
  if (persistentCaptureActive) {
    // Data is already being updated by polling interval
    // Just proceed to draw
  } else if (tabCaptureActive && tabCaptureAnalyser) {
    // Legacy local Tab Capture - get data directly from analyser
    const data = getTabCaptureData();
    if (data) {
      lastFrequencyData = data.frequencyData;
      lastWaveformData = data.waveformData;
    }
  } else {
    // Ensure port is connected for content script streaming
    // BUT don't reconnect if Tab Capture polling has started (indicates mode switch in progress)
    if (!visualizerPort && currentTabId && !persistentDataPollInterval) {
      connectVisualizerPort();
    }

    // Check for no-data timeout (port not sending data)
    if (visualizerType !== 'off' && !visualizerAutoDisabled) {
      const timeSinceData = performance.now() - lastDataReceiveTime;
      if (lastDataReceiveTime > 0 && timeSinceData > 3000) {
        // No data for 3 seconds - auto-disable
        noDataCount++;
        if (noDataCount >= 30) { // About 1 second at 30fps
          visualizerAutoDisabled = true;
          visualizerType = 'off';
          blockedTabsCache.set(currentTabId, true); // Cache for instant re-apply on tab switch
          updateVisualizerUnavailableMessage();
        }
      } else {
        noDataCount = 0;
      }
    }
  }

  // Draw using latest cached data
  drawVisualizer();
}

// Start the animation loop with fixed interval (30fps = 33ms)
// Using setInterval instead of requestAnimationFrame for consistent timing
const VISUALIZER_FRAME_INTERVAL = 33; // ~30fps

function startVisualizerLoop() {
  if (visualizerAnimationId) return; // Already running
  visualizerAnimationId = setInterval(updateVisualizer, VISUALIZER_FRAME_INTERVAL);
}

function stopVisualizerLoop() {
  if (visualizerAnimationId) {
    clearInterval(visualizerAnimationId);
    visualizerAnimationId = null;
  }
}

// ==================== Start/Stop ====================

// Re-apply all audio settings to Tab Capture after reconnecting
// This ensures settings persist after service worker sleep/wake cycles
async function reapplySettingsToTabCapture() {
  if (!currentTabId || isRestrictedPage) return;

  console.log('[Visualizer] Re-applying settings to Tab Capture');

  // Re-apply volume
  browserAPI.runtime.sendMessage({
    type: 'SET_TAB_CAPTURE_VOLUME',
    tabId: currentTabId,
    volume: currentVolume
  }).catch(() => {});

  // Re-apply bass (convert level to gain using getEffectGain from popup-effects.js)
  if (typeof getEffectGain === 'function') {
    const bassGain = getEffectGain('bass', currentBassBoost);
    browserAPI.runtime.sendMessage({
      type: 'SET_TAB_CAPTURE_BASS',
      tabId: currentTabId,
      gain: bassGain
    }).catch(() => {});

    // Re-apply treble
    const trebleGain = getEffectGain('treble', currentTrebleBoost);
    browserAPI.runtime.sendMessage({
      type: 'SET_TAB_CAPTURE_TREBLE',
      tabId: currentTabId,
      gain: trebleGain
    }).catch(() => {});

    // Re-apply voice
    const voiceGain = getEffectGain('voice', currentVoiceBoost);
    browserAPI.runtime.sendMessage({
      type: 'SET_TAB_CAPTURE_VOICE',
      tabId: currentTabId,
      gain: voiceGain
    }).catch(() => {});
  }

  // Re-apply balance (convert -100 to 100 range to -1 to 1)
  const pan = currentBalance / 100;
  browserAPI.runtime.sendMessage({
    type: 'SET_TAB_CAPTURE_BALANCE',
    tabId: currentTabId,
    pan: pan
  }).catch(() => {});
}

// Check if persistent capture is already active for this tab and reconnect
// Only reconnects if effective mode for this domain is 'tabcapture'
async function checkAndReconnectPersistentCapture() {
  if (isFirefoxBrowser || !currentTabId) return false;

  try {
    // First check if persistent capture is even running for this tab
    const statusResponse = await browserAPI.runtime.sendMessage({
      type: 'GET_PERSISTENT_VISUALIZER_STATUS',
      tabId: currentTabId
    });

    if (!statusResponse || !statusResponse.isActive) {
      return false; // No capture running
    }

    // Capture is running - should we reconnect based on effective mode?
    const currentHostname = currentTabUrl ? getCurrentHostname() : null;
    let effectiveMode = 'webaudio'; // Default fallback

    if (currentHostname) {
      try {
        const response = await browserAPI.runtime.sendMessage({
          type: 'GET_EFFECTIVE_MODE',
          hostname: currentHostname
        });
        if (response && response.success && response.mode) {
          effectiveMode = response.mode;
        }
      } catch (e) {
        console.debug('[Visualizer] Could not get effective mode:', e);
      }
    }

    console.log('[Visualizer] checkAndReconnectPersistentCapture - effective mode:', effectiveMode);

    if (effectiveMode !== 'tabcapture') {
      // Domain should use Web Audio or Off mode - stop the persistent capture
      console.log('[Visualizer] Effective mode is', effectiveMode, '- stopping persistent capture');
      await browserAPI.runtime.sendMessage({
        type: 'STOP_PERSISTENT_VISUALIZER_CAPTURE',
        tabId: currentTabId
      });
      return false;
    }

    // Effective mode is Tab Capture - reconnect
    console.log('[Visualizer] Tab Capture mode - reconnecting to persistent capture');

    // Disconnect Web Audio port to prevent race condition with Tab Capture data
    disconnectVisualizerPort();

    // Reconnect to existing capture
    persistentCaptureActive = true;
    tabCaptureActive = true;
    visualizerAutoDisabled = false;
    showEnablePrompt = false;
    blockedTabsCache.set(currentTabId, false); // Tab is no longer blocked
    clearStatus(); // Clear any blocked status message

    // WARMUP: Poll multiple times before starting the render loop
    // This ensures the analyser's data has stabilized (smoothingTimeConstant needs a few reads)
    // and prevents strobing when reconnecting to already-playing audio
    const WARMUP_POLLS = 4;
    const WARMUP_DELAY = 30; // ms between polls

    for (let i = 0; i < WARMUP_POLLS; i++) {
      try {
        const dataResponse = await browserAPI.runtime.sendMessage({
          type: 'GET_PERSISTENT_VISUALIZER_DATA',
          tabId: currentTabId
        });
        if (dataResponse && dataResponse.success && dataResponse.frequencyData) {
          lastFrequencyData = dataResponse.frequencyData;
          lastWaveformData = dataResponse.waveformData;
          lastDataReceiveTime = performance.now();
        }
      } catch (e) {
        // Ignore - keep trying
      }

      // Small delay between polls to let analyser process more audio
      if (i < WARMUP_POLLS - 1) {
        await new Promise(resolve => setTimeout(resolve, WARMUP_DELAY));
      }
    }

    startPersistentDataPolling();
    loadVisualizerType();
    updateVisualizerUnavailableMessage();

    // Re-apply settings defensively after reconnect (in case service worker woke up)
    reapplySettingsToTabCapture();

    // Update the audio mode button to show Tab Capture is active
    if (typeof updateDisableButtonUI === 'function') {
      updateDisableButtonUI();
    }

    return true;

  } catch (e) {
    console.log('[Visualizer] Error checking persistent capture status:', e);
  }

  return false;
}

// Start visualizer
async function startVisualizer() {
  if (!visualizerCanvas) return;

  resizeVisualizer();

  // Get effective mode for this domain (respects default + all override lists)
  const currentHostname = currentTabUrl ? getCurrentHostname() : null;
  let effectiveMode = isFirefoxBrowser ? 'webaudio' : 'webaudio'; // Default fallback

  if (currentHostname && !isFirefoxBrowser) {
    try {
      const response = await browserAPI.runtime.sendMessage({
        type: 'GET_EFFECTIVE_MODE',
        hostname: currentHostname
      });
      if (response && response.success && response.mode) {
        effectiveMode = response.mode;
      }
    } catch (e) {
      console.debug('[Visualizer] Could not get effective mode:', e);
    }
  }

  console.log('[Visualizer] startVisualizer - effective mode:', effectiveMode);

  // Handle Off/Native mode - skip all audio processing
  if (effectiveMode === 'off') {
    console.log('[Visualizer] Off mode - skipping audio processing');
    visualizerAutoDisabled = true;
    showEnablePrompt = false;
    updateVisualizerUnavailableMessage();
    startVisualizerLoop();
    return;
  }

  // Handle Tab Capture mode (Chrome only)
  if (effectiveMode === 'tabcapture' && !isFirefoxBrowser && currentTabId) {
    // Check if persistent capture is already running for this tab
    const reconnected = await checkAndReconnectPersistentCapture();
    if (reconnected) {
      console.log('[Visualizer] Tab Capture mode - reconnected to persistent capture');
      startVisualizerLoop();
      return;
    }

    // Tab Capture is effective mode but not started yet - auto-start it
    // (Opening popup is a user gesture that allows Tab Capture to start)
    console.log('[Visualizer] Tab Capture mode - auto-starting capture');
    const started = await startTabCapture();
    if (started) {
      console.log('[Visualizer] Tab Capture auto-started successfully');
      // Update the header toggle to reflect Tab Capture mode
      if (typeof window.updateAudioModeToggleUI === 'function') {
        window.updateAudioModeToggleUI();
      }
      startVisualizerLoop();
      return;
    }

    // Auto-start failed - show prompt as fallback
    console.log('[Visualizer] Tab Capture auto-start failed - showing enable prompt');
    visualizerAutoDisabled = true;
    showEnablePrompt = true;
    updateVisualizerUnavailableMessage();
    startVisualizerLoop();
    return;
  }

  // Auto mode: Check if persistent capture is already running for this tab
  if (!isFirefoxBrowser && currentTabId) {
    const reconnected = await checkAndReconnectPersistentCapture();
    if (reconnected) {
      console.log('[Visualizer] Reconnected to persistent capture - no click needed');
      startVisualizerLoop();
      return;
    }
  }

  // In native mode (per-domain), immediately show Tab Capture prompt since content script can't access audio
  // (we don't intercept Web Audio API in native mode - Tab Capture is the only option)
  // Note: Tab Capture requires user gesture, so we can't auto-start it
  if (isDomainDisabled && !isFirefoxBrowser && !tabCaptureActive) {
    const featureEnabled = await isTabCaptureFeatureEnabled();
    if (featureEnabled) {
      console.log('[Visualizer] Native mode detected - showing Tab Capture prompt');
      visualizerAutoDisabled = true;
      showEnablePrompt = true;
      blockedTabsCache.set(currentTabId, true);
      updateVisualizerUnavailableMessage();
      startVisualizerLoop();
      return;
    }
  }

  // Start tab audible detection for Web Audio API sites
  startAudibleDetection();

  // Start the visualizer loop for content script mode
  startVisualizerLoop();
}

// Stop visualizer (called when popup closes or before page refresh)
function stopVisualizer() {
  stopVisualizerLoop();
  disconnectVisualizerPort();
  stopTabCapture();
  stopAudibleDetection();
}
// Expose for popup-tabs.js to call before page refresh
window.stopVisualizer = stopVisualizer;

// Reset visualizer state when switching tabs or modes
async function resetVisualizerState() {
  // Reset detection counters
  zeroDataCount = 0;
  noDataCount = 0;
  hasEverHadData = false;
  visualizerAutoDisabled = false;
  activeTabPermissionError = false;
  showEnablePrompt = false;
  lastDataReceiveTime = 0;
  lastFrequencyData = null;
  lastWaveformData = null;
  audibleNoDataCount = 0;

  // Note: Don't remove 'audio-blocked' class here - let updateVisualizerUnavailableMessage()
  // handle it after async checks complete. This prevents controls from briefly appearing
  // enabled when switching between tabs.

  // Clean up port connection
  disconnectVisualizerPort();

  // Clean up local tabCapture state (persistent capture continues in offscreen)
  stopTabCapture();

  // Stop audible detection
  stopAudibleDetection();

  // Get effective mode for this domain (respects default + all override lists)
  const currentHostname = currentTabUrl ? getCurrentHostname() : null;
  let effectiveMode = 'webaudio'; // Default fallback

  if (currentHostname && !isFirefoxBrowser) {
    try {
      const response = await browserAPI.runtime.sendMessage({
        type: 'GET_EFFECTIVE_MODE',
        hostname: currentHostname
      });
      if (response && response.success && response.mode) {
        effectiveMode = response.mode;
      }
    } catch (e) {
      console.debug('[Visualizer] Could not get effective mode:', e);
    }
  }

  console.log('[Visualizer] resetVisualizerState - effective mode:', effectiveMode);

  // Handle Native/Off mode - skip all audio processing
  if (effectiveMode === 'off') {
    visualizerAutoDisabled = true;
    showEnablePrompt = false;
    updateVisualizerUnavailableMessage();
    return;
  }

  // Handle Tab Capture mode (Chrome only)
  if (effectiveMode === 'tabcapture' && !isFirefoxBrowser && currentTabId) {
    const reconnected = await checkAndReconnectPersistentCapture();
    if (reconnected) {
      console.log('[Visualizer] Tab Capture mode - reconnected on tab switch');
      updateVisualizerUnavailableMessage();
      return;
    }
    // Not connected yet - auto-start Tab Capture for this tab
    console.log('[Visualizer] Tab Capture mode - auto-starting on tab switch');
    const started = await startTabCapture();
    if (started) {
      console.log('[Visualizer] Tab Capture auto-started on tab switch');
      // Update the header toggle to reflect Tab Capture mode
      if (typeof window.updateAudioModeToggleUI === 'function') {
        window.updateAudioModeToggleUI();
      }
      updateVisualizerUnavailableMessage();
      return;
    }
    // Auto-start failed - check if tab is actually playing audio
    try {
      const tab = await browserAPI.tabs.get(currentTabId);
      if (tab && tab.audible) {
        // Tab is playing but capture failed - show prompt
        console.log('[Visualizer] Tab Capture failed but tab is audible - showing prompt');
        visualizerAutoDisabled = true;
        showEnablePrompt = true;
      } else {
        // Tab is paused/silent - Tab Capture failed likely due to no audio stream
        // Don't show error, just show normal state - capture will be retried when user clicks play
        console.log('[Visualizer] Tab Capture mode - tab not audible, showing normal state');
        // Don't start audible detection here - it can't start Tab Capture without user gesture
        // User will need to click "Enable Tab Capture" when they start playing
      }
    } catch (e) {
      // Fallback: show prompt if we can't check
      visualizerAutoDisabled = true;
      showEnablePrompt = true;
    }
    updateVisualizerUnavailableMessage();
    return;
  }

  // Auto mode: Check if persistent capture is already running for this tab
  if (!isFirefoxBrowser && currentTabId) {
    const reconnected = await checkAndReconnectPersistentCapture();
    if (reconnected) {
      console.log('[Visualizer] Reconnected to persistent capture on tab switch');
      updateVisualizerUnavailableMessage();
      return;
    }
  }

  // In native mode (per-domain), show Tab Capture prompt immediately
  if (isDomainDisabled && !isFirefoxBrowser) {
    const featureEnabled = await isTabCaptureFeatureEnabled();
    if (featureEnabled) {
      console.log('[Visualizer] Native mode detected on tab switch - showing Tab Capture prompt');
      visualizerAutoDisabled = true;
      showEnablePrompt = true;
      blockedTabsCache.set(currentTabId, true);
    }
  } else if (blockedTabsCache.get(currentTabId) === true) {
    // Tab was previously detected as blocked - but only apply if tab is currently audible
    // If tab is not audible (paused/silent), don't show blocked state - audio silence is expected
    try {
      const tab = await browserAPI.tabs.get(currentTabId);
      if (tab && tab.audible) {
        // Tab is playing audio but we can't capture it - show blocked prompt
        console.log('[Visualizer] Tab cached as blocked and currently audible - applying immediately');
        const featureEnabled = await isTabCaptureFeatureEnabled();
        if (featureEnabled) {
          visualizerAutoDisabled = true;
          showEnablePrompt = true;
        }
      } else {
        // Tab is not audible (paused/silent) - don't show blocked state
        console.log('[Visualizer] Tab cached as blocked but not audible - not applying blocked state');
        // Start audible detection in case it starts playing later
        startAudibleDetection();
      }
    } catch (e) {
      // Fallback: apply cached state if we can't check audible status
      console.log('[Visualizer] Tab cached as blocked - applying (could not check audible state)');
      const featureEnabled = await isTabCaptureFeatureEnabled();
      if (featureEnabled) {
        visualizerAutoDisabled = true;
        showEnablePrompt = true;
      }
    }
  } else {
    // Normal mode - use audible detection for fallback
    startAudibleDetection();
  }

  // Reset UI indicators
  updateVisualizerUnavailableMessage();
}
// Expose for popup-tabs.js to call after mode switch
window.resetVisualizerState = resetVisualizerState;
