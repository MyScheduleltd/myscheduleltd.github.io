"""Makes the menu sounds in moth-asset-additions/ from the owner's originals.

usage: python3 scripts/make-menu-sfx.py <folder with the two Epidemic Sound files>

Each original (96 kHz, 24-bit stereo) becomes a 44.1 kHz mono 16-bit WAV
like the fights' sounds, peaking at -1 dBFS. The owner asked for them as loud
as the M/O/T/H button sounds (2026-10-14), measured by their loudest 50 ms,
ear-weighted (ITU-R BS.1770). The click gets there with its first spike
trimmed 6 dB by a look-ahead limiter. The tick is a single 10 ms burst whose
samples are all near its peak, so trimming it only lowers the whole tick: it
stays clean, as loud as its peak allows. Writes the files and prints their
loudness; update moth-asset-additions/manifest.json from the new hashes.
Needs numpy and ffmpeg.
"""
import os
import subprocess
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'moth-asset-additions/assets/sfx/menu')
SOUNDS = {
    'menu-tick.wav': ('ES_Mechanical, Click, Tick, Fast, Loopable, Clocks 01 - Epidemic Sound - 0000-0134.wav', 0.0),
    'menu-click.wav': ('ES_User Interface, Click, Button, Press, Click, Video Game, Variations - Epidemic Sound - 0000-0101.wav', 6.0),
}
CEILING = 10 ** (-1 / 20)


def load(path, rate=44100, args=()):
    command = ['ffmpeg', '-v', 'error', '-i', path, *args, '-f', 'f64le', '-ac', '1', '-ar', str(rate), '-']
    return np.frombuffer(subprocess.run(command, capture_output=True, check=True).stdout, dtype='<f8')


def limit(x):
    """Look-ahead peak limiter: 1.5 ms either side, 3 ms smoothing."""
    reach = 66
    envelope = np.array([np.abs(x[max(0, i - reach):i + reach + 1]).max() for i in range(len(x))])
    gain = np.minimum(1.0, CEILING / np.maximum(envelope, 1e-12))
    return x * np.minimum(gain, np.convolve(gain, np.ones(133) / 133, mode='same'))


def biquad(b, a, x):
    y = np.zeros_like(x)
    x1 = x2 = y1 = y2 = 0.0
    for i, v in enumerate(x):
        out = b[0] * v + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2
        x2, x1, y2, y1 = x1, v, y1, out
        y[i] = out
    return y


def loudness(path):
    """Loudest 50 ms, K-weighted (BS.1770 filters at 48 kHz), in LUFS."""
    x = np.concatenate([load(path, 48000), np.zeros(4800)])
    y = biquad([1.0, -2.0, 1.0], [1, -1.99004745483398, 0.99007225036621],
               biquad([1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585], x))
    n = 2400
    energy = np.cumsum(np.concatenate([[0], y ** 2]))
    return -0.691 + 10 * np.log10(((energy[n:] - energy[:-n]) / n).max())


def main(source):
    os.makedirs(OUT, exist_ok=True)
    for name, (original, trim_db) in SOUNDS.items():
        x = load(os.path.join(source, original), args=['-af', 'aresample=44100:filter_size=64:phase_shift=10:cutoff=0.97'])
        x = x / np.abs(x).max() * CEILING
        if trim_db:
            x = limit(x * 10 ** (trim_db / 20))
        pcm = np.clip(np.round(x * 32767), -32768, 32767).astype('<i2').tobytes()
        target = os.path.join(OUT, name)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', '44100', '-ac', '1', '-i', '-', '-c:a', 'pcm_s16le', target],
                       input=pcm, check=True)
        print(name, round(loudness(target), 1), 'LUFS')
    buttons = [loudness(os.path.join(ROOT, f'docs/moth/assets/sfx/player-feedback/button-{b}.wav')) for b in 'moth']
    print('M/O/T/H buttons', round(float(np.mean(buttons)), 1), 'LUFS')


if __name__ == '__main__':
    main(sys.argv[1])
