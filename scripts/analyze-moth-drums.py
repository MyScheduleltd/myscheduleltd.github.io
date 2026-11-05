#!/usr/bin/env python3
"""Remeasure every playable M.O.T.H song and author readable drum-only charts.

Requires numpy and ffmpeg, plus isolated drums from the original masters.
No audio is changed. The published AAC/cut is correlated against its master
at five positions; charts keep measured attacks rather than quantizing away
the drummer's swing/microtiming. Cached measurements are keyed by audio hashes.
The output is a build input, with per-head attack evidence and an audit report.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import numpy as np
import moth_drum_hits as drums

ROOT = Path(__file__).resolve().parents[1]
INSTRUMENTS = {'M': 'hat', 'O': 'snare', 'T': 'kick', 'H': 'other'}
VERSION = 'drums-readable-20261105a'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def alignment(master, published, start):
    """Independent checks of codec/cut timing; return lag in decoded samples."""
    out = []
    duration = len(published) / drums.RATE
    # Avoid faded/silent lead-ins and endings, where AAC noise can dominate
    # correlation and a lag has no physical meaning.
    for at in np.linspace(duration*.1, duration*.9, 5):
        i = round(at * drums.RATE)
        j = round((at + start) * drums.RATE)
        half, search = 11025, 2205
        x = published[i-half:i+half].astype(np.float64)
        y = master[j-half-search:j+half+search].astype(np.float64)
        if len(x) != half*2 or len(y) != half*2+search*2:
            continue
        x -= x.mean()
        size = 1 << (len(x) + len(y) - 1).bit_length()
        corr = np.fft.irfft(np.fft.rfft(y, size) * np.fft.rfft(x[::-1], size), size)
        valid = corr[len(x)-1:len(y)]
        # Normalize every candidate window. Raw covariance can prefer a
        # louder neighboring oscillation in a periodic funk groove.
        sums = np.r_[0., np.cumsum(y)]
        powers = np.r_[0., np.cumsum(y*y)]
        energy = powers[len(x):]-powers[:-len(x)]-(sums[len(x):]-sums[:-len(x)])**2/len(x)
        scores = valid / np.sqrt(np.maximum(energy, 1e-20)*np.dot(x,x))
        k = int(np.argmax(scores))
        yy = y[k:k+len(x)]
        yy = yy-yy.mean()
        coherence = float(np.dot(x, yy) / (np.linalg.norm(x)*np.linalg.norm(yy)+1e-12))
        out.append({'seconds': round(float(at), 3), 'lagMs': round((k-search)/drums.RATE*1000, 3), 'correlation': round(coherence, 5)})
    assert len(out) == 5 and min(a['correlation'] for a in out) > .94, out
    assert max(abs(a['lagMs']) for a in out) < 1.5, out
    return out


def tempo_fit(hits, expected, swung=False):
    """Check a broad tempo range and refine the authored metrical candidate.

    Drum grooves can support half/double-time interpretations. Report both
    eighth/sixteenth peaks; swung songs use eighth coherence, since swung
    offbeats cancel out much of the straight-sixteenth phase signal.
    """
    values = hits['kick'] + hits['snare']
    ts = np.array([t for t, s in values])
    weights = np.array([min(s, 2) for t, s in values])
    def coherence(bpm, subdivision):
        z = np.sum(weights * np.exp(2j*np.pi*ts*bpm*subdivision/60))
        return abs(z)/weights.sum()
    broad={}
    for subdivision in [2,4]:
        tempos=np.arange(60,180.001,.02)
        ordered=sorted(((coherence(bpm,subdivision),bpm) for bpm in tempos),reverse=True)
        peaks=[]
        for score,bpm in ordered:
            if all(abs(bpm-p['bpm'])>.3 for p in peaks):
                peaks.append({'bpm':round(float(bpm),3),'coherence':round(float(score),4)})
            if len(peaks)==5:break
        broad[str(subdivision)]=peaks
    subdivision=2 if swung else 4
    bpms = np.arange(expected-.25, expected+.2501, .001)
    fitted = float(max(bpms, key=lambda bpm:coherence(bpm,subdivision)))
    assert abs(fitted-expected)<.24, 'Tempo fit reached search boundary'
    assert any(abs(p['bpm']-expected)<.08 for p in broad[str(subdivision)]), 'Authored tempo absent from broad-range peaks'
    unit = 60 / (fitted*subdivision)
    phase = np.angle(np.sum(weights*np.exp(2j*np.pi*ts/unit)))/(2*np.pi)*unit
    residual = (ts-phase+unit/2) % unit - unit/2
    near = abs(residual) < .035
    # Weighted regression after nearest subdivision assignment exposes drift.
    n = np.round((ts[near]-phase)/unit)
    slope, intercept = np.polyfit(n, ts[near], 1, w=np.sqrt(weights[near]))
    end = max(ts)
    trend = (slope-unit) * (end/unit) * 1000
    return {'authoredBpm': expected, 'measuredBpm': round(fitted, 3), 'coherence': round(float(coherence(fitted,subdivision)), 4),
            'subdivision':subdivision,'broadRangeBpm':[60,180],'broadPeaks':broad,
            'straightSubdivisionShare': round(float(near.mean()), 4), 'residualDriftMs': round(float(trend), 2)}


def candidate_hits(node, hits, audio_start):
    beat = 60/node['bpm']; unit = beat/4; offset = node.get('beatOffset', 0)
    swing = node.get('grid', {}).get('swing', .5)
    lead = max(2, offset+node['chart'].get('leadInSteps', 16)*unit-.075)
    # These are known drumless sections, identified in the original stem audit.
    # Silence remains silence even if source separation leaks a voice or bass.
    rests = [(72.6, 83.7)] if node.get('_id') == 'level2BathroomRhythm' else []
    if node.get('_id') == 'level5RiverRhythm': rests.append((0, 25.25))
    out = []
    for key, inst in INSTRUMENTS.items():
        values = hits[inst]
        strengths = np.array([s for t, s in values])
        floor = float(np.percentile(strengths, 18 if inst in ('kick','snare') else 32))
        norm = float(np.percentile(strengths, 85))
        for attack, strength in values:
            local = attack-audio_start
            if local < lead or local > node['duration']-.5 or strength < floor: continue
            if any(lo < local < hi for lo,hi in rests): continue
            b = (local-offset)/beat; whole = math.floor(b)
            positions = [0,.25,.5,.75,1] if swing == .5 else [0,swing,1]
            grid_beat = whole+min(positions,key=lambda p:abs(b-whole-p))
            error = abs(b-grid_beat)*beat
            # Live performances can sit tens of ms behind a nominal beat.
            # Retain the exact drum time, not the expected grid time.
            if error > .065: continue
            step = (local-offset)/unit
            priority = min(2,strength/(norm+1e-9)) + (1.3 if inst in ('kick','snare') else 1.05)
            out.append({'time':round(local,6),'attack':round(attack,6),'step':round(step,8),'button':key,
                        'instrument':inst,'strength':round(strength,5),'priority':priority,
                        'gridDeviationMs':round(error*1000,2),'tail':0})
    # Simultaneous drum instruments form one readable event, never a chord.
    selected=[]
    for a in sorted(out,key=lambda a:-a['priority']):
        if any(abs(a['time']-b['time']) < .075 for b in selected): continue
        selected.append(a)
    return sorted(selected,key=lambda a:a['time']), rests


def author(node, candidates, rests):
    beat=60/node['bpm'];unit=beat/4;offset=node.get('beatOffset',0)
    original=node['chart']['easy'];chosen=[];used=set()
    # Preserve the existing easy rhythm/density by matching each authored head
    # to a real drum nearby. Never fill a rest just to recover a note count.
    removed=[]
    for index,(pos,key,tail) in enumerate(original):
        target=offset+pos*unit
        if any(lo < target < hi for lo,hi in rests):
            removed.append({'index':index,'seconds':round(target,3),'reason':'drumless section'});continue
        options=[]
        for i,a in enumerate(candidates):
            distance=abs(a['time']-target)
            if i in used or distance > min(.34,beat*.55): continue
            if any(abs(a['time']-b['time']) < .224-1e-6 for b in chosen): continue
            options.append((distance+(.025 if a['button'] != key else 0),-a['priority'],i,a))
        if not options:
            removed.append({'index':index,'seconds':round(target,3),'reason':'no isolated drum attack nearby'});continue
        _,_,i,a=min(options,key=lambda v:v[:3]);used.add(i)
        a=dict(a);a['oldHold']=tail;a['oldTime']=target;chosen.append(a)
    chosen.sort(key=lambda a:a['time'])
    # Recover displaced heads only inside the same 8-beat phrase, preserving
    # its density. This never creates a head in an empty drum passage.
    phrase_counts={}
    for pos,key,tail in original:
        t=offset+pos*unit
        if any(lo<t<hi for lo,hi in rests):continue
        phrase=int((t-offset)/(beat*8));phrase_counts[phrase]=phrase_counts.get(phrase,0)+1
    wanted=sum(phrase_counts.values())
    for phrase,target in phrase_counts.items():
        def same(a): return int((a['time']-offset)/(beat*8))==phrase
        missing=target-sum(same(a) for a in chosen)
        pool=sorted((a for a in candidates if same(a)),key=lambda a:-a['priority'])
        for a in pool:
            if missing<=0 or len(chosen)>=wanted:break
            if any(abs(a['time']-b['time'])<.26 for b in chosen):continue
            trial=sorted(chosen+[a],key=lambda a:a['time'])
            if any(trial[i+3]['time']-trial[i]['time']<beat*1.85 for i in range(len(trial)-3)):continue
            chosen=trial;missing-=1
    easy=sorted(chosen,key=lambda a:a['time'])
    # Retain existing long-note exercises only when a true drum starts them,
    # with space after release. No tap or hold head can hide beneath a tail.
    for i,a in enumerate(easy):
        if a.get('oldHold',0)<=0:continue
        end=offset+round((a['time']+a['oldHold']*unit-offset)/unit)*unit
        following=easy[i+1]['time'] if i+1<len(easy) else node['duration']
        if end-a['time']>=.25 and following-end>=.2:
            a['tail']=round((end-a['time'])/unit,8)
    hard=[]
    before_hard=len(node['chart']['hard'])
    # Hard adds a modest number of fills around easy. A cap per bar prevents
    # long streams; minimum gaps and same-key recovery prevent mashing.
    target=min(before_hard,max(len(easy)+8,round(len(easy)*1.20)))
    hard_gap=max(.224,min(.28,beat*.45))
    def safe_hard(a):
        if any(abs(a['time']-b['time'])<(.30 if a['button']==b['button'] else hard_gap)-1e-6 for b in hard):return False
        if any(b['tail'] and b['time']-.2<a['time']<b['time']+b['tail']*unit+.2 for b in hard):return False
        if a['tail'] and any(a['time']-.2<b['time']<a['time']+a['tail']*unit+.2 for b in hard):return False
        trial=sorted(hard+[a],key=lambda a:a['time'])
        return not any(trial[i+4]['time']-trial[i]['time']<1.0-1e-6 for i in range(len(trial)-4))
    # First make the backbone safe, then add fills. Filtering after reaching
    # a target would throw away notes without considering other available gaps.
    for a in easy:
        if safe_hard(a):hard.append(dict(a))
    for a in sorted(candidates,key=lambda a:-a['priority']):
        if len(hard)>=target:break
        if sum(int(b['step']//16)==int(a['step']//16) for b in hard)>=6:continue
        if safe_hard(a):hard.append(dict(a,tail=0))
    hard.sort(key=lambda a:a['time'])
    for mode,events in [('easy',easy),('hard',hard)]:
        for a in events:
            a['source']='isolated-drums'
            a['errorMs']=round(abs(offset+a['step']*unit-a['time'])*1000,6)
        assert all(a['time']>=0 and a['time']+a['tail']*unit<=node['duration'] for a in events)
    return easy,hard,removed


# The handful of low-contrast classifier proposals were checked against all
# four isolated-drum bands. Reassign to the clear percussion attack instead
# of preserving a misleading instrument label or inventing a filler hit.
REVIEWED_PROPOSALS = {
    ('level4ArcadeRhythm', 86.423): ('kick', 86.45369614512471),
    ('level5StudioRhythm', 28.194): ('other', 28.142585034013603),
    ('level5RiverRhythm', 64.828): ('snare', 64.80108843537415),
    ('level5RiverRhythm', 127.986): ('snare', 127.95936507936507),
    ('level6ConcertRhythm', 145.886): ('snare', 145.872),
    ('level6ConcertRhythm', 146.783): ('snare', 146.79),
}
REVIEWED_STEM_SHA256 = {'level4ArcadeRhythm': '0583706126cdbc46d905596afde79593b1f2feb689abc3bd5f6319edb6f5dfa9', 'level5StudioRhythm': '62ff9a5c81aa074c22083521260bc9ff0e0bda98cded0a07d6a9b7b44a0ae814', 'level5RiverRhythm': 'dc8bad34b3388b7223ea8648a530a9d6fc75a8f349a6ca60b4c0ceab45829891', 'level6ConcertRhythm': '3c2547b089abe3e696a0dc7f33c89143877cbafc422fc84d3ec4835bdeff38fb'}
MANUAL_PROPOSALS = {'level6ConcertRhythm': {'snare': [145.872, 146.79]}}


def legacy_log_times(hits, env):
    """One-time migration lookup, never used as the new onset detector."""
    db = 20 * np.log10(env + 1e-9)
    out = []
    for t, _ in hits:
        centre = round(t * 1000)
        lo, hi = max(1, centre - 45), min(len(db) - 1, centre + 25)
        out.append((lo + int(np.argmax(db[lo:hi] - db[lo-1:hi-1]))) / 1000)
    return out


def retime_existing(node, prior, measured):
    """Keep existing phrase placement, count and holds; correct their attacks.

    Stable proposalAttack IDs make a second fresh run byte-identical. Only
    hard heads violating the existing recovery/gap limits are removed.
    """
    for identity in ['stem', 'master']:
        assert prior['hashes'][identity] == measured['hashes'][identity], (node['_id'], identity, 'reviewed source identity changed')
    beat = 60 / node['bpm']; unit = beat / 4
    offset = node.get('beatOffset', 0); audio_start = node.get('audioStartSeconds', 0)
    button_of = {inst: button for button, inst in INSTRUMENTS.items()}
    modes = {}
    for mode in ['easy', 'hard']:
        events = []
        assert len(prior[mode]) == len(prior['evidence'][mode])
        for row, old in zip(prior[mode], prior['evidence'][mode]):
            original = old.get('originalAttack', old['attack'])
            review = REVIEWED_PROPOSALS.get((node['_id'], round(original, 6)))
            if review:
                assert measured['hashes']['stem'] == REVIEWED_STEM_SHA256[node['_id']], 'Reviewed percussion source changed'
            inst = review[0] if review else old['instrument']
            proposals = measured['refinements'][inst]
            proposed = review[1] if review else old.get('proposalAttack')
            if proposed is not None:
                ix = min(range(len(proposals)), key=lambda i: abs(proposals[i]['proposal'] - proposed))
                assert abs(proposals[ix]['proposal'] - proposed) < .00001, (node['_id'], proposed)
            else:
                legacy = measured['legacyLogHits'][inst]
                ix = min(range(len(legacy)), key=lambda i: abs(legacy[i] - old['attack']))
                assert abs(legacy[ix] - old['attack']) < .000002, (node['_id'], old)
            attack = proposals[ix]
            assert attack['contrast'] >= .5, (node['_id'], original, 'requires waveform review', attack)
            local = attack['time'] - audio_start
            button = button_of[inst]
            b = (local-offset)/beat; whole = math.floor(b)
            swing = node.get('grid', {}).get('swing', .5)
            positions = [0,.25,.5,.75,1] if swing == .5 else [0,swing,1]
            grid_beat = whole + min(positions, key=lambda p: abs(b-whole-p))
            events.append({'time': round(local, 6), 'attack': attack['time'], 'step': round((local-offset)/unit, 8),
                           'button': button, 'instrument': inst, 'tail': row[2], 'strength': attack['strength'],
                           'source': 'isolated-drums', 'gridDeviationMs': round(abs(b-grid_beat)*beat*1000, 2),
                           'errorMs': round(abs(offset + round((local-offset)/unit, 8)*unit-local)*1000, 6),
                           'proposalAttack': attack['proposal'], 'originalAttack': original,
                           'onsetContrast': round(attack['contrast'], 6),
                           'onsetEdge': attack.get('onsetEdge', False), 'peakEdge': attack.get('peakEdge', attack['edge']),
                           'manuallyReviewed': bool(review)})
        modes[mode] = sorted(events, key=lambda a: a['time'])
    easy = modes['easy']; hard = modes['hard']; removed = list(prior.get('retimingRemovedHard', []))
    easy_ids = {(a['proposalAttack'], a['instrument']) for a in easy}
    gap = max(.224, min(.28, beat*.45))
    while True:
        conflict = None
        for i in range(len(hard)-1):
            a, b = hard[i:i+2]
            minimum = .30 if a['button'] == b['button'] else gap
            if b['time']-a['time'] < minimum - 1e-6:
                conflict = ([i, i+1], 'same-button recovery' if minimum == .30 else 'minimum gap'); break
            if a['tail'] and b['time'] - a['time'] - a['tail']*unit < .2 - 1e-6:
                conflict = ([i, i+1], 'hold release recovery'); break
        if conflict is None:
            for i in range(len(hard)-4):
                if hard[i+4]['time']-hard[i]['time'] < 1 - 1e-6:
                    conflict = (list(range(i,i+5)), 'four heads per second'); break
        if conflict is None: break
        indices, reason = conflict
        # Preserve easy's backbone where possible, then keep the stronger
        # measured attack. Never shift a true drum off its audible timestamp.
        drop = min(indices, key=lambda i: ((hard[i]['proposalAttack'],hard[i]['instrument']) in easy_ids,
                                         bool(hard[i]['tail']), hard[i]['strength']))
        gone = hard.pop(drop)
        removed.append({'originalAttack': gone['originalAttack'], 'attack': gone['attack'], 'button': gone['button'], 'reason': reason})
    for events in [easy, hard]:
        assert all(a['time'] >= 0 and a['time']+a['tail']*unit <= node['duration'] for a in events)
        assert all(b['time']-a['time']-a['tail']*unit > .06 for a,b in zip(events,events[1:]))
    return easy, hard, removed


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--original-root',type=Path,required=True,help='Original Bobby_game master/stem workspace (read-only)')
    ap.add_argument('--stems-root',type=Path,default=Path.home()/'.cache/bobby-drum-stems/htdemucs')
    ap.add_argument('--ffmpeg',default='ffmpeg')
    ap.add_argument('--fresh',action='store_true')
    ap.add_argument('--output',type=Path,default=ROOT/'scripts/moth-drum-charts.json')
    ap.add_argument('--retime-existing',type=Path,help='Preserve these existing phrase heads and density, correcting only their measured attacks')
    ap.add_argument('--baseline',type=Path,default=ROOT/'.qa/moth/published/data/level1.json',help='Immutable release data, never a previously rebuilt chart')
    args=ap.parse_args()
    before=json.loads(args.baseline.read_text())
    prior_charts=json.loads(args.retime_existing.read_text()) if args.retime_existing else None
    # Measurements are cached locally; authored density always comes from the
    # immutable source release, so a clean reconstruction gives the same rows.
    baseline=ROOT/'.qa/moth/drum-sync-20261029/before-config.json'
    baseline.parent.mkdir(parents=True,exist_ok=True)
    names=['level1OfficeRhythm','level2BathroomRhythm','level3MassageRhythm','level4ArcadeRhythm','level5StudioRhythm','level5RiverRhythm','level6ConcertRhythm']
    entries=[(k,before[k]) for k in names]+[(n['id'],n['rhythm']) for n in before['secretLevels']]
    output={'version':VERSION,'baselineSha256':sha(args.baseline),'refinementVersion':drums.REFINEMENT_VERSION,'method':'Isolated drum amplitude boundaries; actual swing and syncopation retained, no grid quantization. Existing easy phrase placement/counts retained; hard only drops strict recovery conflicts. Six low-contrast classifier heads were checked in all four drum bands and reassigned to clear percussion. errorMs is row-encoding roundtrip error, not an independent musical accuracy measurement.','songs':{}}
    report=[]
    for name,node in entries:
        node['_id']=name
        song=Path(node.get('audioSrc',before['audioSrc'])).name
        stem=args.stems_root/Path(song).stem/'drums.wav'
        if name.startswith('secret-'):stem=args.original_root/'.qa/secret-levels/stems/htdemucs'/Path(song).stem/'drums.wav'
        if name=='level5StudioRhythm':stem=args.original_root/'.qa/studio-chapter/stems/htdemucs'/Path(song).stem/'drums.wav'
        master=args.original_root/'songs/2026-09-28'/Path(song).with_suffix('.wav')
        playing=ROOT/'docs/moth'/(node.get('fightCut',{}).get('src') or node.get('audioSrc',before['audioSrc']))
        signature={'stem':sha(stem),'master':sha(master),'playing':sha(playing)}
        cache=baseline.parent/(name+'-measured.json')
        if cache.exists() and not args.fresh and json.loads(cache.read_text())['hashes']==signature and json.loads(cache.read_text()).get('refinementVersion') == drums.REFINEMENT_VERSION:
            measured=json.loads(cache.read_text());hits=measured['hits']
        else:
            print('MEASURE',name,flush=True)
            wave=drums.decode(stem,args.ffmpeg)
            spec=drums.spectrogram(wave);freqs=np.fft.rfftfreq(drums.N_FFT,1/drums.RATE)
            keep=(freqs>=30)&(freqs<=16000)
            activations=drums.nmf(spec[keep],drums.templates(freqs[keep]))
            bands={'kick':(35,150),'snare':(150,6000),'hat':(5000,16000),'other':(100,5000)}
            raw_hits={inst:drums.peaks(activations[i]) for i,inst in enumerate(drums.CLASSES)}
            for inst,proposals in MANUAL_PROPOSALS.get(name,{}).items():
                raw_hits[inst].extend((proposal,1) for proposal in proposals)
            envelopes={inst:drums.envelope_ms(drums.band(wave,*bands[inst])) for inst in drums.CLASSES}
            refinements={inst:drums.refine_details(raw_hits[inst],envelopes[inst]) for inst in drums.CLASSES}
            legacy_hits={inst:legacy_log_times(raw_hits[inst],envelopes[inst]) for inst in drums.CLASSES}
            hits={inst:[(a['time'],a['strength']) for a in refinements[inst]] for inst in drums.CLASSES}
            cut_start=node.get('audioStartSeconds',0) if node.get('fightCut') else 0
            checks=alignment(drums.decode(master,args.ffmpeg),drums.decode(playing,args.ffmpeg),cut_start)
            measured={'hashes':signature,'refinementVersion':drums.REFINEMENT_VERSION,'rawHits':raw_hits,'legacyLogHits':legacy_hits,'refinements':refinements,'hits':hits,'alignment':checks}
            cache.write_text(json.dumps(measured)+'\n')
        measured['tempo']=tempo_fit(hits,node['bpm'],node.get('grid',{}).get('swing',.5)!=.5)
        cache.write_text(json.dumps(measured)+'\n')
        candidates,rests=candidate_hits(node,hits,node.get('audioStartSeconds',0))
        easy,hard,removed=retime_existing(node,prior_charts['songs'][name],measured) if prior_charts else author(node,candidates,rests)
        evidence={mode:[{k:a[k] for k in ['attack','time','button','instrument','source','gridDeviationMs','errorMs','proposalAttack','originalAttack','onsetContrast','onsetEdge','peakEdge','manuallyReviewed'] if k in a} for a in events] for mode,events in [('easy',easy),('hard',hard)]}
        entry={'bpm':node['bpm'],'beatOffset':node.get('beatOffset',0),'audioStartSeconds':node.get('audioStartSeconds',0),'hashes':signature,'alignment':measured['alignment'],'tempo':measured['tempo'],
               'refinementVersion':drums.REFINEMENT_VERSION,'retimingRemovedHard':removed if prior_charts else [],'restSections':rests,'easy':[[a['step'],a['button'],a['tail']] for a in easy],'hard':[[a['step'],a['button'],a['tail']] for a in hard],'evidence':evidence}
        output['songs'][name]=entry
        item={'id':name,'bpm':node['bpm'],'tempo':measured['tempo'],'alignmentMaxLagMs':max(abs(a['lagMs']) for a in measured['alignment']),
              'before':{m:len(node['chart'][m]) for m in ['easy','hard']},'after':{m:len(entry[m]) for m in ['easy','hard']},
              'minimumGapMs':{m:round(min(b['time']-a['time'] for a,b in zip(events,events[1:]))*1000,2) for m,events in [('easy',easy),('hard',hard)]},'removedEasy':[] if prior_charts else removed,'removedHard':removed if prior_charts else []}
        report.append(item);print(json.dumps(item,ensure_ascii=False),flush=True)
    args.output.write_text(json.dumps(output,ensure_ascii=False,separators=(',',':'))+'\n')
    (baseline.parent/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')


if __name__=='__main__':main()
