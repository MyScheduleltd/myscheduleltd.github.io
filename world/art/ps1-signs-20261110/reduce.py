# Reduces the Higgsfield sign faces (raw/) to the world's textures: venue
# boards 640 wide, square shop boxes 320, the 皇宮戲院 tower 288 by 512, as
# 64-colour palette PNGs (clean flat print, so no dithering).
import pathlib
from PIL import Image
here = pathlib.Path(__file__).parent
assets = here.parents[1] / 'src/assets/ps1'
venues = ['rooftop', 'club', 'palace', 'drive-in', 'shore', 'temple']
shops = ['brand', 'video', 'icefruit', 'billiards', 'basement', 'dancehall', 'news', 'snacks', 'photo', 'inn']
def reduce(name, size, out):
    im = Image.open(here / 'raw' / f'{name}.png').convert('RGB').resize(size, Image.LANCZOS)
    im.quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(out, optimize=True)
    return out.stat().st_size
total = 0
for v in venues:
    w, h = Image.open(here / 'raw' / f'{v}.png').size
    total += reduce(v, (640, round(640 * h / w)), assets / 'signs' / f'{v}.png')
for s in shops: total += reduce(s, (320, 320), assets / 'lightboxes' / f'{s}.png')
total += reduce('palace-vertical', (288, 512), assets / 'lightboxes' / 'palace-vertical.png')
print('total bytes', total)
for v in venues: print(v, Image.open(assets / 'signs' / f'{v}.png').size)
