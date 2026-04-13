// Per-Tab Audio Control - Popup Recording Module
// Handles recording button UI, timer display, disclaimer dialog, and download triggering

'use strict';

// ==================== Recording State ====================
let isRecording = false;
let recordingTabId = null; // Which tab is actually being recorded
let recordingStartTime = 0;
let recordingTimerInterval = null;
let checkingRecordingStatus = false;

// Tracks which tab IDs have accepted the recording disclaimer this popup
// session. Acceptance is INTENTIONALLY not persisted across popup opens: the
// disclaimer is a legal-compliance surface and we want the user to see it
// fresh each time the popup opens rather than defaulting to their historical
// consent. This is a product decision, not an oversight. (#27)
const recordingConsentedTabs = new Set();

// ==================== DOM References ====================
const recordBtn = document.getElementById('recordBtn');
const disclaimerOverlay = document.getElementById('recordingDisclaimerOverlay');
const disclaimerAcceptBtn = document.getElementById('disclaimerAcceptBtn');
const disclaimerCancelBtn = document.getElementById('disclaimerCancelBtn');

// ==================== Recording Functions ====================

// Format duration as MM:SS or HH:MM:SS
function formatRecordingDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Format file size for display
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Sanitize tab title for use as filename
function sanitizeFilename(title) {
  return title
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '') // Remove invalid chars
    .replace(/\s+/g, '_') // Spaces to underscores
    .substring(0, 100) // Limit length
    .replace(/^\.+/, '') // No leading dots
    || 'recording'; // Fallback
}

// Start recording timer display via status bar
// If resumeFromMs is provided, the timer starts from that elapsed time (popup reopen case)
function startRecordingTimer(resumeFromMs) {
  if (resumeFromMs) {
    recordingStartTime = Date.now() - resumeFromMs;
  } else {
    recordingStartTime = Date.now();
  }

  showStatus(`Recording  ●  ${formatRecordingDuration(Date.now() - recordingStartTime)}`, 'error', 0);

  recordingTimerInterval = setInterval(() => {
    const elapsed = Date.now() - recordingStartTime;
    showStatus(`Recording  ●  ${formatRecordingDuration(elapsed)}`, 'error', 0);
  }, 1000);
}

// Stop recording timer display
function stopRecordingTimer() {
  if (recordingTimerInterval) {
    clearInterval(recordingTimerInterval);
    recordingTimerInterval = null;
  }
  // Restore focus mode reminder if active (onStatusExpiredCallback = showFocusReminder)
  if (typeof onStatusExpiredCallback === 'function') {
    onStatusExpiredCallback();
  }
}

// Update recording button visual state
// Three states: recording (this tab), disabled (another tab recording), idle
function updateRecordButtonState(recording) {
  if (!recordBtn) return;
  isRecording = recording;
  const otherTabRecording = !recording && recordingTabId && recordingTabId !== currentTabId;

  recordBtn.classList.toggle('recording', recording);
  recordBtn.disabled = otherTabRecording;

  if (recording) {
    recordBtn.title = 'Stop recording';
    recordBtn.setAttribute('aria-label', 'Stop recording');
  } else if (otherTabRecording) {
    recordBtn.title = 'Stop current recording first';
    recordBtn.setAttribute('aria-label', 'Recording in progress on another tab');
  } else {
    recordBtn.title = 'Record tab audio';
    recordBtn.setAttribute('aria-label', 'Record tab audio');
  }
}

// Show disclaimer dialog the first time recording is started for each tab
function showDisclaimerIfNeeded() {
  // Already consented for this tab this session
  if (currentTabId && recordingConsentedTabs.has(currentTabId)) {
    return Promise.resolve(true);
  }

  // Show dialog
  return new Promise((resolve) => {
    // Fail closed: if the disclaimer DOM is missing for any reason, do NOT
    // start recording. Better to surface a visible failure than to silently
    // bypass consent. (#23)
    if (!disclaimerOverlay || !disclaimerAcceptBtn || !disclaimerCancelBtn) {
      console.error('[TabVolume] Recording disclaimer DOM missing — refusing to record.');
      resolve(false);
      return;
    }

    disclaimerOverlay.classList.add('visible');
    openDialog(disclaimerOverlay, {
      initialFocus: disclaimerCancelBtn,
      returnFocusTo: recordBtn
    });

    const cleanup = () => {
      disclaimerOverlay.classList.remove('visible');
      disclaimerAcceptBtn.removeEventListener('click', handleAccept);
      disclaimerCancelBtn.removeEventListener('click', handleCancel);
      disclaimerOverlay.removeEventListener('keydown', handleEscape);
      closeDialog(disclaimerOverlay);
    };

    const handleAccept = () => {
      cleanup();
      if (currentTabId) recordingConsentedTabs.add(currentTabId);
      resolve(true);
    };

    const handleCancel = () => {
      cleanup();
      resolve(false);
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') handleCancel();
    };

    disclaimerAcceptBtn.addEventListener('click', handleAccept);
    disclaimerCancelBtn.addEventListener('click', handleCancel);
    disclaimerOverlay.addEventListener('keydown', handleEscape);
  });
}

