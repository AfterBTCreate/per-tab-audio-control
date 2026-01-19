// Offscreen document for Tab Capture visualizer and audio device enumeration
// Chrome-only feature - this file is not used in Firefox

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

console.log('[Offscreen] Document loaded');

// ==================== Visualizer Tab Capture State ====================
// Track visualizer captures per tab (can have multiple tabs captured)
const visualizerCaptures = new Map(); // tabId -> { audioContext, analyser, stream, freqArray, waveArray }

// ==================== Message Handler ====================
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Offscreen] Received message:', message.type);

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
      setTabCaptureVolume(message.tabId, message.volume);
      sendResponse({ success: true });
      return false;

    case 'SET_TAB_CAPTURE_BASS':
      setTabCaptureBass(message.tabId, message.gain);
      sendResponse({ success: true });
      return false;

    case 'SET_TAB_CAPTURE_TREBLE':
      setTabCaptureTreble(message.tabId, message.gain);
      sendResponse({ success: true });
      return false;

    case 'SET_TAB_CAPTURE_VOICE':
      setTabCaptureVoice(message.tabId, message.gain);
      sendResponse({ success: true });
      return false;

    case 'SET_TAB_CAPTURE_BALANCE':
      setTabCaptureBalance(message.tabId, message.pan);
      sendResponse({ success: true });
      return false;

    case 'SET_TAB_CAPTURE_DEVICE':
      setTabCaptureDevice(message.tabId, message.deviceId, message.deviceLabel).then(sendResponse);
      return true;

    case 'GET_TAB_CAPTURE_MODE':
      const hasCapture = visualizerCaptures.has(message.tabId);
      sendResponse({ success: true, isTabCaptureMode: hasCapture });
      return false;
  }

  return false;
});

// ==================== Tab Capture Audio Control Functions ====================

function setTabCaptureVolume(tabId, volume) {
  const capture = visualizerCaptures.get(tabId);
  if (!capture || !capture.gainNode) return;

  try {
    const gain = Math.max(volume / 100, 0.0001);
    capture.gainNode.gain.setTargetAtTime(
      volume === 0 ? 0 : gain,
      capture.audioContext.currentTime,
      0.03
    );

    // Update limiter based on volume
    if (capture.limiter) {
      capture.limiter.threshold.value = volume > 100 ? -1 : 0;
    }

    console.log('[Offscreen] Set volume for tab', tabId, ':', volume);
  } catch (e) {
    console.error('[Offscreen] Error setting volume:', e);
  }
}

function setTabCaptureBass(tabId, gainDb) {
  const capture = visualizerCaptures.get(tabId);
  if (!capture || !capture.bassFilter) return;

  try {
    capture.bassFilter.gain.setTargetAtTime(gainDb, capture.audioContext.currentTime, 0.03);
    console.log('[Offscreen] Set bass for tab', tabId, ':', gainDb);
  } catch (e) {
    console.error('[Offscreen] Error setting bass:', e);
  }
}

function setTabCaptureTreble(tabId, gainDb) {
  const capture = visualizerCaptures.get(tabId);
  if (!capture || !capture.trebleFilter) return;

  try {
    capture.trebleFilter.gain.setTargetAtTime(gainDb, capture.audioContext.currentTime, 0.03);
    console.log('[Offscreen] Set treble for tab', tabId, ':', gainDb);
  } catch (e) {
    console.error('[Offscreen] Error setting treble:', e);
  }
}

function setTabCaptureVoice(tabId, gainDb) {
  const capture = visualizerCaptures.get(tabId);
  if (!capture || !capture.voiceFilter) return;

  try {
    capture.voiceFilter.gain.setTargetAtTime(gainDb, capture.audioContext.currentTime, 0.03);
    console.log('[Offscreen] Set voice for tab', tabId, ':', gainDb);
  } catch (e) {
    console.error('[Offscreen] Error setting voice:', e);
  }
}

function setTabCaptureBalance(tabId, pan) {
  const capture = visualizerCaptures.get(tabId);
  if (!capture || !capture.stereoPanner) return;

  try {
    capture.stereoPanner.pan.setTargetAtTime(pan, capture.audioContext.currentTime, 0.03);
    console.log('[Offscreen] Set balance for tab', tabId, ':', pan);
  } catch (e) {
    console.error('[Offscreen] Error setting balance:', e);
  }
}

async function setTabCaptureDevice(tabId, deviceId, deviceLabel) {
  console.log('[Offscreen] setTabCaptureDevice called:', { tabId, deviceId, deviceLabel });
  console.log('[Offscreen] Active captures:', Array.from(visualizerCaptures.keys()));

  const capture = visualizerCaptures.get(tabId);
  if (!capture || !capture.audioElement) {
    console.log('[Offscreen] No capture/audioElement found for tab', tabId);
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
    if (!targetDeviceId && deviceLabel) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const matchingDevice = devices.find(d =>
        d.kind === 'audiooutput' && d.label === deviceLabel
      );
      if (matchingDevice) {
        targetDeviceId = matchingDevice.deviceId;
        console.log('[Offscreen] Resolved device by label:', deviceLabel, '->', targetDeviceId);
      }
    }

    // Set the output device on the Audio element
    // The audio chain goes: filters -> MediaStreamDestination -> Audio element -> speakers
    // So we need to set the sink on the Audio element, not the AudioContext
    const sinkId = targetDeviceId || '';
    await capture.audioElement.setSinkId(sinkId);

    console.log('[Offscreen] Set device for tab', tabId, ':', deviceLabel || sinkId || 'default');
    return { success: true };
  } catch (e) {
    console.error('[Offscreen] Error setting device:', e);
    return { success: false, error: e.message };
  }
}

// ==================== Device Enumeration ====================
async function handleGetDevices(requestPermission) {
  console.log('[Offscreen] handleGetDevices called, requestPermission:', requestPermission);

  try {
    if (!navigator.mediaDevices) {
      console.error('[Offscreen] navigator.mediaDevices not available');
      return { success: false, error: 'mediaDevices not available' };
    }

    let permissionGranted = false;
    if (requestPermission) {
      try {
        console.log('[Offscreen] Calling getUserMedia({ audio: true })...');
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

    console.log('[Offscreen] Found audio outputs:', audioOutputs);
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
  console.log('[Offscreen] Starting visualizer capture for tab:', tabId);

  try {
    // Check if already capturing this tab
    if (visualizerCaptures.has(tabId)) {
      console.log('[Offscreen] Already capturing tab', tabId);
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

    console.log('[Offscreen] Got media stream for tab', tabId);

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
    // source → bass → treble → voice → panner → gain → limiter → analyser → destination
    source.connect(bassFilter);
    bassFilter.connect(trebleFilter);
    trebleFilter.connect(voiceFilter);
    voiceFilter.connect(stereoPanner);
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
      stereoPanner,
      limiter,
      freqArray,
      waveArray
    });

    console.log('[Offscreen] Visualizer capture started for tab', tabId);
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
  console.log('[Offscreen] Stopping visualizer capture for tab:', tabId);

  const capture = visualizerCaptures.get(tabId);
  if (!capture) {
    console.log('[Offscreen] No capture found for tab', tabId);
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

    console.log('[Offscreen] Visualizer capture stopped for tab', tabId);
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
  console.log('[Offscreen] Stopping all visualizer captures');

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

