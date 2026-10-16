"""Makes the deck's M/O/T/H button sheet in the Super Famicom pad's colours.

usage: python3 scripts/make-moth-buttons.py

The owner asked for the buttons in the Super Famicom controller's colours
(2026-10-17): M blue, O red, T yellow, H green. This repaints the release's
sheet (columns M, O, T, H; a resting row over a pressed one), whose buttons are
grey with a red base: each grey shade takes the button's colour at the same
lightness, and the base a darker shade of it, so every button is one colour
of plastic. The dark outline is left alone, and the letters stay
cream, apart from T's, which is ink so that it reads on yellow; the green
glint becomes white. The colours are
MOTH_NOTE_COLOURS in scripts/moth-fight-hud.mjs, the notes' own.

Writes moth-asset-additions/assets/ui/mobile_moth_buttons_20261017/sheet.webp
(lossless) and prints its hash; update moth-asset-additions/manifest.json from
it. Needs numpy and Pillow.
"""
import hashlib
import json
import os
import re

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = 'assets/ui/mobile_moth_buttons_20261002/sheet.webp'
OUT = 'assets/ui/mobile_moth_buttons_20261017/sheet.webp'
INK = (42, 34, 16)


def note_colours():
    text = open(os.path.join(ROOT, 'scripts/moth-fight-hud.mjs'), encoding='utf8').read()
    table = re.search(r'export const MOTH_NOTE_COLOURS = (\{[^}]*\});', text).group(1)
    return json.loads(re.sub(r'(\w):', r'"\1":', table))


def hex_rgb(value):
    return np.array([int(value[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float64)


def main():
    source = os.path.join(ROOT, '.qa/moth/published', SOURCE)
    snapshot = json.load(open(os.path.join(ROOT, '.qa/moth/published-snapshot.json'), encoding='utf8'))
    release = next(f['sha256'] for f in snapshot['files'] if f['path'] == SOURCE)
    assert hashlib.sha256(open(source, 'rb').read()).hexdigest() == release, 'the release sheet'
    colours = note_colours()
    image = np.asarray(Image.open(source).convert('RGBA')).astype(np.float64)
    rgb, alpha = image[..., :3], image[..., 3]
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    spread = rgb.max(axis=-1) - rgb.min(axis=-1)
    hue = np.zeros_like(luma)
    ok = spread > 0
    maxc = rgb.max(axis=-1)
    hr = np.where(maxc == r, ((g - b) / np.where(ok, spread, 1)) % 6, 0)
    hg = np.where(maxc == g, (b - r) / np.where(ok, spread, 1) + 2, 0)
    hb = np.where(maxc == b, (r - g) / np.where(ok, spread, 1) + 4, 0)
    hue = np.where(maxc == r, hr, np.where(maxc == g, hg, hb)) * 60
    shown = alpha >= 10
    # The outline: the darkest shades along the edge of each button. Dark
    # shades further in are the body's shadows and take its colour.
    edge = ~shown
    for _ in range(10):
        grown = edge.copy()
        grown[1:] |= edge[:-1]; grown[:-1] |= edge[1:]
        grown[:, 1:] |= edge[:, :-1]; grown[:, :-1] |= edge[:, 1:]
        edge = grown
    outline = (luma < 0.17) & edge
    warm = shown & ~outline & (spread > 34) & ((hue < 50) | (hue > 340))
    letter = warm & (luma >= 0.72)
    base = warm & ~letter
    glint = shown & (spread > 34) & (hue >= 90) & (hue <= 200) & (luma >= 0.45)
    grey = shown & ~outline & ~warm & ~glint & (luma <= 0.8)
    face = (0.2126 * 56 + 0.7152 * 61 + 0.0722 * 59) / 255
    base_level = float(np.median(luma[base]))
    out = rgb.copy()
    width = image.shape[1]
    column = np.arange(width)[None, :].repeat(image.shape[0], axis=0) * 4 // width
    for index, name in enumerate('MOTH'):
        target = hex_rgb(colours[name])
        here = column == index
        # The button's top and sides: the colour at the grey's lightness,
        # lighter shades eased towards white.
        f = (luma / face)[..., None]
        k = np.clip((f - 1) * 0.55, 0, 1)
        painted = np.where(f <= 1, target * f, target + (255 - target) * k)
        mask = (here & grey)[..., None]
        out = np.where(mask, painted, out)
        # The base: a darker shade of the same colour.
        shade = target * 0.45 * (luma / base_level)[..., None]
        out = np.where((here & base)[..., None], np.clip(shade, 0, 255), out)
        # The glint, a white shine rather than the old green one.
        shine = 255 - (255 - luma[..., None] * 255) * 0.5
        out = np.where((here & glint)[..., None], np.repeat(shine, 3, axis=-1), out)
        if name == 'T':
            ink = np.array(INK, dtype=np.float64) * (luma / 0.9)[..., None]
            out = np.where((here & letter)[..., None], np.clip(ink, 0, 255), out)
    result = np.dstack([np.round(out), alpha]).astype(np.uint8)
    path = os.path.join(ROOT, 'moth-asset-additions', OUT)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(result).save(path, 'WEBP', lossless=True, quality=100, method=6, exact=True)
    data = open(path, 'rb').read()
    print(OUT, len(data), hashlib.sha256(data).hexdigest())


if __name__ == '__main__':
    main()
