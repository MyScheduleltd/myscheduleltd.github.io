// Decode both variants to prove startup preparation preserves every song sample.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {prependAudioSilence} from './moth-fight-audio.mjs';

const root = path.resolve(import.meta.dirname, '..');
const config = JSON.parse(await fs.readFile(path.join(root, 'docs/moth/data/level1.json')));
const specs = Object.values(config).filter(spec => spec?.chart?.easy)
  .concat(config.secretLevels.map(level => level.rhythm), Object.values(config.stageSelectRhythms));
const files = [...new Set(specs.flatMap(spec => [spec.easyAudioSrc, spec.fightCut?.src || spec.audioSrc]))];
assert.equal(files.length, 30);

function decodedHash(bytes, sampleRate, skipBytes = 0) {
  return new Promise((resolve, reject) => {
    const decoder = spawn('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-ac', '2',
      '-ar', String(sampleRate), '-f', 'f32le', 'pipe:1']);
    const digest = createHash('sha256');
    let frames = 0;
    let remaining = skipBytes;
    let stderr = '';
    decoder.stdout.on('data', chunk => {
      const skipped = Math.min(remaining, chunk.length);
      remaining -= skipped;
      const samples = chunk.subarray(skipped);
      frames += samples.length / 8;
      digest.update(samples);
    });
    decoder.stderr.on('data', chunk => { stderr += chunk; });
    decoder.on('error', reject);
    decoder.on('close', code => {
      if (code) reject(new Error(stderr));
      else resolve({frames, hash: digest.digest('hex')});
    });
    decoder.stdin.end(bytes);
  });
}

for (const file of files) {
  const original = await fs.readFile(path.join(root, 'docs/moth', file));
  const prepared = prependAudioSilence(original);
  const silentFrames = Math.round(prepared.lead * prepared.sampleRate);
  const [source, result] = await Promise.all([
    decodedHash(original, prepared.sampleRate),
    decodedHash(prepared.data, prepared.sampleRate, silentFrames * 8)
  ]);
  assert.equal(result.hash, source.hash, file + ' preserves every original decoded sample');
  assert.equal(result.frames, source.frames, file + ' preserves the full song after preparation');
  console.log('PASS', file, source.frames, 'samples', prepared.data.length - original.length, 'added bytes');
}
