// Offscreen document for Tab Capture visualizer and audio device enumeration
// Chrome-only feature - this file is not used in Firefox

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Debug flag - set to true for verbose logging during development
const DEBUG = false;
const log = (...args) => DEBUG && console.log('[Offscreen]', ...args);

log('Document loaded');

// ==================== Visualizer Tab Capture State ====================
// Track visualizer captures per tab (can have multiple tabs captured)
const visualizerCaptures = new Map(); // tabId -> { audioContext, analyser, stream, freqArray, waveArray }

// ===== DUPLICATED CONSTANTS — KEEP IN SYNC =====
// Source of truth: shared/constants.js
// Also duplicated in: background.js, content/content.js, content/page-script.js
// Reason: Offscreen document can't access shared script tags
const VOLUME_DEFAULT = 100;
const VOLUME_MIN = 0;
const VOLUME_MAX = 500;
const EFFECT_RANGES = {
  bass: { min: -24, max: 24 },
  treble: { min: -24, max: 24 },
  voice: { min: 0, max: 18 },
  speed: { min: 0.05, max: 5 }
};

// ===== COMPRESSOR COMPENSATION — KEEP IN SYNC =====
// Source of truth: content/content.js
// Reduce gain to maintain similar perceived loudness (values are approximate)
const COMPRESSOR_COMPENSATION = {
  off: 1.0,       // No compensation needed
  podcast: 0.80,  // -1.9dB - light compression
  movie: 0.65,    // -3.7dB - medium compression
  maximum: 0.50   // -6dB - heavy compression
};

// ==================== Message Handler ====================
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Security: Validate sender is our extension
  if (sender.id !== browserAPI.runtime.id) {
    console.warn('[Offscreen] Rejected message from unauthorized sender:', sender.id);
    return false;
  }

  // Security: Validate message type is a string
  if (typeof message.type !== 'string') {
    console.warn('[Offscreen] Invalid message type:', typeof message.type);
    return false;
  }

  log('Received message:', message.type);

  switch (message.type) {
    case 'GET_AUDIO_DEVICES':
      handleGetDevices(message.requestPermission).then(sendResponse);
      return true;

    case 'START_VISUALIZER_CAPTURE':
      handleStartVisualizerCapture(message.streamId, message.tabId).then(sendResponse);
      return true;

    case 'STOP_VISUALIZER_CAPTURE':
      handleStopVisualizerCapture(message.tabId).then(sendResponse);
      return true;

    case 'GET_VISUALIZER_DATA':
      const data = getVisualizerData(message.tabId);
      sendResponse(data);
      return false;

    case 'GET_VISUALIZER_CAPTURE_STATUS':
      const isActive = visualizerCaptures.has(message.tabId);
      sendResponse({ isActive, tabId: message.tabId });
      return false;

    case 'STOP_ALL_VISUALIZER_CAPTURES':
      handleStopAllVisualizerCaptures().then(sendResponse);
      return true;

    case 'TAB_REMOVED':
      // Clean up capture when tab is closed
      if (message.tabId) {
        handleStopVisualizerCapture(message.tabId);
      }
      return false;

    // ==================== Tab Capture Audio Control ====================
    case 'SET_TAB_CAPTURE_VOLUME':
      sendResponse({ success: setTabCaptureVolume(message.tabId, message.volume) });
      return false;

    case 'SET_TAB_CAPTURE_BASS':
      sendResponse({ success: setTabCaptureBass(message.tabId, message.gain) });
      return false;

    case 'SET_TAB_CAPTURE_TREBLE':
      sendResponse({ success: setTabCaptureTreble(message.tabId, message.gain) });
      return false;

    case 'SET_TAB_CAPTURE_VOICE':
      sendResponse({ success: setTabCaptureVoice(message.tabId, message.gain) });
      return false;

    case 'SET_TAB_CAPTURE_BALANCE':
      sendResponse({ success: setTabCaptureBalance(message.tabId, message.pan) });
      return false;

    case 'SET_TAB_CAPTURE_DEVICE':
      setTabCaptureDevice(message.tabId, message.deviceId, message.deviceLabel).then(sendResponse);
      return true;

    case 'SET_TAB_CAPTURE_COMPRESSOR':
      sendResponse({ success: setTabCaptureCompressor(message.tabId, message.preset) });
      return false;

    case 'SET_TAB_CAPTURE_CHANNEL_MODE':
      sendResponse({ success: setTabCaptureChannelMode(message.tabId, message.mode) });
      return false;

    case 'GET_TAB_CAPTURE_MODE':
      const hasCapture = visualizerCaptures.has(message.tabId);
      sendResponse({ success: true, isTabCaptureMode: hasCapture });
      return false;

    default:
      log('Unknown message type:', message.type);
      return false;
  }
});

