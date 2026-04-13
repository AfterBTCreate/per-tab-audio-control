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
  voice: { min: -18, max: 18 },
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

// ==================== Recording State ====================
const activeRecordings = new Map(); // tabId -> { recorder/scriptNode, chunks, startTime, format, ... }
// tabIds currently in the "starting" state (atomically transitioning from
// not-recording to recording). Prevents a TOCTOU race where two concurrent
// START_RECORDING messages both pass the activeRecordings check before either
// call has populated the map. See #22.
const startingRecordings = new Set();

// Maximum recording size (2GB - safety margin for ArrayBuffer limits)
const MAX_RECORDING_BYTES = 2 * 1024 * 1024 * 1024 - 1024;

// ==================== Recording Functions ====================

function isValidRecordingFormat(format) {
  return ['mp3', 'wav', 'webm'].includes(format);
}

function isValidBitrate(bitrate) {
  return Number.isInteger(bitrate) && bitrate >= 32 && bitrate <= 320;
}

function isValidSampleRate(rate) {
  return [44100, 48000].includes(rate);
}

async function handleStartRecording(tabId, format, bitrate, sampleRate) {
  if (!isValidTabId(tabId)) {
    return { success: false, error: 'Invalid tab ID' };
  }
  if (!isValidRecordingFormat(format)) {
    return { success: false, error: 'Invalid format' };
  }
  // Validate bitrate and sample rate (defense-in-depth, background.js also validates)
  if (format !== 'wav' && !isValidBitrate(bitrate)) {
    return { success: false, error: 'Invalid bitrate' };
  }
  if (sampleRate !== undefined && !isValidSampleRate(sampleRate)) {
    return { success: false, error: 'Invalid sample rate' };
  }

  // Check if already recording OR starting — atomically claim the "starting"
  // state before any async work to close the TOCTOU window (#22).
  if (activeRecordings.has(tabId) || startingRecordings.has(tabId)) {
    return { success: false, error: 'Already recording this tab' };
  }
  startingRecordings.add(tabId);

  const capture = visualizerCaptures.get(tabId);
  if (!capture || !capture.audioContext || !capture.limiter) {
    startingRecordings.delete(tabId);
    return { success: false, error: 'No active audio capture for this tab. Open the popup on the tab first.' };
  }

  try {
    const ctx = capture.audioContext;
    const startTime = Date.now();
    let recordingState;

    if (format === 'webm') {
      // Native MediaRecorder path
      const destNode = ctx.createMediaStreamDestination();
      capture.limiter.connect(destNode);

      const recorder = new MediaRecorder(destNode.stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: (bitrate || 128) * 1000
      });

      const chunks = [];
      let estimatedBytes = 0;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          estimatedBytes += e.data.size;
          if (estimatedBytes > MAX_RECORDING_BYTES) {
            log('Recording size limit reached, stopping');
            autoStopRecording(tabId, 'size_limit');
            return;
          }
          chunks.push(e.data);
        }
      };

      recorder.start(1000); // Collect data every second

      recordingState = {
        type: 'mediarecorder',
        recorder,
        destNode,
        chunks,
        startTime,
        format,
        estimatedBytes: 0,
        get currentBytes() { return chunks.reduce((sum, c) => sum + c.size, 0); }
      };

    } else if (format === 'wav' || format === 'mp3') {
      // WAV/MP3: AudioWorkletNode captures PCM on the audio rendering thread,
      // sends it to the main thread via MessagePort for encoding/storage.
      // This replaces the deprecated ScriptProcessorNode.

      if (format === 'mp3' && typeof lamejs === 'undefined') {
        return { success: false, error: 'MP3 encoder not loaded' };
      }

      // Load the recording worklet module (idempotent — safe to call multiple times)
      await ctx.audioWorklet.addModule(
        chrome.runtime.getURL('offscreen/recording-worklet.js')
      );

      // Create worklet node with 0 outputs — acts as a pure audio sink.
      // No silent gain hack needed (unlike ScriptProcessorNode), and no
      // risk of doubling audio output to speakers.
      const workletNode = new AudioWorkletNode(ctx, 'recording-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: 2
      });

      // Always use the AudioContext's actual sample rate.
      // The worklet captures PCM at ctx.sampleRate — using a different rate
      // for the encoder/header causes pitch/speed artifacts.
      const actualSampleRate = ctx.sampleRate;

      // Format-specific state
      let mp3Encoder = null;
      const dataChunks = []; // WAV: {left, right} objects | MP3: Uint8Array frames
      let estimatedBytes = 0;
      let stopped = false;

      if (format === 'mp3') {
        const mp3Bitrate = bitrate || 192;
        mp3Encoder = new lamejs.Mp3Encoder(2, actualSampleRate, mp3Bitrate);
      }

      // Handle PCM data arriving from the worklet thread
      workletNode.port.onmessage = (e) => {
        if (stopped || e.data.type !== 'pcm') return;

        if (format === 'wav') {
          dataChunks.push({ left: e.data.left, right: e.data.right });
          estimatedBytes += e.data.left.length * 4; // 2ch * 16-bit = 4 bytes/frame
          if (estimatedBytes > MAX_RECORDING_BYTES) {
            stopped = true;
            log('WAV recording size limit reached, stopping');
            setTimeout(() => autoStopRecording(tabId, 'size_limit'), 0);
          }
        } else {
          // MP3: convert Float32 → Int16 → lamejs
          const leftInt16 = floatTo16BitPCM(e.data.left);
          const rightInt16 = floatTo16BitPCM(e.data.right);
          const mp3Data = mp3Encoder.encodeBuffer(leftInt16, rightInt16);
          if (mp3Data.length > 0) {
            dataChunks.push(mp3Data);
            estimatedBytes += mp3Data.length;
            if (estimatedBytes > MAX_RECORDING_BYTES) {
              stopped = true;
              log('MP3 recording size limit reached, stopping');
              setTimeout(() => autoStopRecording(tabId, 'size_limit'), 0);
            }
          }
        }
      };

      // Connect: limiter → workletNode (no output, no signal doubling)
      capture.limiter.connect(workletNode);

      recordingState = {
        type: format, // 'wav' or 'mp3'
        workletNode,
        dataChunks,
        mp3Encoder,
        startTime,
        format,
        sampleRate: actualSampleRate,
        bitrate: bitrate || 192,
        get currentBytes() {
          if (format === 'wav') {
            return dataChunks.reduce((sum, c) => sum + c.left.length, 0) * 4;
          }
          return dataChunks.reduce((sum, c) => sum + c.length, 0);
        }
      };
    }

    activeRecordings.set(tabId, recordingState);
    log('Recording started for tab', tabId, 'format:', format);
    return { success: true };

  } catch (e) {
    console.error('[Offscreen] Error starting recording:', e);
    return { success: false, error: e.message };
  } finally {
    // Release the "starting" claim either way — either we're in
    // activeRecordings now or we failed and freed the slot.
    startingRecordings.delete(tabId);
  }
}

