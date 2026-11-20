"""Signal controls for the studio-stem author; requires NumPy/SciPy."""
from pathlib import Path
import importlib.util
import sys
import numpy as np

spec = importlib.util.spec_from_file_location('stem_author_controls', Path(__file__).with_name('author-moth-funk.py'))
author = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = author
spec.loader.exec_module(author)
rate = author.SAMPLE_RATE
time = np.arange(rate*4)/rate
rng = np.random.default_rng(42)
envelope = np.minimum(1, np.maximum(0, (time-.5)/.02))*np.minimum(1, np.maximum(0, (3.5-time)/.02))
harmonics = sum(np.sin(2*np.pi*180*n*time)/n for n in range(1, 6))
phase = np.cumsum(180+12*np.sin(2*np.pi*5.5*time))*2*np.pi/rate
vibrato = sum(np.sin(n*phase)/n for n in range(1, 6))
for name, wave, expected in [
    ('silence', np.zeros(len(time)), 0),
    ('broadband unvoiced hiss', rng.normal(0, .08, len(time))*(time>.5)*(time<3.5), 0),
    ('quiet bleed', .0008*harmonics*envelope, 0),
    ('one sustained vowel', .16*harmonics*envelope, 1),
    ('one continuous vibrato vowel', .16*vibrato*envelope, 1)
]:
    notes = author.vocal_attacks(wave, float, 4)
    assert len(notes) == expected, (name, [event.time for event,_ in notes])
    print('PASS', name, len(notes), 'articulations')

wave = np.zeros(len(time))
onsets = [.7, .85, 1.0]
for index, onset in enumerate(onsets):
    age = time-onset
    body = np.where((age>=0)&(age<.095), np.minimum(1, np.maximum(0, age/.004))
                    *np.minimum(1, np.maximum(0, (.095-age)/.025)), 0)
    tone = sum(np.sin(2*np.pi*(160+index*12)*n*time)/n for n in range(1, 6))
    wave += .2*tone*body
notes = author.vocal_attacks(wave, float, 4)
assert len(notes) == 3
assert all(abs(event.time-onset)<.025 for (event,_),onset in zip(notes,onsets))
assert all(event.features['strong'] for event,_ in notes)
print('PASS three real rapid re-articulations retain separate source attacks')

repeated = [(author.Attack(at, 2), np.array([1., 0., 0., 0.])) for at in [1.6, 1.8, 2., 2.2, 2.4]]
assert len(author.vocal_phrases(repeated, 0, .5)) == 1
assert len(set(author.vocal_delivery_lanes(repeated).values())) == 1
print('PASS bar crossings preserve the phrase and repeated delivery can reuse one key')
