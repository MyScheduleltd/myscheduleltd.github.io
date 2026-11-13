# The pamphlet stand's printed pieces (2026-11-11): the header light-box face,
# lettered in Yuanti TC Bold so every character is right, and the three
# Higgsfield covers reduced to small PS1 textures.
# Usage: python3 build-faces.py  (writes into ../../src/assets/ps1/pamphlet/)
from PIL import Image, ImageDraw, ImageFont
import os
OUT = os.path.join(os.path.dirname(__file__), '../../src/assets/ps1/pamphlet')
os.makedirs(OUT, exist_ok=True)
FONT = '/System/Library/AssetsV2/com_apple_MobileAsset_Font8/4a418d1fa4860652a3241e8ee457806c8557fc64.asset/AssetData/Yuanti.ttc'
CREAM, INDIGO, OXBLOOD, MUSTARD, SAGE = (239, 230, 210), (47, 63, 99), (128, 52, 44), (201, 156, 70), (122, 146, 112)

# Header face, 512 x 192 (2.67:1, the box is 1.9 by 0.71).
W, H = 1024, 384
face = Image.new('RGB', (W, H), CREAM)
d = ImageDraw.Draw(face)
d.rectangle([22, 22, W - 23, H - 23], outline=INDIGO, width=6)
d.rectangle([36, 36, W - 37, H - 37], outline=INDIGO, width=2)
# Emblem: a film reel in oxblood on a mustard disc.
cx, cy, r = 178, H // 2, 104
d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=MUSTARD)
d.ellipse([cx - 78, cy - 78, cx + 78, cy + 78], fill=OXBLOOD)
import math
for k in range(5):
    a = k * 2 * math.pi / 5 - math.pi / 2
    hx, hy = cx + math.cos(a) * 44, cy + math.sin(a) * 44
    d.ellipse([hx - 17, hy - 17, hx + 17, hy + 17], fill=CREAM)
d.ellipse([cx - 11, cy - 11, cx + 11, cy + 11], fill=CREAM)
font = ImageFont.truetype(FONT, 172, index=3)
text = '影展手冊'
box = d.textbbox((0, 0), text, font=font)
tx = 318 + (W - 60 - 318 - (box[2] - box[0])) // 2 - box[0]
ty = (H - (box[3] - box[1])) // 2 - box[1]
d.text((tx, ty), text, font=font, fill=INDIGO)
# A thin sage rule under the lettering, as on the other boards.
d.rectangle([318, H - 74, W - 64, H - 70], fill=SAGE)
face.resize((512, 192), Image.LANCZOS).save(os.path.join(OUT, 'header.png'))

# Covers: 96 x 128, reduced to a small palette for the chunky print look.
for i in (1, 2, 3):
    src = Image.open(os.path.join(os.path.dirname(__file__), f'raw/cover{i}.png')).convert('RGB')
    small = src.resize((96, 128), Image.LANCZOS).quantize(colors=20, method=Image.Quantize.MEDIANCUT).convert('RGB')
    small.save(os.path.join(OUT, f'cover{i}.png'))
print('wrote', sorted(os.listdir(OUT)))
