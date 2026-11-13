# Generates the PS1 restyle's light-box sign faces with Higgsfield GPT Image 2
# (the owner, 2026-11-10: redesign the signs after their Showa light-box
# references). Usage: python3 generate.py [id ...]  (default: all, 6 at a time)
import json, subprocess, sys, re, pathlib, concurrent.futures as cf
here = pathlib.Path(__file__).parent
signs = json.loads((here / 'signs.json').read_text())
only = set(sys.argv[1:])
def prompt(s):
    layout = ('A TALL VERTICAL sign: the characters stacked top to bottom in one column, very large.' if s.get('vertical')
              else 'The emblem and the characters side by side in one row, the characters large.' if s['aspect'] in ('21:9', '16:9')
              else 'The emblem above, the characters below it in one row, large and centred.')
    chars = ' '.join(s['name'])
    return (f"Flat front-on artwork of the printed acrylic face of a backlit 1970s-80s Taiwanese street light-box sign, "
            f"filling the whole frame edge to edge. No housing, no wall, no bracket, no perspective, no shadow, no photo, no mockup. "
            f"The only text is the traditional Chinese name {s['name']} (exactly these characters in this order: {chars}), "
            f"in bold clean printed lettering (heavy 黑體 gothic or bold 明體, NOT brush calligraphy). {layout} "
            f"{s['emblem']}. Colours: {s['colours']}. Retro Showa-era signage graphic design: two or three solid flat ink colours, "
            f"crisp vector-flat shapes, generous margins, a slight soft glow as if lit from behind, evenly lit. "
            f"No English, no other words, no numbers except on the 8-ball, no real brand logos.")
def run(s):
    out = here / 'raw' / f"{s['id']}.png"
    p = prompt(s)
    r = subprocess.run(['higgsfield', 'generate', 'create', 'gpt_image_2', '--prompt', p, '--aspect_ratio', s['aspect'],
                        '--resolution', '1k', '--quality', 'high', '--wait'], capture_output=True, text=True, timeout=900)
    url = re.search(r'https://\S+\.(?:png|jpg|webp)', r.stdout + r.stderr)
    if not url: return s['id'], 'FAILED ' + (r.stdout + r.stderr)[-300:]
    subprocess.run(['curl', '-s', '-o', str(out), url.group(0)], check=True)
    (here / 'raw' / f"{s['id']}.prompt.txt").write_text(p + '\n' + url.group(0) + '\n')
    return s['id'], 'ok'
todo = [s for s in signs if not only or s['id'] in only]
with cf.ThreadPoolExecutor(6) as pool:
    for sid, status in pool.map(run, todo): print(sid, status, flush=True)
