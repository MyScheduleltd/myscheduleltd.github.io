"""Draw the outfit 1 back graphic and hem tag as clean artwork.

The back print used to be lifted from a photograph (prepare-outfit-prints.py).
Its thin table lines and labels came out a third opaque, and a garment print is
cut out at half opacity, so on the avatar everything but the heading and the
stamp disappeared. This redraws the owner's design from their tee mockup
(2026-09-24): MY SCHEDULE LTD. over a PROJECT / WORK / DATE table, three
labelled rows and the 我的檔期 stamp, in the print's tan, at four times the
old resolution. The stamp and the tag reuse the supplied 我的檔期 mark.

Run with a Python that has Pillow: python3 scripts/draw-outfit-prints.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'src/assets/outfits'
MARK = ROOT / 'src/assets/cap-logo.png'
TAN = (178, 116, 76, 255)
FONTS = Path('/System/Library/Fonts')
HEAVY = FONTS / 'Supplemental/Arial Black.ttf'
PLAIN = FONTS / 'Helvetica.ttc'


def mark(size, fill, ink=None):
    """The supplied mark: a square with the characters cut through it."""
    src = Image.open(MARK).convert('RGBA')
    box = src.getchannel('A').getbbox()
    src = src.crop(box).resize(size, Image.LANCZOS)
    alpha = src.getchannel('A')
    out = Image.new('RGBA', size, (0, 0, 0, 0))
    out.paste(Image.new('RGBA', size, fill), (0, 0), alpha)
    if ink:
        holes = alpha.point(lambda a: 255 - a)
        # Only inside the square: the margin round it stays clear.
        inner = Image.new('L', size, 0)
        ImageDraw.Draw(inner).rectangle((6, 6, size[0] - 7, size[1] - 7), fill=255)
        from PIL import ImageChops
        out.paste(Image.new('RGBA', size, ink), (0, 0), ImageChops.multiply(holes, inner))
    return out


def text(draw, xy, words, font, width=None):
    """Draw text; with `width`, stretch it horizontally to exactly that width."""
    if width is None:
        draw.text(xy, words, font=font, fill=TAN)
        return
    left, top, right, bottom = font.getbbox(words)
    tile = Image.new('RGBA', (right - left, bottom - top), (0, 0, 0, 0))
    ImageDraw.Draw(tile).text((-left, -top), words, font=font, fill=TAN)
    tile = tile.resize((width, tile.height), Image.LANCZOS)
    draw._image.alpha_composite(tile, (int(xy[0]), int(xy[1])))


def back():
    W, H, line = 1168, 796, 6
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    heading = ImageFont.truetype(str(HEAVY), 96)
    text(d, (0, 0), 'MY SCHEDULE LTD.', heading, width=W)
    label = ImageFont.truetype(str(PLAIN), 30)
    h = lambda y: d.rectangle((0, y, W, y + line), fill=TAN)
    h(148)
    h(404)
    h(772)
    for y in (524, 644):
        d.rectangle((0, y, 780, y + line), fill=TAN)
    for x in (412, 792):
        d.rectangle((x, 148, x + line, 404), fill=TAN)
    d.rectangle((780, 404, 780 + line, 778), fill=TAN)
    for x, words in ((12, 'PROJECT'), (428, 'WORK'), (808, 'DATE')):
        text(d, (x, 176), words, label)
    for y, words in ((452, 'PROFESSIONAL TIME'), (572, 'DEADLINE MANAGEMENT'), (668, 'COMMIT TO THE'), (704, 'SCHEDULE')):
        text(d, (12, y), words, label)
    stamp = mark((168, 176), TAN)
    img.alpha_composite(stamp, (972 - 84, 588 - 88))
    img.save(OUT / 'schedule-back.png', optimize=True)
    return img.size


def tag():
    img = mark((128, 144), (138, 88, 58, 255), ink=(58, 36, 24, 255))
    img.save(OUT / 'schedule-tag.png', optimize=True)
    return img.size


if __name__ == '__main__':
    print('back', back(), 'tag', tag())
