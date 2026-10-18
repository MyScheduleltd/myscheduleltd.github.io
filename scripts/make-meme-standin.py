"""Makes the stand-in picture for the level 4 basement chest.

usage: python3 scripts/make-meme-standin.py

The owner's meme PNG for the chest comes later (2026-10-18); until then the
chest holds this card, in the scoreboard card's colours, saying the meme is on
its way. Replace moth-asset-additions/assets/memes/level4-meme.png with the
owner's file (and its hash in the manifest) when it arrives.

Writes the PNG and prints its hash. Needs Pillow and macOS's fonts.
"""
import hashlib
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = 'assets/memes/level4-meme.png'
CHEST = os.path.join(ROOT, 'moth-asset-additions/assets/sprites/level4_meme_chest/sheet.webp')


def main():
    size = 1080
    card = Image.new('RGB', (size, size), '#141a16')
    draw = ImageDraw.Draw(card)
    for y in range(0, size, 6):
        draw.rectangle((0, y, size, y + 1), fill='#171e19')
    draw.rectangle((48, 48, size - 48, size - 48), fill='#2b3a2f')
    draw.rectangle((60, 60, size - 60, size - 60), outline='#d8d2b4', width=8)
    draw.rectangle((72, 72, size - 72, size - 72), outline='#141a16', width=4)
    title = ImageFont.truetype('/System/Library/Fonts/Supplemental/Courier New Bold.ttf', 64)
    zh = ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc', 76)
    small = ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc', 40)
    draw.text((size / 2, 170), 'MASTER OF THE HOUSE', font=title, fill='#f7f2de', anchor='mm')
    draw.text((size / 2, 250), 'BONITA 的寶箱', font=small, fill='#8fe8ff', anchor='mm')
    # The chest, open, from its own sheet.
    sheet = Image.open(CHEST).convert('RGBA')
    frame = sheet.width // 2
    chest = sheet.crop((frame, frame, frame * 2, frame * 2)).resize((frame * 2, frame * 2), Image.NEAREST)
    card.paste(chest, ((size - chest.width) // 2, 300), chest)
    draw.text((size / 2, 860), '梗圖即將登場', font=zh, fill='#ffd36c', anchor='mm')
    draw.text((size / 2, 940), '敬請期待', font=small, fill='#f7f2de', anchor='mm')
    path = os.path.join(ROOT, 'moth-asset-additions', OUT)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    card.save(path, 'PNG', optimize=True)
    data = open(path, 'rb').read()
    print(OUT, len(data), hashlib.sha256(data).hexdigest())


if __name__ == '__main__':
    main()