// ==================== Tab Capture Audio Control Functions ====================

// Security: Validate numeric parameters to prevent NaN/Infinity issues
function isValidTabId(tabId) {
  return Number.isInteger(tabId) && tabId > 0;
}

function isValidVolume(volume) {
  return Number.isFinite(volume) && volume >= VOLUME_MIN && volume <= VOLUME_MAX;
}

function isValidGainDb(gainDb, effectType) {
  const range = effectType === 'voice' ? EFFECT_RANGES.voice : EFFECT_RANGES.bass;
  return Number.isFinite(gainDb) && gainDb >= range.min && gainDb <= range.max;
}

function isValidPan(pan) {
  return Number.isFinite(pan) && pan >= -1 && pan <= 1;
}

const VALID_CHANNEL_MODES = ['stereo', 'mono', 'swap'];

function setTabCaptureVolume(tabId, volume) {
  if (!isValidTabId(tabId) || !isValidVolume(volume)) {
    console.warn('[Offscreen] Invalid params for setTabCaptureVolume:', { tabId, volume });
    return false;
  }

  const capture = visualizerCaptures.get(tabId);
  if (!capture || !capture.gainNode) return true;

  try {
    // Track current volume for compressor compensation
    capture.currentVolume = volume;

    // Apply compressor compensation if active
    const compensation = COMPRESSOR_COMPENSATION[capture.currentCompressor] || 1.0;
    const baseGain = Math.max(volume / 100, 0.0001);
    const compensatedGain = baseGain * compensation;

    capture.gainNode.gain.setTargetAtTime(
      volume === 0 ? 0 : compensatedGain,
      capture.audioContext.currentTime,
      0.03
    );

    // Update limiter based on volume
    if (capture.limiter) {
      capture.limiter.threshold.value = volume > 100 ? -1 : 0;
    }

    log('Set volume for tab', tabId, ':', volume, '(compensated:', compensatedGain.toFixed(3), ')');
    return true;
  } catch (e) {
    console.error('[Offscreen] Error setting volume:', e);
    return false;
  }
}

function setTabCaptureBass(tabId, gainDb) {
  if (!isValidTabId(tabId) || !isValidGainDb(gainDb, 'bass')) {
    console.warn('[Offscreen] Invalid params for setTabCaptureBass:', { tabId, gainDb });
    return false;
  }

  const capture = visualizerCaptures.get(tabId);
  if (!capture || !capture.bassFilter) return true;

  try {
    capture.bassFilter.gain.setTargetAtTime(gainDb, capture.audioContext.currentTime, 0.03);
    log('Set bass for tab', tabId, ':', gainDb);
    return true;
  } catch (e) {
    console.error('[Offscreen] Error setting bass:', e);
    return false;
  }
}

function setTabCaptureTreble(tabId, gainDb) {
  if (!isValidTabId(tabId) || !isValidGainDb(gainDb, 'treble')) {
    console.warn('[Offscreen] Invalid params for setTabCaptureTreble:', { tabId, gainDb });
    return false;
  }

  const capture = visualizerCaptures.get(tabId);
  if (!capture || !capture.trebleFilter) return true;

  try {
    capture.trebleFilter.gain.setTargetAtTime(gainDb, capture.audioContext.currentTime, 0.03);
    log('Set treble for tab', tabId, ':', gainDb);
    return true;
  } catch (e) {
    console.error('[Offscreen] Error setting treble:', e);
    return false;
  }
}

