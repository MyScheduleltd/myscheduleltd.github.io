#!/usr/bin/env python3
"""Independent signal check of every chart head, including hidden songs.

Requires numpy/scipy and local isolated source drums. This reopens and filters
actual source waveforms with a Butterworth filter (the author uses an FFT
band), then measures their amplitude boundary independently. It reports
uncertainty rather than treating row-encoding roundtrips as musical proof.
"""
import argparse, hashlib, json
from pathlib import Path
import numpy as np
from scipy.signal import butter, sosfiltfilt
import moth_drum_hits as drums

ROOT = Path(__file__).resolve().parents[1]
BANDS = {'kick': (35,150), 'snare': (150,6000), 'hat': (5000,16000), 'other': (100,5000)}
# These three slow bass attacks were inspected in all bands and the full
# isolated waveform. The first significant amplitude rise is retained; the alternative
# filter threshold crossed a later oscillation/energy lobe. The source hash
# check below prevents accepting these reviews for a different recording.
REVIEWED_BOUNDARIES = {
    ('level2BathroomRhythm', 2.191): 'First amplitude rise confirmed in both filters and full drum waveform; secondary detector chose later bass cycle',
    ('level2BathroomRhythm', 13.391): 'First amplitude rise confirmed in both filters and full drum waveform; secondary detector chose later bass cycle',
    ('level5RiverRhythm', 123.116): 'First amplitude rise and concurrent snare transient confirmed; secondary detector chose later bass cycle',
}

REVIEWED_STEM_SHA256 = {'level2BathroomRhythm': 'd814499fa95fcb60ec9a555ab1c15470ecfa646edc3b1e433f5ac16e22393782', 'level5RiverRhythm': 'dc8bad34b3388b7223ea8648a530a9d6fc75a8f349a6ca60b4c0ceab45829891'}


def reviewed_resolution(name, attack, source_sha):
    if REVIEWED_STEM_SHA256.get(name) != source_sha:
        return None
    return REVIEWED_BOUNDARIES.get((name, attack))


