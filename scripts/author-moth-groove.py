#!/usr/bin/env python3
"""Choose audible drum attacks for all nine existing Beauty Boy charts.

The original stem gives the attack clock. The master helps distinguish an
audible accent from percussion masked by the rest of the mix. Optimizing the
whole chart retains counts in each eight-beat phrase, even at its boundaries.
The independent Butterworth onset check runs on every eligible attack first.
"""
import argparse
from collections import Counter, defaultdict
import hashlib
from importlib.util import module_from_spec, spec_from_file_location
import json
import math
from pathlib import Path

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp
from scipy.signal import butter, sosfiltfilt
from scipy.sparse import coo_matrix

import moth_drum_hits as drums

ROOT = Path(__file__).resolve().parents[1]
VERSION = 'drums-groove-20261114a'
SELECTION = 'audible-drum-phrases-v1'
BASE = ROOT / 'scripts/moth-drum-charts.json'
RIVER = ROOT / 'scripts/moth-river-cut.json'
CONFIG = ROOT / '.qa/moth/published/data/level1.json'
CACHE = ROOT / '.qa/moth/drum-sync-20261029'
AUDIT = ROOT / 'scripts/verify-moth-drum-waveforms.py'
AUDIT_SPEC = spec_from_file_location('waveform_audit', AUDIT)
audit = module_from_spec(AUDIT_SPEC)
AUDIT_SPEC.loader.exec_module(audit)
BUTTONS = dict(zip(drums.CLASSES, 'TOMH'))
RIVER_PINS = (25.346, 39.433, 59.961, 64.697, 86.787, 125.093, 127.856, 135.749)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def envelope(wave, band):
    filt = butter(3, band, btype='bandpass', fs=drums.RATE, output='sos')
    return drums.envelope_ms(sosfiltfilt(filt, wave))


def attack_identity(event):
    return event['instrument'], event['proposalAttack']


def candidate_attacks(name, source, duration, measured, stem_wave, master_wave):
    origin = source['audioStartSeconds']
    rests = source['restSections']
    beat = 60 / source['bpm']
    lead = min(source[mode][0][0] * beat / 4 + source['beatOffset'] for mode in ('easy', 'hard'))
    retained = {attack_identity(event): event for mode in ('easy', 'hard') for event in source['evidence'][mode]}
    result = []
    for instrument, band in audit.BANDS.items():
        stem = envelope(stem_wave, band)
        mix = envelope(master_wave, band)
        stem_rise = np.maximum(0, np.diff(stem, prepend=stem[0]))
        mix_rise = np.maximum(0, np.diff(mix, prepend=mix[0]))
        group = []
        for hit in measured['refinements'][instrument]:
            attack = hit['time']
            local = attack - origin
            old = retained.get((instrument, hit['proposal']))
            if not (lead - .001 <= local <= duration - .45) and not old:
                continue
            if hit['contrast'] < .5 or hit.get('onsetEdge') or any(lo < local < hi for lo, hi in rests):
                continue
            # Agreement with a different filter and boundary method helps
            # screen false transients. Reviewed slow bass attacks are pinned.
            independent, contrast, edge = audit.boundary(stem, hit['proposal'])
            if abs(independent - attack) > .020001 or contrast < .5 or edge:
                if not audit.reviewed_resolution(name, attack, source['hashes']['stem']):
                    continue
            at = round(attack * 1000)
            drum_energy = float(np.mean(stem[at:at + 40] ** 2))
            mix_energy = float(np.mean(mix[at:at + 40] ** 2))
            sharp = float(max(stem_rise[at - 4:at + 16]))
            mix_sharp = float(max(mix_rise[at - 4:at + 16]))
            amplitude = drum_energy ** .5
            share = drum_energy / max(mix_energy, 1e-12)
            rise_support = sharp / max(mix_sharp, 1e-12)
            # Keep the viable previous selection as the solver's fallback.
            # New events need energy and a transient visible in the mix band.
            if not old and (amplitude < .005 or (share < .02 and rise_support < .25)):
                continue
            if name == 'level5RiverRhythm' and any(abs(attack - earlier) < .0001 for earlier in (39.563, 60.078, 64.804, 86.924, 127.975)):
                continue
            group.append({
                'attack': attack, 'time': round(local, 6), 'instrument': instrument, 'button': BUTTONS[instrument],
                'proposalAttack': hit['proposal'], 'source': 'isolated-drums', 'onsetContrast': round(hit['contrast'], 6),
                'onsetEdge': bool(hit.get('onsetEdge')), 'peakEdge': bool(hit.get('peakEdge', hit['edge'])),
                'drumRms': amplitude, 'drumEnergyShare': share, 'masterRiseSupport': rise_support, 'rise': sharp,
                'independentDifferenceMs': round((independent - attack) * 1000, 3),
            })
        if not group:
            continue
        amps = np.asarray([event['drumRms'] for event in group])
        rises = np.asarray([event['rise'] for event in group])
        for event in group:
            amp_rank = float(np.mean(amps <= event['drumRms']))
            rise_rank = float(np.mean(rises <= event['rise']))
            # Kick/snare anchor the groove, and exposed hats, cymbals and
            # percussion still outrank quieter accents within those bands.
            emphasis = .48 if instrument in ('kick', 'snare') else .06 if instrument == 'hat' else 0
            event['audibilityScore'] = (.72 * amp_rank + .75 * rise_rank + .75 * min(1, event['drumEnergyShare'] / .3)
                                         + .43 * min(1, event['masterRiseSupport'] / .6) + emphasis)
            quarter = (event['time'] - source['beatOffset']) / beat
            event['offbeat'] = abs(quarter - round(quarter)) >= .18
        result.extend(group)
    # Collapse repeated detector proposals of the same instrument/time while
    # retaining all distinct attacks and competing instrument labels.
    by_attack = {}
    for event in result:
        key = (event['attack'], event['instrument'])
        old = by_attack.get(key)
        if old is None or (attack_identity(event) in retained, event['onsetContrast']) > (attack_identity(old) in retained, old['onsetContrast']):
            by_attack[key] = event
    return sorted(by_attack.values(), key=lambda event: (event['time'], event['button']))


