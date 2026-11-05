"""Waveform measurement helpers for analyze-moth-drums.py.

Ported from this game's original drum_hits.py. NMF uses kick, snare,
hi-hat and broad percussion templates, then refines their detected transients
on band-filtered isolated drums at one-millisecond resolution. These labels
are automatic estimates; source separation and classification can contain
leakage. Tempo, cut alignment and chart playability are audited separately.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import numpy as np

REFINEMENT_VERSION = "energy-boundary-v2"
RATE = 44100
N_FFT, HOP = 2048, 256
FPS = RATE / HOP
CLASSES = ("kick", "snare", "hat", "other")


def decode(path: Path, ffmpeg: str) -> np.ndarray:
    raw = subprocess.run(
        [ffmpeg, "-v", "quiet", "-i", str(path), "-ac", "1", "-ar", str(RATE), "-f", "f32le", "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def band(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / RATE)
    gain = 1 / (1 + (lo / np.maximum(f, 1)) ** 8) / (1 + (f / hi) ** 8)
    return np.fft.irfft(spec * gain, len(x))


def spectrogram(x: np.ndarray) -> np.ndarray:
    win = np.hanning(N_FFT).astype(np.float32)
    count = 1 + (len(x) - N_FFT) // HOP
    out = np.empty((N_FFT // 2 + 1, count), np.float32)
    for start in range(0, count, 2048):
        stop = min(count, start + 2048)
        frames = np.stack([x[i * HOP:i * HOP + N_FFT] * win for i in range(start, stop)])
        out[:, start:stop] = np.abs(np.fft.rfft(frames, axis=1)).T
    return out


def templates(freqs: np.ndarray) -> np.ndarray:
    def bump(lo: float, hi: float) -> np.ndarray:
        centre = np.log(np.sqrt(lo * hi))
        width = np.log(hi / lo) / 2.5
        return np.exp(-0.5 * ((np.log(np.maximum(freqs, 20)) - centre) / width) ** 2) + 1e-3

    kick = bump(40, 110) + 0.05 * bump(2000, 5000)
    snare = 0.6 * bump(150, 350) + bump(1200, 5000) + 0.3 * bump(5000, 9000)
    hat = bump(7000, 15000) + 0.15 * bump(3000, 6000)
    other = np.ones_like(freqs)
    return np.stack([kick, snare, hat, other], axis=1).astype(np.float32)


def nmf(V: np.ndarray, W0: np.ndarray, iters: int = 80) -> np.ndarray:
    prior = W0 / W0.sum(axis=0, keepdims=True)
    W = prior.copy()
    H = np.full((W.shape[1], V.shape[1]), V.mean(), np.float32)
    eps = 1e-9
    for it in range(iters):
        H *= (W.T @ (V / (W @ H + eps))) / (W.sum(axis=0)[:, None] + eps)
        if it >= 20:
            Wn = W * ((V / (W @ H + eps)) @ H.T) / (H.sum(axis=1)[None, :] + eps)
            # Adapt to the song, but stay near the prior so a kick stays a kick.
            W = 0.7 * Wn / Wn.sum(axis=0, keepdims=True) + 0.3 * prior
    return H


def peaks(activation: np.ndarray, floor: float = 0.08, min_gap: float = 0.09) -> list[tuple[float, float]]:
    a = activation / (np.percentile(activation, 99.5) + 1e-9)
    log_a = np.log1p(a * 20)
    novelty = np.convolve(np.maximum(np.diff(log_a, prepend=log_a[0]), 0), [0.25, 0.5, 0.25], mode="same")
    gap = int(min_gap * FPS)
    out, last = [], -gap
    for i in range(2, len(novelty) - 2):
        if novelty[i] >= novelty[i - 1] and novelty[i] > novelty[i + 1] and novelty[i] > 0.35 and a[i:i + 6].max() > floor:
            if i - last >= gap:
                out.append((i * HOP / RATE + N_FFT / 2 / RATE, float(a[i:i + 6].max())))
                last = i
    return out


def envelope_ms(x: np.ndarray) -> np.ndarray:
    """RMS over 2 ms, sampled at every exact millisecond."""
    power = np.convolve(x.astype(np.float64) ** 2, np.ones(88) / 88, mode="same")
    idx = (np.arange(int(len(x) / RATE * 1000)) * RATE / 1000).astype(int)
    return np.sqrt(power[np.clip(idx, 0, len(power) - 1)])


def refine_details(hits: list[tuple[float, float]], env: np.ndarray) -> list[dict]:
    """Locate the significant amplitude boundary of each proposed drum hit.

    A logarithmic derivative gives a near-silent pre-echo as much weight as
    the drum itself. In the old detector that could select low-frequency
    filter ringing tens of milliseconds before a kick. Find the local drum
    energy peak instead, then backtrack to 10% of its rise above the local
    floor. A 7 ms triangular envelope suppresses individual bass cycles;
    the reported time is the beginning of the rise, never its energy peak.

    NMF still proposes the instrument and approximate region. This is onset
    measurement, not grid quantization: syncopation and swing stay intact.
    The diagnostic contrast/edge fields let the independent audit flag
    uncertain proposals instead of treating a computed time as proof.
    """
    smooth = np.convolve(env, np.array([1, 2, 3, 4, 3, 2, 1]) / 16, mode="same")
    out = []
    for t, strength in hits:
        centre = int(round(t * 1000))
        lo, hi = max(1, centre - 45), min(len(smooth) - 1, centre + 45)
        if hi <= lo:
            continue
        peak = lo + int(np.argmax(smooth[lo:hi + 1]))
        leading = smooth[lo:max(lo + 1, peak)]
        floor = float(np.percentile(leading, 10))
        height = float(smooth[peak])
        threshold = floor + 0.1 * max(0, height - floor)
        onset = peak
        while onset > lo and smooth[onset - 1] > threshold:
            onset -= 1
        out.append({"time": onset / 1000.0, "strength": strength,
                    "proposal": t, "peak": peak / 1000.0,
                    "contrast": (height - floor) / max(height, 1e-12),
                    "onsetEdge": onset <= lo + 1, "peakEdge": peak >= hi - 1,
                    "edge": onset <= lo + 1 or peak >= hi - 1})
    return out


def refine(hits: list[tuple[float, float]], env: np.ndarray) -> list[tuple[float, float]]:
    return [(a["time"], a["strength"]) for a in refine_details(hits, env)]
