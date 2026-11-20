// The M O T H hit sounds start under the finger (owner, 2026-11-20: "slight
// delays on the SFXs when pressing the buttons").
//
// Measured (.qa/moth/sfx-latency-20261120): each button file opens before its
// attack - M fades in for ~16 ms, T and H sit silent for ~7-10 ms, and O has a
// ~130 ms lead-in that every press outside a fight (practice, tutorial, sound
// test) played in full. And every hit went through the feedback compressor,
// whose fixed lookahead holds everything it passes back 6 ms.
//
// Each press now starts its file at the attack - where it first comes within
// 12 dB of its loudest; O keeps its lead-in skipped - in fights and out, with a
// 1 ms fade-in so the cut cannot click. Hits skip the compressor: alone they
// never reached its threshold (they peak at -4.5 to -8 dBFS), so it only ever
// acted when a hit overlapped a praise voice. Those overlaps are handled
// without lookahead now: the voices dip 5 dB under a hit, and a curve that is
// exact below -3 dBFS rounds off hits stacking on each other.
export const BUTTON_SFX_START = { M: 0.016, O: 0.130, T: 0.007, H: 0.009 };

export function patchHitSoundStart(once) {
  once(`    node.connect(context.destination);
    this.feedbackOutput = { context, node };
    return node;
  }
`, `    // Voices pass a gain a hit can dip (duckFeedbackVoices).
    const duck = context.createGain();
    node.connect(duck);
    duck.connect(context.destination);
    // Button hits skip the compressor (its lookahead is 6 ms). The curve
    // spans two full-scale hits and is exact below -3 dBFS.
    const hits = context.createGain();
    hits.gain.value = 0.5;
    const safety = context.createWaveShaper();
    if (!this.hitSafetyCurve) {
      const curve = new Float32Array(4097), knee = 0.708;
      for (let i = 0; i < curve.length; i++) {
        const x = (i / 2048 - 1) * 2, a = Math.abs(x);
        curve[i] = Math.sign(x) * (a <= knee ? a : knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee)));
      }
      this.hitSafetyCurve = curve;
    }
    safety.curve = this.hitSafetyCurve;
    safety.oversample = "none";
    hits.connect(safety);
    safety.connect(context.destination);
    this.feedbackOutput = { context, node, duck, hits, safety };
    return node;
  }

  ensureHitOutput(context) {
    this.ensureFeedbackOutput(context);
    return this.feedbackOutput.hits;
  }

  // A hit over a praise voice: the voice dips 5 dB for the hit's length so the
  // two never sum past full scale (what the compressor did, 6 ms late).
  duckFeedbackVoices(context, now, length) {
    const duck = this.feedbackOutput?.context === context ? this.feedbackOutput.duck : null;
    if (!duck || ![...this.feedbackChannels.keys()].some(channel => !channel.startsWith("button-"))) return;
    const gain = duck.gain, until = now + Math.min(Math.max(length, 0.02), 0.4);
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0.56, now + 0.002);
    gain.setValueAtTime(0.56, until);
    gain.linearRampToValueAtTime(1, until + 0.04);
  }
`);
  once('    volume.connect(this.ensureFeedbackOutput(context));\n',
    '    const hit = name.startsWith("button-");\n    volume.connect(hit ? this.ensureHitOutput(context) : this.ensureFeedbackOutput(context));\n');
  once('      volume.gain.linearRampToValueAtTime(level, now + 0.003);\n', '      volume.gain.linearRampToValueAtTime(level, now + 0.001);\n');
  once(`    source.start(now, offset);
    if (duration) {
      volume.gain.setValueAtTime(level, now + duration - 0.012);
      volume.gain.linearRampToValueAtTime(0, now + duration);
      source.stop(now + duration);
    }
`, `    source.start(now, offset);
    if (duration) {
      volume.gain.setValueAtTime(level, now + duration - 0.012);
      volume.gain.linearRampToValueAtTime(0, now + duration);
      source.stop(now + duration);
    }
    if (hit) this.duckFeedbackVoices(context, now, duration || buffer.duration - offset);
`);
  once(`      return this.playFeedbackSfx(sample, channel, speaking ? 0.78 : 1.12,
        { duration: 0.055, offset: button === "O" ? 0.120 : 0 });
    }
    return this.playFeedbackSfx(sample, channel, speaking ? 1.0 : 1.4);`,
  `      return this.playFeedbackSfx(sample, channel, speaking ? 0.78 : 1.12, { duration: 0.055, offset });
    }
    return this.playFeedbackSfx(sample, channel, speaking ? 1.0 : 1.4, { offset });`);
  once('    const sample = "button-" + button.toLowerCase(), channel = "button-" + button;\n',
    `    const sample = "button-" + button.toLowerCase(), channel = "button-" + button;
    // Where each file's attack begins (scripts/moth-hit-sound-start.mjs).
    const offset = ${JSON.stringify(BUTTON_SFX_START)}[button];
`);
}
