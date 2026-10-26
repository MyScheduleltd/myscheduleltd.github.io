"""Build the owner's snowfall wind as a compact, seam-padded mono loop.

Usage: python3 tools/build-snow-wind-sfx.py source.wav [output-folder] [report-file]
The supplied master is read only. The seven-second runtime buffer has a
six-second body, two-second equal-power seam and half-second decoder pads.
"""
from pathlib import Path
import argparse,hashlib,json,subprocess
import numpy as np

SR=48000
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('source',type=Path)
parser.add_argument('output',type=Path,nargs='?',default=Path('src/assets/audio'))
parser.add_argument('report',type=Path,nargs='?',default=Path('art/weather-coverage-20261025/wind-audio-build.json'))
args=parser.parse_args()
SOURCE,OUT,REPORT=args.source,args.output,args.report
OUT.mkdir(parents=True,exist_ok=True);REPORT.parent.mkdir(parents=True,exist_ok=True)
original=SOURCE.read_bytes();start=24;n,xf,pad=6*SR,2*SR,SR//2
raw=subprocess.check_output(['ffmpeg','-v','error','-ss',str(start),'-t','8','-i',str(SOURCE),'-ac','1','-ar',str(SR),'-af','highpass=f=45,lowpass=f=10000','-f','f32le','-'])
segment=np.frombuffer(raw,np.float32).astype(np.float64)
assert len(segment)>=n+xf
body=segment[:n].copy();t=(np.arange(xf)+.5)/xf
body[:xf]=segment[:xf]*np.sin(t*np.pi/2)+segment[n:n+xf]*np.cos(t*np.pi/2)
padded=np.concatenate([body[-pad:],body,body[:pad]])
gain=min(10**(-24/20)/np.sqrt(np.mean(padded*padded)),10**(-1.5/20)/np.max(np.abs(padded)))
padded*=gain;dest=OUT/'weather-snow-wind-mono.mp3'
subprocess.run(['ffmpeg','-v','error','-y','-f','f64le','-ar',str(SR),'-ac','1','-i','-','-c:a','libmp3lame','-b:a','64k',str(dest)],input=np.ascontiguousarray(padded).tobytes(),check=True)
decoded_raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(dest),'-ac','1','-ar',str(SR),'-f','f32le','-'])
decoded=np.frombuffer(decoded_raw,np.float32)
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','stream=sample_rate,channels','-of','json',str(dest)],text=True))
assert probe['streams'][0]['channels']==1 and int(probe['streams'][0]['sample_rate'])==SR
assert len(decoded)==len(padded)
seam=abs(float(decoded[int(6.5*SR)])-float(decoded[int(6.5*SR)-1]));assert seam<.04
record={'file':dest.name,'bytes':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'source':SOURCE.name,'sourceStart':start,'sampleRate':SR,'channels':1,'duration':len(decoded)/SR,'loopStart':.5,'loopEnd':6.5,'crossfadeSeconds':2,'gainDb':round(float(20*np.log10(gain)),3),'rmsDb':round(float(20*np.log10(np.sqrt(np.mean(padded*padded)))),3),'encodedRmsDb':round(float(20*np.log10(np.sqrt(np.mean(decoded*decoded)))),3),'peakDb':round(float(20*np.log10(np.max(np.abs(decoded)))),3),'actualDecodedSamples':len(decoded),'actualDecodedFloatBytes':len(decoded_raw),'encodedSeamStep':round(seam,7)}
assert SOURCE.read_bytes()==original,'master remains unchanged'
report={'sampleRate':SR,'channels':1,'files':[record],'runtimeBytes':record['bytes'],'decodedBytesAt48k':record['actualDecodedFloatBytes'],'sourceFiles':{'wind':{'name':SOURCE.name,'bytes':len(original),'sha256':hashlib.sha256(original).hexdigest()}}}
assert report['runtimeBytes']<60_000 and report['decodedBytesAt48k']==1_344_000
REPORT.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
