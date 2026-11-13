# Second pass of the PS1 light-box faces (the owner, 2026-11-10: the Chinese
# lettering was ugly and the reds too bright; "quiet Showa retro", Japanese
# aesthetic, lettering like the 1970s 樂聲牌 tower, deep muted palette, and
# the MYSCHEDULE entrance as a long light-box keeping its English).
# Higgsfield GPT Image 2 with lettering-reference.png. Usage: python3 generate2.py [id ...]
import json, subprocess, sys, re, pathlib, concurrent.futures as cf
here = pathlib.Path(__file__).parent
signs = json.loads((here / 'signs2.json').read_text())
only = set(sys.argv[1:])
(here / 'raw2').mkdir(exist_ok=True)
STYLE = ("Quiet Japanese Showa-era retro graphic design: generous empty space, a fine inner border and thin rules, one small simple flat emblem, "
         "only two or three colours from a deep muted palette (oxblood, brick, indigo, sumi black, muted mustard, sage, cream), "
         "and a faint touch of aged enamel (very slight soft wear at the edges, a few tiny chips). Calm, elegant, not loud. No bright red anywhere.")
LETTERING = ("LETTERING: copy only the lettering style of the attached reference image (the 1970s tower sign's characters): hand-drawn geometric "
             "display lettering with even medium-weight strokes, squared construction with softly rounded corners, slightly condensed, airy spacing, "
             "as on 1970s Japanese and Taiwanese neon shop signs. NOT a heavy bold gothic font, NOT brush calligraphy. Ignore everything else in the reference.")
def prompt(s):
    if s.get('english'):
        return ("Flat front-on artwork of the printed face of a very long backlit Showa-era Japanese light-box sign over a festival entrance, "
                "filling the whole frame edge to edge. No housing, no wall, no perspective, no photo, no mockup. "
                f"{s['face']} face. All the content sits in ONE centred horizontal band that takes only the middle 40% of the height; above and below it is plain empty face. "
                "In that band: the English word MYSCHEDULE large in the centre, and directly beneath it the words VIRTUAL FESTIVAL small and widely letter-spaced between two thin horizontal rules. "
                f"{s['emblem']}. Colours: {s['colours']}. {STYLE} "
                "The English lettering in a 1970s Japanese retro display style: geometric, even strokes, softly rounded corners, wide spacing. "
                "Exactly these words spelled correctly: MYSCHEDULE, VIRTUAL FESTIVAL. No other text.")
    layout = ('A TALL VERTICAL sign: the characters stacked top to bottom in one column.' if s.get('vertical')
              else 'The small emblem and the characters side by side in one row, the characters the main feature.' if s['aspect'] in ('21:9', '16:9')
              else 'The small emblem above, the characters below it in one row, centred.')
    chars = ' '.join(s['name'])
    return (f"Flat front-on artwork of the printed face of a backlit Showa-era Japanese / 1970s Taiwanese street light-box sign, filling the whole frame edge to edge. "
            f"No housing, no wall, no bracket, no perspective, no shadow, no photo, no mockup. {s['face']} face. "
            f"The only text is the traditional Chinese name {s['name']} (exactly these characters in this order: {chars}). {layout} "
            f"{s['emblem']}. Colours: {s['colours']}. {STYLE} {LETTERING} {s.get('note', '')} "
            f"No English, no Japanese kana, no other words, no digits or numbers anywhere, no real brand logos. "
            "Never use any character that appears in the reference image (樂, 聲, 牌 must not appear); write only the name given.")
def run(s):
    import os
    out = here / 'raw2' / f"{s['id']}{os.environ.get('VARIANT', '')}.png"
    p = prompt(s)
    r = subprocess.run(['higgsfield', 'generate', 'create', 'gpt_image_2', '--prompt', p, '--image', str(here / 'lettering-reference.png'),
                        '--aspect_ratio', s['aspect'], '--resolution', '1k', '--quality', 'high', '--wait'], capture_output=True, text=True, timeout=900)
    url = re.search(r'https://\S+\.(?:png|jpg|webp)', r.stdout + r.stderr)
    if not url: return s['id'], 'FAILED ' + (r.stdout + r.stderr)[-300:]
    subprocess.run(['curl', '-s', '-o', str(out), url.group(0)], check=True)
    (here / 'raw2' / f"{s['id']}{os.environ.get('VARIANT', '')}.prompt.txt").write_text(p + '\n' + url.group(0) + '\n')
    return s['id'], 'ok'
todo = [s for s in signs if not only or s['id'] in only]
with cf.ThreadPoolExecutor(6) as pool:
    for sid, status in pool.map(run, todo): print(sid, status, flush=True)
