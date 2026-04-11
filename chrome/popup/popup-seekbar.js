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

// Play/pause icon state (driven by seekbar poll, not by click)
const _mediaBtn = document.getElementById('mediaToggleBtn');
const _pauseIcon = _mediaBtn?.querySelector('.pause-icon');
const _playIcon = _mediaBtn?.querySelector('.play-icon');

function updatePlayPauseIcon(paused) {
  if (!_pauseIcon || !_playIcon) return;
  _pauseIcon.classList.toggle('hidden', paused);
  _playIcon.classList.toggle('hidden', !paused);
  if (_mediaBtn) {
    _mediaBtn.setAttribute('aria-label', paused ? 'Play' : 'Pause');
  }
}

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

      // Update play/pause icon from media state
      updatePlayPauseIcon(!!response.position.paused);

      // Live stream: show seekbar with "0:00" and "LIVE"
      if (!duration || !isFinite(duration) || duration <= 0) {
        if (response.position.live) {
          seekbarRow.classList.add('has-media');
          seekbarCurrentTime.textContent = '0:00';
          seekbarDuration.textContent = 'LIVE';
          seekbarDuration.classList.remove('seekbar-duration-toggle');
          seekbarSlider.value = 0;
          seekbarSlider.disabled = true;
          seekbarFill.style.width = '0%';
        } else {
          seekbarRow.classList.remove('has-media');
          seekbarSlider.disabled = true;
        }
        return;
      }

      seekbarRow.classList.add('has-media');
      seekbarSlider.disabled = false;
      if (!seekbarDuration.classList.contains('seekbar-duration-toggle')) {
        seekbarDuration.classList.add('seekbar-duration-toggle');
        updateDurationTooltip();
      }
      // Floor elapsed time once, then derive remaining from it so both labels
      // tick at the exact same moment (avoids fractional-second desync)
      const elapsed = Math.floor(currentTime);
      seekbarCurrentTime.textContent = formatTime(elapsed);
      if (showRemaining) {
        seekbarDuration.textContent = '-' + formatTime(duration - elapsed);
      } else {
        seekbarDuration.textContent = formatTime(duration);
      }
      const pct = (currentTime / duration) * 100;
      seekbarSlider.value = pct;
      seekbarFill.style.width = `${pct}%`;
      seekbarSlider.setAttribute('aria-valuenow', Math.round(pct));
    } else {
      seekbarRow.classList.remove('has-media');
      seekbarSlider.disabled = true;
      updatePlayPauseIcon(false);
    }
  } catch {
    seekbarRow.classList.remove('has-media');
    seekbarSlider.disabled = true;
    updatePlayPauseIcon(false);
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
  seekbarSlider.disabled = true;
  seekbarFill.style.width = '0%';
  seekbarCurrentTime.textContent = '0:00';
  seekbarDuration.textContent = '0:00';
  updatePlayPauseIcon(false);
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
seekbarSlider.addEventListener('touchcancel', () => { isSeeking = false; });
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

// Click handler: toggle between total and remaining (skip for live streams)
seekbarDuration.addEventListener('click', () => {
  if (seekbarDuration.textContent === 'LIVE') return;
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
