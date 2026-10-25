"""Cut two compact avatar cues from the owner's supplied masters.

Usage: python3 tools/build-action-sfx.py [output-folder] [report-file]
The source WAVs remain untouched. Runtime files are mono48kHz PCM16, matching
the existing avatar one-shots and requiring no separate playback graph.
"""
from pathlib import Path
import hashlib,json,subprocess,sys
import numpy as np

SR=48000
ROOT=Path('/Users/myscheduleai/Desktop/Michael/MSSWEB/SFX')
OUT=Path(sys.argv[1] if len(sys.argv)>1 else 'src/assets/audio')
REPORT=Path(sys.argv[2] if len(sys.argv)>2 else 'art/weather-actions-20261024/action-audio-build.json')
OUT.mkdir(parents=True,exist_ok=True);REPORT.parent.mkdir(parents=True,exist_ok=True)
CUTS=[
 {'kind':'snow-brush','file':'avatar-snow-brush.wav','source':'ES_Snow, Movement, Raise Up From Snow 02 - Epidemic Sound.wav','start':.60,'duration':.52,'attack':.003,'release':.035},
 # The owner supplied a0.811s excerpt of the x5 recording, containing one
 # isolated clean impact. Do not synthesize or duplicate five fake variants.
 {'kind':'punch','file':'avatar-punch.wav','source':'ES_Fight, Impact, Punch, Bright, Clean, Meaty x5 02 - Epidemic Sound - 0000-0811.wav','start':.195,'duration':.415,'attack':.0015,'release':.03},
]
records=[];sources={}
for cut in CUTS:
 source=ROOT/cut['source'];source_bytes=source.read_bytes()
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=sample_rate,channels','-of','json',str(source)],text=True))
 sources[cut['kind']]={'name':source.name,'bytes':len(source_bytes),'sha256':hashlib.sha256(source_bytes).hexdigest(),'duration':float(probe['format']['duration']),'sampleRate':int(probe['streams'][0]['sample_rate']),'channels':probe['streams'][0]['channels']}
 raw=subprocess.check_output(['ffmpeg','-v','error','-ss',str(cut['start']),'-t',str(cut['duration']),'-i',str(source),'-ac','1','-ar',str(SR),'-af','highpass=f=45,lowpass=f=14000','-f','f32le','-'])
 x=np.frombuffer(raw,np.float32).astype(np.float64)
 assert len(x)==round(cut['duration']*SR)
 attack=round(cut['attack']*SR);release=round(cut['release']*SR)
 x[:attack]*=np.linspace(0,1,attack);x[-release:]*=np.linspace(1,0,release)**2
 gain=min(10**(-23/20)/np.sqrt(np.mean(x*x)),10**(-1.5/20)/np.max(np.abs(x)))
 x*=gain;dest=OUT/cut['file']
 subprocess.run(['ffmpeg','-v','error','-y','-f','f64le','-ar',str(SR),'-ac','1','-i','-','-c:a','pcm_s16le',str(dest)],input=np.ascontiguousarray(x).tobytes(),check=True)
 decoded_raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(dest),'-ac','1','-ar',str(SR),'-f','f32le','-'])
 decoded=np.frombuffer(decoded_raw,np.float32)
 assert len(decoded)==len(x)
 peak=np.max(np.abs(decoded));audible=np.flatnonzero(np.abs(decoded)>peak*10**(-36/20))
 record={'kind':cut['kind'],'file':cut['file'],'bytes':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'source':source.name,'sourceStart':cut['start'],'sourceEnd':cut['start']+cut['duration'],'sampleRate':SR,'channels':1,'pcmBits':16,'duration':len(decoded)/SR,'decodedSamples':len(decoded),'actualDecodedFloatBytes':len(decoded_raw),'gainDb':round(float(20*np.log10(gain)),3),'rmsDb':round(float(20*np.log10(np.sqrt(np.mean(decoded*decoded)))),3),'peakDb':round(float(20*np.log10(peak)),3),'attackFadeSeconds':cut['attack'],'releaseFadeSeconds':cut['release'],'firstAudibleAtSeconds':round(int(audible[0])/SR,6),'peakAtSeconds':round(int(np.argmax(np.abs(decoded)))/SR,6),'recommendedSchedulingDelaySeconds':0}
 if cut['kind']=='punch':record['sourceCleanHits']=1
 assert source.read_bytes()==source_bytes,'master must remain unchanged'
 records.append(record)
report={'sampleRate':SR,'channels':1,'files':records,'runtimeBytes':sum(r['bytes'] for r in records),'decodedBytesAt48k':sum(r['actualDecodedFloatBytes'] for r in records),'sourceFiles':sources}
assert report['runtimeBytes']<100_000 and report['decodedBytesAt48k']<200_000
REPORT.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'runtimeBytes':report['runtimeBytes'],'decodedBytesAt48k':report['decodedBytesAt48k'],'files':[{k:r[k] for k in ['kind','file','duration','rmsDb','peakDb','peakAtSeconds']} for r in records]},indent=2))
