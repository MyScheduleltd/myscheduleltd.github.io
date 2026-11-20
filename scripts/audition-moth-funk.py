#!/usr/bin/env python3
"""Export local review mixes for the authored Beauty Boy charts.

Easy clicks over the isolated drums and Hard clicks over the isolated lead
vocal. The isolated bass is heard during charted bass passages. The stems
and listening exports stay outside the game package.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from html import escape
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

import numpy as np

spec = importlib.util.spec_from_file_location('moth_funk', Path(__file__).with_name('author-moth-funk.py'))
author = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = author
spec.loader.exec_module(author)

RATE = 44100


def clicks(button, downbeat=False):
    time = np.arange(round(RATE*.035)) / RATE
    frequency = dict(zip('MOTH', (1600,1150,850,620)))[button]
    if downbeat:
        frequency *= .82
    sine = np.sin(2*np.pi*frequency*time) + .18*np.sin(4*np.pi*frequency*time)
    gain = .25 if downbeat else .18
    return gain*sine*np.minimum(1,time/.0014)*np.exp(-time/.007)


def write_mix(path, audio, events):
    audio = np.asarray(audio, dtype=np.float32).copy()
    peak = np.max(np.abs(audio))
    audio *= .60 / max(peak,.60)
    for event in events:
        tone = clicks(event['button'],event['role']=='downbeat')
        markers = [(event['time'], tone)]
        if 'holdEnd' in event:
            markers.append((event['holdEnd'], .60*clicks(event['button'], downbeat=True)))
        for time, wave in markers:
            start = round(time*RATE)
            n = min(len(wave),len(audio)-start)
            assert 0 <= start < len(audio)
            audio[start:start+n] += wave[:n,None]
    subprocess.run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y','-f','f32le',
                    '-ar',str(RATE),'-ac','2','-i','-','-c:a','aac','-b:a','112k',str(path)],
                   input=audio.astype('<f4',copy=False).tobytes(),check=True)


def aligned_stem(path, expected_hash, alignment, frames):
    if author.digest(path) != expected_hash:
        raise ValueError(f'{path} differs from the analyzed stem')
    stem = author.decode(path,rate=RATE,stereo=True)
    slope = alignment['driftMsPerMinute']/60000
    offset = alignment['offsetMs']*RATE/1000
    positions = (np.arange(frames)-offset)/(1+slope)
    source_frames = np.arange(len(stem))
    result = np.empty((frames,2), dtype=np.float32)
    for index, channel in enumerate(stem.T):
        result[:,index] = np.interp(positions,source_frames,channel,left=0,right=0)
    return result


def add_bass_windows(primary, bass, windows):
    previous_end = 0
    for begin, finish in windows:
        start, end = round(begin*RATE), round(finish*RATE)
        if not previous_end <= start < end <= len(primary):
            raise ValueError(f'Invalid or overlapping bass window: {begin}–{finish}')
        previous_end = end
        fade = min(round(.008*RATE), (end-start)//2)
        section = primary[start:end]
        if not fade:
            section += bass[start:end]
            continue
        ramp = np.linspace(0,1,fade,dtype=np.float32)[:,None]
        section[:fade] += bass[start:start+fade]*ramp
        section[fade:-fade] += bass[start+fade:end-fade]
        section[-fade:] += bass[end-fade:end]*ramp[::-1]


def render(identity, score, report, stems, bass_directory, out):
    prefix, label, *_ = author.SONGS[identity]
    mix_path = author.ROOT/'docs/moth'/score['audioSrc']
    assert author.digest(mix_path) == score['mixSha256']
    frames = round(score['duration']*RATE)
    windows_by_mode = report.get('bassWindows', {})
    bass = None
    if any(windows_by_mode.values()):
        if report['bassSource'] == 'separated':
            if bass_directory is None:
                raise ValueError('Provide --bass-directory for the separated bass WAVs')
            bass_path = bass_directory/f'{identity}.wav'
        else:
            bass_path = author.stem_path(stems,prefix,'Bass')
        bass = aligned_stem(bass_path,report['bassSha256'],report['bassAlignment'],frames)

    players = []
    for mode, role, report_key, title in [
        ('easy','Drums','drum','Easy · isolated drums'),
        ('hard','Vocals','vocal','Hard · isolated lead vocal')
    ]:
        stem_path = author.stem_path(stems,prefix,role)
        clip = aligned_stem(stem_path,report[report_key+'Sha256'],report[report_key+'Alignment'],frames)
        notes = report[mode]
        assert score[mode] == [author.chart_row(event) for event in notes]
        windows = windows_by_mode.get(mode, [])
        for event in notes:
            if event['source'] == 'bass-stem' and not any(
                begin <= event['time'] <= event.get('holdEnd',event['time']) <= end
                for begin,end in windows
            ):
                raise ValueError(f'{identity} {mode}: bass note outside its audition window')
        if windows:
            add_bass_windows(clip,bass,windows)
            title += ' + bass passages'
        filename = f'{identity}-{mode}.m4a'
        write_mix(out/filename,clip,notes)
        players.append(f'<label>{title}<audio controls preload="metadata" src="{filename}"></audio></label>')
    print(identity, len(score['easy']),len(score['hard']),flush=True)
    title = escape(label.split(' - ',1)[-1])
    return f"<section><h2>{title}</h2>{''.join(players)}</section>"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stems', required=True, type=Path)
    parser.add_argument('--bass-directory', type=Path, help='Directory containing separated bass WAVs')
    parser.add_argument('--charts', default=author.ROOT/'scripts/moth-funk-charts.json', type=Path)
    parser.add_argument('--report', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    result = json.loads(args.charts.read_text())
    evidence = json.loads(args.report.read_text())
    args.output.mkdir(parents=True,exist_ok=True)
    with ThreadPoolExecutor(max_workers=2) as pool:
        sections = pool.map(lambda name: render(name,result['songs'][name],evidence[name],args.stems,
                                                args.bass_directory,args.output), author.SONGS)
        page = ''.join(sections)
    (args.output/'index.html').write_text('''<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Beauty Boy chart review</title>
<style>
:root{color-scheme:dark;background:#191713;color:#f0e7cf;font:1rem/1.5 system-ui}
main{max-width:45rem;margin:2rem auto;padding:0 1.25rem 2rem}
h2{font-size:1.15rem;color:#f0c572}
section{border-block-start:1px solid #5a503a;margin-block:1.5rem}
label{display:block;margin:.75rem 0}audio{display:block;width:100%;margin:.25rem 0}
</style>
<main><h1>Beauty Boy chart review</h1>
<p>In Easy, listen for the drum hits and how fills lead back to the downbeat.
In Hard, listen for the starts of the singer's syllables. During charted bass passages, follow the bass attacks and the softer clicks marking hold releases.</p>
''' + page + '''</main>
<script>
document.addEventListener('play', (event) => {
  document.querySelectorAll('audio').forEach(audio => { if (audio !== event.target) audio.pause(); });
}, true);
</script>
''')


if __name__ == '__main__':
    main()
