#!/usr/bin/env python3
"""Beauty Boy charts you play like the band (owner, 2026-11-20).

Easy is the drum kit: every firm kick on T, every firm snare on O, hi-hats on
M where the kick and snare rest (more of them in the louder sections), fills
before a section as a run on H, and the downbeat where a section kicks back in
as a held H. The same drum is always the same button, so a repeated riff plays
the same way every time.

Hard is the lead vocal: one note per sung syllable (codex's articulation
detector in author-moth-funk.py), the button following the melody (the song's
lowest quarter of its notes on T, then H, O, and the highest on M), sustained
notes held for as long as they are sung, and quick rap kept off long runs of
one button.

Reads the studio stems (they share the shipped mixes' clock: 0 ms offset, no
drift, .qa/moth/timing-audit-20261120/source/alignment.json) and writes
candidate charts plus a report. Requires numpy, scipy, librosa and ffmpeg.

Breaks longer than two bars with no drums (Easy) or no vocals (Hard) play the
bass line instead: the measured bass notes from author-moth-funk.py's analysis
(on H in Easy).

Every note sits on the sound you hear (owner, 2026-11-21: "on beat 100%, no
dragging or pushing"). The songs are recorded to a click, so each has a beat
grid: the table's BPM, its phase from the strong on-beat kicks and snares, its
beat 1 from where the song changes section, 32nds in slow songs, and triplets in
a song's swung bars (Level 7). Easy keeps main hits on that grid where the drum
is within 15 ms of it (inaudible, and neatly spaced) and on the drum's own time
where it is not; it keeps only hits the full mix lets you hear, and adds the
mix's strong hits on beats and 8ths that the drum track lacks (Level 7's bass
and synth stabs: T when low, else H). A drum groove that repeats is charted the
same every time. Easy notes are an 8th apart at most (a 16th in slow songs).
Hard follows the singing as you hear it, ad-libs included: each syllable where
its word lands (the voice at half strength), clearly sung syllables the
detector missed added, echo tails and breaths and doubly found syllables
dropped. The grid ships with the charts for the track's bar and beat lines.

usage: author-moth-feel.py --stems DIR --previous-analysis FILE [--songs id,id] --output FILE --report FILE
"""
from __future__ import annotations

import argparse
from collections import Counter
import importlib.util
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('author_moth_funk', ROOT / 'scripts/author-moth-funk.py')
author = importlib.util.module_from_spec(spec)
sys.modules['author_moth_funk'] = author
spec.loader.exec_module(author)

VERSION = 'grid-20261121c'
SR = author.SAMPLE_RATE
GHOST = .60              # Easy plays main hits: below this share of a drum's typical loudness, a stroke is a ghost note
EASY_SNAP = .045         # an Easy note further than this from the grid is a stray decay or a slip: dropped
EASY_SNAP_SWUNG = .060   # a swung bar's triplet absorbs the drummer's looser swing (Level 7's off-beats .54-.65)
SLOW_SIXTEENTH = .15     # a song whose 16th lasts this long or longer charts on 32nds
DRUM_EXACT = .015        # an Easy note within this of its drum hit stays on the grid; further, it takes the hit's time
DRUM_REACH = .065        # how far from its grid slot a note's drum hit may be
AUDIBLE = .45            # an Easy note needs the full mix to hit at least this strongly around it (share of its loud hits)
ACCENT = .50             # a full-mix hit this strong with no Easy note gets one ("chart what I hear")
GROOVE_AUDIBLE = .25     # how strongly the mix must hit for a groove's shared note to be restored in one of its bars
VOCAL_QUIET = 20         # dB under the phrase's loudest: an echo tail or breath, not a note
VOCAL_NUCLEUS = 12       # dB under the phrase's loudest: still a clearly sung syllable
VOCAL_RISE = 6           # dB a missing syllable rises out of the sound before it to be added
LAND_MAX = .08           # how far a Hard note moves to where its word lands
HARD_FASTEST = .125      # the quickest two sung notes (owner: keep the 0.125 s limit)
EASY_FASTEST = .19       # Easy's quickest notes: 16ths where they are this far apart (slow songs), else 8ths
SWING_RANGE = (.54, .70) # where a swung off-beat 8th sits, in beats
HAT_FLOOR = .50
NEAREST = .120           # no two notes closer: the phone rail (306 px/s) needs 36 px between 28 px letters
PAIR = .190              # two notes closer than this are a quick pair; never three in a row
SAME_BUTTON = .160       # the same button again needs at least this long
HOLD_MIN = .36
HARD_GAP = author.MIN_HARD_GAP
DRUM_BUTTON = {'kick': 'T', 'snare': 'O', 'hat': 'M', 'percussion': 'H'}
PITCH_BUTTONS = 'THOM'   # lowest to highest


