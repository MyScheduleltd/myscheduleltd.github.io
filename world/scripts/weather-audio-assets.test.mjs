import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('published weather excerpts retain their verified mono/48kHz recipe, compact file hashes and decoded-memory budget', async () => {
  const report = JSON.parse(await readFile('art/weather-actions-20261024/weather-audio-build.json', 'utf8'));
  assert.equal(report.files.length, 4);
  assert.ok(report.runtimeBytes < 400000);
  assert.ok(report.decodedBytesAt48k < 8 * 1048576);
  for (const file of report.files) {
    const bytes = await readFile(`src/assets/audio/${file.file}`);
    assert.equal(bytes.length, file.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    assert.equal(file.channels, 1); assert.equal(file.sampleRate, 48000);
    assert.equal(file.actualDecodedFloatBytes, file.actualDecodedSamples * 4);
    if (file.file.endsWith('.mp3')) {
      assert.equal(file.duration, 17); assert.equal(file.loopStart, .5); assert.equal(file.loopEnd, 16.5);
      assert.equal(file.crossfadeSeconds, 3); assert.ok(file.encodedSeamStep < .04);
      assert.ok(Math.abs(file.rmsDb + 24) < .05, 'weather beds match the existing landscape loudness');
    } else {
      assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
      // Parse RIFF chunks; metadata can precede the PCM data.
      let format, data;
      for (let at = 12; at + 8 <= bytes.length;) {
        const key = bytes.toString('ascii', at, at + 4), length = bytes.readUInt32LE(at + 4);
        if (key === 'fmt ') format = bytes.subarray(at + 8, at + 8 + length);
        if (key === 'data') data = bytes.subarray(at + 8, at + 8 + length);
        at += 8 + length + (length % 2);
      }
      assert.ok(format && data); assert.equal(format.readUInt16LE(0), 1); assert.equal(format.readUInt16LE(2), 1);
      assert.equal(format.readUInt32LE(4), 48000); assert.equal(format.readUInt16LE(14), 16);
      assert.ok(data.length / 2 / 48000 <= .5);
      assert.ok(Math.abs(data.readInt16LE(0)) <= 1, 'the attack begins without a click');
      assert.ok(Math.abs(data.readInt16LE(data.length - 2)) <= 1, 'the release ends without a click');
    }
  }
});

test('snow gusts retain their supplied master provenance, seam padding and combined eight-MiB weather/action budget',async()=>{
 const wind=JSON.parse(await readFile('art/weather-coverage-20261025/wind-audio-build.json','utf8'));
 const weather=JSON.parse(await readFile('art/weather-actions-20261024/weather-audio-build.json','utf8'));
 const action=JSON.parse(await readFile('art/weather-actions-20261024/action-audio-build.json','utf8'));
 assert.equal(wind.files.length,1);const file=wind.files[0],bytes=await readFile(`src/assets/audio/${file.file}`);
 assert.equal(file.file,'weather-snow-wind-mono.mp3');assert.equal(bytes.length,file.bytes);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
 assert.equal(file.source,'ES_Wind, General, Heavy, Gusts, Sand Storm 03 - Epidemic Sound.wav');
 assert.equal(file.channels,1);assert.equal(file.sampleRate,48000);assert.equal(file.duration,7);
 assert.equal(file.loopStart,.5);assert.equal(file.loopEnd,6.5);assert.equal(file.crossfadeSeconds,2);
 assert.equal(file.actualDecodedSamples,336000);assert.equal(file.actualDecodedFloatBytes,1_344_000);
 assert.ok(file.encodedSeamStep<.04);assert.ok(Math.abs(file.rmsDb+24)<.05);
 assert.ok(wind.runtimeBytes<60_000);assert.equal(wind.decodedBytesAt48k,file.actualDecodedFloatBytes);
 assert.ok(wind.decodedBytesAt48k+weather.decodedBytesAt48k+action.decodedBytesAt48k<8*1048576);
});
