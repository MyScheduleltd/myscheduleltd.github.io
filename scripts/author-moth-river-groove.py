#!/usr/bin/env python3
"""Author the river excerpt from audible recorded drums, including shuffle hits.

The earlier authoring pass rejected attacks over 65 ms from a straight-sixteenth
grid. A genuine 76 BPM triplet offbeat is ~65.8 ms from that grid, so prominent
kicks could be rejected while a quieter straight-position hat was retained.
This pass ranks actual source attacks by drum/master amplitude and sharp-rise
support, without a beat-grid gate. Counts are retained per eight-quarter phrase
in easy; hard keeps its spacing limits and never adds a masked note for a quota.
The game build consumes the resulting JSON and does not need source audio tools.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
from pathlib import Path
import numpy as np
from scipy.signal import butter, sosfiltfilt
import moth_drum_hits as drums

ROOT = Path(__file__).resolve().parents[1]
VERSION = 'drums-readable-20261105b'
SELECTION_VERSION = 'audible-shuffle-v1'
BASE_SHA256 = '59f9e0944b2bf2fa0768c7cec3c276a9b3c44a06be2888267dc871817ada3dc3'
STEM_SHA256 = 'dc8bad34b3388b7223ea8648a530a9d6fc75a8f349a6ca60b4c0ceab45829891'
MASTER_SHA256 = '4d6555a1f539c7ef24ad1c6198ebc08b6f8e3dc9206a61639432a0e29312c741'
START, END, FADE = 10., 164., .35
QUARTER_PHASE = .0893
BANDS = {'kick': (35,150), 'snare': (150,6000), 'hat': (5000,16000), 'other': (150,6000)}
BUTTON = {'kick': 'T', 'snare': 'O', 'hat': 'M', 'other': 'H'}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def envelopes(wave):
    result = {}
    for inst,(lo,hi) in BANDS.items():
        filtered = sosfiltfilt(butter(3,[lo,hi],btype='bandpass',fs=drums.RATE,output='sos'),wave)
        env = np.convolve(drums.envelope_ms(filtered), [.25,.5,.25], mode='same')
        result[inst] = (env, np.maximum(0,np.diff(env,prepend=env[0])))
    return result


def candidates(source, measured, isolated, master):
    beat = 60/source['bpm']; result = []
    for inst,events in measured['refinements'].items():
        env,rise = isolated[inst]; full,fullrise = master[inst]
        for hit in events:
            t = hit['time']
            if not 25.25 < t < END-FADE or hit['contrast'] < .5 or hit.get('onsetEdge',False):
                continue
            at = round(t*1000)
            energy = float(np.mean(env[at:at+40]**2))
            full_energy = float(np.mean(full[at:at+40]**2))
            rms = energy**.5
            if rms < .005:
                continue
            sharp = float(max(rise[at-4:at+16]))
            full_sharp = float(max(fullrise[at-4:at+16]))
            result.append({'time':t, 'instrument':inst, 'button':BUTTON[inst],
                           'rms':rms, 'share':energy/(full_energy+1e-15), 'sharp':sharp,
                           'audibleRiseRatio':sharp/(full_sharp+1e-12),
                           'strength':hit['strength'], 'contrast':hit['contrast'],
                           'proposalAttack':hit['proposal'], 'onsetEdge':hit.get('onsetEdge',False),
                           'peakEdge':hit.get('peakEdge',hit.get('edge',False)),
                           'phrase':int((t-QUARTER_PHASE)//(beat*8))})
    for inst in BANDS:
        group = [a for a in result if a['instrument']==inst]
        rms = np.array([a['rms'] for a in group]); sharp = np.array([a['sharp'] for a in group])
        for a in group:
            a['amplitudePercentile'] = float(np.mean(rms<=a['rms']))
            a['risePercentile'] = float(np.mean(sharp<=a['sharp']))
            # Amplitude alone can favour a long tail; sharp-rise support in
            # the original mix makes prominent attacks rank above masked ones.
            a['score'] = (a['amplitudePercentile']*.8 + a['risePercentile']*.5
                          + min(1,a['share']/.25)*.8 + min(1,a['audibleRiseRatio']/.5)*.5
                          + (1.0 if inst in ('kick','snare') else 0))
    merged = []
    for a in sorted(result,key=lambda a:(-a['score'],a['time'],a['instrument'])):
        if all(abs(a['time']-b['time'])>=.060 for b in merged):
            merged.append(a)
    return result, sorted(merged,key=lambda a:a['time'])


def select(mode, source, pool):
    beat = 60/source['bpm']; unit = beat/4
    prior = [{**event,'holdSteps':row[2]} for row,event in zip(source[mode],source['evidence'][mode])
             if START<=event['attack']<END-FADE]
    phrases = {}
    for event in prior:
        phrases.setdefault(int((event['attack']-QUARTER_PHASE)//(beat*8)),[]).append(event)
    chosen,shortages = [],[]
    for phrase,old in sorted(phrases.items()):
        target = len(old); local = []
        for a in sorted((a for a in pool if a['phrase']==phrase),key=lambda a:(-a['score'],a['time'])):
            # No quiet ghost/filler is required just to reach a hard quota.
            if a['score']<1.5 or (a['share']<.02 and a['audibleRiseRatio']<.25):
                continue
            gap = .224 if mode=='easy' else max(.224,min(.28,beat*.45))
            if any(abs(a['time']-b['time']) < (.30 if mode=='hard' and a['button']==b['button'] else gap)-1e-6
                   for b in chosen+local):
                continue
            trial = sorted(chosen+local+[a],key=lambda a:a['time'])
            if mode=='hard' and any(trial[i+4]['time']-trial[i]['time']<1-1e-6 for i in range(len(trial)-4)):
                continue
            local.append(dict(a,tail=0))
            if len(local)==target:
                break
        if len(local)<target:
            shortages.append({'phrase':phrase,'wanted':target,'chosen':len(local),
                              'reason':'Only audible, readable attacks are kept; no forced filler'})
        chosen += local
    chosen.sort(key=lambda a:a['time'])
    # Preserve a prior hold only when a nearby real drum starts it and its
    # original musical release remains clear of both adjacent note heads.
    holds=[]
    for old in (a for a in prior if a['holdSteps']>0):
        matches=[(abs(a['time']-old['attack']),i) for i,a in enumerate(chosen)
                 if abs(a['time']-old['attack'])<=.18 and not a['tail']]
        if not matches:
            continue
        _,i=min(matches); a=chosen[i]
        release=old['attack']+old['holdSteps']*unit
        next_time=chosen[i+1]['time'] if i+1<len(chosen) else END-FADE
        previous_release=(chosen[i-1]['time']+chosen[i-1]['tail']*unit) if i else START
        if release-a['time']>=.25 and next_time-release>=.2 and a['time']-previous_release>=.2:
            a['tail']=(release-a['time'])/unit
            holds.append({'oldAttack':old['attack'],'attack':a['time'],'release':release,'button':a['button']})
    assert not (mode=='easy' and (len(chosen)!=len(prior) or shortages)), 'Easy density must be retained in every phrase'
    for i,a in enumerate(chosen):
        assert START<=a['time']<END-FADE
        if i+1<len(chosen):
            following=chosen[i+1]
            assert following['time']-a['time']-a['tail']*unit>=.2-1e-6, 'Clear head/hold release spacing'
            if mode=='hard':
                assert following['time']-a['time'] >= (.30 if a['button']==following['button'] else .28)-1e-6
    return prior,chosen,shortages,holds


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--master',type=Path,required=True)
    parser.add_argument('--stem',type=Path,default=Path.home()/'.cache/bobby-drum-stems/htdemucs/6 - 更年期 ft. 手天使 & 謝乾/drums.wav')
    parser.add_argument('--ffmpeg',default='ffmpeg')
    parser.add_argument('--output',type=Path,default=ROOT/'scripts/moth-river-groove.json')
    parser.add_argument('--report',type=Path,default=ROOT/'.qa/moth/river-musical-recheck/groove-report.json')
    args=parser.parse_args()
    base_path=ROOT/'scripts/moth-drum-charts.json'
    assert sha(base_path)==BASE_SHA256,'Reviewed source chart identity'
    assert sha(args.master)==MASTER_SHA256 and sha(args.stem)==STEM_SHA256,'Reviewed original source audio required'
    base=json.loads(base_path.read_text()); source=base['songs']['level5RiverRhythm']
    measured=json.loads((ROOT/'.qa/moth/drum-sync-20261029/level5RiverRhythm-measured.json').read_text())
    assert measured['refinementVersion']=='energy-boundary-v2'
    assert measured['hashes']['master']==MASTER_SHA256 and measured['hashes']['stem']==STEM_SHA256
    isolated=envelopes(drums.decode(args.stem,args.ffmpeg)); master=envelopes(drums.decode(args.master,args.ffmpeg))
    all_candidates,pool=candidates(source,measured,isolated,master)
    song=copy.deepcopy(source); song['selectionVersion']=SELECTION_VERSION
    song['restSections']=[[START,25.25]]; song['evidence']={}
    report={'version':VERSION,'window':{'start':START,'end':END},'sourceChartSha256':BASE_SHA256,
            'sourceHashes':{'master':MASTER_SHA256,'stem':STEM_SHA256},'modes':{}}
    beat=60/source['bpm']; unit=beat/4; offset=source['beatOffset']
    for mode in ('easy','hard'):
        prior,events,shortages,holds=select(mode,source,pool)
        song[mode]=[[round((a['time']-offset)/unit,8),a['button'],round(a['tail'],8)] for a in events]
        evidence=[]
        for row,a in zip(song[mode],events):
            old=min(prior,key=lambda b:abs(b['attack']-a['time']))
            straight=abs(((a['time']-offset+unit/2)%unit)-unit/2)*1000
            triplet_unit=beat/6
            triplet=abs(((a['time']-QUARTER_PHASE+triplet_unit/2)%triplet_unit)-triplet_unit/2)*1000
            evidence.append({'attack':a['time'],'time':a['time'],'button':a['button'],'instrument':a['instrument'],
                             'source':'isolated-drums','gridDeviationMs':round(straight,4),
                             'errorMs':round(abs(offset+row[0]*unit-a['time'])*1000,6),
                             'proposalAttack':a['proposalAttack'],'originalAttack':old['attack'],
                             'onsetContrast':round(a['contrast'],6),'onsetEdge':a['onsetEdge'],'peakEdge':a['peakEdge'],
                             'manuallyReviewed':False,'selectionVersion':SELECTION_VERSION,
                             'audibilityScore':round(a['score'],6),'drumRms':round(a['rms'],6),
                             'drumEnergyShare':round(a['share'],6),'masterRiseSupport':round(a['audibleRiseRatio'],6),
                             'tripletGridDeviationMs':round(triplet,4),'priorNearestDeltaMs':round((a['time']-old['attack'])*1000,3)})
        song['evidence'][mode]=evidence
        report['modes'][mode]={'before':len(prior),'after':len(events),'shortages':shortages,'holds':holds,
                               'exactOldAttacksRetained':sum(any(abs(a['time']-b['attack'])<.002 for b in prior) for a in events),
                               'instrumentCounts':{inst:sum(a['instrument']==inst for a in events) for inst in BANDS},
                               'outsideOldStraightGate':sum(e['gridDeviationMs']>65 for e in evidence),
                               'medianAudibilityScore':float(np.median([a['score'] for a in events]))}
    # Known prominent shuffled attacks must survive. Their old straight-grid
    # neighbors were 107–130 ms later; no fixed timing offset can fix that.
    reviewed=[39.433,59.961,64.697,125.093,127.856,135.749]
    for t in reviewed:
        assert any(abs(e['attack']-t)<.002 for e in song['evidence']['easy']),('Missing reviewed triplet kick',t)
    report['reviewedProminentTriplets']=reviewed
    result={'version':VERSION,'baselineSha256':BASE_SHA256,
            'method':'Master-supported audible drum selection, preserving easy count per eight-quarter phrase; real shuffled/triplet attacks are retained without a straight-grid gate. Per-head times remain measured waveform attacks; no global offset or quantization. Hard excludes masked quota fillers and retains readable gaps.',
            'window':{'start':START,'end':END},'song':song}
    args.output.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=='__main__':main()