function setTabCaptureVoice(tabId, gainDb) {
  if (!isValidTabId(tabId) || !isValidGainDb(gainDb, 'voice')) {
    console.warn('[Offscreen] Invalid params for setTabCaptureVoice:', { tabId, gainDb });
    return false;
  }

  const capture = visualizerCaptures.get(tabId);
  if (!capture || !capture.voiceFilter) return true;

  try {
    capture.voiceFilter.gain.setTargetAtTime(gainDb, capture.audioContext.currentTime, 0.03);
    log('Set voice for tab', tabId, ':', gainDb);
    return true;
  } catch (e) {
    console.error('[Offscreen] Error setting voice:', e);
    return false;
  }
}

function setTabCaptureBalance(tabId, pan) {
  if (!isValidTabId(tabId) || !isValidPan(pan)) {
    console.warn('[Offscreen] Invalid params for setTabCaptureBalance:', { tabId, pan });
    return false;
  }

  const capture = visualizerCaptures.get(tabId);
  if (!capture || !capture.stereoPanner) return true;

  try {
    capture.stereoPanner.pan.setTargetAtTime(pan, capture.audioContext.currentTime, 0.03);
    log('Set balance for tab', tabId, ':', pan);
    return true;
  } catch (e) {
    console.error('[Offscreen] Error setting balance:', e);
    return false;
  }
}

function setTabCaptureCompressor(tabId, preset) {
  if (!isValidTabId(tabId)) {
    console.warn('[Offscreen] Invalid tabId for setTabCaptureCompressor:', tabId);
    return false;
  }
  const validPresets = ['off', 'podcast', 'movie', 'maximum'];
  if (!validPresets.includes(preset)) {
    console.warn('[Offscreen] Invalid compressor preset:', preset);
    return false;
  }

  const capture = visualizerCaptures.get(tabId);
  if (!capture || !capture.compressor) return true;

  try {
    const compressor = capture.compressor;
    const currentTime = capture.audioContext.currentTime;

    // Apply compressor settings based on preset
    switch (preset) {
      case 'podcast':
        compressor.threshold.setTargetAtTime(-20, currentTime, 0.03);
        compressor.knee.setTargetAtTime(10, currentTime, 0.03);
        compressor.ratio.setTargetAtTime(3, currentTime, 0.03);
        compressor.attack.setTargetAtTime(0.005, currentTime, 0.03);
        compressor.release.setTargetAtTime(0.25, currentTime, 0.03);
        break;
      case 'movie':
        compressor.threshold.setTargetAtTime(-30, currentTime, 0.03);
        compressor.knee.setTargetAtTime(8, currentTime, 0.03);
        compressor.ratio.setTargetAtTime(5, currentTime, 0.03);
        compressor.attack.setTargetAtTime(0.003, currentTime, 0.03);
        compressor.release.setTargetAtTime(0.2, currentTime, 0.03);
        break;
      case 'maximum':
        compressor.threshold.setTargetAtTime(-40, currentTime, 0.03);
        compressor.knee.setTargetAtTime(5, currentTime, 0.03);
        compressor.ratio.setTargetAtTime(10, currentTime, 0.03);
        compressor.attack.setTargetAtTime(0.001, currentTime, 0.03);
        compressor.release.setTargetAtTime(0.1, currentTime, 0.03);
        break;
      case 'off':
      default:
        // Bypass: high threshold = no compression
        compressor.threshold.setTargetAtTime(0, currentTime, 0.03);
        compressor.knee.setTargetAtTime(10, currentTime, 0.03);
        compressor.ratio.setTargetAtTime(1, currentTime, 0.03);
        compressor.attack.setTargetAtTime(0.003, currentTime, 0.03);
        compressor.release.setTargetAtTime(0.25, currentTime, 0.03);
        break;
    }

    // Store current preset for compensation calculation
    capture.currentCompressor = preset;

    // Apply compensation to gain node if it exists
    if (capture.gainNode && capture.currentVolume !== undefined) {
      const compensation = COMPRESSOR_COMPENSATION[preset] || 1.0;
      const baseGain = capture.currentVolume / 100;
      const compensatedGain = Math.max(baseGain * compensation, 0.0001);
      capture.gainNode.gain.setTargetAtTime(
        capture.currentVolume === 0 ? 0 : compensatedGain,
        currentTime,
        0.03
      );
    }

    log('Set compressor for tab', tabId, ':', preset);
    return true;
  } catch (e) {
    console.error('[Offscreen] Error setting compressor:', e);
    return false;
  }
}

