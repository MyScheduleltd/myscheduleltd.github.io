#!/usr/bin/env bash
# Cuts the brand's Ming face down to the characters this world can display.
#
# The full HanWangMingBlack is 8.47 MB, because a Ming face carries glyphs for
# essentially the whole CJK range. The festival uses a few hundred of them. Sent
# whole to a phone it would be the largest thing on the site by an order of
# magnitude; subset and re-wrapped as WOFF2 it is 140 KB.
#
# The character list is read out of the source rather than maintained by hand,
# so re-running this after adding new wording picks the new characters up. Any
# character outside the subset still renders — the canvas falls back per glyph
# to a system face — so a staff member re-lettering a sign gets readable text
# rather than empty boxes.
#
# Needs: pip3 install fonttools brotli
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - <<'PY'
import pathlib
chars = set()
for path in ['src/world/FestivalWorld.ts', 'src/ui/App.ts', 'src/main.ts']:
    p = pathlib.Path(path)
    if not p.exists():
        continue
    for ch in p.read_text(encoding='utf-8'):
        if '　' <= ch <= '鿿' or '＀' <= ch <= '￯':
            chars.add(ch)
pathlib.Path('/tmp/ming-glyphs.txt').write_text(''.join(sorted(chars)), encoding='utf-8')
print(f'{len(chars)} characters to keep')
PY

python3 -m fontTools.subset \
  ../docs/font/HanWangMingBlack.ttf \
  --text-file=/tmp/ming-glyphs.txt \
  --output-file=public/font/HanWangMing-subset.woff2 \
  --flavor=woff2 \
  --layout-features='' --no-hinting --desubroutinize \
  --drop-tables+=DSIG

# The world asks for /font/... which the dev server serves out of public/ and
# the live site serves out of docs/font/, so the subset has to land in both or
# it resolves in development and 404s in production.
cp public/font/HanWangMing-subset.woff2 ../docs/font/
ls -l public/font/HanWangMing-subset.woff2 ../docs/font/HanWangMing-subset.woff2
