#!/usr/bin/env python3
"""Bake the key-fringe cleanup into M.O.T.H's sprite files.

Many of the release's sprites were cut from a magenta background, which left
a purple fringe on their outer edge (owner, 2026-10-13). For each sprite in
moth-asset-patches/key-fringe.json (approved by the owner from a before/after
review; level 3's notes left out) this writes a cleaned copy, losslessly, to
moth-asset-patches/<same path>, and records it in manifest.json with the
release file's hash. build-moth.mjs publishes the copies in place of the
release files; verify-moth-package.mjs checks both hashes.

Only a sprite's 2 px outer edge changes: a magenta-tinted edge pixel takes the
hue of the solid colours within 3 px, at its own brightness, so a dark outline
stays dark. Edges beside genuinely pink or purple art inside the sprite are
left alone, and translucent leftovers with nothing solid nearby are cleared.

usage: python3 scripts/bake-key-fringe.py   (reads .qa/moth/published)
"""
import hashlib, json
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RELEASE = ROOT / '.qa/moth/published'
OUT = ROOT / 'moth-asset-patches'

def box(mask, r):
    p = np.pad(mask.astype(np.int64), r)
    c = np.pad(np.cumsum(np.cumsum(p, 0), 1), ((1, 0), (1, 0)))
    k = 2 * r + 1
    return c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]

def clean(image):
    a = np.array(image.convert('RGBA'))
    rgb, al = a[..., :3].astype(np.float64), a[..., 3].astype(int)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    tint = (r - g > 40) & (b - g > 25)
    border = (al > 0) & (box(al == 0, 2) > 0)
    inner = (al >= 250) & ~border
    pink_inside = box(inner & tint, 3) > 0
    ok = inner & ~tint
    n_ok = box(ok, 3)
    avg = np.stack([box(np.where(ok, rgb[..., c], 0), 3) for c in range(3)], -1) / np.maximum(n_ok, 1)[..., None]
    lum = lambda c: 0.299 * c[..., 0] + 0.587 * c[..., 1] + 0.114 * c[..., 2]
    fix = border & tint & ~pink_inside & (n_ok > 0)
    scale = (lum(rgb) / np.maximum(lum(avg), 1))[..., None]
    out = a.copy()
    out[..., :3][fix] = np.clip(np.round(avg * scale), 0, 255).astype(np.uint8)[fix]
    stray = border & tint & ~pink_inside & (n_ok == 0) & (al < 160) & (box(al >= 250, 2) == 0)
    out[..., 3][stray] = 0
    return Image.fromarray(out), int(fix.sum() + stray.sum())

sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
files = {}
for rel in json.loads((OUT / 'key-fringe.json').read_text()):
    source = RELEASE / rel
    cleaned, changed = clean(Image.open(source))
    target = OUT / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    cleaned.save(target, 'WEBP', lossless=True, quality=100, method=6, exact=True)
    files[rel] = {'release': sha(source), 'sha256': sha(target), 'pixelsCleaned': changed,
                  'bytes': [source.stat().st_size, target.stat().st_size]}
    print(f"{changed:6d} px  {source.stat().st_size // 1024:5d} -> {target.stat().st_size // 1024:5d} KB  {rel}")
(OUT / 'manifest.json').write_text(json.dumps({'files': files}, indent=1, ensure_ascii=False) + '\n')
before = sum(v['bytes'][0] for v in files.values()); after = sum(v['bytes'][1] for v in files.values())
print(len(files), 'sprites,', round(before / 1e6, 2), '->', round(after / 1e6, 2), 'MB')
