#!/usr/bin/env python3
"""Regression signals for Easy's physical drum attack/pattern evidence."""
import importlib.util
from pathlib import Path
import sys
import numpy as np

spec = importlib.util.spec_from_file_location('funk', Path(__file__).with_name('author-moth-funk.py'))
f = importlib.util.module_from_spec(spec)
sys.modules['funk'] = f
spec.loader.exec_module(f)
rng = np.random.default_rng(193)
rate = f.SAMPLE_RATE
wave = np.zeros(4 * rate)
onsets = [(0.413, 'kick'), (1.017, 'snare'), (1.619, 'hat'), (2.227, 'kick'), (2.831, 'snare')]
for at, voice in onsets:
    age = np.arange(round(.4*rate))/rate
    if voice == 'kick':
        # A delayed loud low body and a small initial click must be one hit.
        signal = np.sin(2*np.pi*61*age)*(1-np.exp(-age*220))*np.exp(-age*19)
        signal += .12*rng.normal(size=len(age))*np.exp(-age*180)
    else:
        signal = rng.normal(size=len(age))*np.exp(-age*(50 if voice=='snare' else 140))
        if voice == 'hat':
            from scipy.signal import butter, sosfiltfilt
            signal = sosfiltfilt(butter(2, 3500, btype='highpass', fs=rate, output='sos'),signal)
    start = round(at*rate)
    wave[start:start+len(signal)] += signal
events, report = f.measured_drum_strokes(wave, float)
for at, voice in onsets:
    nearby = [e for e in events if abs(e['time']-at)<.018]
    assert nearby, (at, voice, [(e['time'],e['drumVoice']) for e in events])
    assert all(e['drumSalience']>0 for e in nearby)
# Ignore peaks in the last few envelope milliseconds, but ringing 25–100 ms
# after a measured attack must not manufacture an extra kick instruction.
ringing = [e for e in events if e['drumVoice']=='kick'
           and any(.025<e['time']-at<.120 for at,voice in onsets if voice=='kick')]
assert not ringing, ringing
# Off-grid attacks move with their audio, not to the nearest calculated beat.
shift = .037
shifted = np.r_[np.zeros(round(shift*rate)), wave[:-round(shift*rate)]]
moved, _ = f.measured_drum_strokes(shifted, float)
for at,_ in onsets:
    original = min(events,key=lambda e:abs(e['time']-at))['time']
    delayed = min(moved,key=lambda e:abs(e['time']-at-shift))['time']
    assert abs(delayed-original-shift)<.003,(at,original,delayed)
routine = [dict(source='drum-stem', time=i*.5, button='O', role='groove',
                confidence=1, drumVoice='snare') for i in range(8)]
f.tag_drum_fill_accents(routine,.5,0)
assert all(e['role']=='groove' for e in routine), routine
print('PASS physical kick/snare/hat attacks, ringing rejection, actual syncopation and routine backbeats are not fills')