// Auto-stop path used by size-limit and error cleanup: produce the blob, hand
// it to the background for download, and revoke if nobody takes it. This
// prevents the blob URL leak that occurs when internal callers don't consume
// handleStopRecording's return value.
async function autoStopRecording(tabId, reason) {
  const result = await handleStopRecording(tabId);
  if (!result || !result.success || !result.blobUrl) return;
  try {
    await chrome.runtime.sendMessage({
      type: 'RECORDING_AUTO_STOPPED',
      tabId,
      reason,
      blobUrl: result.blobUrl,
      size: result.size,
      duration: result.duration,
      format: result.format
    });
  } catch (e) {
    try { URL.revokeObjectURL(result.blobUrl); } catch (_) { /* ignore */ }
  }
}

async function handleStopRecording(tabId) {
  if (!isValidTabId(tabId)) {
    return { success: false, error: 'Invalid tab ID' };
  }

  const recording = activeRecordings.get(tabId);
  if (!recording) {
    return { success: false, error: 'No active recording for this tab' };
  }

  try {
    let blob;
    const duration = Date.now() - recording.startTime;

    if (recording.type === 'mediarecorder') {
      // Stop MediaRecorder and wait for final data
      await new Promise((resolve) => {
        recording.recorder.onstop = resolve;
        recording.recorder.stop();
      });

      // Disconnect the destination node
      try {
        const capture = visualizerCaptures.get(tabId);
        if (capture && capture.limiter) {
          capture.limiter.disconnect(recording.destNode);
        }
      } catch (e) { /* May already be disconnected */ }

      blob = new Blob(recording.chunks, { type: 'audio/webm;codecs=opus' });

    } else if (recording.type === 'wav' || recording.type === 'mp3') {
      // Stop the worklet processor and disconnect
      try {
        recording.workletNode.port.postMessage({ type: 'stop' });
        recording.workletNode.disconnect();
        const capture = visualizerCaptures.get(tabId);
        if (capture && capture.limiter) {
          capture.limiter.disconnect(recording.workletNode);
        }
      } catch (e) { /* May already be disconnected */ }

      if (recording.type === 'wav') {
        // Guard against oversized WAV before allocation
        const wavTotalSamples = recording.dataChunks.reduce((sum, c) => sum + c.left.length, 0);
        if (wavTotalSamples * 4 + 44 > MAX_RECORDING_BYTES) {
          activeRecordings.delete(tabId);
          return { success: false, error: 'Recording too large to save as WAV' };
        }
        blob = buildWavBlob(recording.dataChunks, recording.sampleRate);

      } else {
        // Flush the MP3 encoder
        const finalData = recording.mp3Encoder.flush();
        if (finalData.length > 0) {
          recording.dataChunks.push(finalData);
        }

        // Combine all MP3 chunks
        const totalLength = recording.dataChunks.reduce((sum, c) => sum + c.length, 0);
        const mp3Data = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of recording.dataChunks) {
          mp3Data.set(chunk, offset);
          offset += chunk.length;
        }

        blob = new Blob([mp3Data], { type: 'audio/mpeg' });
      }
    }

    // Clean up
    activeRecordings.delete(tabId);

    // Create blob URL for download
    const blobUrl = URL.createObjectURL(blob);

    log('Recording stopped for tab', tabId, 'size:', blob.size, 'duration:', duration);
    return {
      success: true,
      blobUrl,
      size: blob.size,
      duration,
      format: recording.format
    };

  } catch (e) {
    console.error('[Offscreen] Error stopping recording:', e);
    activeRecordings.delete(tabId);
    return { success: false, error: e.message };
  }
}

