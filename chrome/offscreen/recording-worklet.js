// AudioWorkletProcessor for recording tab audio
// Captures stereo PCM from the audio graph and sends it to the main thread
// via MessagePort. Runs on the audio rendering thread (not main thread).

class RecordingProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._active = true;
    this.port.onmessage = (e) => {
      if (e.data.type === 'stop') {
        this._active = false;
      }
    };
  }

  process(inputs) {
    if (!this._active) return false; // Returning false deactivates the processor

    const input = inputs[0];
    if (!input || input.length < 2 || !input[0].length) {
      return true; // No data yet, keep alive
    }

    // Copy channel data (input buffers are reused by the engine)
    const left = new Float32Array(input[0]);
    const right = new Float32Array(input[1]);

    // Transfer ownership of the buffers to the main thread (zero-copy)
    this.port.postMessage(
      { type: 'pcm', left, right },
      [left.buffer, right.buffer]
    );

    return true;
  }
}

registerProcessor('recording-processor', RecordingProcessor);
