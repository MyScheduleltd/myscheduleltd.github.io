// Release preflight: every active media URL must be pinned and byte-identical.
// Read-only public downloads; no scoreboard or player-data requests.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import {MOTH_MIRROR_COMMIT, MOTH_MIRROR_PINS, mirrorPath} from './moth-runtime-patches.mjs';
const root = path.resolve(import.meta.dirname, '..');
const integrity = JSON.parse(await fs.readFile(path.join(root, 'docs/moth/asset-integrity.json'), 'utf8'));
const pins = new Map(MOTH_MIRROR_PINS.flatMap(pin => pin.files.map(file => [file, pin.commit])));
const entries = Object.entries(integrity), results = [];
let next = 0;
await Promise.all(Array.from({length: 4}, async () => {
  while (next < entries.length) {
    const [file, expected] = entries[next++];
    const commit = pins.has(file) ? pins.get(file) : MOTH_MIRROR_COMMIT;
    assert.match(commit || '', /^[a-f0-9]{40}$/, 'Active asset needs an immutable CDN pin: ' + file);
    const url = mirrorPath(commit) + file.split('/').map(encodeURIComponent).join('/');
    const started = performance.now();
    try {
      const response = await fetch(url, {signal: AbortSignal.timeout(40000)});
      const bytes = Buffer.from(await response.arrayBuffer());
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      results.push({file, commit, status: response.status, bytes: bytes.length, seconds: +((performance.now() - started) / 1000).toFixed(3), valid: response.status === 200 && sha256 === expected, ...(response.ok ? {} : {error: bytes.toString().slice(0, 250)})});
    } catch (error) {
      results.push({file, commit, valid: false, error: String(error)});
    }
  }
}));
results.sort((a, b) => a.file.localeCompare(b.file));
const failures = results.filter(result => !result.valid);
const report = {checkedAt: new Date().toISOString(), files: results.length, bytes: results.filter(result => result.valid).reduce((sum, result) => sum + result.bytes, 0), failures: failures.length, results};
const directory = path.join(root, '.qa/moth/cleanup-20261106');
await fs.mkdir(directory, {recursive: true});
await fs.writeFile(path.join(directory, 'cdn-assets.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({files: report.files, bytes: report.bytes, failures}));
assert.equal(failures.length, 0, 'Every active CDN asset must be available and match its integrity hash');
console.log('PASS all active game media CDN pins, HTTP responses and SHA-256 hashes');
