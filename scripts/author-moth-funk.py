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
VERSION = 'funk-stems-20261117b'
SAMPLE_RATE = 16000
HOP = 80
FPS = SAMPLE_RATE / HOP
MIN_HARD_GAP = .190
MIN_EASY_GAP = .225
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
    'secret-xiaosi': ('Hidden level - lol', '7 - 笑死', 117.98, .776, 4),
    'secret-getdown': ('Hidden level - Get Down', '12 - Get Down 蹲得低 ft. 謝乾', 128, .106, 2),
}

# Absolute times in the shipped mix. The drum kit is silent through this
# passage. The bass riff supplies the attacks, including the release beats.
# Story slices the same timeline at 10 s and starts with the sustained bass
# at 11.870. From the first vocal onward Hard keeps its syllable pattern.
RIVER_BASS_INTRO = (
    (.080, 'M', None), (1.665, 'T', None), (3.250, 'O', None), (4.815, 'H', None),
    (5.605, 'T', 6.010), (6.395, 'M', None), (7.965, 'H', None), (9.560, 'O', None),
)
RIVER_OPENINGS = {
    'easy': (*RIVER_BASS_INTRO, (11.870, 'T', 12.715), (14.295, 'H', None),
             (15.885, 'O', None), (17.465, 'T', None), (19.040, 'M', None),
             (20.630, 'T', None), (21.810, 'O', None), (23.365, 'M', None),
             (23.765, 'H', None), (24.175, 'T', None), (24.955, 'H', None)),
    'hard': (*RIVER_BASS_INTRO, (5.215, 'O', None)),
}


@dataclass
class Attack:
    time: float
    strength: float
    band: int = 0
    frame: int = 0


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


