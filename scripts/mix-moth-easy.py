#!/usr/bin/env python3
"""Bake single-stream Easy mixes without shifting the chart clock.

Use the measured mapping from the supplied drum stems to the game's songs.
Keep each arrangement's original PCM length and closing fade. Export the
revised full-mix Story cuts alongside their Easy counterparts. Easy output
already includes the regular gameplay music gain.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import importlib.util
import json
from pathlib import Path
import subprocess

import numpy as np
from scipy.signal import butter, sosfiltfilt

module = importlib.util.spec_from_file_location('moth_audition', Path(__file__).with_name('audition-moth-funk.py'))
audition = importlib.util.module_from_spec(module)
module.loader.exec_module(audition)
author, RATE = audition.author, audition.RATE
DRUM_GAIN_DB = 5
MUSIC_GAIN = .50
ASSET_DIR = Path('assets/audio/easy-mixes')


def estimate_kit_gain(mix, drums):
    filt = butter(3, (40, 4000), btype='bandpass', fs=RATE, output='sos')
    song = sosfiltfilt(filt, mix.mean(axis=1))
    kit = sosfiltfilt(filt, drums.mean(axis=1))
    fits = []
    for start in range(0, len(song)-RATE, RATE):
        m, d = song[start:start+RATE], kit[start:start+RATE]
        energy = np.dot(d, d)
        if energy < RATE*.01**2:
            continue
        shared = np.dot(m, d)
        if shared >= .30*np.sqrt(np.dot(m, m)*energy):
            fits.append(shared/energy)
    assert len(fits) >= 8, 'Expected multiple aligned drum passages'
    return float(np.median(fits))


def write_mix(path, base, drums, added_gain):
    pcm = (MUSIC_GAIN*(base + added_gain*drums)).astype('<f4',copy=False).tobytes()
    path.parent.mkdir(parents=True, exist_ok=True)
    # AAC can create small peaks above the PCM limiter. Check the delivered
    # waveform and lower only the limiter ceiling when a file needs room.
    ceiling = .80
    for _ in range(5):
        subprocess.run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y','-f','f32le',
                        '-ar',str(RATE),'-ac','2','-i','-',
                        '-af',f'alimiter=limit={ceiling:.5f}:attack=5:release=45:level=false:latency=1',
                        '-c:a','aac','-aac_tns','0','-aac_pns','0','-b:a','128k','-movflags','+faststart',str(path)],
                       input=pcm,check=True)
        recovered = author.decode(path,rate=RATE,stereo=True)
        assert len(recovered) == len(base), (path, len(base), len(recovered))
        peak = float(np.max(np.abs(recovered)))
        if peak <= .97:
            return
        ceiling *= .92/peak
    raise ValueError(f'{path} still has decoded peaks above the target')


def write_story_cut(path, segment):
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(RATE),
                    '-ac', '2', '-i', '-', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(path)],
                   input=segment.astype('<f4', copy=False).tobytes(), check=True)
    assert len(author.decode(path, rate=RATE, stereo=True)) == len(segment), path


def build_song(identity, config, analysis, stems, out, story_only):
    prefix, filename, *_ = author.SONGS[identity]
    source = 'songs/2026-09-28/' + filename + '.m4a'
    spec = next(spec for spec in config['stageSelectRhythms'].values() if spec['audioSrc'] == source)
    theme = spec['theme']
    story = config.get(identity, {})
    cut = story.get('fightCut')
    revised = bool(cut and cut['src'].endswith('-onset.m4a'))
    if story_only and not revised:
        return
    full = author.decode(author.ROOT/'docs/moth'/source,rate=RATE,stereo=True)
    drum_path = author.stem_path(stems,prefix,'Drums')
    evidence = analysis[identity]
    drums = audition.aligned_stem(drum_path,evidence['drumSha256'],evidence['drumAlignment'],len(full))
    kit_gain = estimate_kit_gain(full, drums)
    added_gain = kit_gain*(10**(DRUM_GAIN_DB/20)-1)
    if not story_only:
        write_mix(out/ASSET_DIR/f'{theme}.m4a',full,drums,added_gain)

    if cut:
        fade_out = round(cut['fadeSeconds'] * RATE)
        fade_in = round((story['fadeInSeconds'] if revised else cut['fadeSeconds']) * RATE)
        start = round(cut['fromSeconds']*RATE)
        if revised:
            original = author.ROOT/'.qa/moth/published'/cut['src'].replace('-onset.m4a', '.m4a')
            base = author.decode(original, rate=RATE, stereo=True).copy()
            # Replace only the old two-second intro. Blend back into the
            # verified cut on the same samples, keeping its original ending.
            blend = round(.10 * RATE)
            lead = full[start:start+fade_out+blend]
            assert len(lead) == fade_out + blend, (identity, 'full mix covers intro')
            base[:fade_out] = lead[:fade_out]
            region = slice(fade_out, fade_out+blend)
            weight = np.linspace(0, 1, blend, dtype=np.float32)[:, None]
            base[region] = weight * base[region] + (1 - weight) * lead[region]
        else:
            base = author.decode(author.ROOT/'docs/moth'/cut['src'],rate=RATE,stereo=True)
        segment = drums[start:start+len(base)].copy()
        assert len(segment) == len(base), (identity, 'drum stem covers cut')
        opening = np.linspace(0, 1, fade_in, dtype=np.float32)[:, None]
        if revised:
            opening = np.sin(opening * np.pi / 2)
        closing = np.linspace(1, 0, fade_out, dtype=np.float32)[:, None]
        segment[:fade_in] *= opening
        segment[-fade_out:] *= closing
        if revised:
            base[:fade_in] *= opening
            write_story_cut(out/cut['src'], base)
        write_mix(out/ASSET_DIR/f'{theme}-story.m4a',base,segment,added_gain)
    print(identity, 'fitted kit gain', round(kit_gain,3), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stems', type=Path, required=True)
    parser.add_argument('--analysis', type=Path, required=True, help='Chart authoring report on the current song clock')
    parser.add_argument('--config', type=Path, default=author.ROOT/'docs/moth/data/level1.json')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--story-openings-only', action='store_true', help='Rebuild just Story cuts with the revised opening fades')
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    analysis = json.loads(args.analysis.read_text())
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda identity: build_song(identity,config,analysis,args.stems,args.output,args.story_openings_only),author.SONGS))


if __name__ == '__main__':
    main()
