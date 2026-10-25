"""Build short, mono weather audio from the owner's supplied recordings.

Usage: python3 tools/build-weather-sfx.py [output-folder] [report-file]
Only the compact runtime excerpts are published; masters stay at their source.
A16-second body uses a3-second equal-power seam, padded by0.5seconds on
both sides. All runtime decoding uses the existing48kHz offline audio decoder.
"""
from pathlib import Path
import hashlib,json,subprocess,sys
import numpy as np

SR=48000
ROOT=Path('/Users/myscheduleai/Desktop/Michael/MSSWEB/SFX')
OUT=Path(sys.argv[1] if len(sys.argv)>1 else 'src/assets/audio')
REPORT=Path(sys.argv[2] if len(sys.argv)>2 else 'art/weather-actions-20261024/weather-audio-build.json')
OUT.mkdir(parents=True,exist_ok=True)
REPORT.parent.mkdir(parents=True,exist_ok=True)
MASTERS={
 'rain':'ES_Rain, Concrete, Rain Water, Intense On Cement, Soft - Epidemic Sound.wav',
 'snow':'ES_Ambience, Forest, Winter, Calm, Light Wind, Oslo, Ostmarka 02 - Epidemic Sound.wav',
 'steps':'ES_Footsteps, Human, Snow, Walk 02 - Epidemic Sound.wav',
}

def load(kind,start,seconds):
 raw=subprocess.check_output(['ffmpeg','-v','error','-ss',str(start),'-t',str(seconds),'-i',str(ROOT/MASTERS[kind]),'-ac','1','-ar',str(SR),'-af','highpass=f=45,lowpass=f=14000','-f','f32le','-'])
 return np.frombuffer(raw,np.float32).astype(np.float64)

def write(name,x,args):
 dest=OUT/name
 subprocess.run(['ffmpeg','-v','error','-y','-f','f64le','-ar',str(SR),'-ac','1','-i','-',*args,str(dest)],input=np.ascontiguousarray(x).tobytes(),check=True)
 return {'file':name,'bytes':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'sampleRate':SR,'channels':1,'decodedSamples':len(x),'decodedFloatBytes':len(x)*4,'duration':len(x)/SR,'rmsDb':round(float(20*np.log10(np.sqrt(np.mean(x*x)))),2),'peakDb':round(float(20*np.log10(np.max(np.abs(x)))) ,2)}

def balance(x,rms_db):
 rms=np.sqrt(np.mean(x*x));peak=np.max(np.abs(x))
 assert rms>0 and peak>0
 gain=min(10**(rms_db/20)/rms,10**(-1.5/20)/peak)
 return x*gain,float(20*np.log10(gain))

records=[]
for key,start in [('rain',19),('snow',66)]:
 n,xf,pad=16*SR,3*SR,SR//2
 seg=load(key,start,19)
 assert len(seg)>=n+xf
 body=seg[:n].copy()
 t=(np.arange(xf)+.5)/xf
 body[:xf]=seg[:xf]*np.sin(t*np.pi/2)+seg[n:n+xf]*np.cos(t*np.pi/2)
 padded=np.concatenate([body[-pad:],body,body[:pad]])
 padded,gain=balance(padded,-24)
 record=write(f'weather-{key}-mono.mp3',padded,['-c:a','libmp3lame','-b:a','64k'])
 record.update({'source':MASTERS[key],'sourceStart':start,'loopStart':.5,'loopEnd':16.5,'crossfadeSeconds':3,'gainDb':round(gain,2),'seamStep':round(float(abs(padded[pad+n]-padded[pad+n-1])),7)})
 records.append(record)

# Adjacent isolated plants from the supplied walking take, not synthetic noise.
for side,start in [('left',4.35),('right',4.96)]:
 x=load('steps',start,.48)
 envelope=np.abs(x)
 hot=np.flatnonzero(envelope>envelope.max()*10**(-36/20))
 assert len(hot)
 lead=max(0,int(hot[0])-int(.003*SR))
 x=x[lead:].copy()
 fade=min(len(x),int(.045*SR))
 x[:min(len(x),96)]*=np.linspace(0,1,min(len(x),96))
 x[-fade:]*=np.linspace(1,0,fade)**2
 x,gain=balance(x,-23)
 record=write(f'avatar-step-snow-{side}.wav',x,['-c:a','pcm_s16le'])
 record.update({'source':MASTERS['steps'],'sourceStart':round(start+lead/SR,6),'gainDb':round(gain,2)})
 records.append(record)

# Probe and re-decode published bytes as an independent codec/channel check.
for record in records:
 dest=OUT/record['file']
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=sample_rate,channels','-of','json',str(dest)],text=True))
 assert probe['streams'][0]['channels']==1
 raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(dest),'-ar',str(SR),'-ac','1','-f','f32le','-'])
 decoded=np.frombuffer(raw,np.float32)
 record['actualDecodedSamples']=len(decoded)
 record['actualDecodedFloatBytes']=len(raw)
 assert len(decoded)==record['decodedSamples']
 if record['file'].startswith('weather-'):
  seam=abs(float(decoded[int(16.5*SR)])-float(decoded[int(16.5*SR)-1]))
  record['encodedSeamStep']=round(seam,7)
  assert seam<.04,'the encoded seam must remain a small adjacent-sample transition'
report={'sampleRate':SR,'channels':1,'files':records,'runtimeBytes':sum(r['bytes'] for r in records),'decodedBytesAt48k':sum(r['actualDecodedFloatBytes'] for r in records),'sourceFiles':{k:{'name':name,'bytes':(ROOT/name).stat().st_size} for k,name in MASTERS.items()}}
assert report['decodedBytesAt48k']<8*1048576
REPORT.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'runtimeBytes':report['runtimeBytes'],'decodedBytesAt48k':report['decodedBytesAt48k'],'files':[{k:r[k] for k in ['file','bytes','duration','rmsDb','peakDb']} for r in records]},indent=2))
