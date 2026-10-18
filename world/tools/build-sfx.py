"""Builds the world's SFX from the owner's masters (2026-10-17).

Ambience: a body of exactly L seconds whose head is an equal-power crossfade
with the material that followed its tail, so the body repeats seamlessly; then
0.5 s of the body's own tail before it and head after it, so the player can
loop [0.5, 0.5+L] and still be seamless if a decoder shifts the start by its
encoder delay.
"""
import json, subprocess, sys, numpy as np
SR = 48000
SRC = '/Users/myscheduleai/Desktop/Michael/MSSWEB/SFX/'
OUT = sys.argv[1]
# Which set to build: world (beds + menu cues), avatar (2026-10-17 second batch) or all.
GROUP = sys.argv[2] if len(sys.argv) > 2 else 'all'
PAD, XF = 0.5, 5.0

def load(name):
    raw = subprocess.run(['ffmpeg','-v','error','-i',SRC+name,'-ac','2','-ar',str(SR),'-af','aresample=filter_size=64:phase_shift=10:cutoff=0.97','-f','f32le','-'],capture_output=True,check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)

def write(path, x, args):
    p = subprocess.run(['ffmpeg','-v','error','-y','-f','f64le','-ar',str(SR),'-ac','2','-i','-',*args,path], input=np.ascontiguousarray(x).tobytes())
    assert p.returncode == 0, path

beds = {
    'ambience-day':   ('ES_Ambience, Seaside, Promenade, Quiet, Walla Part 02 - Epidemic Sound.wav', 31.0, 60.0),
    'ambience-night': ('ES_Ambience, Rural, Rural, Amb, Quiet, Evening - Epidemic Sound.wav', 139.0, 45.0),
    'ambience-ocean': ('ES_Water, Wave, Beach Waves at Night - Epidemic Sound.wav', 175.0, 45.0),
}
manifest = {}
for key, (name, start, L) in (beds.items() if GROUP in ('world', 'all') else []):
    src = load(name)
    s, n, x = int(start*SR), int(L*SR), int(XF*SR)
    seg = src[s:s+n+x]
    body = seg[:n].copy()
    t = (np.arange(x) + .5) / x
    fin, fout = np.sin(t*np.pi/2)[:,None], np.cos(t*np.pi/2)[:,None]
    body[:x] = seg[:x]*fin + seg[n:n+x]*fout
    p = int(PAD*SR)
    looped = np.concatenate([body[-p:], body, body[:p]])
    rms = np.sqrt((body**2).mean())
    peak = np.abs(looped).max()
    gain = min(10**(-24/20)/rms, 10**(-1.5/20)/peak)
    looped *= gain
    seam = np.abs(np.diff(np.concatenate([body[-2:], body[:2]]), axis=0)).max()*gain
    write(f'{OUT}/{key}.mp3', looped, ['-c:a','libmp3lame','-b:a','128k'])
    write(f'{OUT}/{key}-mono.mp3', looped, ['-ac','1','-c:a','libmp3lame','-b:a','64k'])
    manifest[key] = {'loopStart': PAD, 'loopEnd': PAD+L, 'gainDb': round(20*np.log10(gain),1), 'rmsDb': round(20*np.log10(rms*gain),1), 'peakDb': round(20*np.log10(peak*gain),1), 'seamStep': round(float(seam),4)}

for key, name in ({'ui-click': 'click2.wav', 'ui-hover': 'flip2.wav'}.items() if GROUP in ('world', 'all') else []):
    x = load(name)
    a = np.abs(x).max(axis=1)
    first = max(0, int(np.argmax(a > 10**(-50/20))) - SR//1000)
    x = x[first:]
    x *= 10**(8/20)
    fade = min(len(x), SR//200)
    x[-fade:] *= np.linspace(1, 0, fade)[:,None]
    write(f'{OUT}/{key}.wav', x, ['-c:a','pcm_s16le'])
    manifest[key] = {'trimmedMs': round(first/SR*1000,1), 'peakDb': round(20*np.log10(np.abs(x).max()),1), 'ms': round(len(x)/SR*1000,1)}

# The avatar's own sounds (owner, 2026-10-17). One-shots start on their first
# sound, so a footstep lands on the foot plant and not a beat after it, end once
# they have died away, and share one loudness over their active part; the board
# is a loop like the beds.
def active_rms(x, threshold_db=-40):
    a = np.abs(x).max(axis=1)
    hot = a > a.max() * 10**(threshold_db/20)
    return np.sqrt((x[hot]**2).mean())

ONE_SHOTS = {
    # key: (file, onset threshold dB, keep before onset ms, max length ms)
    'avatar-step-left': ('leftfoot.wav', -45, 2, 460),
    'avatar-step-right': ('rightfoot.wav', -45, 2, 460),
    'avatar-eat-popcorn': ('eatingpopcorn.wav', -60, 15, 600),
    'avatar-drink': ('drink.wav', -50, 10, 620),
}
for key, (name, threshold, lead, longest) in (ONE_SHOTS.items() if GROUP in ('avatar', 'all') else []):
    x = load(name)
    a = np.abs(x).max(axis=1)
    first = max(0, int(np.argmax(a > 10**(threshold/20))) - lead*SR//1000)
    x = x[first:first + longest*SR//1000].copy()
    fade = min(len(x), SR*40//1000)
    x[-fade:] *= np.linspace(1, 0, fade)[:,None]**2
    gain = min(10**(-20/20)/active_rms(x), 10**(-1/20)/np.abs(x).max())
    x *= gain
    write(f'{OUT}/{key}.wav', x, ['-c:a','pcm_s16le'])
    manifest[key] = {'trimmedMs': round(first/SR*1000,1), 'ms': round(len(x)/SR*1000,1), 'gainDb': round(20*np.log10(gain),1), 'peakDb': round(20*np.log10(np.abs(x).max()),1)}

if GROUP in ('avatar', 'all'):
    # 6.7 s of rolling; its last 50 ms end on a click, so it is left out.
    src = load('ES_Sports, Skate, Skateboarding, Running After Rolling Skateboard - Epidemic Sound - 0994-7702.wav')
    xf = int(1.2*SR)
    seg = src[int(.05*SR):int(6.65*SR)]
    n = len(seg) - xf
    body = seg[:n].copy()
    t = (np.arange(xf) + .5) / xf
    body[:xf] = seg[:xf]*np.sin(t*np.pi/2)[:,None] + seg[n:n+xf]*np.cos(t*np.pi/2)[:,None]
    p = int(PAD*SR)
    looped = np.concatenate([body[-p:], body, body[:p]])
    gain = min(10**(-24/20)/np.sqrt((body**2).mean()), 10**(-1.5/20)/np.abs(looped).max())
    looped *= gain
    write(f'{OUT}/avatar-skate.mp3', looped, ['-c:a','libmp3lame','-b:a','128k'])
    manifest['avatar-skate'] = {'loopStart': PAD, 'loopEnd': round(PAD + n/SR, 4), 'gainDb': round(20*np.log10(gain),1)}
print(json.dumps(manifest, indent=1))
