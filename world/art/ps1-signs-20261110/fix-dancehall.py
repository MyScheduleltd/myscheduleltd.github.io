# 舞廳: the image model kept drawing 廳 without the 耳 inside 广 (three tries),
# so the characters are set in Yuanti TC Bold (圓體, the closest match to the
# generated lettering's rounded geometric style) over the generated face,
# keeping its disco ball, border, colours and paper grain.
import glob, pathlib
import numpy as np
from PIL import Image, ImageDraw, ImageFont
here = pathlib.Path(__file__).parent
face = Image.open(here / 'raw2' / 'dancehall-b.png').convert('RGB')
w, h = face.size
a = np.asarray(face).astype(np.float32)
# The old characters' cream, and the plain face beneath them.
box = (int(.17 * w), int(.40 * h), int(.86 * w), int(.76 * h))
region = a[box[1]:box[3], box[0]:box[2]]
cream = region[region.sum(axis=2) > 450].mean(axis=0)
band = a[int(.77 * h):int(.94 * h), box[0]:box[2]]
fill = np.concatenate([band, band[::-1], band], axis=0)[:box[3] - box[1]]
a[box[1]:box[3], box[0]:box[2]] = fill
# Grain from the plain face, to print the new letters onto it.
lum = a.mean(axis=2); grain = (lum / lum[box[1]:box[3], box[0]:box[2]].mean()).clip(.85, 1.15)
font = ImageFont.truetype(glob.glob('/System/Library/AssetsV2/com_apple_MobileAsset_Font8/*/AssetData/Yuanti.ttc')[0], int(h * .25), index=3)
mask = Image.new('L', (w, h), 0); d = ImageDraw.Draw(mask)
text = '舞廳'; spacing = int(h * .035)
widths = [d.textbbox((0, 0), c, font=font)[2] - d.textbbox((0, 0), c, font=font)[0] for c in text]
x = (w - (sum(widths) + spacing)) / 2; top = int(.43 * h)
for c, cw in zip(text, widths):
    bb = d.textbbox((0, 0), c, font=font); d.text((x - bb[0], top - bb[1]), c, font=font, fill=255); x += cw + spacing
m = np.asarray(mask).astype(np.float32)[..., None] / 255
ink = cream[None, None, :] * grain[..., None]
out = a * (1 - m) + ink * m
Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(here / 'raw2' / 'dancehall.png')
print('cream', cream.round(), 'letters at', top, 'to', top + int(h * .25))
