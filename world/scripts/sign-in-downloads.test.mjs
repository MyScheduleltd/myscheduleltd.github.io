import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Everything the sign-in page downloads before ENTER (the owner, 2026-11-12).
const bundle = await build({ entryPoints: ['src/ui/SignInDownloads.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { SignInDownloads, sourceName, publishedName } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));

const settle = async () => { for (let n = 0; n < 6; n++) await Promise.resolve(); };
const watcher = () => { const listeners = new Set(); return { watch: listener => { listeners.add(listener); return () => listeners.delete(listener); }, report: progress => listeners.forEach(l => l(progress)), listeners }; };

test('built names map back to their source files, hashes and all', () => {
  const sizes = { 'cinema-pilaster.glb': 1, 'male-body-dye.png': 2 };
  assert.equal(sourceName('cinema-pilaster.glb', sizes), 'cinema-pilaster.glb', 'an unhashed name it knows is left alone');
  assert.equal(sourceName('male-body-dye-Bc3tGV-t.png', sizes), 'male-body-dye.png');
  assert.equal(sourceName('escape-arcade-Bw9KkDk-.glb', sizes), 'escape-arcade.glb');
  assert.equal(publishedName('http://localhost/assets/moth-arcade-1JFC2tRb.glb?x=1'), 'moth-arcade-1JFC2tRb.glb');
});

test('the bar is bytes as they arrive, each file in full once its preload settles, and done only when sealed and settled', async () => {
  const w = watcher();
  const downloads = new SignInDownloads(w.watch, { 'a.glb': 300, 'b.png': 100 });
  let finishA, failB;
  downloads.track(['/assets/a.glb'], new Promise(resolve => { finishA = resolve; }));
  downloads.track(['/assets/b.png'], new Promise((_, reject) => { failB = reject; }));
  assert.equal(downloads.done, false);
  w.report({ file: 'a.glb', received: 150 });
  w.report({ file: 'unrelated.mp3', received: 9e9 });
  assert.equal(downloads.fraction, 150 / 400);
  failB(new Error('offline'));
  await settle();
  assert.equal(downloads.fraction, 250 / 400, 'a failed file counts as done: the world asks again and reports');
  finishA();
  await settle();
  assert.equal(downloads.fraction, 1);
  assert.equal(downloads.done, false, 'not done until every preload has been tracked');
  downloads.seal();
  assert.equal(downloads.done, true);
  downloads.dispose();
  assert.equal(w.listeners.size, 0);
});