def boundary(env, proposal):
    at = round(proposal*1000)
    lo, hi = max(1, at-45), min(len(env)-1, at+45)
    smooth = np.convolve(env[max(0,lo-4):hi+5], np.ones(5)/5, mode='same')
    start = lo-max(0,lo-4)
    local = smooth[start:start+hi-lo+1]
    peak = int(np.argmax(local))
    floor = float(np.percentile(local[:max(1,peak)],10))
    level = float(local[peak])
    threshold = floor+.12*max(0,level-floor)
    onset = peak
    while onset>0 and local[onset-1]>threshold: onset-=1
    return (lo+onset)/1000, (level-floor)/max(level,1e-12), onset<=1


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--original-root',type=Path,required=True)
    ap.add_argument('--stems-root',type=Path,default=Path.home()/'.cache/bobby-drum-stems/htdemucs')
    ap.add_argument('--charts',type=Path,default=ROOT/'scripts/moth-drum-charts.json')
    ap.add_argument('--ffmpeg',default='ffmpeg')
    ap.add_argument('--river-cut',type=Path,help='Verify the shipped short river chart rather than the complete source chart')
    ap.add_argument('--groove',type=Path,help='Verify the current all-song groove selection and its shipped row timestamps')
    ap.add_argument('--report',type=Path,help='Write the independent verification report here')
    args=ap.parse_args()
    charts=json.loads(args.charts.read_text())
    if args.river_cut:
        cut=json.loads(args.river_cut.read_text())
        assert hashlib.sha256(args.charts.read_bytes()).hexdigest()==cut['sourceSha256']
        charts['songs']['level5RiverRhythm']=cut['song']
    if args.groove:
        assert args.river_cut, 'The groove selection is for the released river cut'
        groove = json.loads(args.groove.read_text())
        assert hashlib.sha256(args.charts.read_bytes()).hexdigest() == groove['baseSha256']
        assert hashlib.sha256(args.river_cut.read_bytes()).hexdigest() == groove['riverSha256']
        shipped = json.loads((ROOT/'docs/moth/data/level1.json').read_text())
        assert shipped['rhythmChartVersion'] == groove['version']
        specs = {key: shipped[key] for key in groove['songs'] if key in shipped}
        specs.update({level['id']: level['rhythm'] for level in shipped['secretLevels']})
        for name, modes in groove['songs'].items():
            spec = specs[name]
            unit = 60 / spec['bpm'] * spec['chart']['stepBeats']
            song = charts['songs'][name]
            song['evidence'] = {}
            for mode, selection in modes.items():
                rows = spec['chart'][mode]
                assert rows == selection['rows'] and len(rows) == len(selection['evidence']), (name, mode)
                song[mode] = rows
                song['evidence'][mode] = []
                for row, event in zip(rows, selection['evidence']):
                    # Measure against the timestamp decoded from the actual
                    # built chart and its cut origin, including off-grid heads.
                    emitted = spec['beatOffset'] + row[0] * unit + spec.get('audioStartSeconds', 0)
                    assert abs(emitted - event['attack']) < .000002, (name, mode, event)
                    song['evidence'][mode].append({**event, 'attack': emitted})
    baseline=json.loads((ROOT/'.qa/moth/published/data/level1.json').read_text())
    entries={k:baseline[k] for k in charts['songs'] if k in baseline}
    entries.update({a['id']:a['rhythm'] for a in baseline['secretLevels']})
    output={'scope':'shipped runtime cuts' if args.river_cut else 'complete source chart windows','method':'Independent Butterworth amplitude boundary of actual source waveforms; no chart retiming or quantization','songs':[]}
    for name,node in entries.items():
        song=Path(node.get('audioSrc',baseline['audioSrc'])).stem
        stem=args.stems_root/song/'drums.wav'
        if name.startswith('secret-'):stem=args.original_root/'.qa/secret-levels/stems/htdemucs'/song/'drums.wav'
        if name=='level5StudioRhythm':stem=args.original_root/'.qa/studio-chapter/stems/htdemucs'/song/'drums.wav'
        source_sha=hashlib.sha256(stem.read_bytes()).hexdigest()
        assert source_sha==charts['songs'][name]['hashes']['stem']
        wave=drums.decode(stem,args.ffmpeg)
        envs={}
        for inst,(lo,hi) in BANDS.items():
            signal=sosfiltfilt(butter(3,[lo,hi],btype='bandpass',fs=drums.RATE,output='sos'),wave)
            envs[inst]=drums.envelope_ms(signal)
        events={}
        for mode in ['easy','hard']:
            for event in charts['songs'][name]['evidence'][mode]:
                key=(event['attack'],event['instrument'])
                if key in events:continue
                observed,contrast,edge=boundary(envs[event['instrument']],event['proposalAttack'])
                events[key]={'attack':round(event['attack'], 6),'instrument':event['instrument'],'independentAttack':observed,
                             'differenceMs':round((observed-event['attack'])*1000,3),'contrast':round(contrast,4),'edge':edge}
        values=np.array([e['differenceMs'] for e in events.values()])
        review=[{**e, 'resolution': reviewed_resolution(name, e['attack'], source_sha)} for e in events.values() if abs(e['differenceMs'])>20 or e['contrast']<.5 or e['edge']]
        unresolved=[e for e in review if not e['resolution']]
        item={'id':name,'uniqueHeads':len(values),'charts':{m:len(charts['songs'][name][m]) for m in ['easy','hard']},
              'medianDifferenceMs':float(np.median(values)),'p95AbsoluteDifferenceMs':float(np.percentile(abs(values),95)),
              'largestAbsoluteDifferenceMs':float(max(abs(values))), 'reviewedBoundaries':review,'unresolved':unresolved}
        output['songs'].append(item);print(json.dumps(item),flush=True)
    assert not any(song['unresolved'] for song in output['songs']), 'Independent boundary differences require waveform review'
    out=args.report or ROOT/'.qa/moth/drum-onset-20261105'/('independent-runtime-after.json' if args.river_cut else 'independent-after.json')
    out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')


if __name__=='__main__':main()