def select(name, source, candidates, mode):
    beat = 60 / source['bpm']
    unit = beat / 4
    offset = source['beatOffset']
    prior = [{**event, 'tail': row[2]} for event, row in zip(source['evidence'][mode], source[mode])]
    prior_by_key = {attack_identity(event): event for event in prior}
    phrase = lambda event: int((event['time'] - offset) // (beat * 8))
    counts = Counter(map(phrase, prior))
    candidate_ids = {attack_identity(event) for event in candidates}
    assert set(prior_by_key) <= candidate_ids, (name, mode, set(prior_by_key) - candidate_ids)
    eligible = [event for event in candidates if counts[phrase(event)]]
    slots = defaultdict(list)
    by_key = {}
    for index, event in enumerate(eligible):
        slots[phrase(event)].append(index)
        by_key[attack_identity(event)] = index
    fixed = {by_key[attack_identity(prior[0])]}
    hold_ends = {}
    for old in prior:
        index = by_key[attack_identity(old)]
        if old['tail'] > 0:
            fixed.add(index)
            hold_ends[index] = old['time'] + old['tail'] * unit
        if name == 'level5RiverRhythm' and any(abs(old['attack'] - attack) < .0001 for attack in RIVER_PINS):
            fixed.add(index)

    matrix_rows, columns, weights, lower, upper = [], [], [], [], []

    def limit(indices, minimum, maximum):
        if len(indices) <= maximum and minimum == 0:
            return
        matrix_rows.extend([len(lower)] * len(indices))
        columns.extend(indices)
        weights.extend([1] * len(indices))
        lower.append(minimum)
        upper.append(maximum)

    for key, target in counts.items():
        limit(slots[key], target, target)
    gap = .224 if mode == 'easy' else max(.224, min(.28, beat * .45))
    for i, event in enumerate(eligible):
        t = event['time']
        # Sliding cliques cover all pair gaps in far fewer rows than testing
        # every pair of candidate instruments individually.
        j = i + 1
        while j < len(eligible) and eligible[j]['time'] - t < gap - 1e-6:
            j += 1
        limit(list(range(i, j)), 0, 1)
        if mode == 'hard':
            repeated = [i]
            while j < len(eligible) and eligible[j]['time'] - t < .30 - 1e-6:
                j += 1
            repeated.extend(k for k in range(i + 1, j) if eligible[k]['button'] == event['button'])
            limit(repeated, 0, 1)
            while j < len(eligible) and eligible[j]['time'] - t < 1 - 1e-6:
                j += 1
            limit(list(range(i, j)), 0, 4)

    lo, hi = np.zeros(len(eligible)), np.ones(len(eligible))
    for index, release in hold_ends.items():
        for following in range(index + 1, len(eligible)):
            if eligible[following]['time'] >= release + .20 - 1e-6:
                break
            hi[following] = 0
    lo[list(fixed)] = 1
    assert np.all(lo <= hi), (name, mode, 'existing hold conflict')
    objective = []
    for i, event in enumerate(eligible):
        # Hard can use the sharper offbeat accents more often. No event is
        # quantized to its metrical position; offbeats are ranked by the mix.
        offbeat = (.26 if mode == 'hard' else .10) if event['offbeat'] else 0
        continuity = .09 if attack_identity(event) in prior_by_key else 0
        objective.append(-event['audibilityScore'] - offbeat - continuity + i * 1e-8)
    # Encourage button variety over a phrase without forcing weak attacks
    # into passages where one drum is carrying the musical pattern.
    excess_costs = []
    for key, target in counts.items():
        if target < 5:
            continue
        for button in BUTTONS.values():
            indices = [i for i in slots[key] if eligible[i]['button'] == button]
            ceiling = math.ceil(.70 * target)
            if len(indices) <= ceiling:
                continue
            slack = len(eligible) + len(excess_costs)
            limit(indices, 0, ceiling)
            matrix_rows.append(len(lower) - 1)
            columns.append(slack)
            weights.append(-1)
            excess_costs.append(1.15)
    slack_count = len(excess_costs)
    matrix = coo_matrix((weights, (matrix_rows, columns)),
                        shape=(len(lower), len(eligible) + slack_count)).tocsc()
    result = milp(objective + excess_costs, integrality=np.r_[np.ones(len(eligible)), np.zeros(slack_count)],
                  bounds=Bounds(np.r_[lo, np.zeros(slack_count)], np.r_[hi, np.full(slack_count, np.inf)]),
                  constraints=LinearConstraint(matrix, lower, upper), options={'mip_rel_gap': .0005})
    assert result.success, (name, mode, result.message)
    chosen = [(i, event) for i, event in enumerate(eligible) if result.x[i] > .5]
    assert Counter(phrase(event) for _, event in chosen) == counts
    assert len(chosen) == len(prior)

    rows, evidence = [], []
    for index, event in chosen:
        step = round((event['attack'] - source['audioStartSeconds'] - offset) / unit, 8)
        tail = prior_by_key[attack_identity(event)]['tail'] if index in hold_ends else 0
        rows.append([step, event['button'], tail])
        evidence.append({
            key: round(value, 6) if isinstance(value, float) and key in {'drumRms', 'drumEnergyShare', 'masterRiseSupport', 'audibilityScore'} else value
            for key, value in event.items() if key not in {'rise', 'offbeat'}
        })
    assert sum(bool(row[2]) for row in rows) == len(hold_ends)
    measured = {attack_identity(event): event for event in candidates}
    old_measured = [measured[attack_identity(event)] for event in prior]
    report = {
        'heads': len(rows), 'holds': len(hold_ends), 'phrases': len(counts),
        'changed': sum(attack_identity(event) not in prior_by_key for event in evidence),
        'instrumentsBefore': dict(Counter(event['instrument'] for event in prior)),
        'instrumentsAfter': dict(Counter(event['instrument'] for event in evidence)),
        'averageAudibilityBefore': round(float(np.mean([event['audibilityScore'] for event in old_measured])), 4),
        'averageAudibilityAfter': round(float(np.mean([event['audibilityScore'] for event in evidence])), 4),
        'offbeatsBefore': sum(event['offbeat'] for event in old_measured),
        'offbeatsAfter': sum(eligible[index]['offbeat'] for index, _ in chosen),
    }
    return {'rows': rows, 'evidence': evidence}, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--original-root', type=Path, required=True)
    parser.add_argument('--stems-root', type=Path, default=Path.home() / '.cache/bobby-drum-stems/htdemucs')
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--output', type=Path, default=ROOT / 'scripts/moth-groove-charts.json')
    parser.add_argument('--report', type=Path, default=ROOT / '.qa/moth/groove-20261114/selection.json')
    args = parser.parse_args()
    baseline = json.loads(CONFIG.read_text())
    transcription = json.loads(BASE.read_text())
    river = json.loads(RIVER.read_text())
    assert sha(CONFIG) == transcription['baselineSha256'] and sha(BASE) == river['sourceSha256']
    sources = {**transcription['songs'], 'level5RiverRhythm': river['song']}
    specs = {key: baseline[key] for key in sources if key in baseline}
    specs.update({level['id']: level['rhythm'] for level in baseline['secretLevels']})
    artifact = {'version': VERSION, 'selectionVersion': SELECTION, 'baseSha256': sha(BASE),
                'riverSha256': sha(RIVER), 'songs': {}}
    report = {}
    for name, source in sources.items():
        node = specs[name]
        filename = Path(node.get('audioSrc', baseline['audioSrc'])).stem
        master = args.original_root / 'songs/2026-09-28' / (filename + '.wav')
        stems = args.stems_root
        if name.startswith('secret-'):
            stems = args.original_root / '.qa/secret-levels/stems/htdemucs'
        elif name == 'level5StudioRhythm':
            stems = args.original_root / '.qa/studio-chapter/stems/htdemucs'
        stem = stems / filename / 'drums.wav'
        measured = json.loads((CACHE / f'{name}-measured.json').read_text())
        for identity, file in [('master', master), ('stem', stem)]:
            assert sha(file) == measured['hashes'][identity] == source['hashes'][identity], (name, identity)
        assert measured['refinementVersion'] == transcription['refinementVersion'] == drums.REFINEMENT_VERSION
        candidates = candidate_attacks(name, source, source.get('duration', node['duration']), measured,
                                       drums.decode(stem, args.ffmpeg), drums.decode(master, args.ffmpeg))
        artifact['songs'][name] = {}
        report[name] = {}
        for mode in ('easy', 'hard'):
            artifact['songs'][name][mode], report[name][mode] = select(name, source, candidates, mode)
        print(name, json.dumps(report[name], ensure_ascii=False), flush=True)
    args.output.write_text(json.dumps(artifact, ensure_ascii=False, separators=(',', ':')) + '\n')
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
