// Per-Tab Audio Control - Content Script (ISOLATED world)
// Cross-browser compatible (Chrome & Firefox)
// Handles browser API communication and bridges to page script
// v4.0.3 - AudioContext autoplay fix

(function() {
  'use strict';

  console.log('[TabVolume] Content script v4.0.3 loaded');

  if (window.__tabVolumeControlContentInjected) return;
  window.__tabVolumeControlContentInjected = true;

  // Debug flag - set to true for verbose logging during development
  const DEBUG = false;
  const log = (...args) => DEBUG && console.log('[Content]', ...args);
  const logDebug = (...args) => DEBUG && console.debug('[Content]', ...args);

  // Browser API compatibility layer (needed for disabled domain handler)
  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
  const isFirefox = typeof browser !== 'undefined';

  // Helper function to toggle play/pause with multiple fallback methods
  // Works on sites like Spotify where direct media element control fails
  function toggleMediaPlayPause() {
    let success = false;
    let isPlaying = null;

    // Method 1: Find and click play/pause button FIRST (works on Spotify, YouTube, etc.)
    // This must come first because sites like Spotify have video elements (album art)
    // that respond to play/pause but don't control the actual music playback
    const playPauseSelectors = [
      // Spotify - data-testid selectors
      '[data-testid=control-button-playpause]',
      '[data-testid=control-button-play]',
      '[data-testid=control-button-pause]',
      // Spotify - class-based selectors (older versions)
      '.control-button.spoticon-play-16',
      '.control-button.spoticon-pause-16',
      // YouTube
      '.ytp-play-button',
      // Video.js (common HTML5 player library)
      '.vjs-play-control',
      '.vjs-big-play-button',
      // Generic patterns (aria labels)
      'button[aria-label*="Play" i]:not([aria-label*="Playback" i])',
      'button[aria-label*="Pause" i]',
      '[role="button"][aria-label*="Play" i]',
      '[role="button"][aria-label*="Pause" i]',
      // Common class patterns
      '.play-pause-button',
      '.playPauseButton',
      '.player-play-pause'
    ];

    for (const selector of playPauseSelectors) {
      try {
        const btn = document.querySelector(selector);
        // Check if element exists and is reasonably visible
        if (btn && (btn.offsetParent !== null || btn.offsetWidth > 0 || btn.offsetHeight > 0)) {
          btn.click();
          success = true;
          // Determine play state from aria-label if available
          const ariaLabel = btn.getAttribute('aria-label') || '';
          if (ariaLabel.toLowerCase().includes('pause')) {
            isPlaying = true; // Was playing, now paused
          } else if (ariaLabel.toLowerCase().includes('play')) {
            isPlaying = false; // Was paused, now playing
          }
          break;
        }
      } catch (e) {
        // Selector might be invalid, continue
      }
    }

    // Method 2: Try standard audio/video elements (fallback for simple sites)
    if (!success) {
      const mediaElements = document.querySelectorAll('audio, video');
      if (mediaElements.length > 0) {
        const anyPlaying = Array.from(mediaElements).some(el => !el.paused);

        mediaElements.forEach(element => {
          if (anyPlaying) {
            element.pause();
          } else if (element.readyState >= 1) {
            element.play().catch(() => {});
          }
        });

        // Check if state changed (verify we actually controlled playback)
        const newAnyPlaying = Array.from(mediaElements).some(el => !el.paused);
        if (anyPlaying !== newAnyPlaying) {
          success = true;
          isPlaying = newAnyPlaying;
        }
      }
    }

    // Method 3: Keyboard simulation (space key) - last resort
    if (!success) {
      try {
        // Find a focusable player element or use document body
        const playerSelectors = [
          '[data-testid="now-playing-bar"]', // Spotify
          '.html5-video-player', // YouTube
          '[role="application"]',
          '.player',
          'video',
          'audio'
        ];

        let target = document.body;
        for (const selector of playerSelectors) {
          const el = document.querySelector(selector);
          if (el) {
            target = el;
            break;
          }
        }

        const spaceEvent = new KeyboardEvent('keydown', {
          key: ' ',
          code: 'Space',
          keyCode: 32,
          which: 32,
          bubbles: true,
          cancelable: true,
          view: window
        });
        target.dispatchEvent(spaceEvent);

        // Also dispatch keyup for completeness
        const spaceUpEvent = new KeyboardEvent('keyup', {
          key: ' ',
          code: 'Space',
          keyCode: 32,
          which: 32,
          bubbles: true,
          cancelable: true,
          view: window
        });
        target.dispatchEvent(spaceUpEvent);

        success = true;
      } catch (e) {
        // Keyboard simulation failed
      }
    }

    return { success, isPlaying };
  }

  // Security: Validate hostname before using in storage keys
  function isValidHostname(hostname) {
    if (!hostname || typeof hostname !== 'string') return false;
    if (hostname.length > 253) return false;
    // Only allow valid hostname characters (alphanumeric, dots, hyphens)
    return /^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$/.test(hostname) || /^[a-zA-Z0-9]$/.test(hostname);
  }

  // CRITICAL: Synchronous disabled domain check BEFORE any setup
  // This must happen before event listeners, observers, or any functionality is initialized.
  // We use localStorage because it's synchronous and accessible from content scripts.
  // The page-script.js also does this check to avoid patching Web Audio APIs.
  try {
    const hostname = window.location.hostname;
    if (!isValidHostname(hostname)) {
      log('Invalid hostname, skipping disabled check');
    }
    const disabledKey = '__tabVolumeControl_disabled_' + hostname;
    const isDisabled = localStorage.getItem(disabledKey) === 'true';
    if (isDisabled) {
      console.log('[TabVolume] content.js: Domain is DISABLED, setting up minimal handler');
      window.__tabVolumeContentDisabled = true; // Debug marker

      // Report media to background so disabled tabs show in tab navigation
      function reportMediaIfPresent() {
        const mediaElements = document.querySelectorAll('audio, video');
        if (mediaElements.length > 0) {
          browserAPI.runtime.sendMessage({ type: 'HAS_MEDIA' }).catch(() => {});
        }
      }

      // Check for existing media
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', reportMediaIfPresent);
      } else {
        reportMediaIfPresent();
      }

      // Watch for dynamically added media elements
      const observer = new MutationObserver(() => {
        reportMediaIfPresent();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });

      // Native mode: Set up message listener for basic volume and media control
      // No AudioContext, no enhancements - just native element.volume (0-100%)
      let nativeVolume = 100;

      // Apply native volume to all media elements
      function applyNativeVolume(volume) {
        // Cap at 100% (native volume doesn't support boost)
        const cappedVolume = Math.min(100, Math.max(0, volume));
        nativeVolume = cappedVolume;
        const normalizedVolume = cappedVolume / 100; // Convert to 0.0-1.0 range
        document.querySelectorAll('audio, video').forEach(el => {
          el.volume = normalizedVolume;
        });
        console.log('[TabVolume] Native mode: Set volume to', cappedVolume + '%');
      }

      // Watch for new media elements and apply native volume
      const nativeVolumeObserver = new MutationObserver(() => {
        const normalizedVolume = nativeVolume / 100;
        document.querySelectorAll('audio, video').forEach(el => {
          if (el.volume !== normalizedVolume) {
            el.volume = normalizedVolume;
          }
        });
      });
      nativeVolumeObserver.observe(document.documentElement, { childList: true, subtree: true });

      browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (sender.id !== browserAPI.runtime.id) return false;

        if (request.type === 'SET_VOLUME') {
          // Use ?? instead of || so volume 0 (mute) works correctly
          applyNativeVolume(request.volume ?? 100);
          sendResponse({ success: true });
        } else if (request.type === 'GET_NATIVE_MODE_STATUS') {
          // Report that we're in native mode (for popup UI)
          const mediaElements = document.querySelectorAll('audio, video');
          sendResponse({
            isNativeMode: true,
            reason: 'disabled',
            mediaCount: mediaElements.length,
            currentVolume: nativeVolume
          });
        } else if (request.type === 'TOGGLE_PLAY_PAUSE') {
          const result = toggleMediaPlayPause();
          sendResponse({ success: result.success, isPlaying: result.isPlaying });
        }
        return false;
      });

      // Cleanup observers when page unloads to prevent memory leaks
      window.addEventListener('pagehide', () => {
        observer.disconnect();
        nativeVolumeObserver.disconnect();
      });

      return; // Exit before audio processing code runs
    }
  } catch (e) {
    // localStorage might be blocked on some sites, continue with normal operation
    console.log('[TabVolume] content.js: localStorage check error:', e.message);
  }

  console.log('[TabVolume] content.js starting...');

  // NOTE: page-script.js is loaded via manifest's content_scripts with world: "MAIN"
  // This bypasses page CSP restrictions that would block inline script injection.
  // The localStorage check inside page-script.js handles disabled domains.

  // Check if extension is disabled on this domain
  let extensionDisabledOnDomain = false;

  // Global native mode flag (set when defaultAudioMode is 'native')
  // In native mode: volume is 0-100% only, no Web Audio API boosting
  let isGlobalNativeMode = false;
  let nativeModeVolume = 100; // Track native volume separately (0-100)

  // Tab Capture mode flag - when true, skip processing media elements through Web Audio API
  // Tab Capture captures audio at the browser level, so we don't need to route through AudioContext
  // This avoids CORS issues with cross-origin media (e.g., Facebook Messenger videos)
  let isTabCaptureMode = false;

  // Apply native volume to all media elements (no Web Audio API, 0-100% only)
  function applyNativeVolumeToMedia(volume) {
    const cappedVolume = Math.min(100, Math.max(0, volume));
    nativeModeVolume = cappedVolume;
    const normalizedVolume = cappedVolume / 100; // Convert to 0.0-1.0 range

    document.querySelectorAll('audio, video').forEach(el => {
      el.volume = normalizedVolume;
    });
    console.log('[TabVolume] Native mode: Set volume to', cappedVolume + '%');
  }

  async function isDomainDisabled() {
    try {
      const domain = window.location.hostname;
      if (!domain) return false;

      const result = await browserAPI.storage.sync.get(['disabledDomains']);
      const disabledDomains = result.disabledDomains || [];
      return disabledDomains.includes(domain);
    } catch (e) {
      return false;
    }
  }

  // Get effective audio mode for this site via background.js (single source of truth)
  // Returns 'tabcapture', 'webaudio', or 'native'
  async function getEffectiveAudioMode() {
    try {
      const hostname = window.location.hostname;
      if (!hostname) return isFirefox ? 'webaudio' : 'tabcapture';

      const response = await browserAPI.runtime.sendMessage({
        type: 'GET_EFFECTIVE_MODE',
        hostname: hostname
      });

      if (response && response.success && response.mode) {
        // Map 'off' to 'native' for content script compatibility
        return response.mode === 'off' ? 'native' : response.mode;
      }

      // Fallback if message fails
      return isFirefox ? 'webaudio' : 'tabcapture';
    } catch (e) {
      console.log('[TabVolume] Error getting effective audio mode:', e.message);
      return isFirefox ? 'webaudio' : 'tabcapture';
    }
  }

  let currentVolume = 100;
  let currentDeviceId = ''; // Empty string = default device
  let audioMode = 'boost'; // 'boost' = volume 0-500% (no device switching), 'device' = volume 0-100% (device switching enabled)
  let currentBassGain = 0;  // dB
  let currentTrebleGain = 0; // dB
  let currentVoiceGain = 0; // dB
  let currentPan = 0; // -1 to 1 (left to right)
  let currentChannelMode = 'stereo'; // 'stereo', 'mono', 'swap'
  let currentCompressor = 'off'; // 'off', 'podcast', 'movie', 'maximum'
  let compressorCompensation = 1.0; // Gain multiplier to offset compressor loudness increase

  // Compressor compensation factors (reduce gain to maintain similar perceived loudness)
  // Values are approximate - compression effect varies by content
  const COMPRESSOR_COMPENSATION = {
    off: 1.0,       // No compensation needed
    podcast: 0.80,  // -1.9dB - light compression
    movie: 0.65,    // -3.7dB - medium compression
    maximum: 0.50   // -6dB - heavy compression
  };

  // Audio mode is now automatic based on device selection (per-tab)
  // When a custom device is selected, mode = 'device' (100% max, uses setSinkId)
  // When default device is used, mode = 'boost' (500% max, uses GainNode)
  async function loadAudioMode() {
    // Mode is determined by device selection, not global setting
    // Check if this tab has a saved device
    if (isFirefox) {
      try {
        const tabId = await getTabId();
        if (tabId) {
          const deviceKey = `tab_${tabId}_device`;
          const result = await browserAPI.storage.local.get([deviceKey]);
          audioMode = result[deviceKey] ? 'device' : 'boost';
          console.log('[TabVolume] Audio mode (from device selection):', audioMode);
        }
      } catch (e) {
        audioMode = 'boost';
      }
    } else {
      audioMode = 'boost';
    }
  }

  // Helper to get current tab ID
  async function getTabId() {
    try {
      const response = await browserAPI.runtime.sendMessage({ type: 'GET_TAB_ID' });
      return response?.tabId;
    } catch (e) {
      return null;
    }
  }

  // Helper to create event detail that works across Firefox security boundaries
  // Firefox requires cloneInto() to share objects from ISOLATED to MAIN world
  function createEventDetail(data) {
    if (typeof cloneInto !== 'undefined') {
      return cloneInto(data, window);
    }
    return data;
  }

  // Send volume to page script (MAIN world)
  function sendVolumeToPage(volume) {
    window.dispatchEvent(new CustomEvent('__tabVolumeControl_set', {
      detail: createEventDetail({ volume })
    }));
  }

  // Initialize page script with stored volume
  function initPageScript(volume) {
    window.dispatchEvent(new CustomEvent('__tabVolumeControl_init', {
      detail: createEventDetail({ volume })
    }));
  }

  // Send device change to page script (MAIN world)
  // This is needed for sites using Web Audio API directly (e.g., stake.us)
  function sendDeviceToPage(deviceId, deviceLabel) {
    window.dispatchEvent(new CustomEvent('__tabVolumeControl_setDevice', {
      detail: createEventDetail({ deviceId: deviceId || '', deviceLabel: deviceLabel || '' })
    }));
  }

  // Send bass boost change to page script (MAIN world)
  function sendBassToPage(gain) {
    window.dispatchEvent(new CustomEvent('__tabVolumeControl_setBass', {
      detail: createEventDetail({ gain })
    }));
  }

  // Send treble boost change to page script (MAIN world)
  function sendTrebleToPage(gain) {
    window.dispatchEvent(new CustomEvent('__tabVolumeControl_setTreble', {
      detail: createEventDetail({ gain })
    }));
  }

  // Send voice boost change to page script (MAIN world)
  function sendVoiceToPage(gain) {
    window.dispatchEvent(new CustomEvent('__tabVolumeControl_setVoice', {
      detail: createEventDetail({ gain })
    }));
  }

  // Send balance change to page script (MAIN world)
  function sendBalanceToPage(pan) {
    window.dispatchEvent(new CustomEvent('__tabVolumeControl_setBalance', {
      detail: createEventDetail({ pan })
    }));
  }

  // Send channel mode change to page script (MAIN world)
  function sendChannelModeToPage(mode) {
    window.dispatchEvent(new CustomEvent('__tabVolumeControl_setChannelMode', {
      detail: createEventDetail({ mode })
    }));
  }

  // Listen for resolved device ID from page script (MAIN world)
  // This is critical for Firefox where content script can't enumerate devices
  // but page script can resolve device IDs by label
  window.addEventListener('__tabVolumeControl_deviceResolved', async function(e) {
    if (e.detail && e.detail.deviceId) {
      console.log('[TabVolume] Received resolved device ID from page script:', e.detail.deviceId);

      // Apply to hidden output audio elements (Firefox MediaStreamDestination workaround)
      const elements = Array.from(document.querySelectorAll('audio, video'));
      let successful = 0;

      for (const element of elements) {
        const data = mediaGainNodes.get(element);
        if (data && data.outputAudioElement) {
          try {
            await data.outputAudioElement.setSinkId(e.detail.deviceId);
            console.log('[TabVolume] Applied resolved device ID to output audio element: success');
            successful++;
          } catch (err) {
            console.log('[TabVolume] Applied resolved device ID to output audio element: failed', err.name);
          }
        }
      }

      if (successful > 0) {
        currentDeviceId = e.detail.deviceId;
        console.log('[TabVolume] Device switching via page script resolution: successful');
      }
    }
  });

  // Also handle HTML5 media elements from content script
  // (some may have CORS restrictions that prevent page script access)
  const mediaGainNodes = new WeakMap();
  let audioContext = null;
  let audioContextCreating = false; // Mutex to prevent duplicate creation
  let userHasInteracted = false; // Track if user has interacted with the page

  // Check if user just switched modes via popup (popup click = user interaction)
  // This flag is set by popup before page refresh when switching to Web Audio mode
  try {
    if (sessionStorage.getItem('__tabVolumeControl_modeSwitched') === 'true') {
      userHasInteracted = true;
      sessionStorage.removeItem('__tabVolumeControl_modeSwitched');
      console.log('[TabVolume] Mode switch detected - treating as user interaction');
    }
  } catch (e) {
    // sessionStorage might not be available (private browsing, etc.)
  }

  // Track user interaction to avoid AudioContext autoplay warnings
  // Only resume AudioContext after user gesture to comply with browser policy
  const trackUserInteraction = () => {
    userHasInteracted = true;
    // Remove listeners after first interaction (optimization)
    document.removeEventListener('click', trackUserInteraction);
    document.removeEventListener('keydown', trackUserInteraction);
    document.removeEventListener('touchstart', trackUserInteraction);
  };
  document.addEventListener('click', trackUserInteraction);
  document.addEventListener('keydown', trackUserInteraction);
  document.addEventListener('touchstart', trackUserInteraction);

  function getAudioContext() {
    // Return existing context immediately
    if (audioContext) {
      return audioContext;
    }

    // Don't create AudioContext until user has interacted (avoids autoplay warning)
    if (!userHasInteracted) {
      return null;
    }

    // Prevent reentrant creation during edge cases
    // (shouldn't happen in single-threaded JS, but defensive coding)
    if (audioContextCreating) {
      console.debug('[TabVolume] AudioContext creation already in progress, waiting...');
      return null; // Caller should retry or handle gracefully
    }

    // Create new context with mutex protection
    audioContextCreating = true;
    try {
      // Double-check after setting mutex (defensive)
      if (audioContext) {
        return audioContext;
      }

      // Use the native constructor directly in isolated world
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioContext = new AudioContextClass();
        console.debug('[TabVolume] Created new AudioContext');
      }
    } finally {
      audioContextCreating = false;
    }

    // Don't proactively resume - let it auto-resume when media plays
    // This avoids browser autoplay policy warning
    return audioContext;
  }

  // Check if AudioContext supports setSinkId (needed for device switching)
  // Firefox doesn't support this, so we can't use AudioContext routing in Firefox
  // if we want device switching to work
  let audioContextSupportsSinkId = null; // null = unknown, true/false after check

  function checkAudioContextSinkIdSupport() {
    if (audioContextSupportsSinkId !== null) return audioContextSupportsSinkId;

    // Don't create test AudioContext until user has interacted (avoids autoplay warning)
    if (!userHasInteracted) {
      return false; // Assume not supported until we can test
    }

    try {
      const testCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextSupportsSinkId = typeof testCtx.setSinkId === 'function';
      testCtx.close();
      console.log('[TabVolume] AudioContext.setSinkId supported:', audioContextSupportsSinkId);
    } catch (e) {
      audioContextSupportsSinkId = false;
    }
    return audioContextSupportsSinkId;
  }

  // Update limiter state based on current volume and bass boost
  // Limiter is enabled when volume >100% AND no bass boost is active
  // (Bass boost can cause pumping with the limiter)
  function updateLimiterState(limiter) {
    if (!limiter) return;

    const shouldEnable = currentVolume > 100 && currentBassGain <= 0;

    if (shouldEnable) {
      // Enable limiter: set threshold to catch peaks
      limiter.threshold.value = -1;
    } else {
      // Disable limiter: set threshold very high so it never triggers
      limiter.threshold.value = 0;
    }
  }

  // Update limiter state on all media elements
  function updateAllLimiters() {
    document.querySelectorAll('audio, video').forEach(element => {
      const data = mediaGainNodes.get(element);
      if (data && data.limiter) {
        updateLimiterState(data.limiter);
      }
    });
  }

  // Apply channel mode gains to channel matrix
  // Stereo: L→L, R→R (normal)
  // Mono: L+R mixed to both channels
  // Swap: L→R, R→L (channels swapped)
  function applyChannelModeGains(gains, mode) {
    if (!gains) return;

    const { ll, lr, rl, rr } = gains;

    if (mode === 'mono') {
      // Mix both channels: output = (L + R) / 2 on both sides
      ll.gain.value = 0.5;
      lr.gain.value = 0.5;
      rl.gain.value = 0.5;
      rr.gain.value = 0.5;
    } else if (mode === 'swap') {
      // Swap channels: L→R, R→L
      ll.gain.value = 0;
      lr.gain.value = 1;
      rl.gain.value = 1;
      rr.gain.value = 0;
    } else {
      // Stereo (default): L→L, R→R
      ll.gain.value = 1;
      lr.gain.value = 0;
      rl.gain.value = 0;
      rr.gain.value = 1;
    }
  }

  function processMediaElement(element) {
    // In Tab Capture mode, don't route through AudioContext - let browser capture native audio
    // This avoids CORS issues with cross-origin media (e.g., Facebook Messenger, embedded videos)
    // Tab Capture handles volume boost/effects in the offscreen document
    if (isTabCaptureMode) {
      // Keep media element at full volume - Tab Capture will adjust volume
      element.volume = 1.0;
      console.log('[TabVolume] processMediaElement: Tab Capture mode, skipping AudioContext routing');
      return;
    }

    // In device mode on Chrome, don't route through AudioContext - use native element volume
    // Firefox exception: Uses MediaStreamDestination workaround which needs AudioContext for analyser/effects
    if (audioMode === 'device' && !isFirefox) {
      // Just apply current volume to element
      element.volume = Math.min(1, currentVolume / 100);
      console.log('[TabVolume] processMediaElement: device mode (Chrome), skipping AudioContext routing');
      return;
    }

    // Boost mode: route through AudioContext for volume > 100%
    if (mediaGainNodes.has(element)) {
      console.log('[TabVolume] processMediaElement: element already routed through AudioContext');
      return;
    }
    if (!element.src && !element.srcObject && element.querySelectorAll('source').length === 0) {
      return;
    }

    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      console.log('[TabVolume] processMediaElement: routing', element.tagName, 'through AudioContext');
      const source = ctx.createMediaElementSource(element);

      // Validate values to prevent non-finite errors
      const safeBassGain = Number.isFinite(currentBassGain) ? currentBassGain : 0;
      const safeTrebleGain = Number.isFinite(currentTrebleGain) ? currentTrebleGain : 0;
      const safeVoiceGain = Number.isFinite(currentVoiceGain) ? currentVoiceGain : 0;
      const safePan = Number.isFinite(currentPan) ? currentPan : 0;
      const safeVolume = Number.isFinite(currentVolume) ? currentVolume : 100;

      // Create bass filter (low shelf at 200Hz)
      const bassFilter = ctx.createBiquadFilter();
      bassFilter.type = 'lowshelf';
      bassFilter.frequency.value = 200;
      bassFilter.gain.value = safeBassGain;

      // Create treble filter (high shelf at 6kHz)
      const trebleFilter = ctx.createBiquadFilter();
      trebleFilter.type = 'highshelf';
      trebleFilter.frequency.value = 6000;
      trebleFilter.gain.value = safeTrebleGain;

      // Create voice filter (peaking at 3kHz)
      const voiceFilter = ctx.createBiquadFilter();
      voiceFilter.type = 'peaking';
      voiceFilter.frequency.value = 3000;
      voiceFilter.Q.value = 1.0;
      voiceFilter.gain.value = safeVoiceGain;

      // Create stereo panner
      const stereoPanner = ctx.createStereoPanner();
      stereoPanner.pan.value = safePan;

      // Create channel matrix for stereo/mono/swap modes
      // Uses splitter → gain nodes → merger for flexible channel routing
      const channelSplitter = ctx.createChannelSplitter(2);
      const channelMerger = ctx.createChannelMerger(2);

      // Gain nodes for channel matrix (Left-to-Left, Left-to-Right, Right-to-Left, Right-to-Right)
      const ll = ctx.createGain(); // Left input to Left output
      const lr = ctx.createGain(); // Left input to Right output
      const rl = ctx.createGain(); // Right input to Left output
      const rr = ctx.createGain(); // Right input to Right output

      // Connect splitter to gain nodes
      channelSplitter.connect(ll, 0); // L channel to LL
      channelSplitter.connect(lr, 0); // L channel to LR
      channelSplitter.connect(rl, 1); // R channel to RL
      channelSplitter.connect(rr, 1); // R channel to RR

      // Connect gain nodes to merger
      ll.connect(channelMerger, 0, 0); // LL to Left output
      rl.connect(channelMerger, 0, 0); // RL to Left output (sums with LL)
      lr.connect(channelMerger, 0, 1); // LR to Right output
      rr.connect(channelMerger, 0, 1); // RR to Right output (sums with LR)

      // Set initial channel matrix gains based on current mode
      const channelGains = { ll, lr, rl, rr };
      applyChannelModeGains(channelGains, currentChannelMode);

      // Create compressor for audio normalization (podcast/movie mode)
      const compressor = ctx.createDynamicsCompressor();
      // Default to bypassed state (high threshold = no compression)
      compressor.threshold.value = 0;
      compressor.knee.value = 10;
      compressor.ratio.value = 1;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      // Apply current compressor settings
      applyCompressorSettings(compressor, currentCompressor);

      // Create gain node for volume (includes compressor compensation)
      const gainNode = ctx.createGain();
      gainNode.gain.value = (safeVolume / 100) * compressorCompensation;

      // Create limiter (DynamicsCompressor configured as a limiter)
      // Acts as safety net for volume >100% to prevent clipping
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -1;  // Catch peaks just before clipping
      limiter.knee.value = 0;        // Hard knee for true limiting
      limiter.ratio.value = 20;      // Aggressive ratio
      limiter.attack.value = 0.001;  // Very fast attack (1ms)
      limiter.release.value = 0.1;   // Quick release (100ms)

      // Create analyser for visualizer (samples frequency data)
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;  // 32 frequency bins - smaller = less CPU (we only display 16 bars)
      analyser.smoothingTimeConstant = 0.7;  // 0-1 range: lower = more reactive, higher = smoother
      analyser.maxDecibels = -10;  // Default -30dB clips too easily; -10dB gives more headroom

      // Connect chain: source → bassFilter → trebleFilter → voiceFilter → stereoPanner → channelMatrix → compressor → gainNode → limiter → analyser → ...
      source.connect(bassFilter);
      bassFilter.connect(trebleFilter);
      trebleFilter.connect(voiceFilter);
      voiceFilter.connect(stereoPanner);
      stereoPanner.connect(channelSplitter);
      channelMerger.connect(compressor);
      compressor.connect(gainNode);
      gainNode.connect(limiter);
      limiter.connect(analyser);

      // Firefox: AudioContext.setSinkId not supported, use MediaStreamDestination workaround
      // Route through a hidden audio element that supports setSinkId
      let outputAudioElement = null;
      if (isFirefox && !checkAudioContextSinkIdSupport()) {
        console.log('[TabVolume] Firefox: using MediaStreamDestination for device switching');
        const mediaStreamDest = ctx.createMediaStreamDestination();
        analyser.connect(mediaStreamDest);

        // Create hidden audio element to play the processed stream
        outputAudioElement = new Audio();
        outputAudioElement.srcObject = mediaStreamDest.stream;
        outputAudioElement.volume = 1.0; // Volume is controlled by gainNode

        // Apply current device if set
        if (currentDeviceId && typeof outputAudioElement.setSinkId === 'function') {
          outputAudioElement.setSinkId(currentDeviceId).catch(e => {
            console.log('[TabVolume] Could not set initial device on output element:', e.name);
          });
        }

        // Sync play/pause with source element
        const syncPlayback = () => {
          if (!element.paused && outputAudioElement.paused) {
            outputAudioElement.play().catch(() => {});
          } else if (element.paused && !outputAudioElement.paused) {
            outputAudioElement.pause();
          }
        };
        element.addEventListener('play', () => {
          outputAudioElement.play().catch(() => {});
        });
        element.addEventListener('pause', () => {
          outputAudioElement.pause();
        });

        // Start playing if source is already playing
        if (!element.paused) {
          outputAudioElement.play().catch(() => {});
        }
      } else {
        // Chrome or Firefox with setSinkId support: connect directly to destination
        analyser.connect(ctx.destination);
      }

      // Set initial limiter state based on volume and bass boost
      updateLimiterState(limiter);

      mediaGainNodes.set(element, {
        gainNode,
        bassFilter,
        trebleFilter,
        voiceFilter,
        stereoPanner,
        channelGains,
        compressor,
        limiter,
        analyser,
        context: ctx,
        outputAudioElement // For Firefox device switching
      });

      // Resume AudioContext when media starts playing (user gesture satisfies autoplay policy)
      // This is critical: createMediaElementSource disconnects audio from default output,
      // so if AudioContext is suspended, no audio will play at all
      const resumeContext = () => {
        // Only resume if user has interacted to avoid console warnings
        if (ctx.state === 'suspended' && userHasInteracted) {
          console.log('[TabVolume] Resuming suspended AudioContext');
          ctx.resume().catch(() => {});
        }
      };

      // Multiple event listeners to ensure we catch the context resume opportunity
      element.addEventListener('play', resumeContext);
      element.addEventListener('playing', resumeContext);

      // timeupdate fires continuously during playback - catches late resume
      const onTimeUpdate = () => {
        if (ctx.state === 'suspended' && userHasInteracted) {
          ctx.resume().catch(() => {});
        } else if (ctx.state === 'running') {
          // Context is running, remove this listener to save CPU
          element.removeEventListener('timeupdate', onTimeUpdate);
        }
      };
      element.addEventListener('timeupdate', onTimeUpdate);

      // Try to resume immediately
      resumeContext();

      // Retry after short delays to handle race conditions
      setTimeout(resumeContext, 100);
      setTimeout(resumeContext, 500);

      // === SOURCE CHANGE RECOVERY (for ad transitions on Twitch, etc.) ===
      // When media source changes (ad → content), the AudioContext may need recovery

      // Track if we've seen valid audio from this element
      let hasHadValidAudio = false;

      // Validate and recover audio chain
      const validateAndRecoverAudio = (eventName) => {
        const data = mediaGainNodes.get(element);
        if (!data) return;

        // Only log if user has interacted (avoid console spam on page load)
        if (userHasInteracted) {
          console.log(`[TabVolume] Source event: ${eventName} on ${element.tagName}`);
        }

        // Only resume context if user has interacted (avoids autoplay policy warnings)
        if (ctx.state === 'suspended' && userHasInteracted) {
          console.log('[TabVolume] Recovering: resuming suspended context');
          ctx.resume().catch(() => {});
        }

        // Re-apply current volume to ensure gain is correct
        const safeVolume = Number.isFinite(currentVolume) ? currentVolume : 100;
        const compensatedGain = (safeVolume / 100) * compressorCompensation;
        if (data.gainNode) {
          data.gainNode.gain.value = compensatedGain;
        }

        // Re-apply limiter state
        if (data.limiter) {
          updateLimiterState(data.limiter);
        }
      };

      // Listen for source change events that indicate ad/content transitions
      element.addEventListener('emptied', () => validateAndRecoverAudio('emptied'));
      element.addEventListener('loadstart', () => validateAndRecoverAudio('loadstart'));
      element.addEventListener('loadeddata', () => validateAndRecoverAudio('loadeddata'));
      element.addEventListener('canplay', () => {
        validateAndRecoverAudio('canplay');
        hasHadValidAudio = true;
      });

      // Additional recovery: if video plays but audio might be broken
      element.addEventListener('playing', () => {
        // Small delay to let audio chain stabilize after source change
        setTimeout(() => {
          if (ctx.state === 'suspended' && userHasInteracted) {
            console.log('[TabVolume] Recovery on playing: resuming context');
            ctx.resume().catch(() => {});
          }
        }, 100);
      });

    } catch (e) {
      // Already connected or CORS - that's ok, page script should handle it
      console.log('[TabVolume] processMediaElement error:', e.message);
    }
  }

  function applyVolumeToMedia(volume) {
    // Apply compressor compensation to maintain similar perceived loudness
    const compensatedGain = (volume / 100) * compressorCompensation;
    document.querySelectorAll('audio, video').forEach(element => {
      // In device mode, use native element volume (clamped to 0-1)
      if (audioMode === 'device') {
        element.volume = Math.min(1, compensatedGain);
        return;
      }

      // Boost mode: use AudioContext gain nodes
      const data = mediaGainNodes.get(element);
      if (data && data.gainNode) {
        try {
          data.gainNode.gain.setTargetAtTime(
            volume === 0 ? 0 : Math.max(compensatedGain, 0.0001),
            data.context.currentTime,
            0.03
          );
        } catch (e) {
          data.gainNode.gain.value = compensatedGain;
        }
      } else {
        // Fallback: element not routed through AudioContext, use native volume
        element.volume = Math.min(1, compensatedGain);
      }
    });
  }

  function applyBassBoostToMedia(gainDb) {
    document.querySelectorAll('audio, video').forEach(element => {
      const data = mediaGainNodes.get(element);
      if (data && data.bassFilter) {
        try {
          data.bassFilter.gain.setTargetAtTime(
            gainDb,
            data.context.currentTime,
            0.03
          );
        } catch (e) {
          data.bassFilter.gain.value = gainDb;
        }
      }
    });
  }

  function applyTrebleBoostToMedia(gainDb) {
    document.querySelectorAll('audio, video').forEach(element => {
      const data = mediaGainNodes.get(element);
      if (data && data.trebleFilter) {
        try {
          data.trebleFilter.gain.setTargetAtTime(
            gainDb,
            data.context.currentTime,
            0.03
          );
        } catch (e) {
          data.trebleFilter.gain.value = gainDb;
        }
      }
    });
  }

  function applyVoiceBoostToMedia(gainDb) {
    document.querySelectorAll('audio, video').forEach(element => {
      const data = mediaGainNodes.get(element);
      if (data && data.voiceFilter) {
        try {
          data.voiceFilter.gain.setTargetAtTime(
            gainDb,
            data.context.currentTime,
            0.03
          );
        } catch (e) {
          data.voiceFilter.gain.value = gainDb;
        }
      }
    });
  }

  function applyBalanceToMedia(pan) {
    document.querySelectorAll('audio, video').forEach(element => {
      const data = mediaGainNodes.get(element);
      if (data && data.stereoPanner) {
        try {
          data.stereoPanner.pan.setTargetAtTime(
            pan,
            data.context.currentTime,
            0.03
          );
        } catch (e) {
          data.stereoPanner.pan.value = pan;
        }
      }
    });
  }

  function applyBassBoost(gainDb) {
    // Validate input to prevent non-finite errors
    const safeGain = Number.isFinite(gainDb) ? gainDb : 0;
    currentBassGain = safeGain;
    sendBassToPage(safeGain);
    applyBassBoostToMedia(safeGain);
    updateAllLimiters(); // Limiter disabled when bass boost is active
  }

  function applyTrebleBoost(gainDb) {
    // Validate input to prevent non-finite errors
    const safeGain = Number.isFinite(gainDb) ? gainDb : 0;
    currentTrebleGain = safeGain;
    sendTrebleToPage(safeGain);
    applyTrebleBoostToMedia(safeGain);
  }

  function applyVoiceBoost(gainDb) {
    // Validate input to prevent non-finite errors
    const safeGain = Number.isFinite(gainDb) ? gainDb : 0;
    currentVoiceGain = safeGain;
    sendVoiceToPage(safeGain);
    applyVoiceBoostToMedia(safeGain);
  }

  function applyBalance(pan) {
    // Validate input to prevent non-finite errors
    const safePan = Number.isFinite(pan) ? pan : 0;
    currentPan = safePan;
    sendBalanceToPage(safePan);
    applyBalanceToMedia(safePan);
  }

  function applyChannelModeToMedia(mode) {
    document.querySelectorAll('audio, video').forEach(element => {
      const data = mediaGainNodes.get(element);
      if (data && data.channelGains) {
        applyChannelModeGains(data.channelGains, mode);
      }
    });
  }

  function applyChannelMode(mode) {
    currentChannelMode = mode;
    sendChannelModeToPage(mode);
    applyChannelModeToMedia(mode);
  }

  // Compressor presets for audio normalization
  // Podcast: Light compression for spoken content
  // Movie: Medium compression for film/TV (quiet dialogue, loud action)
  // Maximum: Heavy compression for aggressive normalization
  function applyCompressorSettings(compressor, preset) {
    if (!compressor) return;

    switch (preset) {
      case 'podcast':
        compressor.threshold.value = -20;
        compressor.knee.value = 10;
        compressor.ratio.value = 3;
        compressor.attack.value = 0.005;
        compressor.release.value = 0.25;
        break;
      case 'movie':
        compressor.threshold.value = -30;
        compressor.knee.value = 8;
        compressor.ratio.value = 5;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.2;
        break;
      case 'maximum':
        compressor.threshold.value = -40;
        compressor.knee.value = 5;
        compressor.ratio.value = 10;
        compressor.attack.value = 0.001;
        compressor.release.value = 0.1;
        break;
      case 'off':
      default:
        // Bypass: high threshold and ratio of 1 means no compression
        compressor.threshold.value = 0;
        compressor.knee.value = 10;
        compressor.ratio.value = 1;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;
        break;
    }
  }

  function applyCompressorToMedia(preset) {
    document.querySelectorAll('audio, video').forEach(element => {
      const data = mediaGainNodes.get(element);
      if (data && data.compressor) {
        applyCompressorSettings(data.compressor, preset);
      }
    });
  }

  function applyCompressor(preset) {
    currentCompressor = preset;
    compressorCompensation = COMPRESSOR_COMPENSATION[preset] || 1.0;
    applyCompressorToMedia(preset);
    // Re-apply volume to update gain with new compensation
    applyVolumeToMedia(currentVolume);
  }

  function applyVolume(volume) {
    // Validate input to prevent non-finite errors
    const safeVolume = Number.isFinite(volume) ? volume : 100;
    currentVolume = safeVolume;
    sendVolumeToPage(safeVolume);
    applyVolumeToMedia(safeVolume);
    updateAllLimiters(); // Limiter enabled when volume >100%
  }

  // Apply audio output device via AudioContext.setSinkId
  // This bypasses page Permissions-Policy restrictions since we own the AudioContext
  async function applyDeviceToContext(deviceId) {
    const ctx = getAudioContext();
    if (!ctx) {
      console.warn('[TabVolume] No AudioContext available');
      return { success: false, notFound: false };
    }

    // Check if setSinkId is supported on AudioContext
    if (typeof ctx.setSinkId !== 'function') {
      console.warn('[TabVolume] AudioContext.setSinkId not supported in this browser');
      // Fallback: try on media elements directly
      const elemSuccess = await applyDeviceToElements(deviceId);
      return { success: elemSuccess, notFound: false };
    }

    try {
      await ctx.setSinkId(deviceId || '');
      console.log('[TabVolume] Successfully set AudioContext output to:', deviceId || 'default');
      return { success: true, notFound: false };
    } catch (e) {
      // Expected during cross-context resolution fallback - device ID from offscreen won't work here
      console.debug('[TabVolume] AudioContext.setSinkId failed:', e.name, e.message);

      // Check if device was not found (expected when using cross-context device ID)
      if (e.name === 'NotFoundError') {
        console.debug('[TabVolume] Device ID not valid in this context, will resolve by label');
        return { success: false, notFound: true };
      }

      // For other errors, try fallback to media elements
      const elemSuccess = await applyDeviceToElements(deviceId);
      return { success: elemSuccess, notFound: false };
    }
  }

  // Fallback: Apply device directly to media elements
  async function applyDeviceToElements(deviceId) {
    const elements = Array.from(document.querySelectorAll('audio, video'));
    console.log('[TabVolume] applyDeviceToElements: found', elements.length, 'elements, deviceId:', deviceId);

    let successful = 0;
    for (const element of elements) {
      if (typeof element.setSinkId === 'function') {
        try {
          await element.setSinkId(deviceId || '');
          console.log('[TabVolume] Set device on element:', element.tagName, 'success');
          successful++;
        } catch (e) {
          console.log('[TabVolume] Set device on element:', element.tagName, 'failed:', e.name, e.message);
        }
      } else {
        console.log('[TabVolume] setSinkId not available on element:', element.tagName);
      }
    }
    console.log('[TabVolume] applyDeviceToElements: successful:', successful);
    return successful > 0;
  }

  // Firefox: Apply device to hidden output audio elements (MediaStreamDestination workaround)
  async function applyDeviceToOutputElements(deviceId) {
    let successful = 0;
    const elements = Array.from(document.querySelectorAll('audio, video'));

    for (const element of elements) {
      const data = mediaGainNodes.get(element);
      if (data && data.outputAudioElement) {
        try {
          await data.outputAudioElement.setSinkId(deviceId || '');
          console.log('[TabVolume] Set device on output audio element: success');
          successful++;
        } catch (e) {
          console.log('[TabVolume] Set device on output audio element failed:', e.name, e.message);
        }
      }
    }

    console.log('[TabVolume] applyDeviceToOutputElements: successful:', successful);
    return successful > 0;
  }

  // Apply device to all audio output
  async function applyDeviceToAllMedia(deviceId, deviceLabel) {
    currentDeviceId = deviceId;
    console.log('[TabVolume] Setting audio output device to:', deviceId || 'default', 'mode:', audioMode);

    // Also notify page script for Web Audio API contexts (e.g., stake.us slots)
    // Pass label so page script can resolve device ID in its own context
    sendDeviceToPage(deviceId, deviceLabel);

    // Firefox without AudioContext.setSinkId: ALWAYS try hidden output audio elements first
    // These are created when video is routed through AudioContext (for boost/effects)
    // and they're the ONLY way to switch devices when audio goes through AudioContext
    if (isFirefox && !checkAudioContextSinkIdSupport()) {
      const outputSuccess = await applyDeviceToOutputElements(deviceId);
      if (outputSuccess) {
        console.log('[TabVolume] Firefox: Device switching applied via output audio elements');
        return { success: true, notFound: false };
      }
      // Fallback to regular elements (for elements not routed through AudioContext)
      const elemSuccess = await applyDeviceToElements(deviceId);
      if (elemSuccess) {
        console.log('[TabVolume] Firefox: Device switching applied to media elements');
        return { success: true, notFound: false };
      }
      console.log('[TabVolume] Firefox: No output elements or media elements to apply device to');
      return { success: false, notFound: false };
    }

    // In device mode (non-Firefox or Firefox with setSinkId support)
    if (audioMode === 'device') {
      let success = false;

      // First try AudioContext.setSinkId if we have one (elements may already be routed through it)
      const ctx = audioContext; // Use existing context, don't create new one
      console.log('[TabVolume] Device mode: audioContext exists:', !!ctx, 'setSinkId available:', ctx ? typeof ctx.setSinkId : 'N/A');

      if (ctx && typeof ctx.setSinkId === 'function') {
        try {
          await ctx.setSinkId(deviceId || '');
          console.log('[TabVolume] Device mode: AudioContext.setSinkId succeeded');
          success = true;
        } catch (e) {
          console.log('[TabVolume] Device mode: AudioContext.setSinkId failed:', e.name, e.message);
        }
      } else if (ctx) {
        console.log('[TabVolume] Device mode: AudioContext exists but setSinkId not available');
      }

      // Also try element.setSinkId for elements not routed through AudioContext
      const elemSuccess = await applyDeviceToElements(deviceId);
      if (elemSuccess) {
        console.log('[TabVolume] Device switching applied to media elements');
        success = true;
      }

      if (!success) {
        console.log('[TabVolume] No media elements or AudioContext to apply device to (yet)');
      }
      return { success, notFound: false };
    }

    // Boost mode: First, ensure we have an AudioContext and media is routed through it
    processAllMedia();

    // Apply to AudioContext (preferred) or fall back to elements
    const result = await applyDeviceToContext(deviceId);

    if (result.notFound && deviceId) {
      // Device was not found - expected when cross-context ID doesn't match
      console.debug('[TabVolume] Device ID not found in this context');
      currentDeviceId = '';

      // Don't notify background to clear storage - the popup handles stale devices
      // by checking if saved device exists in enumerated list

      // Reset to default device
      const ctx = getAudioContext();
      if (ctx && typeof ctx.setSinkId === 'function') {
        try {
          await ctx.setSinkId('');
          console.log('[TabVolume] Reset to default audio output device');
        } catch (e) {
          // Ignore errors when resetting to default
        }
      }

      return { success: false, notFound: true };
    }

    if (result.success) {
      console.log('[TabVolume] Audio output device applied successfully');
    } else {
      console.debug('[TabVolume] Device application pending label resolution');
    }

    return { success: result.success, notFound: false };
  }

  function processAllMedia() {
    if (extensionDisabledOnDomain) return;
    document.querySelectorAll('audio, video').forEach(element => {
      // Only process media that is currently playing (user has already interacted)
      // This avoids creating AudioContext before user gesture (Chrome autoplay policy)
      if (!element.paused && element.readyState >= 1) {
        processMediaElement(element);
      }
      // For paused/unplayed media, defer processing until play event (user gesture)
      element.addEventListener('play', () => processMediaElement(element), { once: true });
    });
  }

  // Watch for new media elements
  const observer = new MutationObserver((mutations) => {
    if (extensionDisabledOnDomain) return;
    let found = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1) {
          if (node.tagName === 'AUDIO' || node.tagName === 'VIDEO') found = true;
          else if (node.querySelector && node.querySelector('audio, video')) found = true;
        }
      }
    }
    if (found) requestAnimationFrame(processAllMedia);
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Periodic safety check for unprocessed media elements
  // Catches edge cases where MutationObserver might miss elements (e.g., Twitch ad transitions)
  setInterval(() => {
    if (extensionDisabledOnDomain) return;
    document.querySelectorAll('audio, video').forEach(element => {
      // Skip if already processed
      if (mediaGainNodes.has(element)) return;
      // Skip if in device mode on Chrome
      if (audioMode === 'device' && !isFirefox) return;
      // Only process if element is playing (user has interacted) - avoids AudioContext warning
      if (!element.paused && (element.src || element.srcObject || element.querySelector('source')) && element.readyState >= 1) {
        console.log('[TabVolume] Periodic check: found unprocessed', element.tagName);
        processMediaElement(element);
      }
    });
  }, 2000); // Check every 2 seconds

  // Enumerate audio output devices (requires permission)
  async function enumerateAudioDevices(requestPermission = false) {
    try {
      // Request microphone permission to unlock full device enumeration
      if (requestPermission) {
        // First check if we already have permission to avoid Permissions-Policy violations
        let alreadyGranted = false;
        try {
          const permStatus = await navigator.permissions.query({ name: 'microphone' });
          alreadyGranted = permStatus.state === 'granted';
        } catch (e) {
          // permissions.query might not be supported, continue anyway
        }

        // Only request if not already granted (avoids Permissions-Policy violation on restrictive sites)
        if (!alreadyGranted) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
          } catch (e) {
            // Expected to fail on sites with restrictive Permissions-Policy (e.g., YouTube)
            // This is fine - if permission was granted elsewhere, enumerateDevices will still work
          }
        }
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices
        .filter(d => d.kind === 'audiooutput')
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Audio Device ${d.deviceId.slice(0, 8)}...`
        }));

      return audioOutputs;
    } catch (e) {
      console.debug('Could not enumerate devices:', e);
      return [];
    }
  }

  // Track if we've already tried requesting permission from content script
  let permissionAttempted = false;

  // Check if devices array has real labels
  function hasRealDeviceLabels(devices) {
    return devices.length > 1 || devices.some(d => d.label && !d.label.includes('Audio Device'));
  }

  // Resolve a device by label - enumerate locally and find matching device
  // This is needed because device IDs are context-specific (offscreen vs content script)
  async function resolveDeviceByLabel(deviceLabel) {
    if (!deviceLabel) return null;

    try {
      // First try without requesting permission
      let devices = await enumerateAudioDevices(false);
      console.log('[TabVolume] Content script enumerated devices (no permission request):', devices);
      console.log('[TabVolume] Looking for label:', deviceLabel);

      // If we don't have real labels, try enumerating a few more times
      // Permission granted at browser level may take a moment to propagate
      if (!hasRealDeviceLabels(devices)) {
        for (let i = 0; i < 3; i++) {
          await new Promise(r => setTimeout(r, 100));
          devices = await enumerateAudioDevices(false);
          if (hasRealDeviceLabels(devices)) {
            console.log('[TabVolume] Content script got labels on retry', i + 1);
            break;
          }
        }
      }

      // If still no labels and haven't tried getUserMedia yet, try once
      // This handles fresh installs where permission hasn't been granted yet
      if (!hasRealDeviceLabels(devices) && !permissionAttempted) {
        permissionAttempted = true;
        console.log('[TabVolume] Limited device info, attempting permission request from content script...');
        devices = await enumerateAudioDevices(true);
        console.log('[TabVolume] Content script enumerated devices (with permission request):', devices);
      }

      // Find device with matching label (case-insensitive, trimmed)
      const normalizedTargetLabel = deviceLabel.toLowerCase().trim();
      const match = devices.find(d => d.label && d.label.toLowerCase().trim() === normalizedTargetLabel);
      if (match) {
        console.log('[TabVolume] Resolved device by label:', deviceLabel, '->', match.deviceId);
        return match.deviceId;
      }
      // Device not found by label - may not be connected or label may have changed
      console.debug('[TabVolume] Device not available:', deviceLabel);
      return null;
    } catch (e) {
      console.debug('[TabVolume] Could not enumerate devices:', e.message);
      return null;
    }
  }

  // ==================== Security Validation ====================

  // Validate sender is from our extension
  function isValidSender(sender) {
    return sender.id === browserAPI.runtime.id;
  }

  // Validate a number is within range
  function isValidNumber(value, min, max) {
    return typeof value === 'number' &&
           Number.isFinite(value) &&
           value >= min &&
           value <= max;
  }

  // Validate a string is one of allowed values
  function isValidString(value, allowedValues) {
    return typeof value === 'string' && allowedValues.includes(value);
  }

  // Valid message types this content script handles
  // Note: Mode switching messages (SWITCH_TO_WEBAUDIO_MODE, ENABLE_BYPASS_MODE, DISABLE_BYPASS_MODE)
  // were removed in v4.1.23 - all mode switches now refresh the page for reliability
  const VALID_MESSAGE_TYPES = [
    'SET_VOLUME', 'SET_DEVICE', 'GET_DEVICES', 'SET_BASS', 'SET_TREBLE', 'SET_VOICE',
    'SET_BALANCE', 'SET_CHANNEL_MODE', 'SET_COMPRESSOR', 'GET_MEDIA_STATE',
    'TOGGLE_PLAY_PAUSE', 'TOGGLE_PLAYBACK', 'GET_FREQUENCY_DATA',
    'GET_NATIVE_MODE_STATUS', 'MUTE_MEDIA', 'UNMUTE_MEDIA'
  ];

  // Valid presets/modes
  const VALID_CHANNEL_MODES = ['stereo', 'mono', 'swap'];
  const VALID_COMPRESSOR_PRESETS = ['off', 'podcast', 'movie', 'maximum'];

  // Listen for messages from background script and popup
  browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Security: Validate sender is from our extension
    if (!isValidSender(sender)) {
      console.warn('[TabVolume] Ignoring message from unknown sender');
      return false;
    }

    // Security: Validate message type
    if (!request || !isValidString(request.type, VALID_MESSAGE_TYPES)) {
      console.warn('[TabVolume] Invalid message type:', request?.type);
      return false;
    }

    if (request.type === 'SET_VOLUME') {
      // Validate volume is a number between 0 and 500
      if (!isValidNumber(request.volume, 0, 500)) {
        sendResponse({ success: false, error: 'Invalid volume value' });
        return;
      }
      // Use native mode if globally enabled
      if (isGlobalNativeMode) {
        applyNativeVolumeToMedia(request.volume);
        currentVolume = Math.min(100, request.volume); // Track capped value
      } else {
        applyVolume(request.volume);
      }
      sendResponse({ success: true });
    } else if (request.type === 'SET_DEVICE') {
      // Handle device switching with cross-context resolution
      (async () => {
        // Firefox: Mode is determined by device selection
        // Custom device = 'device' mode (uses setSinkId), Default = 'boost' mode (uses GainNode)
        if (isFirefox) {
          audioMode = request.deviceId ? 'device' : 'boost';
        }
        console.log('[TabVolume] SET_DEVICE received:', request.deviceId, request.deviceLabel, 'audioMode:', audioMode);
        let deviceIdToUse = request.deviceId;
        const deviceLabel = request.deviceLabel || '';
        console.log('[TabVolume] Starting device resolution...');

        // If we have a device label, resolve it to a local device ID
        // Device IDs from offscreen document don't work in content script context
        if (request.deviceLabel && request.deviceId) {
          const localDeviceId = await resolveDeviceByLabel(request.deviceLabel);
          if (localDeviceId) {
            deviceIdToUse = localDeviceId;
            console.log('[TabVolume] Using locally-resolved device ID:', deviceIdToUse);
          } else {
            // Couldn't find device by label, try original ID as fallback
            console.log('[TabVolume] Label resolution failed, trying original ID');
          }
        }

        const result = await applyDeviceToAllMedia(deviceIdToUse, deviceLabel);
        sendResponse({
          success: result.success,
          notFound: result.notFound || false,
          error: result.success ? null : 'Device switching failed or no media elements found'
        });
      })().catch((e) => {
        console.error('[TabVolume] SET_DEVICE error:', e.message, e.stack);
        sendResponse({
          success: false,
          notFound: e.name === 'NotFoundError',
          error: `Device switching error: ${e.message}`
        });
      });
      return true;
    } else if (request.type === 'GET_DEVICES') {
      enumerateAudioDevices(request.requestPermission).then(devices => {
        sendResponse({ devices });
      });
      return true;
    } else if (request.type === 'SET_BASS') {
      // Validate gain is a number between -24 and 24 dB
      if (!isValidNumber(request.gain, -24, 24)) {
        sendResponse({ success: false, error: 'Invalid bass gain value' });
        return;
      }
      applyBassBoost(request.gain);
      sendResponse({ success: true });
    } else if (request.type === 'SET_TREBLE') {
      // Validate gain is a number between -24 and 24 dB
      if (!isValidNumber(request.gain, -24, 24)) {
        sendResponse({ success: false, error: 'Invalid treble gain value' });
        return;
      }
      applyTrebleBoost(request.gain);
      sendResponse({ success: true });
    } else if (request.type === 'SET_VOICE') {
      // Validate gain is a number between 0 and 24 dB
      if (!isValidNumber(request.gain, 0, 24)) {
        sendResponse({ success: false, error: 'Invalid voice gain value' });
        return;
      }
      applyVoiceBoost(request.gain);
      sendResponse({ success: true });
    } else if (request.type === 'SET_BALANCE') {
      // Validate pan is a number between -1 and 1 (or -100 to 100 for percentage)
      const pan = request.pan !== undefined ? request.pan : request.balance;
      if (!isValidNumber(pan, -100, 100)) {
        sendResponse({ success: false, error: 'Invalid balance value' });
        return;
      }
      // Normalize to -1 to 1 range if given as percentage
      const normalizedPan = Math.abs(pan) > 1 ? pan / 100 : pan;
      applyBalance(normalizedPan);
      sendResponse({ success: true });
    } else if (request.type === 'SET_CHANNEL_MODE') {
      // Validate mode is one of allowed values
      if (!isValidString(request.mode, VALID_CHANNEL_MODES)) {
        sendResponse({ success: false, error: 'Invalid channel mode' });
        return;
      }
      applyChannelMode(request.mode);
      sendResponse({ success: true });
    } else if (request.type === 'SET_COMPRESSOR') {
      // Validate preset is one of allowed values
      if (!isValidString(request.preset, VALID_COMPRESSOR_PRESETS)) {
        sendResponse({ success: false, error: 'Invalid compressor preset' });
        return;
      }
      applyCompressor(request.preset);
      sendResponse({ success: true });
    } else if (request.type === 'GET_MEDIA_STATE') {
      // Check if any media is currently playing
      const mediaElements = document.querySelectorAll('audio, video');
      let isPlaying = false;
      mediaElements.forEach(element => {
        if (!element.paused && element.readyState >= 1) {
          isPlaying = true;
        }
      });
      sendResponse({ isPlaying });
    } else if (request.type === 'TOGGLE_PLAY_PAUSE') {
      // Toggle play/pause using fallback methods (works on Spotify, YouTube, etc.)
      const result = toggleMediaPlayPause();
      sendResponse({ success: result.success, isPlaying: result.isPlaying });
    } else if (request.type === 'TOGGLE_PLAYBACK') {
      // Toggle play/pause for media elements (used by context menu)
      // Uses same fallback methods as TOGGLE_PLAY_PAUSE
      const result = toggleMediaPlayPause();
      sendResponse({ success: result.success, action: result.isPlaying ? 'playing' : 'paused' });
    } else if (request.type === 'GET_FREQUENCY_DATA') {
      // Get frequency and waveform data from the first media element with an analyser
      const mediaElements = document.querySelectorAll('audio, video');
      let frequencyData = null;
      let waveformData = null;
      let isPlaying = false;

      // Check if any media is playing
      for (const element of mediaElements) {
        if (!element.paused && element.readyState >= 2) {
          isPlaying = true;
          break;
        }
      }

      for (const element of mediaElements) {
        const data = mediaGainNodes.get(element);
        if (data && data.analyser && !element.paused) {
          const bufferLength = data.analyser.frequencyBinCount;
          const freqArray = new Uint8Array(bufferLength);
          const waveArray = new Uint8Array(bufferLength);
          data.analyser.getByteFrequencyData(freqArray);
          data.analyser.getByteTimeDomainData(waveArray);
          frequencyData = Array.from(freqArray);
          waveformData = Array.from(waveArray);
          break;
        }
      }

      // If no data from content script analyser, try page script (for Web Audio API sites like YouTube)
      if (!frequencyData) {
        // Request from page script with timeout
        let responded = false;
        const responseHandler = (e) => {
          if (responded) return;
          responded = true;
          window.removeEventListener('__tabVolumeControl_frequencyDataResponse', responseHandler);
          sendResponse({
            frequencyData: e.detail?.frequencyData || null,
            waveformData: e.detail?.waveformData || null,
            isPlaying
          });
        };
        window.addEventListener('__tabVolumeControl_frequencyDataResponse', responseHandler);

        // Request data from page script
        window.dispatchEvent(new CustomEvent('__tabVolumeControl_getFrequencyData', {
          detail: createEventDetail({})
        }));

        // Timeout after 50ms - if no response, return null
        setTimeout(() => {
          if (!responded) {
            responded = true;
            window.removeEventListener('__tabVolumeControl_frequencyDataResponse', responseHandler);
            sendResponse({ frequencyData: null, waveformData: null, isPlaying });
          }
        }, 50);

        return true; // Keep channel open for async response
      }

      sendResponse({ frequencyData, waveformData, isPlaying });
    } else if (request.type === 'MUTE_MEDIA') {
      // Mute all media elements directly (backup for browser tab mute)
      const mediaElements = document.querySelectorAll('audio, video');
      let mutedCount = 0;
      for (const element of mediaElements) {
        if (!element.muted) {
          element.muted = true;
          mutedCount++;
        }
      }
      sendResponse({ success: true, mutedCount });
    } else if (request.type === 'UNMUTE_MEDIA') {
      // Unmute all media elements directly
      const mediaElements = document.querySelectorAll('audio, video');
      let unmutedCount = 0;
      for (const element of mediaElements) {
        if (element.muted) {
          element.muted = false;
          unmutedCount++;
        }
      }
      sendResponse({ success: true, unmutedCount });
    } else if (request.type === 'GET_NATIVE_MODE_STATUS') {
      // Report native mode status (for popup UI)
      const mediaElements = document.querySelectorAll('audio, video');
      sendResponse({
        isNativeMode: isGlobalNativeMode,
        reason: isGlobalNativeMode ? 'global' : null,
        mediaCount: mediaElements.length,
        currentVolume: isGlobalNativeMode ? nativeModeVolume : currentVolume
      });
    }
    return true;
  });

  // ==================== Port-Based Visualizer Streaming ====================
  // More efficient than polling - content script pushes data to popup

  let visualizerPort = null;
  let visualizerInterval = null;
  const VISUALIZER_PUSH_INTERVAL = 50; // Push data every 50ms (20fps) - popup renders at 60fps

  // Reusable typed arrays to avoid allocation overhead
  let freqArrayBuffer = null;
  let waveArrayBuffer = null;

  function getFrequencyDataForPort() {
    const mediaElements = document.querySelectorAll('audio, video');
    let frequencyData = null;
    let waveformData = null;
    let isPlaying = false;
    let isMuted = false;

    // Check if any media is playing and if it's muted
    for (const element of mediaElements) {
      if (!element.paused && element.readyState >= 2) {
        isPlaying = true;
        // Check if this playing element is muted (either muted property or volume is 0)
        if (element.muted || element.volume === 0) {
          isMuted = true;
        }
        break;
      }
    }

    // Get data from content script analyser
    for (const element of mediaElements) {
      const data = mediaGainNodes.get(element);
      if (data && data.analyser && !element.paused) {
        const bufferLength = data.analyser.frequencyBinCount;

        // Reuse arrays to avoid allocation
        if (!freqArrayBuffer || freqArrayBuffer.length !== bufferLength) {
          freqArrayBuffer = new Uint8Array(bufferLength);
          waveArrayBuffer = new Uint8Array(bufferLength);
        }

        data.analyser.getByteFrequencyData(freqArrayBuffer);
        data.analyser.getByteTimeDomainData(waveArrayBuffer);
        frequencyData = Array.from(freqArrayBuffer);
        waveformData = Array.from(waveArrayBuffer);
        break;
      }
    }

    return { frequencyData, waveformData, isPlaying, isMuted };
  }

  function startVisualizerStream() {
    if (visualizerInterval) return; // Already running

    visualizerInterval = setInterval(() => {
      if (!visualizerPort) {
        stopVisualizerStream();
        return;
      }

      try {
        const data = getFrequencyDataForPort();
        visualizerPort.postMessage({ type: 'FREQUENCY_DATA', ...data });
      } catch (e) {
        // Port disconnected
        stopVisualizerStream();
      }
    }, VISUALIZER_PUSH_INTERVAL);
  }

  function stopVisualizerStream() {
    if (visualizerInterval) {
      clearInterval(visualizerInterval);
      visualizerInterval = null;
    }
    visualizerPort = null;
  }

  // Listen for port connections from popup
  browserAPI.runtime.onConnect.addListener((port) => {
    if (port.name !== 'visualizer') return;

    console.log('[TabVolume] Visualizer port connected');
    visualizerPort = port;

    // Start pushing data
    startVisualizerStream();

    // Clean up when port disconnects (popup closes)
    port.onDisconnect.addListener(() => {
      console.log('[TabVolume] Visualizer port disconnected');
      stopVisualizerStream();
    });
  });

  // Initialize
  async function initialize() {
    // Check if extension is disabled on this domain
    if (await isDomainDisabled()) {
      extensionDisabledOnDomain = true;
      // Also set localStorage for page-script.js to check synchronously on page load
      // This ensures the flag persists even if localStorage was cleared
      try {
        const domain = window.location.hostname;
        localStorage.setItem('__tabVolumeControl_disabled_' + domain, 'true');
      } catch (e) {
        // localStorage might be blocked
      }
      console.log('[TabVolume] Extension disabled on this domain, skipping initialization');
      return;
    }

    // Check effective audio mode for this site (Tab Capture, Web Audio, or Native)
    // When Tab Capture is active, we DON'T process media through Web Audio API
    // This avoids CORS issues with cross-origin media (Facebook videos, embedded content)
    const effectiveMode = await getEffectiveAudioMode();
    if (effectiveMode === 'tabcapture' && !isFirefox) {
      isTabCaptureMode = true;
      console.log('[TabVolume] Tab Capture mode active - content script will not process media elements');
      // Note: We don't return here - we still need to set up message listeners and report media
    }

    // Check for global native mode setting
    try {
      const settings = await browserAPI.storage.sync.get(['defaultAudioMode']);
      const defaultMode = settings.defaultAudioMode || (isFirefox ? 'auto' : 'tabcapture');

      if (defaultMode === 'native') {
        isGlobalNativeMode = true;
        console.log('[TabVolume] Global Native Mode enabled - using native volume control only');

        // Get saved volume from background and apply native volume (capped at 100%)
        try {
          const response = await browserAPI.runtime.sendMessage({ type: 'CONTENT_READY' });
          if (response && response.volume !== undefined) {
            currentVolume = response.volume;
            // Apply native volume (capped at 100% since no boost available)
            applyNativeVolumeToMedia(Math.min(100, response.volume));
          }
        } catch (e) {
          // Background might not be ready, use default
          applyNativeVolumeToMedia(100);
        }

        // Watch for new media elements and apply native volume
        const nativeModeObserver = new MutationObserver(() => {
          const normalizedVolume = nativeModeVolume / 100;
          document.querySelectorAll('audio, video').forEach(el => {
            if (el.volume !== normalizedVolume) {
              el.volume = normalizedVolume;
            }
          });
        });
        nativeModeObserver.observe(document.documentElement, { childList: true, subtree: true });

        // Report media presence to background (for tab navigation)
        const mediaElements = document.querySelectorAll('audio, video');
        if (mediaElements.length > 0) {
          browserAPI.runtime.sendMessage({ type: 'HAS_MEDIA' }).catch(() => {});
        }

        return; // Skip full audio processing setup
      }
    } catch (e) {
      console.log('[TabVolume] Error checking default audio mode:', e.message);
    }

    try {
      const response = await browserAPI.runtime.sendMessage({ type: 'CONTENT_READY' });
      if (response && response.volume !== undefined) {
        currentVolume = response.volume;

        // Firefox: Set mode based on whether a device is saved for this tab
        // If deviceId exists in response, we're in device mode
        if (isFirefox) {
          audioMode = response.deviceId ? 'device' : 'boost';
          console.log('[TabVolume] Init: audioMode =', audioMode, 'deviceId =', response.deviceId || 'none');
        }

        initPageScript(response.volume);
        applyVolumeToMedia(response.volume);
        processAllMedia();

        // Apply saved device if set (only in device mode for Firefox, always for Chrome)
        if (response.deviceId && (audioMode === 'device' || !isFirefox)) {
          let deviceIdToUse = response.deviceId;

          // Resolve device by label if available (for cross-context compatibility)
          if (response.deviceLabel) {
            const localDeviceId = await resolveDeviceByLabel(response.deviceLabel);
            if (localDeviceId) {
              deviceIdToUse = localDeviceId;
              console.log('[TabVolume] Initialization: Using locally-resolved device ID');
            }
          }

          currentDeviceId = deviceIdToUse;
          applyDeviceToAllMedia(deviceIdToUse, response.deviceLabel);
        }
      }
    } catch (e) {
      // Background script might not be ready, use defaults
      initPageScript(100);
    }
  }

  // Note: No visibility handler needed - AudioContext auto-resumes when media plays

  // Report to background when media elements are detected (for paused media tab navigation)
  let hasReportedMedia = false;
  function checkAndReportMedia() {
    if (hasReportedMedia) return;

    const mediaElements = document.querySelectorAll('audio, video');
    if (mediaElements.length > 0) {
      hasReportedMedia = true;
      browserAPI.runtime.sendMessage({ type: 'HAS_MEDIA' }).catch(() => {});
    }
  }

  // Watch for new media elements being added to the page
  const mediaObserver = new MutationObserver((mutations) => {
    if (hasReportedMedia) return;

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'AUDIO' || node.tagName === 'VIDEO' ||
              node.querySelector('audio, video')) {
            checkAndReportMedia();
            return;
          }
        }
      }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initialize();
      checkAndReportMedia();
      mediaObserver.observe(document.body, { childList: true, subtree: true });
    });
  } else {
    initialize();
    checkAndReportMedia();
    if (document.body) {
      mediaObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  window.addEventListener('load', () => {
    processAllMedia();
    checkAndReportMedia();
  });

})();
