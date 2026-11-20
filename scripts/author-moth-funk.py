#!/usr/bin/env python3
"""Build Beauty Boy's two charts from the isolated production stems.

The shipped full mixes own the clock. Use their FFT correlation against the
drum/vocal stems to correct export offsets. Pinned meter anchors name the
musical One in each recording. Easy follows the kit and Hard follows
lead-vocal articulation. Extended rests in either stem can use the bass.
Requires numpy, scipy and ffmpeg. Does not copy the source stems into the game.
"""
from __future__ import annotations

import argparse
from bisect import bisect_right
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import subprocess

import numpy as np
from scipy.ndimage import maximum_filter1d, median_filter, uniform_filter1d
from scipy.signal import butter, correlate, find_peaks, resample_poly, sosfiltfilt, stft

ROOT = Path(__file__).resolve().parents[1]
VERSION = 'funk-patterns-20261119b'
SAMPLE_RATE = 16000
HOP = 80
FPS = SAMPLE_RATE / HOP
MIN_HARD_GAP = .190
MIN_HARD_RUN_GAP = .125
MIN_EASY_GAP = .225
MIN_EASY_FILL_GAP = .190
BUTTONS = 'MOTH'
SONGS = {
    # Stem prefix, shipped mix suffix, BPM, downbeat in mix seconds, riff bars.
    # Intro pickups in TOYOURFACE and lol precede their first complete bars.
    'level1OfficeRhythm': ('Level 1 - ', '2 - 新。李包比自傳 ft. 簡道生', 93, .015, 2),
    'level2BathroomRhythm': ('Level 2 - ', '10 - 腥。禿油肥', 75, 2.173, 2),
    'level3MassageRhythm': ('Level 3 - ', '5 - Okay Okay', 105, .034, 4),
    'level4ArcadeRhythm': ('Level 4 - ', '11 - 辛。壞爸爸', 100, .048, 2),
    'level5StudioRhythm': ('Level 5 - ', '8 - 愛上我的美麗', 113, .014, 4),
    'level5RiverRhythm': ('Level 6 - ', '6 - 更年期 ft. 手天使 & 謝乾', 76, .089, 2),
    'level6ConcertRhythm': ('Level 7 - ', '9 - 尖叫聲', 134, .082, 4),
    'secret-xiaosi': ('Hidden level - 笑死', '7 - 笑死', 117.98, .776, 4),
    'secret-getdown': ('Hidden level - Get Down', '12 - Get Down 蹲得低 ft. 謝乾', 128, .106, 2),
}

@dataclass
class Attack:
    time: float
    strength: float
    band: int = 0
    frame: int = 0
    features: dict = None


def decode(path, rate=SAMPLE_RATE, stereo=False):
    raw = subprocess.check_output([
        'ffmpeg', '-nostdin', '-v', 'error', '-i', str(path), '-ac', '2' if stereo else '1',
        '-ar', str(rate), '-f', 'f32le', '-',
    ])
    return np.frombuffer(raw, '<f4').reshape(-1, 2) if stereo else np.frombuffer(raw, '<f4')


def digest(path):
    hashed = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            hashed.update(block)
    return hashed.hexdigest()


def stem_path(directory, prefix, role):
    matches = list(directory.glob(prefix + '*(' + role + ').wav'))
    if len(matches) != 1:
        raise ValueError(f'{prefix} requires one {role} stem, found {len(matches)}')
    return matches[0]


def correlation(needle, haystack):
    power = np.r_[0, np.cumsum(haystack.astype('float64') ** 2)]
    energy = power[len(needle):] - power[:-len(needle)]
    denom = np.sqrt(np.maximum(energy, 1e-12) * np.dot(needle, needle))
    return np.clip(correlate(haystack, needle, mode='valid', method='fft') / denom, -1, 1)


def align(reference, stem, low_hz):
    """Use the common repeated lag, then fit the tiny export clock difference."""
    filt = butter(3, (low_hz, 4400), btype='bandpass', fs=SAMPLE_RATE, output='sos')
    ref, wave = (sosfiltfilt(filt, item).astype('float32') for item in (reference, stem))
    half_second = SAMPLE_RATE // 2
    radius = round(.24 * SAMPLE_RATE)
    starts = np.arange(SAMPLE_RATE, min(len(ref), len(wave)) - SAMPLE_RATE, SAMPLE_RATE)
    energy = np.array([np.mean(wave[p:p + half_second] ** 2) for p in starts])
    loud = np.percentile(energy, 48)
    probes = []
    for p in starts[energy >= max(loud, 1e-7)]:
        match = correlation(wave[p:p + half_second], ref[p-radius:p+half_second+radius])
        probes.append((p, match))
    if len(probes) < 8:
        raise ValueError('The stem does not contain enough audible reference windows')
    seed = np.argmax(np.median([match for _, match in probes], axis=0))
    nearby = round(.003 * SAMPLE_RATE)
    lo, hi = max(0, seed-nearby), min(2*radius+1, seed+nearby+1)
    offsets = []
    for p, match in probes:
        i = int(np.argmax(match[lo:hi])) + lo
        if match[i] >= .25:
            offsets.append((p / SAMPLE_RATE, (i-radius) / SAMPLE_RATE, float(match[i])))
    if len(offsets) < 8:
        raise ValueError('The supplied stem and game mix lack a stable shared waveform lag')
    offsets = np.array(offsets)
    slope, start = np.polyfit(offsets[:, 0], offsets[:, 1], 1)
    residual = abs(offsets[:, 1] - start - slope * offsets[:, 0])
    keep = residual < .0005
    if keep.sum() >= 8:
        slope, start = np.polyfit(offsets[keep, 0], offsets[keep, 1], 1)
    if abs(slope) > .00004:
        raise ValueError('Variable stem delay requires source review')
    report = {'offsetMs': round(start*1000, 3), 'driftMsPerMinute': round(slope*60000, 3),
              'matchingWindows': len(offsets), 'medianCorrelation': round(float(np.median(offsets[:, 2])), 3),
              'fitP90Ms': round(float(np.percentile(residual, 90)*1000), 3)}
    return lambda t: t * (1 + slope) + start, report


def audited_clock(audit, role, path):
    """Consume a fresh, independent broad-search fit only for its exact bytes."""
    record = audit['stems'][role]
    if digest(path) != record['sha256']:
        raise ValueError(f'{role} stem differs from the independently audited source')
    report = record['alignment']
    if report.get('error') or report['matchingWindows'] < 6 or report['fitP90Ms'] > 1.5:
        raise ValueError(f'{role} has no trustworthy shared full-mix clock: {report}')
    start = report['offsetMs']/1000
    slope = report['driftMsPerMinute']/60000
    return lambda time: time*(1+slope)+start, report


