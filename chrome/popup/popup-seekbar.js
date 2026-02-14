'use strict';

// ==================== Seekbar ====================
// Playback position seekbar for audio/video media elements.
// Polls the content script for currentTime/duration and allows seeking.

const seekbarRow = document.getElementById('seekbarRow');
const seekbarSlider = document.getElementById('seekbarSlider');
const seekbarFill = document.getElementById('seekbarFill');
const seekbarCurrentTime = document.getElementById('seekbarCurrentTime');
const seekbarDuration = document.getElementById('seekbarDuration');

let seekbarInterval = null;
let isSeeking = false;  // True while user is dragging or seek is in flight
let showRemaining = false;  // True = show "-M:SS" remaining, false = show total duration

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function pollMediaPosition() {
  if (!currentTabId || isSeeking) return;
  try {
    const response = await browserAPI.tabs.sendMessage(currentTabId, {
      type: 'GET_MEDIA_POSITION'
    });
    if (response?.success && response.position) {
      const { currentTime, duration } = response.position;
      if (!duration || !isFinite(duration) || duration <= 0) {
        seekbarRow.classList.remove('has-media');
        return;
      }
      seekbarRow.classList.add('has-media');
      if (showRemaining) {
        seekbarCurrentTime.textContent = formatTime(duration);
        seekbarDuration.textContent = '-' + formatTime(duration - currentTime);
      } else {
        seekbarCurrentTime.textContent = formatTime(currentTime);
        seekbarDuration.textContent = formatTime(duration);
      }
      const pct = (currentTime / duration) * 100;
      seekbarSlider.value = pct;
      seekbarFill.style.width = `${pct}%`;
      seekbarSlider.setAttribute('aria-valuenow', Math.round(pct));
    } else {
      seekbarRow.classList.remove('has-media');
    }
  } catch {
    seekbarRow.classList.remove('has-media');
  }
}

function startSeekbarPolling() {
  stopSeekbarPolling();
  pollMediaPosition(); // Immediate first poll
  seekbarInterval = setInterval(pollMediaPosition, 500);
}

function stopSeekbarPolling() {
  if (seekbarInterval) {
    clearInterval(seekbarInterval);
    seekbarInterval = null;
  }
}

function resetSeekbar() {
  stopSeekbarPolling();
  seekbarRow.classList.remove('has-media');
  seekbarSlider.value = 0;
  seekbarFill.style.width = '0%';
  seekbarCurrentTime.textContent = '0:00';
  seekbarDuration.textContent = '0:00';
}

// Drag handling
seekbarSlider.addEventListener('mousedown', () => { isSeeking = true; });
seekbarSlider.addEventListener('touchstart', () => { isSeeking = true; }, { passive: true });
// Clear stuck flag if mouse leaves slider during drag
seekbarSlider.addEventListener('mouseleave', () => { if (isSeeking) commitSeek(); });

seekbarSlider.addEventListener('input', () => {
  // Update fill visually while dragging
  seekbarFill.style.width = `${seekbarSlider.value}%`;
});

async function commitSeek() {
  if (!currentTabId) {
    isSeeking = false;
    return;
  }
  try {
    // Get current duration to compute absolute time
    const response = await browserAPI.tabs.sendMessage(currentTabId, {
      type: 'GET_MEDIA_POSITION'
    });
    if (response?.success && response.position && response.position.duration > 0) {
      const seekTime = (seekbarSlider.value / 100) * response.position.duration;
      await browserAPI.tabs.sendMessage(currentTabId, {
        type: 'SEEK_MEDIA',
        time: seekTime
      });
    }
  } catch (e) {
    console.debug('[Seekbar] Seek failed:', e);
  } finally {
    isSeeking = false;
  }
}

seekbarSlider.addEventListener('mouseup', commitSeek);
seekbarSlider.addEventListener('touchend', commitSeek);
// Also handle change for keyboard arrow-key seeks
seekbarSlider.addEventListener('change', () => {
  if (!isSeeking) {
    isSeeking = true;
    commitSeek();
  }
});

// ==================== Time Display Toggle ====================

function updateDurationTooltip() {
  seekbarDuration.title = showRemaining
    ? 'Click to show current time'
    : 'Click to show time remaining';
}

// Load preference on init
browserAPI.storage.sync.get(['seekbarTimeDisplay']).then(result => {
  const pref = result.seekbarTimeDisplay ?? DEFAULTS.seekbarTimeDisplay;
  showRemaining = pref === 'remaining';
  seekbarDuration.classList.add('seekbar-duration-toggle');
  updateDurationTooltip();
});

// Click handler: toggle between total and remaining
seekbarDuration.addEventListener('click', () => {
  showRemaining = !showRemaining;
  browserAPI.storage.sync.set({
    seekbarTimeDisplay: showRemaining ? 'remaining' : 'total'
  });
  updateDurationTooltip();
  pollMediaPosition();
});

// Live sync from options page changes
browserAPI.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.seekbarTimeDisplay) {
    showRemaining = changes.seekbarTimeDisplay.newValue === 'remaining';
    updateDurationTooltip();
  }
});