def bar_sections(mix, first, beat):
    """Per-bar loudness of the full mix: louder bars, and bars where a section kicks back in."""
    bar = 4 * beat
    count = int((len(mix) / SR - first) // bar)
    rms = np.array([np.sqrt(np.mean(mix[int((first + b * bar) * SR):int((first + (b + 1) * bar) * SR)] ** 2) + 1e-12)
                    for b in range(count)])
    db = 20 * np.log10(rms / rms.max())
    loud = db >= np.percentile(db, 45)
    starts = set()
    for b in range(2, count):
        before = max(db[b - 2], db[b - 1])
        if db[b] - before >= 2.5 and loud[b]:
            starts.add(b)
    return db, loud, starts


def easy_chart(strokes, mix, first, beat, duration):
    db, loud, starts = bar_sections(mix, first, beat)
    bar = 4 * beat

    def bar_of(time):
        return int((time - first) // bar)

    def is_loud(time):
        b = bar_of(time)
        return 0 <= b < len(loud) and bool(loud[b])

    notes = []
    for s in strokes:
        if s['drumVoice'] in ('kick', 'snare', 'percussion') and s['drumSalience'] >= GHOST:
            notes.append(dict(time=s['time'], button=DRUM_BUTTON[s['drumVoice']], role=s['drumVoice'],
                              salience=s['drumSalience'], hold=0.0))
    # Fills: a busy beat (three or more kick/snare/tom strokes) that the same
    # beat of the neighbouring bars does not repeat is a fill, not the groove.
    # It becomes a run on H at 8th-note spacing, replacing the kick/snare there.
    def pattern(b, k):
        start = first + b * bar + k * beat
        return {int(round((s['time'] - start) / beat * 4)) for s in strokes
                if start - .03 <= s['time'] < start + beat - .03
                and s['drumVoice'] != 'hat' and s['drumSalience'] >= .30}

    def alike(x, y):
        return len(x & y) / max(1, len(x | y)) >= .5

    fills = []
    bars_count = len(loud)
    for b in range(bars_count):
        for k in range(4):
            here = pattern(b, k)
            if len(here) < 3:
                continue
            neighbours = [pattern(o, k) for o in (b - 1, b + 1, b - 2, b + 2) if 0 <= o < bars_count]
            if sum(alike(here, other) for other in neighbours) >= 2:
                continue
            fills.append((b, k))
    for b, k in fills:
        start = first + b * bar + k * beat
        window = [s for s in strokes if start - .03 <= s['time'] < start + beat - .03
                  and s['drumVoice'] != 'hat' and s['drumSalience'] >= .30]
        notes = [n for n in notes if not start - .03 <= n['time'] < start + beat - .03]
        last = -1.0
        for s in window:
            if s['time'] - last >= PAIR:
                notes.append(dict(time=s['time'], button='H', role='fill', salience=s['drumSalience'], hold=0.0))
                last = s['time']
    landings = {b + 1 for b, k in fills if k == 3}
    fills = len(fills)
    # Big moments: the downbeat where a section kicks back in, or where a fill
    # at the end of a bar lands, is held on H (at most one every four bars).
    holds = 0
    moments = []
    for b in sorted(starts | landings):
        if b < bars_count and (not moments or b - moments[-1] >= 4):
            moments.append(b)
    for b in moments:
        down = first + b * bar
        near = [s for s in strokes if abs(s['time'] - down) <= .06 and s['drumSalience'] >= .30]
        if not near:
            continue
        at = min(near, key=lambda s: abs(s['time'] - down))['time']
        notes = [n for n in notes if not (at - .06 <= n['time'] <= at + beat + .15)]
        notes.append(dict(time=at, button='H', role='big-moment', salience=2.0, hold=round(beat, 5)))
        holds += 1
    # Hi-hats where the kick and snare rest: about a beat of space, half a
    # beat in the louder sections.
    notes.sort(key=lambda n: n['time'])
    times = np.array([n['time'] for n in notes])
    ends = np.array([n['time'] + n['hold'] for n in notes])
    for s in strokes:
        if s['drumVoice'] != 'hat' or s['drumSalience'] < HAT_FLOOR:
            continue
        rest = (.48 if is_loud(s['time']) else .9) * beat
        if len(times) and (np.min(np.abs(times - s['time'])) < rest or np.any((times <= s['time']) & (ends + .15 > s['time']))):
            continue
        notes.append(dict(time=s['time'], button='M', role='hat', salience=s['drumSalience'], hold=0.0))
    return tidy(notes, kind='easy'), {'sectionStarts': sorted(starts), 'fillLandings': sorted(landings), 'fills': fills, 'bigMoments': holds,
                                      'loudBars': int(loud.sum()), 'bars': len(loud)}


PRIORITY = {'big-moment': 5, 'fill': 4, 'kick': 3, 'snare': 3, 'percussion': 3, 'accent': 3, 'syllable': 3, 'hat': 1}


def tidy(notes, kind):
    """Playable spacing: no notes on top of each other, no fast triples, no fast same-button repeats.

    Hard's syllables are already spaced by codex's articulation selection
    (fast runs of up to three); there only overlaps with a hold's release are
    resolved, and quick same-button repeats are moved, not dropped (hard_chart)."""
    notes = sorted(notes, key=lambda n: n['time'])
    changed = True
    while changed:
        changed = False
        for i in range(1, len(notes)):
            a, b = notes[i - 1], notes[i]
            gap = b['time'] - (a['time'] + a['hold'])
            same = kind == 'easy' and a['button'] == b['button'] and b['time'] - a['time'] < SAME_BUTTON
            if gap < NEAREST or same:
                weaker = min((i - 1, i), key=lambda j: (PRIORITY.get(notes[j]['role'], 2), notes[j]['salience']))
                del notes[weaker]
                changed = True
                break
            if kind == 'easy' and i >= 2 and notes[i - 1]['time'] - notes[i - 2]['time'] < PAIR and gap < PAIR:
                weaker = min((i - 2, i - 1, i), key=lambda j: (PRIORITY.get(notes[j]['role'], 2), notes[j]['salience']))
                del notes[weaker]
                changed = True
                break
    return notes


def hard_chart(vocal, duration, beat):
    import librosa
    attacks = [attack for attack, _tone in author.vocal_attacks(vocal, float, duration)]
    f0, voiced, _ = librosa.pyin(vocal.astype(np.float32), fmin=70, fmax=1000, sr=SR, frame_length=1024, hop_length=160)
    midi = np.where(voiced & np.isfinite(f0), librosa.hz_to_midi(np.nan_to_num(f0, nan=1.0)), np.nan)
    level = np.sqrt(np.convolve(vocal.astype(np.float64) ** 2, np.ones(160) / 160, mode='same'))[::160]
    fps = SR / 160
    notes = []
    times = [a.time for a in attacks]
    for index, attack in enumerate(attacks):
        t = attack.time
        following = times[index + 1] if index + 1 < len(times) else duration
        a, b = int((t + .03) * fps), int(min(following, t + .25) * fps)
        pitch = midi[a:b]
        pitch = pitch[np.isfinite(pitch)]
        note = dict(time=t, role='syllable', salience=float(attack.strength), hold=0.0,
                    pitch=float(np.median(pitch)) if len(pitch) >= 3 else None)
        # Held for as long as the same note is sung.
        if note['pitch'] is not None:
            start = int((t + .03) * fps)
            peak = level[start:start + int(.15 * fps)].max() if start < len(level) else 0
            k = start
            while (k < len(midi) and k < following * fps and np.isfinite(midi[k])
                   and abs(midi[k] - note['pitch']) <= 1.5 and level[k] >= .3 * peak):
                k += 1
            sung = k / fps - t
            note['sung'] = round(sung, 3)
            # Held up to the gap before the next syllable.
            held = min(sung, following - t - HARD_GAP, 2.5)
            if held >= max(HOLD_MIN, .75 * beat):
                note['hold'] = round(held, 5)
        notes.append(note)
    notes, refined = refine_vocals(notes, level, midi, fps)
    pitched = [n['pitch'] for n in notes if n['pitch'] is not None]
    edges = np.percentile(pitched, [25, 50, 75]) if pitched else [0, 0, 0]
    previous = 'H'
    for n in notes:
        if n['pitch'] is None:
            n['button'] = previous
        else:
            n['button'] = PITCH_BUTTONS[int(np.searchsorted(edges, n['pitch']))]
        previous = n['button']
    # Quick rap on one pitch: no three of the same button in a row inside half a second.
    for i in range(2, len(notes)):
        a, b, c = notes[i - 2], notes[i - 1], notes[i]
        if a['button'] == b['button'] == c['button'] and c['time'] - a['time'] < .5:
            band = PITCH_BUTTONS.index(b['button'])
            up = b['pitch'] is not None and a['pitch'] is not None and b['pitch'] >= a['pitch']
            b['button'] = PITCH_BUTTONS[min(3, band + 1) if (up and band < 3) or band == 0 else band - 1]
    for i in range(1, len(notes)):
        a, b = notes[i - 1], notes[i]
        if a['button'] == b['button'] and b['time'] - a['time'] < SAME_BUTTON:
            band = PITCH_BUTTONS.index(b['button'])
            higher = b['pitch'] is not None and a['pitch'] is not None and b['pitch'] > a['pitch']
            b['button'] = PITCH_BUTTONS[band + 1 if (higher and band < 3) or band == 0 else band - 1]
    kept = tidy(notes, kind='hard')
    sung = [n.get('sung', 0) for n in notes]
    return kept, {'syllables': len(attacks), **refined, 'pitched': len(pitched), 'pitchEdgesMidi': [round(float(e), 2) for e in edges],
                  'sungSeconds': {'p50': round(float(np.percentile(sung, 50)), 3), 'p90': round(float(np.percentile(sung, 90)), 3), 'over042': int(sum(x >= .42 for x in sung)), 'over030': int(sum(x >= .30 for x in sung))},
                  'holds': sum(n['hold'] > 0 for n in kept)}


def refine_vocals(notes, level, midi, fps):
    """Hard on the singing as you hear it (owner, 2026-11-21: notes slightly
    before the words, syllables missing, extra notes; ad-libs stay).

    A note on something you cannot hear (VOCAL_QUIET dB under the phrase's
    loudest: an echo tail, a breath) goes. A clearly sung syllable with no note
    (a voiced loudness peak at most VOCAL_NUCLEUS dB under the phrase, rising
    VOCAL_RISE dB out of the sound before it) gets one. Every note then sits
    where its word lands: where the voice reaches half its strength, at most
    LAND_MAX after the first sound of the syllable. One syllable found twice
    (two notes within .25 s, no 3 dB dip in the voice between them, the same
    pitch) keeps its first note."""
    from scipy.ndimage import maximum_filter1d
    db = 20 * np.log10(level + 1e-7)
    count = len(db)
    phrase = maximum_filter1d(db, size=int(3 * fps) + 1)
    frame = lambda t: min(count - 1, max(0, int(round(t * fps))))
    voiced = lambda a, b: bool(np.isfinite(midi[max(0, a):min(len(midi), b + 1)]).any())
    kept, quiet = [], 0
    for n in notes:
        a, b = frame(n['time']), frame(n['time'] + .15)
        peak = db[a:b + 1].max()
        if peak < phrase[a] - VOCAL_QUIET or (not voiced(a, b) and peak < phrase[a] - VOCAL_NUCLEUS):
            quiet += 1
            continue
        kept.append(n)
    times = np.array(sorted(n['time'] for n in kept))
    added, last = 0, -100
    for f in range(4, count - 4):
        if db[f] < db[f - 4:f + 5].max() or db[f] < phrase[f] - VOCAL_NUCLEUS or not voiced(f - 2, f + 2):
            continue
        before = db[max(0, f - 15, last):f + 1]
        if db[f] - before.min() < VOCAL_RISE:
            continue
        last = f
        g = f
        while g > 0 and level[g - 1] >= .5 * level[f]:
            g -= 1
        landing = g / fps
        if len(times) and np.any((times >= landing - .12) & (times <= f / fps)):
            continue
        pitch = midi[f:f + 10]
        pitch = pitch[np.isfinite(pitch)]
        kept.append(dict(time=landing, role='syllable', salience=.2, hold=0.0, added=True,
                         pitch=float(np.median(pitch)) if len(pitch) else None))
        added += 1
    kept.sort(key=lambda n: n['time'])
    landed = 0
    for i, n in enumerate(kept):
        if n.get('added'):
            continue
        a = frame(n['time'])
        b = frame(min(n['time'] + .25, kept[i + 1]['time'] if i + 1 < len(kept) else n['time'] + .25))
        if b <= a:
            continue
        p = a + int(np.argmax(level[a:b + 1]))
        g = a
        while g < p and level[g] < .5 * level[p]:
            g += 1
        shift = g / fps - n['time']
        if 0 < shift <= LAND_MAX:
            if n['hold'] > 0:
                n['hold'] = round(n['hold'] - shift, 5) if n['hold'] - shift >= HOLD_MIN else 0.0
            n['time'] = g / fps
            landed += 1
    kept.sort(key=lambda n: n['time'])
    doubles, i = 0, 1
    while i < len(kept):
        a, b = kept[i - 1], kept[i]
        fa, fb = frame(a['time']), frame(b['time'])
        same_pitch = a.get('pitch') is None or b.get('pitch') is None or abs(a['pitch'] - b['pitch']) < 1.5
        if b['time'] - a['time'] <= .25 and fb > fa + 2 and same_pitch \
                and min(db[fa:fa + 12].max(), db[fb:fb + 12].max()) - db[fa + 2:fb + 1].min() < 3:
            del kept[i]
            doubles += 1
            continue
        i += 1
    # The quickest pair stays HARD_FASTEST apart; an added syllable gives way first.
    changed = True
    while changed:
        changed = False
        for i in range(1, len(kept)):
            a, b = kept[i - 1], kept[i]
            if b['time'] - a['time'] < HARD_FASTEST or b['time'] < a['time'] + a['hold'] + .06:
                del kept[min((i - 1, i), key=lambda j: (not kept[j].get('added'), kept[j]['salience']))]
                changed = True
                break
    return kept, {'droppedQuiet': quiet, 'mergedDoubles': doubles, 'addedSyllables': sum(1 for n in kept if n.get('added')), 'landed': landed}


def mix_hits(mix):
    """The full mix's percussive hits: when, how strong (share of its loud
    hits), and how much of each is low (a kick or a bass stab)."""
    import librosa
    _, perc = librosa.effects.hpss(mix.astype(np.float32))
    hop = 64
    envelope = librosa.onset.onset_strength(y=perc, sr=SR, hop_length=hop)
    peaks = librosa.onset.onset_detect(onset_envelope=envelope, sr=SR, hop_length=hop, units='frames')
    spectrum = np.abs(librosa.stft(perc, n_fft=1024, hop_length=hop))
    freqs = librosa.fft_frequencies(sr=SR, n_fft=1024)
    low = spectrum[freqs < 200].sum(0) / (spectrum.sum(0) + 1e-9)
    scale = np.percentile(envelope[peaks], 95) + 1e-9
    return {'time': librosa.frames_to_time(peaks, sr=SR, hop_length=hop),
            'strength': envelope[peaks] / scale,
            'low': low[np.minimum(peaks, len(low) - 1)],
            'envelope': envelope / scale, 'fps': SR / hop}


def heard(hits, t):
    """How strongly the full mix hits around a note (it sits ~10 ms before the
    hit's peak): its percussive strength, not only the picked peaks, so a hit
    right after another still counts."""
    a, b = int((t - .025) * hits['fps']), int((t + .045) * hits['fps']) + 1
    window = hits['envelope'][max(0, a):max(0, b)]
    return float(window.max()) if len(window) else 0.0


def audible_easy(notes, hits):
    """Easy keeps a note only where the full mix has an audible hit (owner,
    2026-11-21: no notes on sounds the mix buries). Notes sit about 10 ms before
    a hit's peak."""
    kept, dropped = [], 0
    for n in notes:
        if n['role'] in ('big-moment', 'bass') or heard(hits, n['time']) >= AUDIBLE:
            kept.append(n)
        else:
            dropped += 1
    return kept, dropped


def add_accents(notes, hits, strokes, grid):
    """A strong hit in the full mix with no Easy note gets one (owner,
    2026-11-21: "chart what I hear"; Level 7's bass stabs): on the drum's
    button where a drum plays it, else T for a low hit and H for the rest. On
    the grid when within DRUM_EXACT of it, else on its own time."""
    times = np.array(sorted(n['time'] for n in notes))
    added = []
    for t, strength, low in zip(hits['time'], hits['strength'], hits['low']):
        at = float(t) - .010
        if strength < ACCENT or (len(times) and np.min(np.abs(times - at)) < .08):
            continue
        k = np.floor((at - grid['first']) / grid['beat'] + 1e-9)
        positions = grid_sets(grid, grid['first'] + (k + .5) * grid['beat'], 'easy')[0]
        swung = abs(positions[1] - .25) > 1e-6 if len(positions) == 5 else False
        # The beat you feel: an added hit sits on a beat or an 8th, never a 16th.
        eighths = (0, positions[2], 1) if swung else (0, .5, 1)
        slots = [grid['first'] + (k + p) * grid['beat'] for p in eighths]
        slot = min(slots, key=lambda x: abs(x - at))
        if abs(slot - at) > .04:
            continue
        drums = [x for x in strokes if abs(x['time'] - at) <= .04 and x['drumVoice'] in ('kick', 'snare', 'percussion') and x['drumSalience'] >= .3]
        button = DRUM_BUTTON[max(drums, key=lambda x: x['drumSalience'])['drumVoice']] if drums else ('T' if low >= .35 else 'H')
        note = dict(time=slot if abs(slot - at) <= DRUM_EXACT else at, measured=at, button=button, role='accent', salience=float(strength), hold=0.0)
        if note['time'] != slot:
            note['drumTimed'] = True
        added.append(note)
    merged = easy_spacing(notes + added, grid)
    return merged, sum(1 for n in merged if n['role'] == 'accent')


def fill_breaks(notes, bass, beat, duration, kind, lead=2.0):
    """Breaks longer than two bars play the bass line (owner, 2026-11-20).

    The bass notes are the measured bass attacks the stem-pattern charts
    already used in those breaks (author-moth-funk.py's analysis): on H in
    Easy, with their own letters in Hard; the river's bass-riff opening keeps
    its holds."""
    notes = sorted(notes, key=lambda n: n['time'])
    edges = [lead] + [n['time'] + n['hold'] for n in notes]
    starts = [n['time'] for n in notes] + [duration - .3]
    added = []
    for begin, end in zip(edges, starts):
        if end - begin <= 8 * beat:
            continue
        for event in bass:
            t = event['time']
            # Hard keeps its normal gap around bass notes (no evidence-backed quick pairs there).
            if kind == 'hard' and added and t - (added[-1]['time'] + added[-1]['hold']) < HARD_GAP:
                continue
            if begin + .3 <= t <= end - .3:
                hold = max(0.0, min(event.get('holdEnd', t), end - .3) - t)
                added.append(dict(time=t, button='H' if kind == 'easy' else event['button'], role='bass',
                                  salience=float(event.get('confidence', .5)), hold=round(hold, 5), pitch=None))
    return tidy(notes + added, kind=kind), len(added)


def song_grid(strokes, first, beat, mix=None):
    """The song's beat grid, as rhythm games chart on one (owner, 2026-11-21).

    Every song is recorded to a click, so its tempo is the table's BPM
    throughout. The phase is where the strong kicks and snares on the beat
    actually land. A song swings when its off-beat hits cluster between the
    straight 8th and the triplet (twice as many as at the straight 8th or
    16th): then each bar is swung or straight by its own off-beats, and the
    swung 8th sits where the drums put it (Level 7: about .6 of a beat)."""
    t = np.array([s['time'] for s in strokes])
    salience = np.array([s['drumSalience'] for s in strokes])
    voice = np.array([s['drumVoice'] for s in strokes])
    strong = (salience >= .6) & np.isin(voice, ['kick', 'snare'])
    rel = (t[strong] - first) / beat
    offsets = (rel - np.round(rel)) * beat
    offsets = offsets[np.abs(offsets) <= .06]
    shift = float(np.median(offsets)) if len(offsets) >= 8 else 0.0
    first += shift
    # Which beat is the bar's first: a song changes section on beat 1, so the
    # biggest jumps in loudness mark it (the table's downbeat was one beat off
    # in Get Down and two in 笑死, 2026-11-21).
    bar_shift = 0
    if mix is not None:
        count = int((len(mix) / SR - first) / beat)
        level = np.array([np.sqrt(np.mean(mix[int((first + k * beat) * SR):int((first + (k + .5) * beat) * SR)] ** 2) + 1e-9)
                          for k in range(count)])
        db = 20 * np.log10(level)
        rise = np.array([db[k] - db[k - 4:k].mean() if k >= 4 else 0.0 for k in range(count)])
        top = np.argsort(rise)[-24:]
        votes = [int(np.sum(top % 4 == r)) for r in range(4)]
        best = int(np.argmax(votes))
        if best and votes[best] >= 1.5 * votes[0] and votes[best] - votes[0] >= 4:
            bar_shift = best
            first += best * beat
    used = salience >= .3
    frac = ((t[used] - first) / beat) % 1.0
    width = .02 / beat
    near = lambda centre: int(np.sum(np.abs(frac - centre) <= width))
    swung = frac[(frac >= SWING_RANGE[0]) & (frac <= SWING_RANGE[1])]
    swing = None
    if len(swung) >= 40 and len(swung) >= 2 * max(near(.5), near(.75)):
        swing = round(float(np.median(swung)), 4)
    bar = 4 * beat
    count = int((t.max() - first) // bar) + 2
    feel = ['straight'] * count
    if swing:
        votes = []
        for b in range(count):
            inside = used & (t >= first + b * bar - .03) & (t < first + (b + 1) * bar - .03)
            f = ((t[inside] - first) / beat) % 1.0
            at_swing = int(np.sum(np.abs(f - swing) <= width))
            at_straight = int(np.sum(np.abs(f - .5) <= width) + np.sum(np.abs(f - .75) <= width))
            votes.append('swing' if at_swing > at_straight else 'straight' if at_straight > at_swing else None)
        for b in range(count):
            # The majority of the five bars around it; a tie keeps the bar's own reading.
            around = [v for v in votes[max(0, b - 2):b + 3] if v]
            swung, straight = around.count('swing'), around.count('straight')
            feel[b] = 'swing' if swung > straight else 'straight' if straight > swung else (votes[b] or 'straight')
    # Swung bars are charted as even triplets, Taiko-style: the off-beat at 2/3
    # of a beat (owner, 2026-11-21), about 17 ms after Level 7's measured .63.
    # Slow songs (a 16th of .15 s or more) chart on 32nds and sextuplets: their
    # drums and rap use those (Level 2: one strong hit in ten sits on a 32nd),
    # and a 16th grid moved them up to 100 ms (owner, 2026-11-21).
    division = 8 if beat / 4 >= SLOW_SIXTEENTH - 1e-9 and not swing else 4
    return {'first': first, 'beat': beat, 'shift': shift, 'barShift': bar_shift, 'swing': 2 / 3 if swing else None,
            'measuredSwing': swing, 'feel': feel, 'division': division}


def grid_sets(grid, time, kind):
    """The positions a note may take in its beat (fractions of a beat; 1 = the next beat)."""
    b = int((time - grid['first']) // (4 * grid['beat']))
    s = grid['swing'] if grid['swing'] and 0 <= b < len(grid['feel']) and grid['feel'][b] == 'swing' else .5
    d = grid.get('division', 4)
    straight = (0, s / 2, s, (1 + s) / 2, 1) if s != .5 else tuple(k / d for k in range(d + 1))
    triplet = tuple(k / (d * 3 // 4) for k in range(d * 3 // 4 + 1))
    if kind == 'easy':
        return [straight]
    return [straight, triplet]


def easy_gap(grid, time):
    """How close two Easy notes may be: a 16th where that is EASY_FASTEST or more
    (slow songs, straight bars), otherwise the bar's shortest 8th."""
    b = int((time - grid['first']) // (4 * grid['beat']))
    swung = grid['swing'] and 0 <= b < len(grid['feel']) and grid['feel'][b] == 'swing'
    return grid['beat'] / 4 if not swung and grid['beat'] / 4 >= EASY_FASTEST - 1e-9 else eighth_gap(grid, time)


def easy_spacing(notes, grid):
    """Easy is main hits at most an 8th apart (a 16th in slow songs): of two closer notes the lesser goes."""
    notes = sorted(notes, key=lambda n: n['time'])
    changed = True
    while changed:
        changed = False
        for i in range(1, len(notes)):
            a, b = notes[i - 1], notes[i]
            if b['time'] - a['time'] < easy_gap(grid, b['time']) - 1e-6:
                del notes[min((i - 1, i), key=lambda j: (PRIORITY.get(notes[j]['role'], 2), notes[j]['salience']))]
                changed = True
                break
    return notes


def bar_slots(grid, b):
    """Where Easy notes may sit in bar b, in seconds from its start."""
    beat = grid['beat']
    positions = grid_sets(grid, grid['first'] + (4 * b + .5) * beat, 'easy')[0][:-1]
    return [(k + p) * beat for k in range(4) for p in positions]


def same_groove(notes, strokes, grid, hits=None):
    """A drum groove that repeats is charted the same every time (owner,
    2026-11-21: "same groove, same chart", as Taiko does).

    Bars whose kicks, snares and percussion sit on the same grid slots (75%
    alike) form a groove. Where three or more of its bars carry no fill, big
    moment or hold, each of them gets the notes most of them agree on: a stray
    detection in one bar drops out, a hit missed in one comes back."""
    first, beat = grid['first'], grid['beat']
    bar = 4 * beat

    def place(time):
        b = int(np.floor((time - first) / bar + 1e-9))
        slots = bar_slots(grid, b)
        rel = time - first - b * bar
        i = int(np.argmin([abs(rel - x) for x in slots]))
        return b, i, abs(rel - slots[i])

    def feel(b):
        return grid['feel'][b] if 0 <= b < len(grid['feel']) else 'straight'

    signature = {}
    for stroke in strokes:
        if stroke['drumVoice'] in ('kick', 'snare', 'percussion') and stroke['drumSalience'] >= .45:
            b, i, err = place(stroke['time'])
            if err <= .03:
                signature.setdefault(b, set()).add((i, stroke['drumVoice']))
    groups = []
    for b in sorted(signature):
        if len(signature[b]) < 3:
            continue
        for group in groups:
            lead = signature[group[0]]
            if feel(group[0]) == feel(b) and len(lead & signature[b]) / len(lead | signature[b]) >= .75:
                group.append(b)
                break
        else:
            groups.append([b])
    by_bar = {}
    for n in notes:
        by_bar.setdefault(int(np.floor((n['time'] - first) / bar + 1e-9)), []).append(n)
    role = {'T': 'kick', 'O': 'snare', 'M': 'hat', 'H': 'percussion'}
    grooves, rewritten = 0, 0
    for group in groups:
        members = [b for b in group if not any(n['role'] in ('fill', 'big-moment') or n['hold'] > 0 for n in by_bar.get(b, []))]
        if len(members) < 3:
            continue
        grooves += 1
        votes = Counter()
        for b in members:
            for n in by_bar.get(b, []):
                votes[(place(n['time'])[1], n['button'])] += 1
        best = {}
        for (i, button), k in votes.items():
            if 2 * k >= len(members) and k > best.get(i, ('', 0))[1]:
                best[i] = (button, k)
        for b in members:
            slots = bar_slots(grid, b)
            new = []
            for i, (button, k) in best.items():
                # Only where this bar has that drum (any drum for H): the
                # shared pattern restores a hit, it never invents one.
                at = first + b * bar + slots[i]
                voice = {'T': 'kick', 'O': 'snare', 'M': 'hat'}.get(button)
                near = [x['time'] for x in strokes if abs(x['time'] - at) <= EASY_SNAP and x['drumSalience'] >= .2
                        and (voice is None or x['drumVoice'] == voice)]
                if not near and hits is not None:
                    d = hits['time'] - at
                    near = [float(at + x) for x in d[(np.abs(d) <= EASY_SNAP) & (hits['strength'] >= AUDIBLE)] - .010]
                # ... and only where the full mix lets you hear it. Most of the
                # groove's bars already do, so a weaker reading here still counts.
                if hits is not None:
                    near = [t for t in near if heard(hits, t) >= GROOVE_AUDIBLE]
                if not near:
                    continue
                hit = min(near, key=lambda t: abs(t - at))
                new.append(dict(time=at, measured=hit, button=button, role=role[button], salience=k / len(members), hold=0.0))
            new = easy_spacing(new, grid)
            if sorted((round(n['time'], 4), n['button']) for n in by_bar.get(b, [])) != sorted((round(n['time'], 4), n['button']) for n in new):
                rewritten += 1
            by_bar[b] = new
    merged = easy_spacing([n for group in by_bar.values() for n in group], grid)
    return tidy(merged, 'easy'), {'grooves': grooves, 'barsRewritten': rewritten}


def follow_drums(notes, strokes, grid):
    """Easy notes sit on the drum hit you hear (owner, 2026-11-21: no dragging
    or pushing). A hit within DRUM_EXACT of the grid stays on the grid, which
    nobody can hear; one further off (Level 4's late snare, Level 7's swing,
    Level 2's quick figures) keeps the drum's own time. Returns the notes and
    the times kept off the grid, for the chart checker."""
    voice_of = {'T': 'kick', 'O': 'snare', 'M': 'hat'}
    pools = {v: np.array(sorted(x['time'] for x in strokes if x['drumVoice'] == v and x['drumSalience'] >= .3))
             for v in ('kick', 'snare', 'hat', 'percussion')}
    every = np.array(sorted(x['time'] for x in strokes if x['drumSalience'] >= .3))
    for n in notes:
        # The note's own sound (its drum stroke, or the bass note in a break);
        # otherwise the nearest drum of its kind.
        if n.get('measured') is not None:
            hit = float(n['measured'])
        elif n['role'] == 'bass':
            continue
        else:
            pool = pools.get(voice_of.get(n['button'], ''), every)
            pool = pool if len(pool) else every
            i = int(np.searchsorted(pool, n['time']))
            near = pool[max(0, i - 1):i + 1]
            if not len(near):
                continue
            hit = float(near[np.argmin(np.abs(near - n['time']))])
        if DRUM_EXACT < abs(hit - n['time']) <= DRUM_REACH:
            n['time'] = hit
            n['drumTimed'] = True
    # Spacing as before, measured on the grid: real timing may bring two notes
    # up to DRUM_REACH closer, never closer than NEAREST.
    notes = sorted(notes, key=lambda n: n['time'])
    changed = True
    while changed:
        changed = False
        for i in range(1, len(notes)):
            a, b = notes[i - 1], notes[i]
            if b['time'] - a['time'] < max(NEAREST, easy_gap(grid, b['time']) - DRUM_REACH) - 1e-6:
                del notes[min((i - 1, i), key=lambda j: (PRIORITY.get(notes[j]['role'], 2), notes[j]['salience']))]
                changed = True
                break
    notes = tidy(notes, 'easy')
    return notes, sorted(round(n['time'], 5) for n in notes if n.get('drumTimed'))


def eighth_gap(grid, time):
    """The shortest gap between two 8ths in this note's bar (a swung bar's short side)."""
    b = int((time - grid['first']) // (4 * grid['beat']))
    s = grid['swing'] if grid['swing'] and 0 <= b < len(grid['feel']) and grid['feel'][b] == 'swing' else .5
    return min(s, 1 - s) * grid['beat']


def grid_snap(notes, grid, kind):
    """Put every note on the grid: 16ths (swung 16ths in a swung bar), and in
    Hard, beat by beat where the singer uses them, triplets. Easy drops a note
    with no grid position near it and keeps its main hits at least an 8th
    apart; holds end on the grid; Hard moves a note that lands too close to the
    one before onto the next position if it can."""
    first, beat = grid['first'], grid['beat']
    by_beat = {}
    for n in notes:
        by_beat.setdefault(int(np.floor((n['time'] - first) / beat + 1e-9)), []).append(n)
    snapped, dropped = [], 0
    for k, group in by_beat.items():
        sets = grid_sets(grid, first + (k + .5) * beat, kind)
        def cost(pos):
            return sum(min(abs((n['time'] - first) / beat - k - p) for p in pos) for n in group)
        positions = sets[0]
        # Triplets only where they fit the singer clearly better (8 ms a note).
        if len(sets) > 1 and cost(sets[1]) * beat < cost(sets[0]) * beat - .008 * len(group):
            positions = sets[1]
        for n in group:
            frac = (n['time'] - first) / beat - k
            p = min(positions, key=lambda q: abs(frac - q))
            swung_bar = abs(positions[1] - .25) > 1e-6
            if kind == 'easy' and abs(frac - p) * beat > (EASY_SNAP_SWUNG if swung_bar else EASY_SNAP):
                dropped += 1
                continue
            snapped.append({**n, 'time': first + (k + p) * beat, 'measured': n['time'], 'positions': positions, 'beatIndex': k})
    snapped.sort(key=lambda n: (n['time'], -PRIORITY.get(n['role'], 2), -n['salience']))
    merged = []
    for n in snapped:
        if merged and abs(n['time'] - merged[-1]['time']) < 1e-6:
            dropped += 1
            continue
        merged.append(n)
    if kind == 'easy':
        before = len(merged)
        merged = easy_spacing(merged, grid)
        dropped += before - len(merged)
    if kind == 'hard':
        for i in range(1, len(merged)):
            a, b = merged[i - 1], merged[i]
            if b['time'] - a['time'] >= NEAREST:
                continue
            k, positions = b['beatIndex'], b['positions']
            later = [first + (k + q) * beat for q in positions if first + (k + q) * beat - a['time'] >= NEAREST]
            if later and later[0] - b['measured'] <= .6 * beat * min(np.diff(positions)) + 1e-9 \
                    and (i + 1 == len(merged) or merged[i + 1]['time'] - later[0] >= NEAREST):
                b['time'] = later[0]
    # Holds end on the grid, leaving room before the next note.
    step = beat / (2 if kind == 'easy' else 4)
    for i, n in enumerate(merged):
        if n['hold'] <= 0:
            continue
        end = n['time'] + n['hold']
        if i + 1 < len(merged):
            end = min(end, merged[i + 1]['time'] - NEAREST)
        end = first + np.floor((end - first) / step + 1e-3) * step   # holds are stored to 10 us
        n['hold'] = round(end - n['time'], 5) if end - n['time'] >= HOLD_MIN - 1e-6 else 0.0
    return tidy(merged, kind), dropped


def rows(notes):
    return [[round(n['time'], 5), n['button'], round(n['hold'], 5)] for n in notes]


def create(identity, stems, previous):
    prefix, mixname, bpm, first, riff_bars = author.SONGS[identity]
    mix_path = ROOT / 'docs/moth/songs/2026-09-28' / (mixname + '.m4a')
    mix = author.decode(mix_path)
    drum = author.decode(author.stem_path(stems, prefix, 'Drums'))
    vocal = author.decode(author.stem_path(stems, prefix, 'Vocals'))
    duration = len(mix) / SR
    beat = 60 / bpm
    strokes, stroke_report = author.measured_drum_strokes(drum, float)
    grid = song_grid(strokes, first, beat, mix)
    first = grid['first']
    easy, easy_report = easy_chart(strokes, mix, first, beat, duration)
    hard, hard_report = hard_chart(vocal, duration, beat)
    # Either mode's measured bass notes can fill a break: the bass line is the same.
    measured = {}
    for mode in ('easy', 'hard'):
        for e in previous[identity][mode]:
            if e['source'] == 'bass-stem':
                measured.setdefault(round(e['time'], 3), e)
    bass = {mode: sorted(measured.values(), key=lambda e: e['time']) for mode in ('easy', 'hard')}
    easy, easy_report['bassNotes'] = fill_breaks(easy, bass['easy'], beat, duration, 'easy')
    hard, hard_report['bassNotes'] = fill_breaks(hard, bass['hard'], beat, duration, 'hard')
    easy, easy_report['offGridDropped'] = grid_snap(easy, grid, 'easy')
    hits = mix_hits(mix)
    easy, easy_report['inaudibleDropped'] = audible_easy(easy, hits)
    easy, easy_report['accentsAdded'] = add_accents(easy, hits, strokes, grid)
    easy, easy_report['sameGroove'] = same_groove(easy, strokes, grid, hits)
    # Hard follows the singer exactly (owner, 2026-11-21): no grid.
    easy, drum_timed = follow_drums(easy, strokes, grid)
    easy_report['drumTimed'] = len(drum_timed)
    swing_bars = [b for b, f in enumerate(grid['feel']) if f == 'swing']
    bars = easy_report['bars']
    report = {'strokes': len(strokes), **stroke_report,
              'grid': {'shiftMs': round(grid['shift'] * 1000, 1), 'barShiftBeats': grid['barShift'], 'measuredSwing': grid['measuredSwing'], 'swingBars': len(swing_bars)},
              'easy': {**easy_report, 'notes': len(easy),
              'perBar': round(len(easy) / max(1, bars), 2),
              'buttons': {k: sum(n['button'] == k for n in easy) for k in 'MOTH'}},
              'hard': {**hard_report, 'notes': len(hard),
              'buttons': {k: sum(n['button'] == k for n in hard) for k in 'MOTH'}}}
    return {'easy': rows(easy), 'hard': rows(hard),
            'grid': {'first': round(first, 5), 'bpm': bpm, 'swing': round(grid['swing'], 6) if grid['swing'] else None,
                     'measuredSwing': grid['measuredSwing'], 'swingBars': swing_bars, 'division': grid['division'],
                     'hard': 'sung', 'drumTimed': drum_timed}}, report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--stems', type=Path, required=True)
    parser.add_argument('--songs', default=','.join(author.SONGS))
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--previous-analysis', type=Path, required=True,
                        help="author-moth-funk.py's analysis (its measured bass notes fill long breaks)")
    args = parser.parse_args()
    previous = json.loads(args.previous_analysis.read_text())
    charts, reports = {}, {}
    for identity in args.songs.split(','):
        charts[identity], reports[identity] = create(identity, args.stems, previous)
        print(identity, json.dumps(reports[identity]), flush=True)
    args.output.write_text(json.dumps({'version': VERSION, 'songs': charts}, ensure_ascii=False) + '\n')
    args.report.write_text(json.dumps(reports, ensure_ascii=False, indent=1) + '\n')


if __name__ == '__main__':
    main()
