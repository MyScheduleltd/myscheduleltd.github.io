#!/usr/bin/env python3
"""Audit supplied studio stems against the game full mixes before authoring charts.

Uses a separate broad waveform search, not the note detector or old chart times.
Nominal meter anchors name the musical One; energy alone cannot label bar one.
Requires numpy, scipy and ffmpeg. Writes review evidence, never runtime assets."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import subprocess
import time

import numpy as np
from scipy.ndimage import uniform_filter1d
from scipy.signal import correlate, find_peaks

ROOT = Path(__file__).resolve().parents[1]
STEMS = None
OUT = None
PREVIOUS = {}
RATE = 8000
SONGS = {
    'level5RiverRhythm': ('Level 6 - ', '6 - 更年期 ft. 手天使 & 謝乾', 76, .089),
    'level1OfficeRhythm': ('Level 1 - ', '2 - 新。李包比自傳 ft. 簡道生', 93, .015),
    'level2BathroomRhythm': ('Level 2 - ', '10 - 腥。禿油肥', 75, 2.173),
    'level3MassageRhythm': ('Level 3 - ', '5 - Okay Okay', 105, .034),
    'level4ArcadeRhythm': ('Level 4 - ', '11 - 辛。壞爸爸', 100, .048),
    'level5StudioRhythm': ('Level 5 - ', '8 - 愛上我的美麗', 113, .014),
    'level6ConcertRhythm': ('Level 7 - ', '9 - 尖叫聲', 134, .082),
    'secret-xiaosi': ('Hidden level - 笑死', '7 - 笑死', 117.98, .776),
    'secret-getdown': ('Hidden level - Get Down', '12 - Get Down 蹲得低 ft. 謝乾', 128, .106),
}


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as handle:
        for part in iter(lambda: handle.read(1024*1024), b''):
            result.update(part)
    return result.hexdigest()


def probe(path):
    value = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'a:0',
        '-show_entries', 'stream=codec_name,sample_rate,channels,sample_fmt,duration,duration_ts,time_base',
        '-of', 'json', str(path)]))['streams'][0]
    return {**value, 'bytes': path.stat().st_size, 'sha256': digest(path)}


def decode(path, role):
    low, high = {'Drums': (35, 3500), 'Vocals': (90, 3500), 'Bass': (30, 700)}[role]
    raw = subprocess.check_output(['ffmpeg', '-nostdin', '-v', 'error', '-threads', '1',
        '-filter_threads', '1', '-i', str(path), '-vn', '-ac', '1', '-ar', str(RATE),
        '-af', f'highpass=f={low},lowpass=f={high}', '-f', 'f32le', '-'])
    return np.frombuffer(raw, '<f4')


def normalized(needle, hay):
    sums = np.r_[0., np.cumsum(hay.astype('float64')**2)]
    power = sums[len(needle):] - sums[:-len(needle)]
    denominator = np.sqrt(np.maximum(power, 1e-15) * max(float(np.dot(needle, needle)), 1e-15))
    return correlate(hay, needle, mode='valid', method='fft') / denominator


def leading_silence(wave):
    block = RATE // 20
    levels = np.sqrt(np.mean(wave[:len(wave)//block*block].reshape(-1, block)**2, axis=1))
    threshold = max(1e-5, float(np.percentile(levels, 95)) * .012)
    active = np.flatnonzero(levels >= threshold)
    return {'thresholdRms': threshold, 'firstActiveSeconds': round(float(active[0])/20, 3) if len(active) else None,
            'lastActiveSeconds': round(float(active[-1]+1)/20, 3) if len(active) else None}


def wide_alignment(reference, stem):
    # Each selected .75s reference covers +/-12 seconds of possible export
    # offset. Compare shared waveform phase, not an onset envelope alone.
    length = int(.75*RATE)
    radius = 12*RATE
    maximum = min(len(reference), len(stem))
    starts = np.arange(RATE, maximum-length-RATE, RATE//2)
    energies = np.array([np.mean(stem[p:p+length]**2) for p in starts])
    selected = []
    # Two energetic probes in each of nine chronological regions.
    for chunk in np.array_split(np.arange(len(starts)), 9):
        if len(chunk):
            order = sorted(chunk, key=lambda i: -energies[i])
            chosen = []
            for index in order:
                if energies[index] < 1e-9:
                    continue
                if all(abs(starts[index]-starts[prior]) >= RATE for prior in chosen):
                    chosen.append(index)
                if len(chosen) == 2:
                    break
            selected.extend(chosen)
    probes = []
    for index in selected:
        p = int(starts[index]); begin = max(0, p-radius); finish = min(len(reference), p+length+radius)
        values = normalized(stem[p:p+length], reference[begin:finish])
        magnitude = abs(values)
        peaks, _ = find_peaks(magnitude, distance=int(.040*RATE))
        if not len(peaks):
            continue
        choices = sorted(peaks, key=lambda i: -magnitude[i])[:12]
        near_zero = np.flatnonzero(abs(np.arange(len(values))+begin-p) <= int(.010*RATE))
        zero = int(near_zero[np.argmax(magnitude[near_zero])]) if len(near_zero) else None
        if zero is not None and zero not in choices:
            choices.append(zero)
        probes.append({'time': p/RATE, 'begin': begin, 'p': p, 'values': values,
                       'candidates': [(float((i+begin-p)/RATE), float(magnitude[i])) for i in choices]})
    # Candidate consensus prevents the same repeated riff one bar away from
    # winning a single probe merely because another instrument masks the mix.
    seeds = sorted({round(offset/.002)*.002 for probe in probes for offset, score in probe['candidates'] if score >= .20})
    ranked = []
    for seed in seeds:
        support = []
        for item in probes:
            possibilities = [score for offset, score in item['candidates'] if abs(offset-seed) <= .004]
            support.append(max(possibilities, default=0))
        score = sum(min(value, .75) for value in support)
        ranked.append((score, sum(value >= .20 for value in support), seed))
    ranked.sort(key=lambda item: (-item[0], -item[1], abs(item[2])))
    if not ranked:
        return {'error': 'No stable shared waveform matches found', 'probes': len(probes)}
    best_score = ranked[0][0]
    close = [item for item in ranked if item[0] >= .985*best_score and item[1] >= ranked[0][1]-1]
    _, _, seed = min(close, key=lambda item: abs(item[2]))
    matches = []
    for item in probes:
        center = int(round(seed*RATE))+item['p']-item['begin']
        lo, hi = max(0, center-int(.008*RATE)), min(len(item['values']), center+int(.008*RATE)+1)
        if hi <= lo:
            continue
        at = lo+int(np.argmax(abs(item['values'][lo:hi])))
        score = float(abs(item['values'][at]))
        if score >= .20:
            matches.append((item['time'], (at+item['begin']-item['p'])/RATE, score))
    if len(matches) < 6:
        return {'error': 'Insufficient agreeing waveform windows', 'candidateOffsetMs': seed*1000, 'matches': matches}
    values = np.asarray(matches)
    slope, offset = np.polyfit(values[:,0], values[:,1], 1)
    residual = abs(values[:,1]-offset-slope*values[:,0])
    keep = residual < max(.0007, 3*np.median(residual))
    if keep.sum() >= 6:
        slope, offset = np.polyfit(values[keep,0], values[keep,1], 1)
        residual = abs(values[:,1]-offset-slope*values[:,0])
    return {'searchRadiusSeconds': 12, 'offsetMs': round(float(offset)*1000, 4),
            'driftMsPerMinute': round(float(slope)*60000, 4), 'matchingWindows': len(matches),
            'medianCorrelation': round(float(np.median(values[:,2])), 4),
            'minimumCorrelation': round(float(min(values[:,2])), 4),
            'fitP90Ms': round(float(np.percentile(residual,90))*1000, 4),
            'outsideOld240msSearch': bool(abs(offset) > .24),
            'candidateAlternatives': [{'offsetMs': round(lag*1000,2), 'support': support, 'score': round(score,3)}
                                      for score,support,lag in ranked[:8]],
            'windowMatches': [{'time': round(t,3), 'offsetMs': round(lag*1000,4), 'correlation': round(score,4)}
                              for t,lag,score in matches]}


def meter_audit(drum, prior_bpm, prior_downbeat):
    hop = RATE//200
    envelope = np.sqrt(np.maximum(0, uniform_filter1d(drum.astype('float64')**2, RATE//100)[::hop]))
    novelty = np.maximum(0, envelope-np.r_[np.zeros(4),envelope[:-4]])
    novelty /= max(np.percentile(novelty,95), 1e-8)
    novelty = np.minimum(novelty, 4)
    fps = RATE/hop
    nfft = 1 << int(np.ceil(np.log2(max(len(novelty)*8, 4096))))
    spectral = abs(np.fft.rfft((novelty-np.mean(novelty))*np.hanning(len(novelty)),nfft))**2
    bpm = np.fft.rfftfreq(nfft,1/fps)*60
    peaks,_ = find_peaks(spectral)
    usable = [i for i in peaks if 55 <= bpm[i] <= 170]
    chosen = sorted(usable,key=lambda i:-spectral[i])[:10]
    independent = [{'bpm': round(float(bpm[i]),4), 'power': round(float(spectral[i]/max(spectral[chosen[0]],1e-12)),4)} for i in chosen]
    nearby = [i for i in usable if abs(bpm[i]-prior_bpm) <= 2]
    if not nearby:
        return {'independentSpectralCandidates': independent, 'priorBpm': prior_bpm, 'error':'No prior-near tempo support'}
    i = max(nearby,key=lambda at:spectral[at]); measured = float(bpm[i])
    # Sub-bin quadratic interpolation in log power.
    if 0 < i < len(spectral)-1:
        y=np.log(np.maximum(spectral[i-1:i+2],1e-15))
        delta=.5*(y[0]-y[2])/(y[0]-2*y[1]+y[2])
        measured += float(delta)*(bpm[1]-bpm[0])
    period = 60/measured
    phases=np.arange(0,period,.005)
    phase_scores=[]
    for phase in phases:
        grid=np.arange(phase, len(drum)/RATE,period)
        positions=np.minimum((grid*fps).astype(int),len(novelty)-1)
        phase_scores.append(float(np.mean(novelty[positions])))
    strongest=float(phases[int(np.argmax(phase_scores))])
    prior_phase=prior_downbeat%period
    difference=(strongest-prior_phase+period/2)%period-period/2
    return {'priorBpm':prior_bpm, 'measuredPriorNearBpm':round(measured,5), 'differenceBpm':round(measured-prior_bpm,5),
            'independentSpectralCandidates':independent, 'strongestDrumEnergyBeatPhaseSeconds':round(strongest,4),
            'priorDownbeatSeconds':prior_downbeat, 'energyPhaseMinusPriorMs':round(difference*1000,3),
            'barPhaseStatus':'Percussion energy cannot uniquely label beat one; the four 4/4 rotations need musical review. Energy phase is not an onset timestamp.'}


def analyze(identity):
    prefix, mix_name, bpm, first = SONGS[identity]
    mix=ROOT/'docs/moth/songs/2026-09-28'/f'{mix_name}.m4a'
    old=PREVIOUS.get(identity,{})
    result={'mixPath':str(mix),'mix':probe(mix),'stems':{}}
    for role in ['Vocals','Drums','Bass']:
        paths=list(STEMS.glob(prefix+'*('+role+').wav'))
        if role=='Bass' and not paths: continue
        assert len(paths)==1,(identity,role,paths)
        path=paths[0];meta=probe(path);wave=decode(path,role);ref=decode(mix,role)
        key={'Vocals':'vocalSha256','Drums':'drumSha256','Bass':'bassSha256'}[role]
        align=wide_alignment(ref,wave)
        result['stems'][role]={'path':str(path),**meta,'previousSha256':old.get(key),
            'differsFromPriorAnalyzedStem':old.get(key)!=meta['sha256'] if key in old else None,
            'silence':leading_silence(wave), 'alignment':align}
        if role=='Drums': result['meter']=meter_audit(wave,bpm,first)
        OUT.mkdir(parents=True,exist_ok=True)
        (OUT/f'alignment-{identity}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
        print(identity,role,'offsetMs',align.get('offsetMs'),'drift',align.get('driftMsPerMinute'),
              'corr',align.get('medianCorrelation'),'windows',align.get('matchingWindows'),
              'changed',result['stems'][role]['differsFromPriorAnalyzedStem'],flush=True)
    return identity,result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stems',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--previous-analysis',type=Path)
    parser.add_argument('--songs',nargs='*',choices=list(SONGS),default=list(SONGS))
    parser.add_argument('--workers',type=int,default=2)
    args=parser.parse_args()
    STEMS,OUT=args.stems,args.output.parent
    OUT.mkdir(parents=True,exist_ok=True)
    if args.previous_analysis:
        PREVIOUS=json.loads(args.previous_analysis.read_text())
        if 'songs' in PREVIOUS: PREVIOUS=PREVIOUS['songs']
    begin=time.time()
    with ThreadPoolExecutor(max_workers=args.workers)as pool: rows=list(pool.map(analyze,args.songs))
    output={'checkedAtUtc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'seconds':round(time.time()-begin,3),
        'method':'Independent +/-12s normalized shared-waveform consensus, chronological energetic windows; prior-near tempo plus independent spectral candidates',
        'songs':dict(rows)}
    args.output.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
    print('DONE',len(rows),'songs',output['seconds'],'seconds',flush=True)
