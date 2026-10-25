import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

test('the two recorded action excerpts keep their checked PCM payload, timing, loudness and small memory budget',async()=>{
  const report=JSON.parse(await readFile('art/weather-actions-20261024/action-audio-build.json','utf8'));
  const weather=JSON.parse(await readFile('art/weather-actions-20261024/weather-audio-build.json','utf8'));
  assert.deepEqual(report.files.map(file=>file.kind),['snow-brush','punch']);
  assert.ok(report.runtimeBytes<100_000);assert.ok(report.decodedBytesAt48k<200_000);
  assert.ok(report.decodedBytesAt48k+weather.decodedBytesAt48k<8*1024**2,'all new weather/action decoded buffers retain the existing8MiB budget');
  for(const file of report.files){
    const bytes=await readFile('src/assets/audio/'+file.file);
    assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
    assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');
    let format,data;
    for(let at=12;at+8<=bytes.length;){
      const key=bytes.toString('ascii',at,at+4),length=bytes.readUInt32LE(at+4);
      if(key==='fmt ')format=bytes.subarray(at+8,at+8+length);
      if(key==='data')data=bytes.subarray(at+8,at+8+length);
      at+=8+length+(length%2);
    }
    assert.ok(format&&data);assert.equal(format.readUInt16LE(0),1);assert.equal(format.readUInt16LE(2),1);
    assert.equal(format.readUInt32LE(4),48_000);assert.equal(format.readUInt16LE(14),16);
    const frames=data.length/2;let squares=0,peak=0,peakIndex=0;
    for(let i=0;i<frames;i++){const sample=data.readInt16LE(i*2)/32768;squares+=sample*sample;if(Math.abs(sample)>peak){peak=Math.abs(sample);peakIndex=i;}}
    assert.equal(frames,file.decodedSamples);assert.equal(frames*4,file.actualDecodedFloatBytes);
    assert.equal(frames/48_000,file.duration);
    assert.ok(Math.abs(20*Math.log10(Math.sqrt(squares/frames))+23)<.05);
    assert.ok(20*Math.log10(peak)<-1.5,'neither source can clip after normalization');
    assert.ok(Math.abs(data.readInt16LE(0))<=1);assert.ok(Math.abs(data.readInt16LE(data.length-2))<=1,'fade ends click-free');
    assert.ok(Math.abs(peakIndex/48_000-file.peakAtSeconds)<1/48_000);
    assert.equal(file.recommendedSchedulingDelaySeconds,0);
    if(file.kind==='punch'){
      assert.equal(file.sourceCleanHits,1,'the supplied0.811s cut contains one impact, not the five from its untrimmed title');
      assert.equal(report.sourceFiles.punch.duration,.811);assert.ok(file.peakAtSeconds<.03);
    }else{assert.ok(file.peakAtSeconds<.09);assert.equal(file.duration,.52);}
  }
});