def bands(wave, ranges, *, hop=HOP, envelope=121):
    result = []
    for band in ranges:
        filt = butter(2, band, btype='bandpass', fs=SAMPLE_RATE, output='sos')
        filtered = sosfiltfilt(filt, wave)
        result.append(np.sqrt(np.maximum(0, uniform_filter1d(filtered**2, envelope)[::hop])))
    return np.asarray(result)


def preceding(values, n):
    return np.pad(values, ((0, 0), (n, 0)), mode='edge')[:, :-n]


def rising_boundary(values, peak, back, fraction):
    left = max(0, peak-back)
    floor = np.percentile(values[left:peak+1], 15)
    target = floor + fraction * (values[peak] - floor)
    first = peak
    while first > left and values[first-1] > target:
        first -= 1
    return first


def percussive_attacks(wave, to_mix):
    env = bands(wave, ((36, 145), (170, 2300), (2500, 7200)))
    reference = np.maximum(np.percentile(env, 92, axis=1)[:, None], .002)
    level = env / reference
    novelty = np.maximum(0, level - preceding(level, 3))
    attacks = []
    for band, row in enumerate(novelty):
        peaks, values = find_peaks(row, height=.20, prominence=.16, distance=12)
        for peak, strength in zip(peaks, values['peak_heights']):
            if level[band, peak:peak+12].max() < .32:
                continue
            crest = peak + int(np.argmax(env[band, peak:peak+4]))
            onset = rising_boundary(env[band], crest, 8, .12)
            weight = min(float(strength), 1.8) * (1.12, 1., .56)[band]
            attacks.append(Attack(to_mix(onset / FPS), weight, band, onset))
    return sorted(attacks, key=lambda event: event.time)