function handleCancelRecording(tabId) {
  if (!isValidTabId(tabId)) {
    return { success: false, error: 'Invalid tab ID' };
  }

  const recording = activeRecordings.get(tabId);
  if (!recording) {
    return { success: true }; // Nothing to cancel
  }

  try {
    if (recording.type === 'mediarecorder' && recording.recorder.state !== 'inactive') {
      recording.recorder.stop();
      try {
        const capture = visualizerCaptures.get(tabId);
        if (capture && capture.limiter) {
          capture.limiter.disconnect(recording.destNode);
        }
      } catch (e) { /* ignore */ }
    } else if (recording.type === 'wav' || recording.type === 'mp3') {
      try {
        recording.workletNode.port.postMessage({ type: 'stop' });
        recording.workletNode.disconnect();
        const capture = visualizerCaptures.get(tabId);
        if (capture && capture.limiter) {
          capture.limiter.disconnect(recording.workletNode);
        }
      } catch (e) { /* ignore */ }
    }
  } catch (e) {
    console.error('[Offscreen] Error during cancel cleanup:', e);
  }

  activeRecordings.delete(tabId);
  log('Recording cancelled for tab', tabId);
  return { success: true };
}

function getRecordingStatus(tabId) {
  const recording = activeRecordings.get(tabId);
  if (!recording) {
    return { recording: false };
  }
  return {
    recording: true,
    duration: Date.now() - recording.startTime,
    size: recording.currentBytes || 0,
    format: recording.format
  };
}