function setTabCaptureChannelMode(tabId, mode) {
  if (!isValidTabId(tabId)) {
    console.warn('[Offscreen] Invalid tabId for setTabCaptureChannelMode:', tabId);
    return false;
  }
  if (!VALID_CHANNEL_MODES.includes(mode)) {
    console.warn('[Offscreen] Invalid channel mode:', mode);
    return false;
  }

  const capture = visualizerCaptures.get(tabId);
  if (!capture || !capture.channelGains) return true;

  try {
    const { ll, lr, rl, rr } = capture.channelGains;
    const t = capture.audioContext.currentTime;
    const tc = 0.03;

    switch (mode) {
      case 'stereo':
        ll.gain.setTargetAtTime(1, t, tc);
        lr.gain.setTargetAtTime(0, t, tc);
        rl.gain.setTargetAtTime(0, t, tc);
        rr.gain.setTargetAtTime(1, t, tc);
        break;
      case 'mono':
        ll.gain.setTargetAtTime(0.5, t, tc);
        lr.gain.setTargetAtTime(0.5, t, tc);
        rl.gain.setTargetAtTime(0.5, t, tc);
        rr.gain.setTargetAtTime(0.5, t, tc);
        break;
      case 'swap':
        ll.gain.setTargetAtTime(0, t, tc);
        lr.gain.setTargetAtTime(1, t, tc);
        rl.gain.setTargetAtTime(1, t, tc);
        rr.gain.setTargetAtTime(0, t, tc);
        break;
    }

    log('Set channel mode for tab', tabId, ':', mode);
    return true;
  } catch (e) {
    console.error('[Offscreen] Error setting channel mode:', e);
    return false;
  }
}

async function setTabCaptureDevice(tabId, deviceId, deviceLabel) {
  log('setTabCaptureDevice called:', { tabId, deviceId, deviceLabel });
  log('Active captures:', Array.from(visualizerCaptures.keys()));

  const capture = visualizerCaptures.get(tabId);
  if (!capture || !capture.audioElement) {
    log('No capture/audioElement found for tab', tabId);
    return { success: false, error: 'No active capture for this tab' };
  }

  try {
    // Check if setSinkId is supported on the audio element
    if (typeof capture.audioElement.setSinkId !== 'function') {
      console.error('[Offscreen] setSinkId not supported on Audio element');
      return { success: false, error: 'Device switching not supported in this browser' };
    }

    // If deviceId is empty but we have a label, try to find the device by label
    let targetDeviceId = deviceId;
    if (!targetDeviceId && deviceLabel && typeof deviceLabel === 'string' && deviceLabel.length <= 500) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const matchingDevice = devices.find(d =>
        d.kind === 'audiooutput' && d.label === deviceLabel
      );
      if (matchingDevice) {
        targetDeviceId = matchingDevice.deviceId;
        log('Resolved device by label:', deviceLabel, '->', targetDeviceId);
      }
    }

    // Set the output device on the Audio element
    // The audio chain goes: filters -> MediaStreamDestination -> Audio element -> speakers
    // So we need to set the sink on the Audio element, not the AudioContext
    const sinkId = targetDeviceId || '';
    await capture.audioElement.setSinkId(sinkId);

    log('Set device for tab', tabId, ':', deviceLabel || sinkId || 'default');
    return { success: true };
  } catch (e) {
    console.error('[Offscreen] Error setting device:', e);
    return { success: false, error: e.message };
  }
}

