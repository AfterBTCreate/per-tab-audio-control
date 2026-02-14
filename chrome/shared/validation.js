// Shared Validation Utilities
// Used by: background, popup, options

'use strict';

// Validate volume is within acceptable range
function validateVolume(value) {
  if (typeof value !== 'number' || isNaN(value)) {
    return VOLUME_DEFAULT;
  }
  return Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, Math.round(value)));
}

// Sanitize hostname for storage keys
function sanitizeHostname(hostname) {
  if (!hostname || typeof hostname !== 'string') {
    return null;
  }
  hostname = hostname.toLowerCase().trim();
  if (hostname.length === 0 || hostname.length > 253) {
    return null;
  }
  // Only allow valid hostname characters
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(hostname) && !/^[a-z0-9]$/.test(hostname)) {
    return null;
  }
  if (/\.\./.test(hostname)) {
    return null;
  }
  return hostname;
}

// Validate URL and extract sanitized hostname
function getValidatedHostname(url) {
  try {
    const urlObj = new URL(url);
    return sanitizeHostname(urlObj.hostname);
  } catch (e) {
    return null;
  }
}

// Validate hostname string (returns boolean)
// KEEP IN SYNC with content.js isValidHostname() and page-script.js isValidHostname()
function isValidHostname(hostname) {
  return sanitizeHostname(hostname) !== null;
}

// Validate effect value is within range
function validateEffectValue(value, effectType) {
  const range = EFFECT_RANGES[effectType];
  if (!range) return 0;
  if (typeof value !== 'number' || isNaN(value)) {
    return range.default;
  }
  return Math.max(range.min, Math.min(range.max, value));
}

// Validate balance value (-100 to 100)
function validateBalance(value) {
  if (typeof value !== 'number' || isNaN(value)) {
    return 0;
  }
  return Math.max(-100, Math.min(100, Math.round(value)));
}
