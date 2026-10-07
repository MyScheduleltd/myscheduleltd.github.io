"""Re-save the band's instrument textures at JPEG quality 90.

The guitar and bass atlases shipped at quality 100: 3.2 and 3.4 MB of the
band's 12.9 MB, which took minutes to arrive from GitHub Pages and left the
roof with a stage and no musicians (the owner, 2026-10-07: "the band is gone
again"). Same 2048 resolution; every other byte of the file is kept, and the
buffer views after the image are shifted by the change in its length.

    python3 scripts/lighten-band-textures.py src/assets/band/guitarist.glb ...
"""
import io
import json
import struct
import sys

from PIL import Image

QUALITY = 90
LARGE = 1_500_000  # only images this big are re-saved


def pad4(n):
    return (n + 3) & ~3


def lighten(path):
    raw = open(path, 'rb').read()
    json_len = struct.unpack('<I', raw[12:16])[0]
    doc = json.loads(raw[20:20 + json_len])
    bin_len = struct.unpack('<I', raw[20 + json_len:24 + json_len])[0]
    start = 28 + json_len
    binary = bytearray(raw[start:start + bin_len])
    views = doc['bufferViews']
    changed = 0
    # Back to front, so an earlier image's offset is not moved by a later one.
    images = sorted(doc.get('images', []), key=lambda i: -views[i['bufferView']].get('byteOffset', 0))
    for image in images:
        view = views[image['bufferView']]
        if view['buffer'] != 0 or image.get('mimeType') != 'image/jpeg' or view['byteLength'] < LARGE:
            continue
        offset = view.get('byteOffset', 0)
        old = bytes(binary[offset:offset + view['byteLength']])
        picture = Image.open(io.BytesIO(old))
        out = io.BytesIO()
        picture.save(out, 'JPEG', quality=QUALITY, optimize=True)
        new = out.getvalue()
        old_span, new_span = pad4(len(old)), pad4(len(new))
        delta = new_span - old_span
        binary[offset:offset + old_span] = new + b'\0' * (new_span - len(new))
        view['byteLength'] = len(new)
        for other in views:
            if other is not view and other['buffer'] == 0 and other.get('byteOffset', 0) > offset:
                other['byteOffset'] += delta
            meshopt = other.get('extensions', {}).get('EXT_meshopt_compression')
            if meshopt and meshopt['buffer'] == 0 and meshopt.get('byteOffset', 0) > offset:
                meshopt['byteOffset'] += delta
        changed += 1
        print(f'{path}: {image.get("name")} {picture.size} {len(old):,} -> {len(new):,} bytes')
    if not changed:
        return
    doc['buffers'][0]['byteLength'] = len(binary)
    text = json.dumps(doc, separators=(',', ':')).encode()
    text += b' ' * (pad4(len(text)) - len(text))
    binary += b'\0' * (pad4(len(binary)) - len(binary))
    body = struct.pack('<II', len(text), 0x4E4F534A) + text + struct.pack('<II', len(binary), 0x004E4942) + bytes(binary)
    open(path, 'wb').write(struct.pack('<III', 0x46546C67, 2, 12 + len(body)) + body)


for name in sys.argv[1:]:
    lighten(name)
