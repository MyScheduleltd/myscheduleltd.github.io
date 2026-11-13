# Second pass: reduces raw2/ to the world's textures. Venue boards 512 wide,
# square shop boxes 256, the 皇宮戲院 tower 224 by 400 (its red darkened to
# the Palace board's oxblood), and the entrance cropped to its 22:3.8 face
# with a fine double rule, as 48-colour palette PNGs.
import pathlib
import numpy as np
from PIL import Image, ImageDraw
here = pathlib.Path(__file__).parent
assets = here.parents[1] / 'src/assets/ps1'
venues = ['rooftop', 'club', 'palace', 'drive-in', 'shore', 'temple']
shops = ['brand', 'video', 'icefruit', 'billiards', 'basement', 'dancehall', 'news', 'snacks', 'photo', 'inn']
def save(im, out):
    im.quantize(colors=48, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(out, optimize=True)
    return out.stat().st_size
def raw(name): return Image.open(here / 'raw2' / f'{name}.png').convert('RGB')
total = 0
for v in venues:
    im = raw(v); total += save(im.resize((512, round(512 * im.height / im.width)), Image.LANCZOS), assets / 'signs' / f'{v}.png')
for s in shops: total += save(raw(s).resize((256, 256), Image.LANCZOS), assets / 'lightboxes' / f'{s}.png')
tower = np.asarray(raw('palace-vertical')).astype(np.float32)
red = (tower[..., 0] > tower[..., 1] + 60) & (tower[..., 0] > tower[..., 2] + 60)
tower[red] *= np.array([.82, .62, .85])
total += save(Image.fromarray(tower.clip(0, 255).astype(np.uint8)).resize((224, 400), Image.LANCZOS), assets / 'lightboxes' / 'palace-vertical.png')
# Entrance: the rows that hold the lettering, centred in a 22:3.8 crop.
im = raw('entrance'); a = np.asarray(im).astype(np.int32)
w, h = im.size; inner = a[:, int(w * .1):int(w * .9)]
dark = (inner.sum(axis=2) < 420).sum(axis=1) > 6
rows = np.nonzero(dark[int(h * .15):int(h * .85)])[0] + int(h * .15)
centre = (rows.min() + rows.max()) // 2
ch = round(w * 3.8 / 22)
top = max(0, min(h - ch, centre - ch // 2))
face = im.crop((0, top, w, top + ch)).resize((1160, round(1160 * ch / w)), Image.LANCZOS)
d = ImageDraw.Draw(face)
for inset, width in ((10, 3), (17, 1)):
    d.rectangle((inset, inset, face.width - 1 - inset, face.height - 1 - inset), outline=(48, 40, 36), width=width)
total += save(face, assets / 'signs' / 'entrance.png')
print('lettering rows', rows.min(), rows.max(), 'crop', top, top + ch, 'entrance', face.size, 'total bytes', total)