// ==================== Device Enumeration ====================
async function handleGetDevices(requestPermission) {
  log('handleGetDevices called, requestPermission:', requestPermission);

  try {
    if (!navigator.mediaDevices) {
      console.error('[Offscreen] navigator.mediaDevices not available');
      return { success: false, error: 'mediaDevices not available' };
    }

    let permissionGranted = false;
    if (requestPermission) {
      try {
        log('Calling getUserMedia({ audio: true })...');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        permissionGranted = true;
      } catch (e) {
        console.debug('[Offscreen] getUserMedia error:', e.name, e.message);
        permissionGranted = false;
      }
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioOutputs = devices
      .filter(d => d.kind === 'audiooutput')
      .map(d => ({
        deviceId: d.deviceId,
        label: d.label || `Audio Device ${d.deviceId.slice(0, 8) || 'Unknown'}...`,
        groupId: d.groupId
      }));

    log('Found audio outputs:', audioOutputs);
    return { success: true, devices: audioOutputs, permissionGranted };
  } catch (e) {
    console.error('[Offscreen] Error:', e);
    return { success: false, error: e.message };
  }
}

// ==================== Visualizer Tab Capture ====================

/**
 * Start a visualizer-only Tab Capture for a specific tab
 * This is a lightweight capture that just provides analyser data
 * Audio is passed through unchanged to the destination
 */
async function handleStartVisualizerCapture(streamId, tabId) {
  log('Starting visualizer capture for tab:', tabId);

  // Validate streamId before attempting capture
  if (!streamId || typeof streamId !== 'string' || streamId.length > 500) {
    console.error('[Offscreen] Invalid streamId provided');
    return { success: false, error: 'Invalid streamId' };
  }

  try {
    // Check if already capturing this tab
    if (visualizerCaptures.has(tabId)) {
      log('Already capturing tab', tabId);
      return { success: true, alreadyCapturing: true };
    }

    // Get the media stream using the stream ID from tabCapture
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

    log('Got media stream for tab', tabId);

    // Create audio context
    const audioContext = new AudioContext();

    // Resume AudioContext if suspended (Chrome autoplay policy)
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    // Create source from the captured stream
    const source = audioContext.createMediaStreamSource(stream);

    // ==================== Audio Processing Chain ====================
    // Create processing nodes for full audio control via Tab Capture

    // Bass filter (low shelf at 200Hz)
    const bassFilter = audioContext.createBiquadFilter();
    bassFilter.type = 'lowshelf';
    bassFilter.frequency.value = 200;
    bassFilter.gain.value = 0;

    // Treble filter (high shelf at 6kHz)
    const trebleFilter = audioContext.createBiquadFilter();
    trebleFilter.type = 'highshelf';
    trebleFilter.frequency.value = 6000;
    trebleFilter.gain.value = 0;

    // Voice filter (peaking at 3kHz)
    const voiceFilter = audioContext.createBiquadFilter();
    voiceFilter.type = 'peaking';
    voiceFilter.frequency.value = 3000;
    voiceFilter.Q.value = 1.0;
    voiceFilter.gain.value = 0;

    // Compressor for dynamic range compression (podcast/movie/maximum modes)
    // Default to bypassed state (high threshold = no compression)
    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = 0;  // 0 dB = no compression
    compressor.knee.value = 10;
    compressor.ratio.value = 1;      // 1:1 = no compression
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    // Channel mode matrix (stereo/mono/swap)
    const channelSplitter = audioContext.createChannelSplitter(2);
    const channelMerger = audioContext.createChannelMerger(2);
    const llGain = audioContext.createGain(); // Left → Left
    const lrGain = audioContext.createGain(); // Left → Right
    const rlGain = audioContext.createGain(); // Right → Left
    const rrGain = audioContext.createGain(); // Right → Right
    // Default: stereo (straight through)
    llGain.gain.value = 1;
    lrGain.gain.value = 0;
    rlGain.gain.value = 0;
    rrGain.gain.value = 1;
    // Wire the matrix: split → route through gains → merge
    channelSplitter.connect(llGain, 0); // Left channel out
    channelSplitter.connect(rlGain, 1); // Right channel out
    llGain.connect(channelMerger, 0, 0);  // L→L into left
    rlGain.connect(channelMerger, 0, 0);  // R→L into left
    channelSplitter.connect(lrGain, 0); // Left channel out
    channelSplitter.connect(rrGain, 1); // Right channel out
    lrGain.connect(channelMerger, 0, 1);  // L→R into right
    rrGain.connect(channelMerger, 0, 1);  // R→R into right

    // Stereo panner for balance
    const stereoPanner = audioContext.createStereoPanner();
    stereoPanner.pan.value = 0;

    // Master gain for volume control
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 1.0;

    // Limiter (compressor configured as limiter)
    const limiter = audioContext.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;

    // Analyser for visualization
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.85; // Higher = smoother transitions, less flickering
    analyser.maxDecibels = -10;
    analyser.minDecibels = -90;

    // Create MediaStreamDestination for processed output
    const destination = audioContext.createMediaStreamDestination();

    // Connect processing chain:
    // source → bass → treble → voice → compressor → channelMatrix → panner → gain → limiter → analyser → destination
    source.connect(bassFilter);
    bassFilter.connect(trebleFilter);
    trebleFilter.connect(voiceFilter);
    voiceFilter.connect(compressor);
    compressor.connect(channelSplitter);
    channelMerger.connect(stereoPanner);
    stereoPanner.connect(gainNode);
    gainNode.connect(limiter);
    limiter.connect(analyser);
    analyser.connect(destination);

    // Play processed audio through Audio element
    const audioElement = new Audio();
    audioElement.srcObject = destination.stream;
    await audioElement.play();

    // Pre-allocate typed arrays for efficiency
    const freqArray = new Uint8Array(analyser.frequencyBinCount);
    const waveArray = new Uint8Array(analyser.fftSize);

    // Store capture state with all processing nodes
    visualizerCaptures.set(tabId, {
      audioContext,
      analyser,
      stream,
      source,
      audioElement,
      // Processing nodes for control
      gainNode,
      bassFilter,
      trebleFilter,
      voiceFilter,
      compressor,
      stereoPanner,
      channelGains: { ll: llGain, lr: lrGain, rl: rlGain, rr: rrGain },
      limiter,
      freqArray,
      waveArray,
      // Track current values for compensation
      currentVolume: 100,
      currentCompressor: 'off'
    });

    // Clean up if stream tracks end unexpectedly (e.g., tab navigates or closes)
    stream.getTracks().forEach(track => {
      track.addEventListener('ended', () => {
        log('Stream track ended for tab', tabId, '- cleaning up');
        handleStopVisualizerCapture(tabId);
      });
    });

    log('Visualizer capture started for tab', tabId);
    return { success: true };

  } catch (e) {
    console.error('[Offscreen] Error starting visualizer capture:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Stop visualizer capture for a specific tab
 */
async function handleStopVisualizerCapture(tabId) {
  log('Stopping visualizer capture for tab:', tabId);

  const capture = visualizerCaptures.get(tabId);
  if (!capture) {
    log('No capture found for tab', tabId);
    return { success: true };
  }

  try {
    // Stop audio element playback
    if (capture.audioElement) {
      capture.audioElement.pause();
      capture.audioElement.srcObject = null;
    }

    // Stop all tracks in the media stream
    if (capture.stream) {
      capture.stream.getTracks().forEach(track => {
        track.stop();
      });
    }

    // Close audio context
    if (capture.audioContext && capture.audioContext.state !== 'closed') {
      await capture.audioContext.close();
    }

    // Remove from map
    visualizerCaptures.delete(tabId);

    log('Visualizer capture stopped for tab', tabId);
    return { success: true };

  } catch (e) {
    console.error('[Offscreen] Error stopping visualizer capture:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Stop all visualizer captures (e.g., on extension update)
 */
async function handleStopAllVisualizerCaptures() {
  log('Stopping all visualizer captures');

  const tabIds = Array.from(visualizerCaptures.keys());
  for (const tabId of tabIds) {
    await handleStopVisualizerCapture(tabId);
  }

  return { success: true, stoppedCount: tabIds.length };
}

/**
 * Get visualizer data (frequency and waveform) for a tab
 */
function getVisualizerData(tabId) {
  const capture = visualizerCaptures.get(tabId);

  if (!capture || !capture.analyser) {
    return {
      success: false,
      frequencyData: null,
      waveformData: null,
      isActive: false
    };
  }

  try {
    // Get frequency and waveform data
    capture.analyser.getByteFrequencyData(capture.freqArray);
    capture.analyser.getByteTimeDomainData(capture.waveArray);

    return {
      success: true,
      frequencyData: Array.from(capture.freqArray),
      waveformData: Array.from(capture.waveArray),
      isActive: true
    };
  } catch (e) {
    console.error('[Offscreen] Error getting visualizer data:', e);
    return {
      success: false,
      frequencyData: null,
      waveformData: null,
      isActive: false,
      error: e.message
    };
  }
}

