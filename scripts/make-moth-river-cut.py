#!/usr/bin/env python3
"""Build Level 6 from verse 1 through chorus 2 and rebase measured drum rows.

The master and immutable full-song transcription remain untouched. Requires
ffmpeg and the audio-analysis Python environment (numpy). Regenerate after a
new transcription; the descriptor records the input hash and codec checks.
"""
import argparse
import hashlib
import importlib.util
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('analysis', ROOT/'scripts/analyze-moth-drums.py')
analysis = importlib.util.module_from_spec(spec)
spec.loader.exec_module(analysis)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--master', type=Path, required=True)
    ap.add_argument('--ffmpeg', default='ffmpeg')
    ap.add_argument('--start', type=float, default=10., help='Original-master verse 1 start (owner: about 00:10)')
    ap.add_argument('--end', type=float, default=164., help='Original-master chorus 2 end (owner: about 02:44)')
    args = ap.parse_args()
    baseline_path = ROOT/'scripts/moth-drum-charts.json'
    baseline = json.loads(baseline_path.read_text())
    groove_path = ROOT/'scripts/moth-river-groove.json'
    groove = json.loads(groove_path.read_text())
    assert groove['baselineSha256'] == digest(baseline_path), 'Audible river groove authored from the current source chart'
    assert args.start >= groove['window']['start'] and args.end <= groove['window']['end'], 'Requested cut is inside the audited musical window'
    source = groove['song']
    assert digest(args.master) == source['hashes']['master'], 'Original measured master required'
    unit = 60/source['bpm']/4
    start, end = args.start, args.end
    assert 0 <= start < end, 'Increasing master section bounds required'
    # The owner's section bounds supersede the earlier arbitrary 90-second
    # window. Keep the final fade inside chorus 2, never play into the bridge.
    fade = .35
    duration = end-start-fade
    # Strong snare backbeats establish this source quarter phase. The old
    # authored offset was half a quarter away; change the visual pulse grid,
    # while retaining every measured drum time. This is a pickup, not a
    # claimed verified bar/downbeat boundary.
    source_quarter_phase = .0893
    offset = (source_quarter_phase-start) % (60/source['bpm'])
    audio_path = 'assets/audio/fight-cuts/level6-river-verse1-chorus2.m4a'
    output = ROOT/'moth-asset-additions'/audio_path
    output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([args.ffmpeg, '-y', '-v', 'error', '-i', str(args.master), '-af',
                    f'atrim=start={start:.12f}:end={end:.12f},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.08,afade=t=out:st={duration:.12f}:d={fade}',
                    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(output)], check=True)
    checks = analysis.alignment(analysis.drums.decode(args.master, args.ffmpeg),
                                analysis.drums.decode(output, args.ffmpeg), start)
    entry = {**source, 'beatOffset': offset, 'audioStartSeconds': start, 'duration': duration,
             'fullSong': False, 'fadeInSeconds': .08,
             'fightCut': {'src': audio_path, 'fromSeconds': start, 'toSeconds': end, 'fadeSeconds': fade,
                          'sectionStart': 'verse-1', 'sectionEnd': 'chorus-2',
                          'song': 'songs/2026-09-28/6 - 更年期 ft. 手天使 & 謝乾.m4a'},
             'hashes': {**source['hashes'], 'playing': digest(output)}, 'alignment': checks,
             'restSections': [[max(0,lo-start), min(duration,hi-start)] for lo,hi in source['restSections']
                              if hi > start and lo < start+duration], 'evidence': {}}
    for mode in ['easy', 'hard']:
        rows, evidence = [], []
        for row, attack in zip(source[mode], source['evidence'][mode]):
            t = attack['attack']-start
            if not 0 <= t < duration-.5:
                continue
            hold = row[2] if t+row[2]*unit < duration-.25 else 0
            rows.append([round((t-offset)/unit, 8), row[1], hold])
            evidence.append({**attack, 'time': round(t, 6),
                             'errorMs': round(abs(offset+rows[-1][0]*unit-t)*1000, 6)})
        entry[mode], entry['evidence'][mode] = rows, evidence
        assert 0 <= evidence[0]['time'] < duration, 'A real drum starts the chart, without invented vocal hits'
    beat = 60/source['bpm']
    # Three game rounds still span the excerpt. Their transitions follow the
    # measured quarter pulse; these are not claims about verse/chorus labels.
    entry['phaseBoundaries'] = [0] + [source_quarter_phase + round((start+duration*f-source_quarter_phase)/beat)*beat-start
                                             for f in [1/3, 2/3]] + [duration]
    entry['quarterGrid'] = {'sourcePhaseSeconds': source_quarter_phase,
                            'basis': 'Strong snare backbeat; 61/64 attacks within 40 ms of the 76 BPM two-beat grid. Quarter phase only; bar/downbeat not asserted.'}
    descriptor = {'version': 'drums-readable-20261105b', 'sourceSha256': digest(baseline_path), 'grooveSha256': digest(groove_path),
                  'method': 'Owner-confirmed verse 1 through chorus 2 (master 00:10–02:44). Clear recorded drum attacks selected without a straight-grid gate, then rebased with their microtiming intact. Final fade stays inside the requested section; no invented notes during the drumless verse opening.',
                  'song': entry}
    (ROOT/'scripts/moth-river-cut.json').write_text(json.dumps(descriptor, ensure_ascii=False, separators=(',', ':'))+'\n')
    manifest_path = ROOT/'moth-asset-additions/manifest.json'
    manifest = json.loads(manifest_path.read_text())
    manifest['files'].pop('assets/audio/fight-cuts/level6-river-short.m4a', None)
    manifest['files'][audio_path] = {'sha256': digest(output), 'bytes': output.stat().st_size,
                                    'source': args.master.name + f'; verse 1 through chorus 2, original master {start:.3f}–{end:.3f} seconds',
                                    'use': 'Level 6 river fight: verse 1 through the end of chorus 2, as requested by the owner',
                                    'mirrorCommit': None}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'start': start, 'duration': duration, 'withFade': duration+fade,
                       'heads': {mode: len(entry[mode]) for mode in ['easy', 'hard']},
                       'first': {mode: entry['evidence'][mode][0]['time'] for mode in ['easy', 'hard']},
                       'alignment': checks}, ensure_ascii=False))


if __name__ == '__main__':
    main()
