// The mic on the audio thread (src/core/voice.ts loads it): mono, low-passed against aliasing, resampled to the
// voice rate (shared/voice.ts VOICE.rate) and posted to the page in frames of VOICE.frame samples.
class VoiceCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = options.processorOptions;
    this.step = sampleRate / o.rate;     // input samples per output sample
    this.size = o.frame;
    this.frame = new Float32Array(this.size);
    this.n = 0;
    this.pos = 0;                        // index of the current input sample
    this.next = 0;                       // where the next output sample falls, in input samples
    this.prev = 0;
    this.lp = 0;
    this.k = Math.min(1, (2 * Math.PI * 6000) / sampleRate);
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.lp += (ch[i] - this.lp) * this.k;
      const x = this.lp;
      while (this.next <= this.pos) {
        const f = this.next - (this.pos - 1);
        this.frame[this.n++] = this.prev + (x - this.prev) * f;
        this.next += this.step;
        if (this.n === this.size) {
          // (A transferred buffer reads as empty afterwards: the size is kept apart.)
          this.port.postMessage(this.frame, [this.frame.buffer]);
          this.frame = new Float32Array(this.size);
          this.n = 0;
        }
      }
      this.prev = x;
      this.pos += 1;
    }
    // Keep the counters small.
    if (this.pos > 1e6) { this.pos -= 1e6; this.next -= 1e6; }
    return true;
  }
}

registerProcessor('voice-capture', VoiceCapture);
