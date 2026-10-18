"""Makes the level 4 basement chest's sprite sheet from its generated artwork.

usage: python3 scripts/make-meme-chest.py <generated 2x2 sheet.png>

The owner asked for a new chest in the game's art style (2026-10-18), then for
it flat and 2D, the size of the basement's red crate and standing with the
crates against the back wall. The artwork was generated with Nano Banana 2 from
the basement and a close-up of its crates as references, as a 2x2 sheet on flat
magenta: closed, a glint on the lock, the lid tipping back, open with gold
sparkles, all seen straight from the front as the crates are. This cuts the
four frames apart (dropping the lines between them), keys out the magenta,
lines each frame up by the base of its chest (the model does not keep the box
still from cell to cell), scales them alike and sets them in 256-pixel frames,
as the release's chests are, the base 4 pixels above each frame's bottom.

Writes moth-asset-additions/assets/sprites/level4_meme_chest/sheet.webp
(lossless) and prints its hash and the closed chest's height in a frame; the
game sizes the chest from that height (MEME_CHEST in moth-walk-scenes.mjs).
Update moth-asset-additions/manifest.json from the hash. Needs numpy and Pillow.
"""
import hashlib
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = 'assets/sprites/level4_meme_chest/sheet.webp'
FRAME = 256
GRADE = (0.86, 0.72, 0.5)


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


def tidied(cell):
    """The cell's chest alone, and its base line: a sparkle can cross the line
    between cells, so whatever lies below the box or against the cell's top
    edge is dropped. The base is the box's last full row."""
    counts = (cell[..., 3] > 0).sum(axis=1)
    base = np.where(counts > counts.max() * 0.2)[0].max()
    cell[base + 1:, :, 3] = 0
    cell[:cell.shape[0] // 32, :, 3] = 0
    return cell, base


def main():
    raw = np.asarray(Image.open(sys.argv[1]).convert('RGB'))
    size = raw.shape[0] // 2
    margin = size // 64
    cells = [keyed(raw[y + margin:y + size - margin, x + margin:x + size - margin])
             for y in (0, size) for x in (0, size)]
    # Each chest's base line, and its middle across the bottom of the box (the
    # sparkles above an open chest do not move it).
    marks = []
    for index, cell in enumerate(cells):
        cell, base = tidied(cell)
        cells[index] = cell
        rows, cols = np.where(cell[..., 3] > 0)
        low = cols[rows >= base - size // 8]
        marks.append((base, (low.min() + low.max()) / 2, rows.min(), cols.min(), cols.max()))
    left = min(c0 - mid for base, mid, top, c0, c1 in marks)
    right = max(c1 + 1 - mid for base, mid, top, c0, c1 in marks)
    height = max(base + 1 - top for base, mid, top, c0, c1 in marks)
    scale = (FRAME - 8) / max(right - left, height)
    w, h = round((right - left) * scale), round(height * scale)
    sheet = Image.new('RGBA', (FRAME * 2, FRAME * 2), (0, 0, 0, 0))
    for index, (cell, (base, mid, top, c0, c1)) in enumerate(zip(cells, marks)):
        # The same box around every chest, from its base and middle.
        box = np.zeros((height, int(right - left), 4))
        y0, x0 = base + 1 - height, int(round(mid + left))
        sy0, sx0 = max(0, y0), max(0, x0)
        sy1, sx1 = min(cell.shape[0], base + 1), min(cell.shape[1], x0 + box.shape[1])
        box[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = cell[sy0:sy1, sx0:sx1]
        art = Image.fromarray(np.round(box).astype(np.uint8)).resize((w, h), Image.LANCZOS)
        sheet.alpha_composite(art, ((index % 2) * FRAME + (FRAME - w) // 2, (index // 2) * FRAME + FRAME - 4 - h))
    pixels = np.asarray(sheet).copy()
    pixels[pixels[..., 3] < 16] = 0
    # Into the basement's lamp light: the model's iron bands come out cool
    # and purple beside the room's warm browns.
    pixels[..., :3] = np.clip(pixels[..., :3] * np.array(GRADE), 0, 255).round()
    path = os.path.join(ROOT, 'moth-asset-additions', OUT)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(pixels).save(path, 'WEBP', lossless=True, quality=100, method=6, exact=True)
    data = open(path, 'rb').read()
    closed = round((marks[0][0] + 1 - marks[0][2]) * scale)
    print(OUT, len(data), hashlib.sha256(data).hexdigest(), 'art', w, h, 'closed chest height', closed)

if __name__ == '__main__':
    main()