// Convert Float32Array to Int16Array for lamejs
function floatTo16BitPCM(float32Array) {
  const int16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16;
}

// Build a WAV file blob from PCM chunk data
function buildWavBlob(pcmChunks, sampleRate) {
  // Count total samples
  let totalSamples = 0;
  for (const chunk of pcmChunks) {
    totalSamples += chunk.left.length;
  }

  const numChannels = 2;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = totalSamples * blockAlign;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (PCM)
  view.setUint16(20, 1, true); // AudioFormat (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave PCM data (left, right, left, right, ...)
  let offset = headerSize;
  for (const chunk of pcmChunks) {
    for (let i = 0; i < chunk.left.length; i++) {
      const leftSample = Math.max(-1, Math.min(1, chunk.left[i]));
      const rightSample = Math.max(-1, Math.min(1, chunk.right[i]));
      view.setInt16(offset, leftSample < 0 ? leftSample * 0x8000 : leftSample * 0x7FFF, true);
      offset += 2;
      view.setInt16(offset, rightSample < 0 ? rightSample * 0x8000 : rightSample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

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
      handleStartVisualizerCapture(message.streamId, message.tabId, message.initialVolume).then(sendResponse);
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

    case 'TAB_REMOVED':
      // Clean up capture and any active recording when tab is closed
      if (message.tabId) {
        if (activeRecordings.has(message.tabId)) {
          handleCancelRecording(message.tabId);
        }
        handleStopVisualizerCapture(message.tabId);
      }
      return false;

    // ==================== Recording ====================
    case 'START_RECORDING':
      handleStartRecording(message.tabId, message.format, message.bitrate, message.sampleRate).then(sendResponse);
      return true;

    case 'STOP_RECORDING':
      handleStopRecording(message.tabId).then(sendResponse);
      return true;

    case 'CANCEL_RECORDING':
      sendResponse(handleCancelRecording(message.tabId));
      return false;

    case 'GET_RECORDING_STATUS':
      sendResponse(getRecordingStatus(message.tabId));
      return false;

    case 'GET_ANY_RECORDING_STATUS': {
      if (activeRecordings.size > 0) {
        const [tabId, recording] = activeRecordings.entries().next().value;
        sendResponse({
          recording: true,
          tabId: tabId,
          duration: Date.now() - recording.startTime
        });
      } else {
        sendResponse({ recording: false });
      }
      return true;
    }

    case 'REVOKE_BLOB_URL':
      if (message.blobUrl && typeof message.blobUrl === 'string' &&
          message.blobUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(message.blobUrl); } catch (e) { /* ignore */ }
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
  return Number.isInteger(tabId) && tabId > 0 && tabId < 2147483647;
}

function isValidVolume(volume) {
  return Number.isFinite(volume) && volume >= VOLUME_MIN && volume <= VOLUME_MAX;
}

function isValidGainDb(gainDb, effectType) {
  const range = EFFECT_RANGES[effectType] || EFFECT_RANGES.bass;
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
    // Widen Q when cutting to cover full vocal range (~700Hz–12kHz); narrow for boost
    capture.voiceFilter.Q.value = gainDb < 0 ? 0.35 : 1.0;
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
  if (!isValidTabId(tabId)) {
    return { success: false, error: 'Invalid tab ID' };
  }
  log('setTabCaptureDevice called:', { tabId, deviceId, deviceLabel });
  log('Active captures:', Array.from(visualizerCaptures.keys()));

  const capture = visualizerCaptures.get(tabId);
  if (!capture || !capture.audioContext) {
    log('No capture/audioContext found for tab', tabId);
    return { success: false, error: 'No active capture for this tab' };
  }

  try {
    // Check if setSinkId is supported on the AudioContext
    if (typeof capture.audioContext.setSinkId !== 'function') {
      console.error('[Offscreen] setSinkId not supported on AudioContext');
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

    // Set the output device on the AudioContext
    // Audio routes directly: filters -> audioContext.destination -> speakers
    const sinkId = targetDeviceId || '';
    await capture.audioContext.setSinkId(sinkId);

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
async function handleStartVisualizerCapture(streamId, tabId, initialVolume) {
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

    // Match AudioContext sample rate to the capture stream to prevent
    // pitch artifacts from sample rate mismatch during initial sync.
    // Without this, a fresh AudioContext may default to a different rate
    // than the captured audio, causing Chrome's resampler to drift briefly
    // (audible as high pitch for several seconds on first capture).
    const audioTrack = stream.getAudioTracks()[0];
    const trackSettings = audioTrack ? audioTrack.getSettings() : {};
    const ctxOptions = trackSettings.sampleRate ? { sampleRate: trackSettings.sampleRate } : {};

    // Create audio context
    const audioContext = new AudioContext(ctxOptions);

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

    // Master gain for volume control — apply stored volume immediately
    // to prevent a burst at 100% before syncStoredSettingsToTabCapture runs
    const gainNode = audioContext.createGain();
    const safeInitialVolume = (typeof initialVolume === 'number' && isFinite(initialVolume))
      ? Math.max(0, Math.min(initialVolume, 500)) : 100;
    gainNode.gain.value = safeInitialVolume / 100;

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

    // Connect processing chain directly to audioContext.destination.
    // Previous versions routed through MediaStreamDestination → Audio element,
    // but that created two independent clock domains causing pitch/speed
    // artifacts during initial synchronization on first capture.
    // Routing directly to audioContext.destination keeps everything on
    // a single clock and eliminates the first-open audio artifact.
    // Device selection uses audioContext.setSinkId() instead.
    source.connect(bassFilter);
    bassFilter.connect(trebleFilter);
    trebleFilter.connect(voiceFilter);
    voiceFilter.connect(compressor);
    compressor.connect(channelSplitter);
    channelMerger.connect(stereoPanner);
    stereoPanner.connect(gainNode);
    gainNode.connect(limiter);
    limiter.connect(analyser);
    analyser.connect(audioContext.destination);

    // Pre-allocate typed arrays for efficiency
    const freqArray = new Uint8Array(analyser.frequencyBinCount);
    const waveArray = new Uint8Array(analyser.fftSize);

    // Store capture state with all processing nodes
    visualizerCaptures.set(tabId, {
      audioContext,
      analyser,
      stream,
      source,
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
      currentVolume: safeInitialVolume,
      currentCompressor: 'off'
    });

    // Clean up if stream tracks end unexpectedly (e.g., tab navigates or closes)
    // Snapshot the capture reference so stale ended events from a previous capture
    // don't tear down a newer capture for the same tab
    const thisCapture = visualizerCaptures.get(tabId);
    stream.getTracks().forEach(track => {
      track.addEventListener('ended', () => {
        if (visualizerCaptures.get(tabId) === thisCapture) {
          log('Stream track ended for tab', tabId, '- cleaning up');
          handleStopVisualizerCapture(tabId);
        } else {
          log('Stream track ended for tab', tabId, '- ignoring (stale capture)');
        }
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

  // Guard: don't tear down AudioContext if a recording is in progress
  // The recording depends on the same capture's AudioContext and nodes
  if (activeRecordings.has(tabId)) {
    log('Recording active for tab', tabId, '- deferring visualizer stop');
    return { success: false, error: 'Recording in progress' };
  }

  const capture = visualizerCaptures.get(tabId);
  if (!capture) {
    log('No capture found for tab', tabId);
    return { success: true };
  }

  try {
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

