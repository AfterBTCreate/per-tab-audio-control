// Per-Tab Audio Control - Page Context Script (runs in MAIN world)
// Intercepts ALL Web Audio API audio output

(function() {
  'use strict';

  if (window.__tabVolumeControlPageInjected) return;
  window.__tabVolumeControlPageInjected = true;

  // Set a marker so we can verify the script ran (survives console.clear)
  window.__tabVolumePageScriptRan = true;

  // Check if extension is disabled on this domain (synchronous check via localStorage)
  // This MUST happen before any API patching to ensure clean audio on disabled domains
  try {
    const disabledKey = '__tabVolumeControl_disabled_' + window.location.hostname;
    const disabledValue = localStorage.getItem(disabledKey);

    if (disabledValue === 'true') {
      console.debug('[TabVolume] DISABLED on this domain - NO API PATCHING');
      window.__tabVolumeDisabled = true;
      return;
    }
  } catch (e) {
    console.debug('[TabVolume] localStorage check error:', e.message);
    // localStorage might be blocked on some sites, continue with normal operation
  }

  console.debug('[TabVolume] Domain ENABLED - patching Web Audio APIs...');

  let currentVolume = 100;
  let currentBassGain = 0;  // dB
  let currentTrebleGain = 0; // dB
  let currentVoiceGain = 0; // dB
  let currentPan = 0; // -1 to 1 (left to right)
  let currentChannelMode = 'stereo'; // 'stereo', 'mono', 'swap'
  const audioContexts = new Set();
  const contextData = new WeakMap();

  // Track user interaction to avoid AudioContext autoplay warnings
  let userHasInteracted = false;
  const trackUserInteraction = () => {
    userHasInteracted = true;
    document.removeEventListener('click', trackUserInteraction);
    document.removeEventListener('keydown', trackUserInteraction);
    document.removeEventListener('touchstart', trackUserInteraction);
  };
  document.addEventListener('click', trackUserInteraction);
  document.addEventListener('keydown', trackUserInteraction);
  document.addEventListener('touchstart', trackUserInteraction);

  // Store originals IMMEDIATELY before anything else runs
  const OriginalAudioContext = window.AudioContext;
  const OriginalWebkitAudioContext = window.webkitAudioContext;
  const OriginalAudioNode = window.AudioNode;
  const originalConnect = OriginalAudioNode && OriginalAudioNode.prototype.connect;
  const originalDisconnect = OriginalAudioNode && OriginalAudioNode.prototype.disconnect;

  if (!OriginalAudioContext && !OriginalWebkitAudioContext) {
    console.debug('[TabVolume] No AudioContext available');
    return;
  }

  // Update limiter state based on current volume and bass boost
  // Limiter is enabled when volume >100% AND no bass boost is active
  function updateLimiterState(limiter) {
    if (!limiter) return;

    const shouldEnable = currentVolume > 100 && currentBassGain <= 0;

    if (shouldEnable) {
      limiter.threshold.value = -1;
    } else {
      limiter.threshold.value = 0;
    }
  }

  // Update limiter state on all contexts
  function updateAllLimiters() {
    audioContexts.forEach(ctx => {
      try {
        const data = contextData.get(ctx);
        if (data && data.limiter && ctx.state !== 'closed') {
          updateLimiterState(data.limiter);
        }
      } catch (e) {}
    });
  }

  // Apply channel mode gains to channel matrix
  function applyChannelModeGains(gains, mode) {
    if (!gains) return;

    const { ll, lr, rl, rr } = gains;

    if (mode === 'mono') {
      ll.gain.value = 0.5;
      lr.gain.value = 0.5;
      rl.gain.value = 0.5;
      rr.gain.value = 0.5;
    } else if (mode === 'swap') {
      ll.gain.value = 0;
      lr.gain.value = 1;
      rl.gain.value = 1;
      rr.gain.value = 0;
    } else {
      ll.gain.value = 1;
      lr.gain.value = 0;
      rl.gain.value = 0;
      rr.gain.value = 1;
    }
  }

  // Get or create master gain and filters for a context
  function getMasterGain(ctx) {
    let data = contextData.get(ctx);
    if (data) return data;

    try {
      const realDest = ctx.destination;

      // Create bass filter (low shelf at 200Hz)
      const bassFilter = ctx.createBiquadFilter();
      bassFilter.type = 'lowshelf';
      bassFilter.frequency.value = 200;
      bassFilter.gain.value = currentBassGain;

      // Create treble filter (high shelf at 6kHz)
      const trebleFilter = ctx.createBiquadFilter();
      trebleFilter.type = 'highshelf';
      trebleFilter.frequency.value = 6000;
      trebleFilter.gain.value = currentTrebleGain;

      // Create voice filter (peaking at 3kHz)
      const voiceFilter = ctx.createBiquadFilter();
      voiceFilter.type = 'peaking';
      voiceFilter.frequency.value = 3000;
      voiceFilter.Q.value = 1.0;
      voiceFilter.gain.value = currentVoiceGain;

      // Create stereo panner
      const stereoPanner = ctx.createStereoPanner();
      stereoPanner.pan.value = currentPan;

      // Create channel matrix for stereo/mono/swap modes
      const channelSplitter = ctx.createChannelSplitter(2);
      const channelMerger = ctx.createChannelMerger(2);

      // Gain nodes for channel matrix
      const ll = ctx.createGain(); // Left to Left
      const lr = ctx.createGain(); // Left to Right
      const rl = ctx.createGain(); // Right to Left
      const rr = ctx.createGain(); // Right to Right

      // Connect splitter to gain nodes
      originalConnect.call(channelSplitter, ll, 0);
      originalConnect.call(channelSplitter, lr, 0);
      originalConnect.call(channelSplitter, rl, 1);
      originalConnect.call(channelSplitter, rr, 1);

      // Connect gain nodes to merger
      ll.connect(channelMerger, 0, 0);
      rl.connect(channelMerger, 0, 0);
      lr.connect(channelMerger, 0, 1);
      rr.connect(channelMerger, 0, 1);

      // Set initial channel gains
      const channelGains = { ll, lr, rl, rr };
      applyChannelModeGains(channelGains, currentChannelMode);

      // Create master gain
      const masterGain = ctx.createGain();
      masterGain.gain.value = currentVolume / 100;

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
      analyser.fftSize = 128;  // 64 frequency bins for responsive visualizer
      analyser.smoothingTimeConstant = 0.4;  // Lower = more reactive to audio changes

      // Connect chain: bassFilter → trebleFilter → voiceFilter → stereoPanner → channelMatrix → masterGain → limiter → analyser → destination
      originalConnect.call(bassFilter, trebleFilter);
      originalConnect.call(trebleFilter, voiceFilter);
      originalConnect.call(voiceFilter, stereoPanner);
      originalConnect.call(stereoPanner, channelSplitter);
      originalConnect.call(channelMerger, masterGain);
      originalConnect.call(masterGain, limiter);
      originalConnect.call(limiter, analyser);
      originalConnect.call(analyser, realDest);

      data = { masterGain, bassFilter, trebleFilter, voiceFilter, stereoPanner, channelGains, limiter, analyser, realDest };
      contextData.set(ctx, data);
      audioContexts.add(ctx);

      // Set initial limiter state
      updateLimiterState(limiter);

      return data;
    } catch (e) {
      console.debug('[TabVolume] Failed to create master gain', e);
      return null;
    }
  }

  // Intercept connect method to redirect destination connections
  if (originalConnect) {
    AudioNode.prototype.connect = function(destination, outputIndex, inputIndex) {
      // Check if connecting to a destination node
      if (destination instanceof AudioDestinationNode) {
        const ctx = this.context;
        const data = getMasterGain(ctx);

        if (data && data.bassFilter && this !== data.bassFilter && this !== data.voiceFilter && this !== data.stereoPanner && this !== data.masterGain) {
          // Redirect to our filter chain (bassFilter is the entry point)
          return originalConnect.call(this, data.bassFilter, outputIndex, inputIndex);
        }
      }

      // Normal connection
      return originalConnect.call(this, destination, outputIndex, inputIndex);
    };
  }

  // Patch AudioContext constructor to track contexts
  function patchAudioContextConstructor(Original) {
    if (!Original) return null;

    const Patched = function(...args) {
      const ctx = new Original(...args);

      // Pre-create master gain node
      getMasterGain(ctx);

      return ctx;
    };

    Patched.prototype = Original.prototype;
    Object.setPrototypeOf(Patched, Original);

    // Copy static properties
    const props = Object.getOwnPropertyNames(Original);
    for (let i = 0; i < props.length; i++) {
      const prop = props[i];
      if (prop !== 'prototype' && prop !== 'length' && prop !== 'name') {
        try {
          Object.defineProperty(Patched, prop, Object.getOwnPropertyDescriptor(Original, prop));
        } catch (e) {}
      }
    }

    return Patched;
  }

  // Override constructors
  if (OriginalAudioContext) {
    window.AudioContext = patchAudioContextConstructor(OriginalAudioContext);
  }
  if (OriginalWebkitAudioContext) {
    window.webkitAudioContext = patchAudioContextConstructor(OriginalWebkitAudioContext);
  }

  // Apply volume to all contexts
  function applyVolume(volume) {
    currentVolume = volume;
    const gain = Math.max(volume / 100, 0.0001);

    audioContexts.forEach(ctx => {
      try {
        const data = contextData.get(ctx);
        if (data && data.masterGain && ctx.state !== 'closed') {
          data.masterGain.gain.cancelScheduledValues(ctx.currentTime);
          data.masterGain.gain.setTargetAtTime(
            volume === 0 ? 0 : gain,
            ctx.currentTime,
            0.03
          );
        }
      } catch (e) {
        try {
          const data = contextData.get(ctx);
          if (data && data.masterGain) {
            data.masterGain.gain.value = volume === 0 ? 0 : gain;
          }
        } catch (e2) {}
      }
    });

    updateAllLimiters(); // Limiter enabled when volume >100%
  }

  // Apply bass boost to all contexts
  function applyBassBoost(gainDb) {
    currentBassGain = gainDb;

    audioContexts.forEach(ctx => {
      try {
        const data = contextData.get(ctx);
        if (data && data.bassFilter && ctx.state !== 'closed') {
          data.bassFilter.gain.cancelScheduledValues(ctx.currentTime);
          data.bassFilter.gain.setTargetAtTime(gainDb, ctx.currentTime, 0.03);
        }
      } catch (e) {
        try {
          const data = contextData.get(ctx);
          if (data && data.bassFilter) {
            data.bassFilter.gain.value = gainDb;
          }
        } catch (e2) {}
      }
    });

    updateAllLimiters(); // Limiter disabled when bass boost is active
  }

  // Apply treble boost to all contexts
  function applyTrebleBoost(gainDb) {
    currentTrebleGain = gainDb;

    audioContexts.forEach(ctx => {
      try {
        const data = contextData.get(ctx);
        if (data && data.trebleFilter && ctx.state !== 'closed') {
          data.trebleFilter.gain.cancelScheduledValues(ctx.currentTime);
          data.trebleFilter.gain.setTargetAtTime(gainDb, ctx.currentTime, 0.03);
        }
      } catch (e) {
        try {
          const data = contextData.get(ctx);
          if (data && data.trebleFilter) {
            data.trebleFilter.gain.value = gainDb;
          }
        } catch (e2) {}
      }
    });
  }

  // Apply voice boost to all contexts
  function applyVoiceBoost(gainDb) {
    currentVoiceGain = gainDb;

    audioContexts.forEach(ctx => {
      try {
        const data = contextData.get(ctx);
        if (data && data.voiceFilter && ctx.state !== 'closed') {
          data.voiceFilter.gain.cancelScheduledValues(ctx.currentTime);
          data.voiceFilter.gain.setTargetAtTime(gainDb, ctx.currentTime, 0.03);
        }
      } catch (e) {
        try {
          const data = contextData.get(ctx);
          if (data && data.voiceFilter) {
            data.voiceFilter.gain.value = gainDb;
          }
        } catch (e2) {}
      }
    });
  }

  // Apply stereo balance to all contexts
  function applyBalance(pan) {
    currentPan = pan;

    audioContexts.forEach(ctx => {
      try {
        const data = contextData.get(ctx);
        if (data && data.stereoPanner && ctx.state !== 'closed') {
          data.stereoPanner.pan.cancelScheduledValues(ctx.currentTime);
          data.stereoPanner.pan.setTargetAtTime(pan, ctx.currentTime, 0.03);
        }
      } catch (e) {
        try {
          const data = contextData.get(ctx);
          if (data && data.stereoPanner) {
            data.stereoPanner.pan.value = pan;
          }
        } catch (e2) {}
      }
    });
  }

  // Apply channel mode to all contexts
  function applyChannelMode(mode) {
    currentChannelMode = mode;

    audioContexts.forEach(ctx => {
      try {
        const data = contextData.get(ctx);
        if (data && data.channelGains && ctx.state !== 'closed') {
          applyChannelModeGains(data.channelGains, mode);
        }
      } catch (e) {}
    });
  }

  // Check if devices have real labels
  function hasRealLabels(devices) {
    return devices.length > 1 && devices.some(d => d.label && d.label.length > 0);
  }

  // Resolve device by label in page context with retries
  async function resolveDeviceByLabel(deviceLabel) {
    if (!deviceLabel) return null;

    const normalizedLabel = deviceLabel.toLowerCase().trim();

    // Try multiple times with delays - permission may take time to propagate
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

        if (hasRealLabels(audioOutputs)) {
          const match = audioOutputs.find(d =>
            d.label && d.label.toLowerCase().trim() === normalizedLabel
          );
          if (match) {
            console.log('[TabVolume] Resolved device by label on attempt', attempt + 1, ':', match.deviceId);
            return match.deviceId;
          }
        }
      } catch (e) {
        console.debug('[TabVolume] Could not enumerate devices', e.message);
      }

      // Wait before retry
      if (attempt < 4) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    console.log('[TabVolume] Could not resolve device by label after retries');
    return null;
  }

  // Apply device to HTML5 media elements (audio/video)
  async function applyDeviceToMediaElements(deviceId) {
    const elements = document.querySelectorAll('audio, video');
    let successCount = 0;

    for (const element of elements) {
      if (typeof element.setSinkId === 'function') {
        try {
          await element.setSinkId(deviceId || '');
          successCount++;
          console.log('[TabVolume] setSinkId on', element.tagName, 'succeeded');
        } catch (e) {
          console.log('[TabVolume] setSinkId on', element.tagName, 'failed:', e.name, e.message);
        }
      }
    }

    console.log('[TabVolume] Media elements found:', elements.length, 'successful:', successCount);
    return successCount;
  }

  // Apply audio output device to all contexts AND media elements
  // Strategy: Try the device ID first. If that fails, try label resolution.
  async function applyDevice(deviceId, deviceLabel) {
    console.log('[TabVolume] applyDevice called', { deviceId, deviceLabel });

    let successCount = 0;
    let failCount = 0;

    // First attempt: use the device ID passed from content script
    if (deviceId) {
      // Apply to AudioContexts
      for (const ctx of audioContexts) {
        try {
          if (ctx.state !== 'closed' && typeof ctx.setSinkId === 'function') {
            await ctx.setSinkId(deviceId);
            successCount++;
            console.log('[TabVolume] AudioContext setSinkId succeeded');
          }
        } catch (e) {
          console.log('[TabVolume] AudioContext setSinkId failed:', e.name);
          failCount++;
        }
      }

      // Apply to media elements (for device mode in Firefox)
      const mediaSuccess = await applyDeviceToMediaElements(deviceId);
      successCount += mediaSuccess;
    }

    // Second attempt: if first attempt failed, try resolving by label
    // This is needed because device IDs are context-specific in Firefox
    if (successCount === 0 && deviceLabel) {
      console.log('[TabVolume] Direct ID failed, trying label resolution...');

      // First request getUserMedia to unlock device enumeration
      try {
        console.log('[TabVolume] Requesting microphone permission in page context...');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        console.log('[TabVolume] Got microphone permission in page context');
      } catch (e) {
        console.log('[TabVolume] Could not get microphone permission:', e.name, e.message);
      }

      console.log('[TabVolume] Resolving device by label:', deviceLabel);
      const localId = await resolveDeviceByLabel(deviceLabel);
      console.log('[TabVolume] Label resolution result:', localId);
      if (localId) {
        console.log('[TabVolume] Resolved by label:', localId);

        // Notify content script of the resolved device ID
        // This is critical for Firefox where content script can't enumerate devices
        // but needs the resolved ID for the hidden output audio elements
        window.dispatchEvent(new CustomEvent('__tabVolumeControl_deviceResolved', {
          detail: { deviceId: localId, deviceLabel: deviceLabel }
        }));
        console.log('[TabVolume] Dispatched resolved device ID to content script');

        // Apply to AudioContexts
        for (const ctx of audioContexts) {
          try {
            if (ctx.state !== 'closed' && typeof ctx.setSinkId === 'function') {
              await ctx.setSinkId(localId);
              successCount++;
              console.log('[TabVolume] setSinkId succeeded with resolved ID');
            }
          } catch (e) {
            failCount++;
          }
        }

        // Apply to media elements
        const mediaSuccess = await applyDeviceToMediaElements(localId);
        successCount += mediaSuccess;
      } else {
        // Label resolution failed - site likely blocks device enumeration
        console.log('[TabVolume] Cannot resolve device - site may restrict audio device access');
      }
    }

    // If no deviceId provided (reset to default)
    if (!deviceId) {
      for (const ctx of audioContexts) {
        try {
          if (ctx.state !== 'closed' && typeof ctx.setSinkId === 'function') {
            await ctx.setSinkId('');
            successCount++;
          }
        } catch (e) {
          failCount++;
        }
      }
      // Reset media elements to default
      await applyDeviceToMediaElements('');
    }

    console.log('[TabVolume] Applied device - success:', successCount, 'failed:', failCount);
    return successCount > 0;
  }

  // Listen for volume changes
  window.addEventListener('__tabVolumeControl_set', function(e) {
    if (e.detail && typeof e.detail.volume === 'number') {
      applyVolume(e.detail.volume);
    }
  });

  window.addEventListener('__tabVolumeControl_init', function(e) {
    if (e.detail && typeof e.detail.volume === 'number') {
      currentVolume = e.detail.volume;
      applyVolume(e.detail.volume);
    }
  });

  // Listen for device changes
  window.addEventListener('__tabVolumeControl_setDevice', function(e) {
    console.log('[TabVolume] Received setDevice event', e.detail);
    console.log('[TabVolume] AudioContexts count:', audioContexts.size);
    if (e.detail && typeof e.detail.deviceId === 'string') {
      applyDevice(e.detail.deviceId, e.detail.deviceLabel || '');
    }
  });

  // Listen for bass boost changes
  window.addEventListener('__tabVolumeControl_setBass', function(e) {
    if (e.detail && typeof e.detail.gain === 'number') {
      applyBassBoost(e.detail.gain);
    }
  });

  // Listen for treble boost changes
  window.addEventListener('__tabVolumeControl_setTreble', function(e) {
    if (e.detail && typeof e.detail.gain === 'number') {
      applyTrebleBoost(e.detail.gain);
    }
  });

  // Listen for voice boost changes
  window.addEventListener('__tabVolumeControl_setVoice', function(e) {
    if (e.detail && typeof e.detail.gain === 'number') {
      applyVoiceBoost(e.detail.gain);
    }
  });

  // Listen for balance changes
  window.addEventListener('__tabVolumeControl_setBalance', function(e) {
    if (e.detail && typeof e.detail.pan === 'number') {
      applyBalance(e.detail.pan);
    }
  });

  // Listen for channel mode changes (stereo/mono/swap)
  window.addEventListener('__tabVolumeControl_setChannelMode', function(e) {
    if (e.detail && typeof e.detail.mode === 'string') {
      applyChannelMode(e.detail.mode);
    }
  });

  // Listen for frequency data requests (for visualizer)
  window.addEventListener('__tabVolumeControl_getFrequencyData', function(e) {
    let frequencyData = null;
    let waveformData = null;

    // Get frequency and waveform data from any context with an analyser (even if suspended - might resume)
    for (const ctx of audioContexts) {
      try {
        const data = contextData.get(ctx);
        if (data && data.analyser && ctx.state !== 'closed') {
          // Try to resume if suspended (only if user has interacted)
          if (ctx.state === 'suspended' && userHasInteracted) {
            ctx.resume().catch(() => {});
          }
          const bufferLength = data.analyser.frequencyBinCount;
          const freqArray = new Uint8Array(bufferLength);
          const waveArray = new Uint8Array(bufferLength);
          data.analyser.getByteFrequencyData(freqArray);
          data.analyser.getByteTimeDomainData(waveArray);
          // Only use if there's actual data (not all zeros)
          const hasData = freqArray.some(v => v > 0);
          if (hasData) {
            frequencyData = Array.from(freqArray);
            waveformData = Array.from(waveArray);
            break;
          }
        }
      } catch (e) {}
    }

    // Dispatch response back to content script
    window.dispatchEvent(new CustomEvent('__tabVolumeControl_frequencyDataResponse', {
      detail: { frequencyData, waveformData }
    }));
  });

  // Clean up AudioContexts when navigating away from page
  // This prevents memory leaks when user navigates within the same tab
  window.addEventListener('pagehide', function() {
    audioContexts.forEach(ctx => {
      try {
        if (ctx.state !== 'closed') {
          ctx.close();
        }
      } catch (e) {
        // Context may already be closed or in an invalid state
      }
    });
    audioContexts.clear();
    console.debug('[TabVolume] Cleaned up AudioContexts on page hide');
  });

  console.debug('[TabVolume] Page script loaded, intercepting AudioNode.connect');

})();