def add_river_openings(mix, drum, bass, bass_clock, easy, hard):
    mix_attacks = [event.time for event in percussive_attacks(mix, lambda time: time)]
    bass_attacks = [event.time for event in percussive_attacks(bass, bass_clock)]
    assert np.max(np.abs(drum[:25*SAMPLE_RATE])) < .002, 'River opening has a silent drum stem'

    for mode, events in [('easy', easy), ('hard', hard)]:
        for time, button, tail in RIVER_OPENINGS[mode]:
            for onset in (time,) if tail is None else (time, tail):
                assert min(abs(hit-onset) for hit in bass_attacks) <= .025, (mode, 'bass', onset)
                assert min(abs(hit-onset) for hit in mix_attacks) <= .025, (mode, 'mix', onset)
            end = {'holdEnd':tail} if tail is not None else {}
            events.append(describe(time, button, 'bass-stem', role='opening', **end))
        events.sort(key=lambda event: event['time'])


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
    """Recover the initial click from kicks and cymbals with slower body energy."""
    env = bands(drum, ((32, 155), (160, 520), (550, 2100), (2150, 7400)),
                hop=SAMPLE_RATE//1000, envelope=65)
    level = env / np.maximum(np.percentile(env, 92, axis=1)[:, None], .002)
    rise = np.minimum(level, 1) * np.maximum(0, level - preceding(level, 5))
    voice_weights = {'T': (1, .78, .84, .78), 'M': (.17, .26, .60, 1)}
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
        if left+edge >= center-1 or onset < 0 or (index and onset-events[index-1]['time'] < gap):
            continue
        event['time'] = onset
        refined += 1
    return refined


def easy_chart(mix, drum, drum_clock, beat, grid, period):
    """Follow drum strokes on and between the beats without quantizing their attacks."""
    profile = harmonic_bar_profiles(mix, grid, 4*beat)
    riff, anchor = riff_positions(profile, period)
    bar_length = 4*beat
    bar_limit = max(5, round(bar_length*2.55))
    min_gap = max(MIN_EASY_GAP, min(.275, .39*beat))
    bars = {}
    pattern = {}
    for hit, button in drum_strokes(drum, drum_clock):
        if hit.time < 0 or hit.time >= len(mix)/SAMPLE_RATE-.09 or hit.strength < (.24 if button == 'M' else .30):
            continue
        beat_position = (hit.time-grid[0])/beat
        bar = int(np.floor((beat_position+.09)/4))
        within_bar = beat_position - bar*4
        phase = riff[min(bar, len(riff)-1)] if bar >= 0 else (bar-anchor)%period
        slot = round(within_bar*4)
        key = (phase, slot, button)
        pattern.setdefault(key, set()).add(bar)
        # Strong recurring downbeats and backbeats carry the groove, while a
        # bright cymbal or a close syncopation can be selected between them.
        pulse = abs(within_bar-round(within_bar)) <= .12
        one = pulse and abs(within_bar) <= .12
        grid_bonus = .20 if one else .12 if pulse else .05
        voice_bonus = .14 if button in ('T', 'O') else 0
        weight = hit.strength + grid_bonus + voice_bonus
        bars.setdefault(bar, []).append((hit, button, key, weight, one))

    # Rank accents before spacing them. The modest recurrence bonus favours
    # the same kit pattern when the riff returns, without making a single
    # quiet subdivision a note or moving a stroke to a calculated beat.
    ranked = sorted(((weight + .09*min(3, len(pattern[key])-1), bar, hit, button, one)
                     for bar, hits in bars.items() for hit, button, key, weight, one in hits),
                    key=lambda stroke: (-stroke[0], stroke[2].time))
    counts = {}
    picked = []
    times = []
    for weight, bar, hit, button, one in ranked:
        if counts.get(bar, 0) >= bar_limit:
            continue
        index = bisect_right(times, hit.time)
        if (index and hit.time-times[index-1] < min_gap) or (index < len(times) and times[index]-hit.time < min_gap):
            continue
        counts[bar] = counts.get(bar, 0)+1
        times.insert(index, hit.time)
        picked.insert(index, describe(hit.time, button, 'drum-stem', bar=bar+1,
                                      role='downbeat' if one else 'groove', band=hit.band,
                                      confidence=round(weight, 3)))
    refined = refine_drum_attack_edges(drum, drum_clock, picked, min_gap)
    return picked, {'riffAnchorBar':anchor+1, 'drumHeads':len(picked), 'refinedDrumHeads':refined}


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
        if flux[i] < max(.044, flux_base[i]*1.65):
            continue
        before = float(np.median(total[i-11:i-4])) if i >= 11 else 0
        body = float(np.max(total[i:i+14]))
        gain = body / max(before, voiced_floor*.55)
        shape = float(np.max(change[i-4:i+6]))
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
    # Weighted interval selection keeps real syllable timestamps. Preserve
    # quick runs while allowing heads to remain separately readable.
    out.sort(key=lambda row: row[0].time)
    times = [event.time for event,_ in out]
    best = [0.]*(len(out)+1)
    links = [0]*len(out)
    used = [False]*len(out)
    for i,(event,_) in enumerate(out):
        j = bisect_right(times, event.time-MIN_HARD_GAP, 0, i)
        selected = best[j]+event.strength
        used[i] = selected >= best[i]
        links[i] = j
        best[i+1] = max(best[i],selected)
    selected = []
    i=len(out)
    while i:
        if used[i-1]:
            selected.append(out[i-1])
            i=links[i-1]
        else:
            i-=1
    return selected[::-1]


def vocal_phrases(attacks, first, beat):
    phrases = []
    current = []
    bar = beat*4
    for event, tone in attacks:
        if current:
            previous = current[-1][0].time
            gap = event.time-previous
            crosses = int((event.time-first+.04)//bar) != int((previous-first+.04)//bar)
            if gap > beat*.92 or crosses and len(current) >= 3 or len(current) >= 12:
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


def hard_chart(wave, clock, duration, first, beat):
    phrases = vocal_phrases(vocal_attacks(wave, clock, duration), first, beat)
    history = []
    output = []
    for group, phrase in enumerate(phrases, 1):
        rhythm = np.array([e.time-phrase[0][0].time for e,_ in phrase])
        sounds = np.array([t for _,t in phrase])
        repeat = most_similar_phrase(rhythm, sounds, history)
        _, reused, assigned = repeat or (0, None, {})
        buttons = []
        pattern = (0, 2, 1, 3, 1, 0, 2, 3, 0, 3, 2, 1)
        for index,k in enumerate(pattern[:len(rhythm)]):
            lane = (k+group-1) % 4
            choices = (BUTTONS[(lane+offset) % 4] for offset in range(4))
            button = assigned.get(index) or next(choice for choice in choices
                if (not buttons or choice != buttons[-1]) and choice != assigned.get(index+1))
            buttons.append(button)
        history.append((group,rhythm,sounds,buttons))
        for index,((event,_),button) in enumerate(zip(phrase,buttons)):
            output.append(describe(event.time,button,'lead-vocal',role='syllable',phrase=group,
                                   repeatsPhrase=reused if index in assigned else None, confidence=round(event.strength,3)))
    exact_repeats = lock_copied_vocal_lanes(wave, clock, output, beat)
    repeats = len({event['phrase'] for event in output if event['repeatsPhrase'] is not None})
    return output, {'vocalPhrases':len(phrases),'repeatedVocalPhrases':repeats,'copiedVocalHeads':exact_repeats}


def create(identity, stems, bass_directory):
    prefix, filename, bpm, first, riff_bars = SONGS[identity]
    relative = 'songs/2026-09-28/' + filename + '.m4a'
    mix_path = ROOT/'docs/moth'/relative
    drum_path = stem_path(stems,prefix,'Drums')
    vocal_path = stem_path(stems,prefix,'Vocals')
    mix, drum, vocal = [decode(path) for path in (mix_path, drum_path, vocal_path)]
    duration = len(mix)/SAMPLE_RATE
    beat = 60/bpm
    grid = np.arange(first, duration-.09, 4*beat)
    drum_clock, drum_alignment = align(mix, drum, 42)
    vocal_clock, vocal_alignment = align(mix, vocal, 85)
    easy, riff_report = easy_chart(mix, drum, drum_clock, beat, grid, riff_bars)
    hard, vocal_report = hard_chart(vocal, vocal_clock, duration, first, beat)
    assert len(easy) >= len(grid) and len(hard) >= 20, identity
    provided_bass = sorted(stems.glob(prefix + '*(Bass).wav'))
    assert len(provided_bass) <= 1, identity
    bass_path = provided_bass[0] if provided_bass else bass_directory/f'{identity}.wav'
    bass = decode(bass_path)
    if provided_bass:
        bass_clock, bass_alignment = align(mix, bass, 35)
    else:
        # Offline separation uses the shipped mix itself with no trim.
        assert abs(len(bass)-len(mix)) <= .025*SAMPLE_RATE, (identity, 'separated bass duration')
        bass_clock = float
        bass_alignment = {'offsetMs':0, 'driftMsPerMinute':0}

    river = identity == 'level5RiverRhythm'
    if river:
        add_river_openings(mix, drum, bass, bass_clock, easy, hard)
        # The first sung syllable has continuous voice energy through 11.785.
        # Give it one head on its articulation and a tail on its own decay.
        first_vocal = next(event for event in hard if event['source'] == 'lead-vocal')
        assert abs(first_vocal['time']-11.49933) < .06, first_vocal
        first_vocal['holdEnd'] = 11.785

    easy_rests = sustained_stem_rests(drum, drum_clock, duration, beat)
    hard_rests = sustained_stem_rests(vocal, vocal_clock, duration, beat)
    bass_attacks = list(measure_bass_attacks(bass, bass_clock, easy_rests+hard_rests))
    bass_windows = {
        'easy':fill_stem_rests(easy, easy_rests, bass_attacks, max(.32, .46*beat)),
        'hard':fill_stem_rests(hard, hard_rests, bass_attacks, max(.28, .38*beat)),
    }
    for mode, events in [('easy', easy), ('hard', hard)]:
        assert all(any(start <= event['time'] <= event.get('holdEnd', event['time']) <= end
                       for start,end in bass_windows[mode]) for event in events if event['source'] == 'bass-stem'), (identity, mode)
    result = {'bpm':bpm, 'duration':round(duration,5), 'audioSrc':relative, 'mixSha256':digest(mix_path),
              'meter': {'beatsPerBar':4, 'firstDownbeat':first, 'barCount':len(grid), 'riffBars':riff_bars}}
    if river:
        result['opening'] = 'bass-riff'
    if any(bass_windows.values()):
        result['extendedRests'] = 'bass-stem'
    report = {'drumSha256':digest(drum_path),'vocalSha256':digest(vocal_path),
              'drumAlignment':drum_alignment,'vocalAlignment':vocal_alignment, **riff_report, **vocal_report,
              'bassSha256':digest(bass_path), 'bassSource':'provided' if provided_bass else 'separated',
              'bassAlignment':bass_alignment, 'bassWindows':bass_windows, 'easy':easy,'hard':hard}
    for mode, events in [('easy',easy),('hard',hard)]:
        rows = [chart_row(event) for event in events]
        gap = min(right[0] - left[0] - left[2] for left, right in zip(rows, rows[1:]))
        assert 0 <= rows[0][0] < rows[-1][0]+rows[-1][2] < duration and gap >= (MIN_HARD_GAP if mode=='hard' else MIN_EASY_GAP)-.00005, (identity, mode, gap)
        result[mode] = rows
        report[mode+'MinGapMs'] = round(float(gap)*1000, 3)
    bass_counts = [sum(event['source']=='bass-stem' for event in events) for events in (easy, hard)]
    print(identity, 'notes', len(easy), len(hard), 'bass', *bass_counts, 'drum heads', riff_report['drumHeads'],
          'drum/vocal rel. offsets ms', drum_alignment['offsetMs'], vocal_alignment['offsetMs'],
          'hard min gap ms', report['hardMinGapMs'], 'phrase repeats', vocal_report['repeatedVocalPhrases'], flush=True)
    return identity, result, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stems', required=True, type=Path, help='Directory containing the original drum and vocal WAV exports')
    parser.add_argument('--bass-directory', required=True, type=Path, help='Directory containing mix-aligned bass files for songs without a supplied bass stem')
    parser.add_argument('--output', type=Path, default=ROOT/'scripts/moth-funk-charts.json')
    parser.add_argument('--report', required=True, type=Path, help='Local-only per-note analysis report')
    args = parser.parse_args()
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda identity: create(identity,args.stems,args.bass_directory), SONGS))
    args.output.write_text(json.dumps({'version':VERSION, 'songs':{name:chart for name,chart,_ in results}},
                                      ensure_ascii=False,separators=(',',':'))+'\n')
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps({name:report for name,_,report in results},
                                      ensure_ascii=False,indent=2)+'\n')


if __name__ == '__main__':
    main()
