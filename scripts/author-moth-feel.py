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

usage: author-moth-feel.py --stems DIR --previous-analysis FILE [--songs id,id] --output FILE --report FILE
"""
from __future__ import annotations

import argparse
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

VERSION = 'feel-20261120b'
SR = author.SAMPLE_RATE
GHOST = .45              # below this share of a drum's typical loudness, a stroke is a ghost note
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


PRIORITY = {'big-moment': 5, 'fill': 4, 'kick': 3, 'snare': 3, 'percussion': 3, 'syllable': 3, 'hat': 1}


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
    return kept, {'syllables': len(attacks), 'pitched': len(pitched), 'pitchEdgesMidi': [round(float(e), 2) for e in edges],
                  'sungSeconds': {'p50': round(float(np.percentile(sung, 50)), 3), 'p90': round(float(np.percentile(sung, 90)), 3), 'over042': int(sum(x >= .42 for x in sung)), 'over030': int(sum(x >= .30 for x in sung))},
                  'holds': sum(n['hold'] > 0 for n in kept)}


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
    bars = easy_report['bars']
    report = {'strokes': len(strokes), **stroke_report, 'easy': {**easy_report, 'notes': len(easy),
              'perBar': round(len(easy) / max(1, bars), 2),
              'buttons': {k: sum(n['button'] == k for n in easy) for k in 'MOTH'}},
              'hard': {**hard_report, 'notes': len(hard),
              'buttons': {k: sum(n['button'] == k for n in hard) for k in 'MOTH'}}}
    return {'easy': rows(easy), 'hard': rows(hard)}, report


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
