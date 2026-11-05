#!/usr/bin/env python3
"""Meaningful signal regressions for the drum onset boundary measurement."""
import numpy as np
import moth_drum_hits as drums

rng = np.random.default_rng(193)
rate = drums.RATE
at = 1.0
count = int(2 * rate)
t = np.arange(count) / rate
age = np.maximum(0, t - at)
active = t >= at
# A quiet, rapid change before the drum exposed the old log derivative bug.
noise = rng.normal(0, 1e-7, count)
noise[(t > .968) & (t < .972)] += 1e-4
signals = {
    "kick": np.sin(2 * np.pi * 62 * age) * np.exp(-age * 20) * active,
    "snare": rng.normal(0, 1, count) * np.exp(-age * 75) * active,
    "hat": (np.sin(2 * np.pi * 8800 * age) + .3 * np.sin(2 * np.pi * 11500 * age)) * np.exp(-age * 110) * active,
}
for name, signal in signals.items():
    env = drums.envelope_ms(signal + noise)
    measured = drums.refine([(at + .008, 1)], env)
    assert len(measured) == 1
    error = measured[0][0] - at
    assert abs(error) <= .006, (name, measured, error)
    # The attack moves with the waveform, including off-grid funk hits.
    delayed = np.r_[np.zeros(1632), signal[:-1632]]
    shifted = drums.refine([(at + .008 + 1632/rate, 1)], drums.envelope_ms(delayed + noise))[0][0]
    assert abs((shifted - measured[0][0]) - 1632/rate) <= .001, (name, shifted)
    print(f"PASS {name}: attack error {error * 1000:+.1f} ms; off-grid delay retained")
# There is no false claim of confidence for a flat, non-transient proposal.
flat = drums.refine_details([(1, 1)], np.ones(2000))[0]
assert flat['contrast'] == 0 and flat['edge']
print('PASS flat proposal is explicitly flagged as uncertain')