def harmonic_bar_profiles(wave, bar_times, bar):
    """Fingerprints of the bass and midrange riff at eight points per bar."""
    n = 2048
    win = np.hanning(n)
    freq = np.fft.rfftfreq(n, 1/SAMPLE_RATE)
    bins = (freq >= 48) & (freq <= 1230)
    midi = np.round(69 + 12*np.log2(freq[bins]/440)).astype(int)
    group = (midi % 12) + 12*(midi >= 58)
    output = []
    for start in bar_times:
        chroma = []
        for part in range(8):
            center = round((start+(part+.38)*bar/8)*SAMPLE_RATE)
            frame = wave[max(0, center-n//2):center+n//2]
            if len(frame) < n:
                frame = np.pad(frame, (0,n-len(frame)))
            energy = np.abs(np.fft.rfft(frame*win))[bins] ** 2
            profile = np.sqrt(np.bincount(group, weights=energy, minlength=24))
            profile[:12] *= 2
            chroma.append(profile / max(np.linalg.norm(profile), 1e-8))
        output.append(np.concatenate(chroma))
    return np.asarray(output)


def riff_positions(profiles, period):
    similarity = profiles @ profiles.T / 8
    windows = range(max(0, len(profiles)-2*period+1))
    if not windows:
        return [i % period for i in range(len(profiles))], 0
    match = lambda i: float(np.mean([similarity[i+j, i+j+period] for j in range(period)]))
    # A quiet intro may have a different motif. Start the reference at the
    # first cycle strongly represented by its repetition and the wider song.
    strength = {i: match(i) for i in windows if i % period == 0}
    peak = max(strength.values())
    anchor = next(i for i, score in strength.items() if score >= peak-.050)
    template = profiles[anchor:anchor+period]
    scores = profiles @ template.T / 8
    phases = []
    for index, row in enumerate(scores):
        expected = (index-anchor) % period if not phases else (phases[-1]+1) % period
        chosen = int(np.argmax(row))
        next_phase = (chosen+1) % period
        has_pattern = index+1 < len(scores) and scores[index+1, next_phase] > .71
        if chosen != expected and row[chosen] > .83 and row[chosen]-row[expected] > .16 and has_pattern:
            expected = chosen
        phases.append(expected)
    return phases, anchor


def describe(time, button, source, **details):
    return {'time':round(float(time), 5), 'button':button, 'source':source, **details}


def sustained_stem_rests(wave, to_mix, duration, beat):
    """Measure uninterrupted quiet, leaving room for the next instrument entry."""
    hop = SAMPLE_RATE//40
    squared = uniform_filter1d(wave**2, round(.08*SAMPLE_RATE))[::hop]
    rms = np.sqrt(np.maximum(0, squared))
    threshold = max(.0017, .04*np.percentile(rms, 90))
    # Include short breaths, reverb tails, and soft drum pickups in the
    # boundary of an active passage.
    active = maximum_filter1d(rms >= threshold, size=7, mode='constant')
    edges = np.flatnonzero(np.diff(np.r_[False,~active,False])).reshape(-1,2)
    windows = [(max(0., to_mix(start/40)), min(duration, to_mix(end/40))) for start,end in edges]
    return [(start, end) for start, end in windows if end-start >= max(3.2, 6*beat)]


def measure_bass_attacks(wave, to_mix, windows):
    """Keep attacks with sustained low-frequency pitch rather than bleed."""
    bass = sosfiltfilt(butter(2, (30, 850), btype='bandpass', fs=SAMPLE_RATE, output='sos'), wave)
    rms = np.sqrt(np.maximum(0, uniform_filter1d(bass**2, round(.07*SAMPLE_RATE))[::HOP]))
    floor = max(.007, float(np.percentile(rms, 90))*.11)
    minimum_period, maximum_period = round(SAMPLE_RATE/320), round(SAMPLE_RATE/36)
    for hit in percussive_attacks(bass, to_mix):
        if hit.band > 1 or hit.strength < .33 or not any(start <= hit.time < end for start,end in windows):
            continue
        start = hit.frame*HOP + round(.015*SAMPLE_RATE)
        clip = bass[start:start+round(.11*SAMPLE_RATE)]
        if len(clip) < .09*SAMPLE_RATE or rms[min(len(rms)-1, hit.frame+9)] < floor:
            continue
        clip = clip - clip.mean()
        ac = correlate(clip, clip, method='fft')[len(clip)-1:]
        strength = ac[minimum_period:maximum_period+1]/max(ac[0], 1e-8)
        peaks, _ = find_peaks(strength)
        if not len(peaks):
            continue
        periodicity = float(np.max(strength[peaks]))
        if periodicity < .52:
            continue
        period = int(peaks[np.flatnonzero(strength[peaks] >= .91*periodicity)[0]]) + minimum_period
        pitch = round(69 + 12*np.log2((SAMPLE_RATE/period)/440))
        yield hit, BUTTONS[pitch % len(BUTTONS)], pitch, periodicity


def fill_stem_rests(events, windows, bass_attacks, gap):
    """Preserve the main lane chart and add only audible bass in its open rests."""
    times = [event['time'] for event in events]
    for hit, button, pitch, periodicity in sorted(bass_attacks, key=lambda row: -row[0].strength):
        if not any(start <= hit.time < end for start,end in windows):
            continue
        index = bisect_right(times, hit.time)
        previous = events[index-1] if index else None
        if previous and hit.time - previous.get('holdEnd', previous['time']) < gap:
            continue
        if index < len(times) and times[index]-hit.time < gap:
            continue
        times.insert(index, hit.time)
        events.insert(index, describe(hit.time, button, 'bass-stem', role='bass-break',
                                      bassPitch=pitch, confidence=round(periodicity, 3)))
    return [[round(start, 5), round(end, 5)] for start,end in windows
            if any(onset['source'] == 'bass-stem' and start <= onset['time'] < end for onset in events)]


def measure_bass_holds(events, wave, clock, windows, gap):
    """Give sustained opening bass notes tails measured from this stem's decay."""
    filtered = sosfiltfilt(butter(2, (32, 700), btype='bandpass', fs=SAMPLE_RATE, output='sos'), wave)
    rms = np.sqrt(np.maximum(0, uniform_filter1d(filtered**2, round(.035*SAMPLE_RATE))[::HOP]))
    origin, scale = clock(0), clock(1)-clock(0)
    count = 0
    for index, event in enumerate(events):
        if event['source'] != 'bass-stem' or event['time'] >= 26:
            continue
        start = round((event['time']-origin)/scale*FPS)
        peak_end = min(len(rms), start+round(.16*FPS))
        if peak_end <= start:
            continue
        peak = start + int(np.argmax(rms[start:peak_end]))
        floor = max(.004, float(rms[peak])*.20)
        tail = peak
        while tail+1 < len(rms) and rms[tail+1] >= floor:
            tail += 1
        end = clock(tail/FPS)
        if index+1 < len(events):
            end = min(end, events[index+1]['time']-gap)
        window_end = next((right for left,right in windows if left <= event['time'] < right), event['time'])
        end = min(end, window_end, event['time']+1.3)
        if end-event['time'] >= .38:
            event['holdEnd'] = round(end, 5)
            event['holdEvidence'] = 'correct bass stem sustained body decay'
            count += 1
    return count


def tag_drum_fill_accents(events, beat, first):
    """Label strong late-bar clusters for easier selection; never move a hit."""
    if any('drumVoice' in event for event in events):
        # A loud last beat alone is a backbeat. New rows carry the evidence
        # from actual local bursts, measured before readability thinning.
        for event in events:
            if event.get('drumFillAccent') and event['role'] != 'downbeat':
                event['role'] = 'fill-accent'
        return
    bars = {}
    for event in events:
        if event['source'] != 'drum-stem':
            continue
        bar = int(np.floor(((event['time']-first)/beat+.09)/4))
        bars.setdefault(bar, []).append(event)
    typical = float(np.median([len(group) for group in bars.values()])) if bars else 0
    for bar, group in bars.items():
        varied = len({event['button'] for event in group}) >= 3
        crowded = len(group) >= typical+1
        strong = float(np.percentile([event.get('confidence',0) for event in group], 60))
        for event in group:
            within = (event['time']-first)/beat-bar*4
            if within >= 2.5 and (crowded or varied) and event.get('confidence',0) >= strong:
                event['role'] = 'fill-accent'


def chart_row(event):
    time = event['time']
    return [time, event['button'], round(event.get('holdEnd', time)-time, 5)]


def drum_strokes(drum, clock):
    """Choose one physical stroke when a single attack lights up several bands."""
    size = 1024
    window = np.hanning(size)
    freqs = np.fft.rfftfreq(size, 1/SAMPLE_RATE)
    bands = np.searchsorted(freqs, [30, 160, 400, 2200, 7000])
    group = []
    for hit in percussive_attacks(drum, clock):
        if group and hit.time - group[0].time > .042:
            yield dominant_drum_stroke(group, drum, window, bands)
            group = []
        group.append(hit)
    if group:
        yield dominant_drum_stroke(group, drum, window, bands)


def dominant_drum_stroke(group, drum, window, bands):
    # Novelty is normalized independently in each band. Comparing it across
    # bands can mistake a kick's harmonic for the louder part of the stroke.
    # Use unnormalized attack spectra for the voice and the onset detector
    # for its timestamp.
    start = max(0, group[0].frame*HOP - round(.006*SAMPLE_RATE))
    clip = drum[start:start+len(window)]
    if len(clip) < len(window):
        clip = np.pad(clip, (0, len(window)-len(clip)))
    power = np.abs(np.fft.rfft(clip*window))**2
    energy = np.array([power[low:high].sum() for low, high in zip(bands, bands[1:])])
    sub, body, snap, bright = energy/max(energy.sum(), 1e-8)
    if sub >= .70:
        button, band = 'T', 0
    elif bright >= .68:
        button, band = 'M', 2
    elif snap >= max(.33, body*.82) or bright >= .20:
        button, band = 'O', 1
    else:
        button, band = 'H', 1
    best = max(group, key=lambda hit: hit.strength)
    onset = max((hit for hit in group if hit.band == band and hit.strength >= best.strength*.42),
                key=lambda hit: hit.strength, default=best)
    return Attack(onset.time, best.strength, onset.band, onset.frame), button


def refine_drum_attack_edges(drum, clock, events, gap):
    """Measure every kit voice's leading edge, including snare/percussion."""
    env = bands(drum, ((32, 155), (160, 520), (550, 2100), (2150, 7400)),
                hop=SAMPLE_RATE//1000, envelope=65)
    level = env / np.maximum(np.percentile(env, 92, axis=1)[:, None], .002)
    rise = np.minimum(level, 1) * np.maximum(0, level - preceding(level, 5))
    voice_weights = {'T': (1, .78, .84, .78), 'M': (.17, .26, .60, 1),
                     'O': (.12, .75, 1, .70), 'H': (.65, 1, .90, .65)}
    attacks = {voice:(rise * np.array(weights)[:, None]).max(axis=0)
               for voice, weights in voice_weights.items()}
    origin = clock(0)
    scale = clock(1) - origin
    refined = 0
    for index, event in enumerate(events):
        novelty = attacks.get(event['button'])
        if novelty is None:
            continue
        center = round((event['time']-origin) * 1000 / scale)
        left = max(0, center-22)
        window = novelty[left:center+17]
        if len(window) < 24:
            continue
        crest = int(window.argmax())
        if window[crest] <= 0:
            continue
        edge = crest
        while edge > 0 and window[edge-1] >= .21 * window[crest]:
            edge -= 1
        onset = round(float(clock((left+edge)/1000)), 5)
        if left+edge >= center-1 or onset < 0 or (gap > 0 and index and onset-events[index-1]['time'] < gap):
            continue
        event['time'] = onset
        refined += 1
    return refined


def measured_drum_strokes(drum, clock):
    """Attach physical kit salience without clipping all loud strokes equally.

    A kick's ringing body can trigger the low-band detector again 25–100 ms
    after its real attack. It is not a new drum stroke when the upper bands
    have no new attack and a stronger broadband stroke already explains it.
    """
    env = bands(drum, ((36, 155), (160, 520), (550, 2300), (2800, 7400)),
                hop=SAMPLE_RATE//1000, envelope=33)
    origin, scale = clock(0), clock(1)-clock(0)
    measured = []
    ringing = 0
    for hit, button in drum_strokes(drum, clock):
        at = max(16, round((hit.time-origin)*1000/scale))
        if at+35 >= env.shape[1]:
            continue
        floor = np.median(env[:, at-15:at-4], axis=1)
        attack = np.maximum(0, env[:, at:at+35].max(axis=1)-floor)
        low, body, snap, bright = attack
        upper = np.hypot(body, snap)
        if measured and hit.time-measured[-1]['time'] < .120 and hit.band == 0:
            previous = measured[-1]
            # Compare fresh upper-band energy, not the still loud kick decay.
            if previous['drumVoice'] != 'hat' and (snap+.5*bright < .35*(previous['_snap']+.5*previous['_bright'])
                    or upper < .22*previous['_upper'] and bright < .25*previous['_bright']):
                ringing += 1
                continue
        voice = ('kick' if low >= .60*upper and low > .012 else
                 'snare' if upper >= .70*bright and upper > .008 else
                 'hat' if bright > 1.5*upper else 'percussion')
        amplitude = (low if voice == 'kick' else upper if voice in ('snare','percussion') else bright)
        measured.append(dict(time=hit.time, button=button, hit=hit, drumVoice=voice,
                             _amplitude=float(amplitude), _upper=float(upper),
                             _snap=float(snap), _bright=float(bright)))
    # Normalize within the estimated physical voice: a kick and snare can be
    # equally important even when one occupies much more spectral bandwidth.
    scales = {voice:max(.004, float(np.percentile([e['_amplitude'] for e in measured
               if e['drumVoice']==voice], 70))) for voice in {e['drumVoice'] for e in measured}}
    for event in measured:
        event['drumSalience'] = round(float(np.sqrt(event['_amplitude']/scales[event['drumVoice']])), 4)
    # Refine independently before spacing. Otherwise an existing proposal of
    # the same physical hit blocks the low band's recovery to its real edge.
    refined = refine_drum_attack_edges(drum, clock, measured, 0)
    merged = []
    for event in sorted(measured, key=lambda e:e['time']):
        if merged and event['time']-merged[-1]['time'] < .035:
            previous = merged[-1]
            if event['drumSalience'] > previous['drumSalience']:
                event['time'] = previous['time']
                merged[-1] = event
        else:
            merged.append(event)
    return merged, {'rejectedDrumBodyRetriggers':ringing, 'refinedDrumCandidates':refined}


def supported_drum_fill_pair(left, right):
    return (left.get('drumVoice') in ('kick','snare','percussion')
            and right.get('drumVoice') in ('kick','snare','percussion')
            and min(left.get('drumSalience',0),right.get('drumSalience',0)) >= .65
            and (left.get('drumFillAccent') or right.get('drumFillAccent')))


def easy_chart(mix, drum, drum_clock, beat, grid, period):
    """Follow drum strokes on and between the beats without quantizing their attacks."""
    profile = harmonic_bar_profiles(mix, grid, 4*beat)
    riff, anchor = riff_positions(profile, period)
    bar_length = 4*beat
    bar_limit = max(5, round(bar_length*2.9))
    min_gap = MIN_EASY_GAP
    bars = {}
    pattern = {}
    strokes, detection_report = measured_drum_strokes(drum, drum_clock)
    for event in strokes:
        hit, button = event['hit'], event['button']
        hit.time = event['time']
        if hit.time < 0 or hit.time >= len(mix)/SAMPLE_RATE-.09 or hit.strength < (.24 if button == 'M' else .30):
            continue
        beat_position = (hit.time-grid[0])/beat
        bar = int(np.floor((beat_position+.09)/4))
        within_bar = beat_position - bar*4
        phase = riff[min(bar, len(riff)-1)] if bar >= 0 else (bar-anchor)%period
        slot = round(within_bar*4)
        key = (phase, slot, event['drumVoice'])
        pattern.setdefault(key, set()).add(bar)
        # Strong recurring downbeats and backbeats carry the groove, while a
        # bright cymbal or a close syncopation can be selected between them.
        pulse = abs(within_bar-round(within_bar)) <= .12
        one = pulse and abs(within_bar) <= .12
        grid_bonus = .24 if one else .12 if pulse else 0
        voice_bonus = .40 if event['drumVoice'] in ('kick', 'snare') else 0
        weight = event['drumSalience'] + grid_bonus + voice_bonus
        event.update(bar=bar, phase=phase, slot=slot, one=one, pulse=pulse, pattern=key,
                     weight=weight, within=within_bar)
        bars.setdefault(bar, []).append(event)

    # A fill requires an actual burst of body strokes with a changed rhythm,
    # rather than a loud routine note near the end of every bar.
    bar_support = {phase:len({e['bar'] for e in strokes if e.get('phase')==phase})
                   for phase in range(period)}
    for group in bars.values():
        for event in group:
            support = len(pattern[event['pattern']])/max(1, bar_support[event['phase']])
            event['drumRecurrence'] = round(support, 4)
            event['drumGrooveAnchor'] = bool(event['pulse'] and support >= .45
                and event['drumVoice'] == 'snare' and event['drumSalience'] >= .70)
        kit = [e for e in group if e['drumVoice']!='hat' and e['drumSalience']>=.65]
        for index in range(max(0, len(kit)-2)):
            burst = kit[index:index+3]
            if (burst[0]['within'] < 1.5 or burst[-1]['time']-burst[0]['time'] > .75*beat
                    or all(e['drumRecurrence']>=.55 for e in burst)):
                continue
            for accent in (burst[0], max(burst[1:], key=lambda e:e['drumSalience'])):
                accent['drumFillAccent'] = True

    # Rank accents before spacing them. The modest recurrence bonus favours
    # the same kit pattern when the riff returns, without making a single
    # quiet subdivision a note or moving a stroke to a calculated beat.
    ranked = sorted((e for group in bars.values() for e in group),
                    key=lambda e: (-(e['weight']+.65*e['drumRecurrence']
                         +(2 if e['one'] else 1 if e['drumGrooveAnchor'] else 0)
                         +.3*e.get('drumFillAccent',False)),e['time']))
    counts = {}
    picked = []
    times = []
    for event in ranked:
        bar, hit, button, one = event['bar'], event['hit'], event['button'], event['one']
        if counts.get(bar, 0) >= bar_limit:
            continue
        index = bisect_right(times, hit.time)
        left_gap = (MIN_EASY_FILL_GAP if index and supported_drum_fill_pair(picked[index-1],event) else min_gap)
        right_gap = (MIN_EASY_FILL_GAP if index < len(times) and supported_drum_fill_pair(event,picked[index]) else min_gap)
        if (index and hit.time-times[index-1] < left_gap-1e-8) or (index < len(times) and times[index]-hit.time < right_gap-1e-8):
            continue
        counts[bar] = counts.get(bar, 0)+1
        times.insert(index, hit.time)
        picked.insert(index, describe(hit.time, button, 'drum-stem', bar=bar+1,
                                      role='downbeat' if one else 'groove', band=hit.band,
                                      confidence=round(event['weight'], 3),
                                      **{key:event[key] for key in ('drumVoice','drumSalience','drumRecurrence',
                                           'drumGrooveAnchor','drumFillAccent') if key in event}))
    return picked, {'riffAnchorBar':anchor+1, 'drumHeads':len(picked),
                    'refinedDrumHeads':detection_report['refinedDrumCandidates'], **detection_report}


def vocal_features(wave):
    env = bands(wave, ((85, 420), (420, 1750), (1750, 7200)))
    freq, _, spec = stft(wave, fs=SAMPLE_RATE, nperseg=512, noverlap=512-HOP)
    groups = np.geomspace(90, 7450, 22)
    mag = np.asarray([np.linalg.norm(spec[(freq>=lo)&(freq<hi)], axis=0)
                      for lo,hi in zip(groups[:-1], groups[1:])])
    size = min(len(env[0]),len(mag[0]))
    env, mag = env[:, :size], mag[:, :size]
    normalized = np.log1p(mag/np.maximum(np.percentile(mag,82,axis=1)[:,None],.00012))
    flux = np.mean(np.maximum(0,normalized-preceding(normalized,3)), axis=0)
    return env, mag, flux


def short_vocal_edges(wave):
    # A shorter analysis window locates consonant and vowel edges that the
    # broader timbre measurement can smear together in a quick delivery.
    frame_size = 400
    freq, _, spectrum = stft(wave, fs=SAMPLE_RATE, nperseg=frame_size, noverlap=frame_size-HOP)
    magnitude = np.abs(spectrum[(freq >= 110) & (freq < 6200)])
    reference = np.maximum(np.percentile(magnitude, 85, axis=1)[:, None], .00016)
    relative = np.log1p(magnitude / reference)
    change = np.maximum(0, relative - preceding(relative, 3))
    boundary = int(np.count_nonzero((freq >= 110) & (freq < 1450)))
    novelty = .40 * change[:boundary].mean(axis=0) + .60 * change[boundary:].mean(axis=0)
    peaks, _ = find_peaks(novelty, height=.020, prominence=.014, distance=6)
    return np.array([rising_boundary(novelty, i, 6, .31) for i in peaks])


def voiced_articulation_support(wave):
    # Check quieter syllables in the voice's body range, excluding most hiss
    # and breath energy. This measurement uses a separate window and hop.
    freq, times, spectrum = stft(wave, fs=SAMPLE_RATE, nperseg=384, noverlap=320,
                                padded=False, boundary=None)
    magnitude = np.abs(spectrum[(freq >= 125) & (freq < 4600)])
    body = np.linalg.norm(magnitude[:35], axis=0)
    reference = np.maximum(np.percentile(magnitude, 85, axis=1)[:, None], .00018)
    relative = np.log1p(magnitude / reference)
    novelty = np.r_[np.zeros(3), np.maximum(0, relative[:, 3:]-relative[:, :-3]).mean(axis=0)]
    peaks, _ = find_peaks(novelty, height=.028, prominence=.016, distance=7)
    edges = []
    for peak in peaks:
        edge = peak
        while edge > max(peak-9, 0) and novelty[edge-1] >= .24*novelty[peak]:
            edge -= 1
        edges.append(times[edge])
    return times, body / max(np.percentile(body, 94), 1e-9), np.array(edges)


def vocal_reset_features(wave, times):
    """Separate voiced-body measurement; timbre motion alone is not a syllable."""
    filtered = sosfiltfilt(butter(3, (180, 3600), btype='bandpass', fs=SAMPLE_RATE, output='sos'), wave)
    body = np.sqrt(np.maximum(0, uniform_filter1d(filtered**2, 129)))[::32]
    body = uniform_filter1d(body, 4)
    rate = SAMPLE_RATE/32
    reference = max(float(np.percentile(body, 94)), 1e-9)
    result = []
    for time in times:
        at = round(time*rate)
        valley = float(body[max(0, at-22):min(len(body), at+7)].min())
        after = float(body[max(0, at):min(len(body), at+38)].max())
        depth, energy = valley/max(after, 1e-9), after/reference
        score = max(0, 1-depth/.62)*min(1, energy/.4)
        result.append({'depth':round(depth, 4), 'energy':round(energy, 4),
                       'resetScore':round(score, 4), 'strong':bool(depth < .35 and energy > .16)})
    return result


def select_vocal_articulations(attacks, wave, clock):
    """Prefer real voiced resets; allow only source-supported short word runs."""
    attacks.sort(key=lambda row: row[0].time)
    offset, speed = clock(0), clock(1)-clock(0)
    # A spectral edge followed only by broadband hiss has no voiced syllable.
    # Inspect several following windows so a real consonant may lead into its
    # vowel; one unvoiced consonant frame alone cannot reject the articulation.
    frequencies = np.fft.rfftfreq(1024, 1/SAMPLE_RATE)
    voiced_band = (frequencies >= 150) & (frequencies < 6000)
    pitched = []
    for event, tone in attacks:
        on = (event.time-offset)/speed
        flatness = []
        for delay in (.010, .045, .075):
            start = round((on+delay)*SAMPLE_RATE)
            frame = wave[start:start+1024]
            if len(frame) < 1024:
                continue
            power = abs(np.fft.rfft(frame*np.hanning(1024)))[voiced_band]**2
            flatness.append(float(np.exp(np.log(np.maximum(power, 1e-15)).mean())/max(power.mean(),1e-15)))
        if flatness and min(flatness) < .45:
            pitched.append((event,tone))
    attacks = pitched
    times = [event.time for event,_ in attacks]
    features = vocal_reset_features(wave, [(time-offset)/speed for time in times])
    for (event,_), feature in zip(attacks, features):
        event.features = feature
    scores = [event.strength+1.5*feature['resetScore'] for (event,_),feature in zip(attacks,features)]
    # States count consecutive short intervals. A run has at most three heads;
    # normal spacing resets it. Fast pairs need BOTH genuine voiced resets.
    ending = [[float('-inf')]*3 for _ in attacks]
    links = [[None]*3 for _ in attacks]
    best = [(0., None)]
    for index, ((event,_), feature) in enumerate(zip(attacks, features)):
        before = bisect_right(times, event.time-MIN_HARD_GAP+1e-9, 0, index)
        ending[index][0] = best[before][0]+scores[index]
        links[index][0] = best[before][1]
        if feature['strong'] and event.strength >= 1.8:
            start = bisect_right(times, event.time-MIN_HARD_GAP, 0, index)
            for earlier in range(start, index):
                if (event.time-times[earlier] < MIN_HARD_RUN_GAP-1e-9
                        or not features[earlier]['strong'] or attacks[earlier][0].strength < 1.8):
                    continue
                for run in (1, 2):
                    value = ending[earlier][run-1]+scores[index]-.75
                    if value > ending[index][run]:
                        ending[index][run], links[index][run] = value, (earlier, run-1)
        run = int(np.argmax(ending[index]))
        value = ending[index][run]
        best.append((value, (index, run)) if value >= best[-1][0] else best[-1])
    selected, node = [], best[-1][1]
    while node is not None:
        index, run = node
        selected.append(attacks[index])
        node = links[index][run]
    return selected[::-1]


def vocal_attacks(wave, to_mix, duration):
    env, magnitude, flux = vocal_features(wave)
    edges = short_vocal_edges(wave)
    voice_times, voice_body, voice_edges = voiced_articulation_support(wave)
    total = np.linalg.norm(env[:2],axis=0)
    next_voice = maximum_filter1d(total,size=22,origin=-8)
    active = np.percentile(total, 78)
    voiced_reference = np.percentile(total, 94)
    flux_base = median_filter(flux, size=97)
    # Onset grows from a consonant or a new vowel. A substantial change in
    # spectrum can mark a re-articulation even during consecutive voiced
    # syllables. Volume motion alone during a sustained vowel is insufficient.
    timbre = magnitude[:, 4:] / np.maximum(magnitude[:, 4:].sum(axis=0), .0001)
    change = np.r_[np.zeros(4), np.sqrt(np.sum((timbre-preceding(timbre,5))**2,axis=0))]
    voiced_floor = max(.009, active*.17)
    candidates, raw = find_peaks(flux, prominence=.021, distance=10)
    out = []
    for i, prominence in zip(candidates, raw['prominences']):
        if i < 5 or i+14 >= len(total) or next_voice[i] < voiced_floor:
            continue
        ordinary_flux = flux[i] >= max(.044, flux_base[i]*1.65)
        before = float(np.median(total[i-11:i-4])) if i >= 11 else 0
        body = float(np.max(total[i:i+14]))
        gain = body / max(before, voiced_floor*.55)
        shape = float(np.max(change[i-4:i+6]))
        # A quiet but distinct syllable can have a small absolute flux peak.
        # Require a strong rise and timbral change for that narrow exception;
        # the independent vocal-body/edge checks below still reject noise.
        if not ordinary_flux and not (flux[i] >= max(.026, flux_base[i]*1.35)
                                      and gain >= 1.8 and shape >= .15 and prominence >= .024):
            continue
        silent_entry = before < voiced_floor*.50 and gain >= 1.8
        consonant = float(np.max(env[2,i-2:i+5])) > max(.003, .63*float(np.max(total[i:i+12])))
        # Reject fluctuations in a sustained vowel, breaths, and isolated
        # consonant-like noise that has no subsequent vocal body.
        if not (silent_entry or gain >= 1.43 and shape > .075 or consonant and shape > .12
                or shape > .15 and prominence > .045 and gain > 1.04):
            continue
        first = rising_boundary(flux, i, 7, .20)
        left, right = edges.searchsorted([first-10, min(i+6, first+11)])
        edge = min(edges[left:right], key=lambda frame: abs(frame-first), default=None)
        # Soft syllables remain playable when an articulation and vocal body
        # agree. Breath, bleed and consonant noise need more than a flux spike.
        if body < voiced_reference*.18:
            voice_support = np.percentile(total[i:i+19], 60)
            if edge is None or body < voiced_reference*.144 or voice_support < voiced_reference*.099:
                continue
        if edge is None and body < voiced_reference*.55 and prominence < .068:
            continue
        if edge is not None:
            first = .66*first + .34*edge
        onset = first/FPS
        body_left, body_right = voice_times.searchsorted([onset+.010, onset+.118])
        support = float(voice_body[body_left:body_right].max()) if body_right > body_left else 0
        edge_left, edge_right = voice_edges.searchsorted([onset-.058, onset+.058])
        if support < .12 or support < .25 and edge_left == edge_right:
            continue
        time = to_mix(first/FPS)
        if not .025 <= time < duration-.075:
            continue
        strength = min(2.1, 8*(flux[i]+prominence))+.25*min(gain,2)+.13*silent_entry
        tone = magnitude[:, min(i+8, magnitude.shape[1]-1)]
        tone = tone / max(np.linalg.norm(tone), .0001)
        out.append((Attack(float(time),float(strength)), tone))
    return select_vocal_articulations(out, wave, to_mix)


def vocal_phrases(attacks, first, beat):
    phrases = []
    current = []
    for event, tone in attacks:
        if current:
            previous = current[-1][0].time
            gap = event.time-previous
            # A bar boundary does not end a sung phrase or reset its letters.
            if gap > max(.46, min(.85, beat)):
                phrases.append(current)
                current = []
        current.append((event,tone))
    if current:
        phrases.append(current)
    return phrases


def most_similar_phrase(times, sounds, history):
    """Match syllables in order while allowing a changed pickup or delivery."""
    best = None
    if len(times) < 3:
        return best
    for phrase_id, prior_times, prior_sounds, lanes in history:
        largest = max(len(times), len(prior_times))
        if min(len(times), len(prior_times)) < .75*largest or abs(times[-1]-prior_times[-1]) > .48:
            continue
        difference = times[:, None] - prior_times
        similarity = sounds @ prior_sounds.T
        for shift in difference[:2, :2].ravel():
            if abs(shift) > .43:
                continue
            delay = abs(difference-shift)
            closest = delay.argmin(axis=1)
            pairs = [(i, j) for i,j in enumerate(closest) if delay[i,j] < .106 and similarity[i,j] >= .73]
            if len(pairs) < .75*largest or len(set(closest[i] for i,_ in pairs)) < len(pairs):
                continue
            error = float(np.mean([delay[i,j] for i,j in pairs]))
            quality = float(np.mean([similarity[i,j] for i,j in pairs]))
            if error >= .042 or quality < .82:
                continue
            score = quality - 3*error + .08*len(pairs)/largest
            if best is None or score > best[0]:
                best = (score, phrase_id, {i:lanes[j] for i,j in pairs})
    return best


def lock_copied_vocal_lanes(wave, clock, notes, beat):
    """Give exact vocal repeats the same lanes even across a phrase split."""
    sample_rate = SAMPLE_RATE//4
    pcm = resample_poly(wave, 1, 4)
    offset, speed = clock(0), clock(1)-clock(0)
    times = np.array([(note['time']-offset)/speed for note in notes])
    starts = np.rint(times*sample_rate).astype(int)
    intervals = np.diff(times)
    frame = round(.60*sample_rate)
    margin = round(.035*sample_rate)
    bar = 4*beat/speed
    paired = set()
    for i in range(1, len(notes)-2):
        start = starts[i]
        if start < margin or start+frame+margin >= len(pcm):
            continue
        needle = pcm[start:start+frame]
        if np.dot(needle, needle) < .003:
            continue
        separation = (times[i]-times[:i])/bar
        whole_bars = abs(separation-np.rint(separation)) <= .043
        same_cadence = ((abs(intervals[:i]-intervals[i]) < .040)
                        & (abs(intervals[1:i+1]-intervals[i+1]) < .040))
        earlier = np.flatnonzero(whole_bars & same_cadence & (separation > 2))
        for j in earlier:
            left = starts[j]-margin
            right = left+frame+2*margin
            if left >= 0 and right <= len(pcm) and correlation(needle, pcm[left:right]).max() >= .84:
                paired.add((i, int(j)))

    # Require adjacent matches so a recurring instrumental bleed or one
    # isolated consonant cannot change the keys of a delivery.
    origins = list(range(len(notes)))

    def original(index):
        while index != origins[index]:
            index = origins[index]
        return index

    for i, j in sorted(paired):
        if (i-1,j-1) not in paired and (i+1,j+1) not in paired:
            continue
        # Connect both copies to the earliest occurrence, including where
        # a later copy links two otherwise separate groups of detections.
        earlier, later = sorted((original(i), original(j)))
        origins[later] = earlier
    copied = 0
    for i, note in enumerate(notes):
        origin = original(i)
        if i != origin:
            note['button'] = notes[origin]['button']
            note['repeatsPhrase'] = notes[origin]['phrase']
            copied += 1
    return copied


def vocal_delivery_lanes(attacks):
    """Stable acoustic delivery classes, rather than an ordinal key counter.

    These describe vocal timbre/contour, not recognized words or absolute
    musical pitches. Repeated articulation spectra keep their natural class.
    """
    if not attacks:
        return {}
    sounds = np.asarray([tone for _,tone in attacks])
    centers = [sounds[int(np.argmin(sounds @ np.arange(sounds.shape[1])))]]
    for _ in range(3):
        distances = 1-sounds @ np.asarray(centers).T
        centers.append(sounds[int(np.argmax(distances.min(axis=1)))])
    centers = np.asarray(centers)
    assigned = np.zeros(len(sounds), dtype=int)-1
    for _ in range(24):
        updated = (sounds @ centers.T).argmax(axis=1)
        if np.array_equal(updated, assigned):
            break
        assigned = updated
        for group in range(4):
            subset = sounds[assigned == group]
            if len(subset):
                center = subset.mean(axis=0)
                centers[group] = center/max(np.linalg.norm(center), .0001)
    order = np.argsort(centers @ np.arange(sounds.shape[1]))
    keys = {int(group):BUTTONS[index] for index,group in enumerate(order)}
    return {id(event):keys[int(group)] for (event,_),group in zip(attacks,assigned)}


def hard_chart(wave, clock, duration, first, beat):
    attacks = vocal_attacks(wave, clock, duration)
    phrases = vocal_phrases(attacks, first, beat)
    delivery = vocal_delivery_lanes(attacks)
    history = []
    output = []
    for group, phrase in enumerate(phrases, 1):
        rhythm = np.array([e.time-phrase[0][0].time for e,_ in phrase])
        sounds = np.array([t for _,t in phrase])
        repeat = most_similar_phrase(rhythm, sounds, history)
        _, reused, assigned = repeat or (0, None, {})
        buttons = []
        for index,(event,_) in enumerate(phrase):
            # Same-key re-articulations are intentional when the delivery
            # repeats. A sustained vowel still supplied only its one onset.
            buttons.append(assigned.get(index, delivery[id(event)]))
        history.append((group,rhythm,sounds,buttons))
        for index,((event,_),button) in enumerate(zip(phrase,buttons)):
            output.append(describe(event.time,button,'lead-vocal',role='syllable',phrase=group,
                                   repeatsPhrase=reused if index in assigned else None, confidence=round(event.strength,3),
                                   vocalReset=event.features))
    exact_repeats = lock_copied_vocal_lanes(wave, clock, output, beat)
    repeats = len({event['phrase'] for event in output if event['repeatsPhrase'] is not None})
    exceptions = []
    for previous, note in zip(output, output[1:]):
        if note['time']-previous['time'] < MIN_HARD_GAP-.00001:
            assert note['time']-previous['time'] >= MIN_HARD_RUN_GAP-.00001
            assert all(event['vocalReset']['strong'] and event['confidence'] >= 1.8 for event in (previous,note))
            exceptions.append({'previousTime':previous['time'],'time':note['time'],
                'before':previous['vocalReset'],'after':note['vocalReset']})
    return output, {'vocalPhrases':len(phrases),'repeatedVocalPhrases':repeats,'copiedVocalHeads':exact_repeats,
                    'hardTimingExceptions':exceptions,'vocalLaneMethod':'source-delivery-clusters-and-phrase-repeats'}


def create(identity, stems, bass_directory, audits):
    prefix, filename, bpm, first, riff_bars = SONGS[identity]
    relative = 'songs/2026-09-28/' + filename + '.m4a'
    mix_path = ROOT/'docs/moth'/relative
    drum_path = stem_path(stems,prefix,'Drums')
    vocal_path = stem_path(stems,prefix,'Vocals')
    mix, drum, vocal = [decode(path) for path in (mix_path, drum_path, vocal_path)]
    duration = len(mix)/SAMPLE_RATE
    beat = 60/bpm
    grid = np.arange(first, duration-.09, 4*beat)
    audit = audits[identity]
    assert digest(mix_path) == audit['mix']['sha256'], 'Full mix differs from the independently audited recording'
    drum_clock, drum_alignment = audited_clock(audit, 'Drums', drum_path)
    vocal_clock, vocal_alignment = audited_clock(audit, 'Vocals', vocal_path)
    easy, riff_report = easy_chart(mix, drum, drum_clock, beat, grid, riff_bars)
    hard, vocal_report = hard_chart(vocal, vocal_clock, duration, first, beat)
    assert len(easy) >= len(grid) and len(hard) >= 20, identity
    provided_bass = sorted(stems.glob(prefix + '*(Bass).wav'))
    assert len(provided_bass) <= 1, identity
    bass_path = provided_bass[0] if provided_bass else bass_directory/f'{identity}.wav'
    bass = decode(bass_path)
    if provided_bass:
        bass_clock, bass_alignment = audited_clock(audit, 'Bass', bass_path)
    else:
        # Offline separation uses the shipped mix itself with no trim.
        assert abs(len(bass)-len(mix)) <= .025*SAMPLE_RATE, (identity, 'separated bass duration')
        bass_clock = float
        bass_alignment = {'offsetMs':0, 'driftMsPerMinute':0}

    river = identity == 'level5RiverRhythm'
    easy_rests = sustained_stem_rests(drum, drum_clock, duration, beat)
    hard_rests = sustained_stem_rests(vocal, vocal_clock, duration, beat)
    bass_attacks = list(measure_bass_attacks(bass, bass_clock, easy_rests+hard_rests))
    bass_windows = {
        'easy':fill_stem_rests(easy, easy_rests, bass_attacks, max(.32, .46*beat)),
        'hard':fill_stem_rests(hard, hard_rests, bass_attacks, max(.28, .38*beat)),
    }
    tag_drum_fill_accents(easy, beat, first)
    bass_holds = {mode:measure_bass_holds(events,bass,bass_clock,bass_windows[mode],
        MIN_EASY_GAP if mode=='easy' else MIN_HARD_GAP) if river else 0
        for mode,events in [('easy',easy),('hard',hard)]}
    for mode, events in [('easy', easy), ('hard', hard)]:
        assert all(any(start <= event['time'] <= event.get('holdEnd', event['time']) <= end
                       for start,end in bass_windows[mode]) for event in events if event['source'] == 'bass-stem'), (identity, mode)
    result = {'bpm':bpm, 'duration':round(duration,5), 'audioSrc':relative, 'mixSha256':digest(mix_path),
              'meter': {'beatsPerBar':4, 'firstDownbeat':first, 'barCount':len(grid), 'riffBars':riff_bars}}
    result['hardTimingExceptions'] = vocal_report['hardTimingExceptions']
    result['easyTimingExceptions'] = [{'previousTime':previous['time'],'time':note['time'],
        'before':{key:previous.get(key) for key in ('drumVoice','drumSalience','drumFillAccent')},
        'after':{key:note.get(key) for key in ('drumVoice','drumSalience','drumFillAccent')}}
        for previous,note in zip(easy,easy[1:]) if note['time']-previous['time'] < MIN_EASY_GAP-.00001]
    for previous,note in zip(easy,easy[1:]):
        if note['time']-previous['time'] < MIN_EASY_GAP-.00001:
            assert supported_drum_fill_pair(previous,note), (identity,'unsupported short drum fill')
    if river:
        result['opening'] = 'bass-riff'
    if any(bass_windows.values()):
        result['extendedRests'] = 'bass-stem'
    report = {'drumSha256':digest(drum_path),'vocalSha256':digest(vocal_path),
              'drumAlignment':drum_alignment,'vocalAlignment':vocal_alignment, **riff_report, **vocal_report,
              'bassSha256':digest(bass_path), 'bassSource':'provided' if provided_bass else 'separated',
              'bassAlignment':bass_alignment, 'bassWindows':bass_windows, 'bassHolds':bass_holds,
              'meterAudit':audit['meter'], 'easy':easy,'hard':hard}
    for mode, events in [('easy',easy),('hard',hard)]:
        rows = [chart_row(event) for event in events]
        gap = min(right[0] - left[0] - left[2] for left, right in zip(rows, rows[1:]))
        assert 0 <= rows[0][0] < rows[-1][0]+rows[-1][2] < duration and gap >= (MIN_HARD_RUN_GAP if mode=='hard' else MIN_EASY_FILL_GAP)-.00005, (identity, mode, gap)
        if mode == 'hard':
            supported = {(item['previousTime'],item['time']) for item in result['hardTimingExceptions']}
            for previous,note in zip(events,events[1:]):
                if note['time']-previous.get('holdEnd',previous['time']) < MIN_HARD_GAP-.00001:
                    assert (previous['time'],note['time']) in supported, (identity, 'unsupported short vocal gap')
        result[mode] = rows
        report[mode+'MinGapMs'] = round(float(gap)*1000, 3)
    bass_counts = [sum(event['source']=='bass-stem' for event in events) for events in (easy, hard)]
    print(identity, 'notes', len(easy), len(hard), 'bass', *bass_counts, 'drum heads', riff_report['drumHeads'],
          'drum/vocal rel. offsets ms', drum_alignment['offsetMs'], vocal_alignment['offsetMs'],
          'hard min gap ms', report['hardMinGapMs'], 'phrase repeats', vocal_report['repeatedVocalPhrases'], flush=True)
    return identity, result, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stems', required=True, type=Path, help='Directory containing the supplied drum and vocal WAV exports')
    parser.add_argument('--bass-directory', required=True, type=Path, help='Directory containing mix-aligned bass files for songs without a supplied bass stem')
    parser.add_argument('--output', type=Path, default=ROOT/'scripts/moth-funk-charts.json')
    parser.add_argument('--report', required=True, type=Path, help='Local-only per-note analysis report')
    parser.add_argument('--alignment-audit', type=Path, default=ROOT/'scripts/moth-stem-clocks.json',
                        help='Independent source hash/clock audit; defaults to the pinned corrected exports')
    parser.add_argument('--songs', nargs='*', default=list(SONGS))
    parser.add_argument('--workers', type=int, default=2)
    args = parser.parse_args()
    audits = json.loads(args.alignment_audit.read_text())['songs']
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(lambda identity: create(identity,args.stems,args.bass_directory,audits), args.songs))
    args.output.write_text(json.dumps({'version':VERSION, 'songs':{name:chart for name,chart,_ in results}},
                                      ensure_ascii=False,separators=(',',':'))+'\n')
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps({name:report for name,_,report in results},
                                      ensure_ascii=False,indent=2)+'\n')


if __name__ == '__main__':
    main()
