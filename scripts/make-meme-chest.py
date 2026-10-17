"""Makes the level 4 basement chest's sprite sheet from its generated artwork.

usage: python3 scripts/make-meme-chest.py <generated 2x2 sheet.png>

The owner asked for a new chest in the game's art style, facing Dr. Beauty
(2026-10-18). The artwork was generated with Nano Banana 2 from two references,
the level 4 basement and the release's old wall chest, as a 2x2 sheet on flat
magenta: closed, a glint on the lock, the lid opening, open with gold
sparkles; the chest's front faces right, the way Dr. Beauty comes down the
ladder. This cuts the four frames apart (dropping the lines between them),
keys out the magenta, puts all four on one footing (the same crop, the base on
the same line) and scales them into 256-pixel frames, as the release's chests
are.

Writes moth-asset-additions/assets/sprites/level4_meme_chest/sheet.webp
(lossless) and prints its hash; update moth-asset-additions/manifest.json from
it. Needs numpy and Pillow.
"""
import hashlib
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = 'assets/sprites/level4_meme_chest/sheet.webp'
FRAME = 256


def keyed(cell):
    """The cell with its magenta made transparent, fringes despilled."""
    rgb = cell[..., :3].astype(np.float64)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # How magenta a pixel is: red and blue both well above green.
    spill = np.clip((np.minimum(r, b) - g) / 255, 0, 1)
    alpha = np.clip(1 - (spill - 0.28) / (0.62 - 0.28), 0, 1)
    # Pull what magenta is left in edge pixels back towards neutral.
    excess = np.maximum(0, np.minimum(r, b) - g)[..., None] * spill[..., None] * 0.9
    rgb = np.clip(rgb - excess * np.array([1, 0, 1]), 0, 255)
    alpha[alpha < 0.08] = 0
    return np.dstack([rgb, alpha * 255])


def main():
    raw = np.asarray(Image.open(sys.argv[1]).convert('RGB'))
    size = raw.shape[0] // 2
    margin = size // 64
    cells = [keyed(raw[y + margin:y + size - margin, x + margin:x + size - margin])
             for y in (0, size) for x in (0, size)]
    # One crop for all four, so the chest stands still from frame to frame.
    seen = np.any([cell[..., 3] > 0 for cell in cells], axis=0)
    rows, cols = np.where(seen)
    top, bottom, left, right = rows.min(), rows.max() + 1, cols.min(), cols.max() + 1
    width, height = right - left, bottom - top
    scale = (FRAME - 8) / max(width, height)
    w, h = round(width * scale), round(height * scale)
    sheet = Image.new('RGBA', (FRAME * 2, FRAME * 2), (0, 0, 0, 0))
    for index, cell in enumerate(cells):
        art = Image.fromarray(np.round(cell[top:bottom, left:right]).astype(np.uint8))
        art = art.resize((w, h), Image.LANCZOS)
        # Feet on the frame's bottom edge, centred across it.
        sheet.alpha_composite(art, ((index % 2) * FRAME + (FRAME - w) // 2, (index // 2) * FRAME + FRAME - 4 - h))
    pixels = np.asarray(sheet).copy()
    pixels[pixels[..., 3] < 16] = 0
    path = os.path.join(ROOT, 'moth-asset-additions', OUT)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(pixels).save(path, 'WEBP', lossless=True, quality=100, method=6, exact=True)
    data = open(path, 'rb').read()
    print(OUT, len(data), hashlib.sha256(data).hexdigest(), 'art', w, h)


if __name__ == '__main__':
    main()
