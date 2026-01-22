// Per-Tab Audio Control - Options Utilities
// Shared utility functions for options page

// Show status message on any status element
function showStatus(statusElement, message, type = 'success') {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.className = 'status ' + type;

  setTimeout(() => {
    statusElement.className = 'status';
  }, 3000);
}

// Get volume color class based on level
function getVolumeClass(volume) {
  if (volume === 0) return 'muted';
  if (volume >= 351) return 'ultra';
  if (volume >= 201) return 'extreme';
  if (volume >= 101) return 'high';
  if (volume >= 51) return 'boosted';
  return 'reduced';
}

// Update input-group color based on volume value
function updateInputColor(input) {
  const inputGroup = input.closest('.input-group');
  if (!inputGroup) return;

  const volume = parseInt(input.value) || 0;
  const colorClass = getVolumeClass(volume);

  // Remove all color classes and add the new one
  inputGroup.classList.remove('muted', 'reduced', 'boosted', 'high', 'extreme', 'ultra');
  inputGroup.classList.add(colorClass);
}

// Format effect level for display
function formatEffectLevel(level) {
  if (!level || level === 'off') return null;
  return level.charAt(0).toUpperCase() + level.slice(1);
}

// Format last used date for display
function formatLastUsed(lastUsed) {
  if (!lastUsed) return 'Never';

  const now = Date.now();
  const diff = now - lastUsed;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return months === 1 ? '1 month ago' : `${months} months ago`;
  }
  const years = Math.floor(days / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

// Clamp volume input to valid range (1-500)
function clampVolumeInput(input) {
  let value = parseInt(input.value, 10);
  if (isNaN(value) || value < 1) value = 1;
  if (value > 500) value = 500;
  input.value = value;
}

// Clamp input to valid range based on level and range config
function clampRangeInput(input, level, ranges) {
  let value = parseInt(input.value, 10);
  const range = ranges[level];
  if (isNaN(value) || value < range.min) value = range.min;
  if (value > range.max) value = range.max;
  input.value = value;
}