// Start recording
async function startRecording() {
  if (!currentTabId || isRecording) return;

  // Show disclaimer on first use
  const accepted = await showDisclaimerIfNeeded();
  if (!accepted) return;

  // Get recording settings
  const settings = await browserAPI.storage.sync.get([
    'recordingFormat', 'recordingBitrate', 'recordingSampleRate'
  ]);
  const format = settings.recordingFormat ?? DEFAULTS.recordingFormat;
  const bitrate = settings.recordingBitrate ?? DEFAULTS.recordingBitrate;
  const sampleRate = settings.recordingSampleRate ?? DEFAULTS.recordingSampleRate;

  try {
    const response = await browserAPI.runtime.sendMessage({
      type: 'START_RECORDING',
      tabId: currentTabId,
      format,
      bitrate,
      sampleRate
    });

    if (response && response.success) {
      recordingTabId = currentTabId;
      updateRecordButtonState(true);
      startRecordingTimer();
    } else {
      const errorMsg = response?.error || 'Failed to start recording';
      showStatus(errorMsg, 'error', 4000);
    }
  } catch (e) {
    showStatus('Recording failed: ' + e.message, 'error', 4000);
  }
}

// Stop recording and trigger download
async function stopRecording() {
  if (!recordingTabId || !isRecording) return;

  const stoppingTabId = recordingTabId;
  try {
    const response = await browserAPI.runtime.sendMessage({
      type: 'STOP_RECORDING',
      tabId: stoppingTabId
    });

    if (response && response.success) {
      // Only update UI after confirmed stop
      recordingTabId = null;
      updateRecordButtonState(false);
      stopRecordingTimer();
      // Generate filename from tab title
      const tabTitleEl = document.getElementById('tabTitle');
      const tabTitleText = tabTitleEl ? tabTitleEl.textContent : 'recording';
      const sanitized = sanitizeFilename(tabTitleText);
      const now = new Date();
      const dateStr = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
      ].join('-');
      const timeStr = [
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0')
      ].join('-');

      const ext = response.format || 'mp3';
      const filename = `${sanitized}_${dateStr}_${timeStr}.${ext}`;

      // Trigger download via background
      const dlResponse = await browserAPI.runtime.sendMessage({
        type: 'DOWNLOAD_RECORDING',
        blobUrl: response.blobUrl,
        filename: filename
      });

      if (dlResponse && dlResponse.success) {
        const sizeStr = formatFileSize(response.size);
        const durStr = formatRecordingDuration(response.duration);
        showStatus(`Saved ${durStr} (${sizeStr})`, 'success', 5000);
      } else {
        showStatus('Download failed: ' + (dlResponse?.error || 'unknown'), 'error', 5000);
      }
    } else {
      // Stop failed - keep recording state so user can retry
      showStatus('Stop failed: ' + (response?.error || 'unknown'), 'error', 4000);
    }
  } catch (e) {
    // On error, reset UI since state is uncertain
    recordingTabId = null;
    updateRecordButtonState(false);
    stopRecordingTimer();
    showStatus('Recording error: ' + e.message, 'error', 4000);
  }
}

// Toggle recording on/off
async function toggleRecording() {
  if (isRecording) {
    await stopRecording();
  } else {
    await startRecording();
  }
}

// Check recording status across all tabs
// Called on popup open and on tab switch
async function checkRecordingStatus() {
  if (!currentTabId) return;
  if (checkingRecordingStatus) return;
  checkingRecordingStatus = true;

  try {
    const response = await browserAPI.runtime.sendMessage({
      type: 'GET_ANY_RECORDING_STATUS'
    });

    if (response && response.recording) {
      recordingTabId = response.tabId;
      if (response.tabId === currentTabId) {
        // This tab is recording
        updateRecordButtonState(true);
        stopRecordingTimer();
        startRecordingTimer(response.duration);
      } else {
        // Another tab is recording
        updateRecordButtonState(false);
        stopRecordingTimer();
      }
    } else {
      // Nothing is recording
      recordingTabId = null;
      updateRecordButtonState(false);
      stopRecordingTimer();
    }
  } catch (e) {
    updateRecordButtonState(false);
    stopRecordingTimer();
  } finally {
    checkingRecordingStatus = false;
  }
}

// ==================== Event Handlers ====================

if (recordBtn) {
  recordBtn.addEventListener('click', toggleRecording);
}

// Hook into popup initialization to check recording status
// We observe currentTabId changes since it's set asynchronously
let lastCheckedTabId = null;
const recordingStatusChecker = setInterval(() => {
  // Defense-in-depth against rapid popup open/close: skip if the popup DOM
  // is no longer connected. (#33)
  if (!document.body || !document.body.isConnected) {
    clearInterval(recordingStatusChecker);
    return;
  }
  if (currentTabId && currentTabId !== lastCheckedTabId) {
    lastCheckedTabId = currentTabId;
    checkRecordingStatus();
    clearInterval(recordingStatusChecker);
  }
}, 100);

// Clear interval after 5 seconds if tab never loaded
setTimeout(() => clearInterval(recordingStatusChecker), 5000);

// Also clear on popup unload as a belt-and-suspenders measure. Chrome tears
// down popup state on close, but this is explicit. (#33)
window.addEventListener('pagehide', () => clearInterval(recordingStatusChecker), { once: true });
