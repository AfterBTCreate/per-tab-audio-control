// Shared Browser API Compatibility Layer
// Used by: popup, options, permissions
// Note: content.js and background.js define their own due to load order requirements

'use strict';

// Browser API compatibility - works for Chrome and Firefox
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
const isFirefox = typeof browser !== 'undefined';

// Debug logging utilities
const DEBUG = false;
const createLogger = (prefix) => ({
  log: (...args) => DEBUG && console.log(prefix, ...args),
  debug: (...args) => DEBUG && console.debug(prefix, ...args),
  warn: (...args) => console.warn(prefix, ...args),
  error: (...args) => console.error(prefix, ...args)
});
