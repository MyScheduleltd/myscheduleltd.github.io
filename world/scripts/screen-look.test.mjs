import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// The PS1 screen layer (the owner, 2026-11-09: subtle, resolution and dither only).
const bundle = await build({ entryPoints: ['src/world/ScreenLook.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { ps1PixelRatio, PS1_SHORT_SIDE } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));

const drawn = (width, height, dpr) => {
  const ratio = ps1PixelRatio(width, height, dpr);
  return { ratio, block: dpr / ratio, width: Math.round(width * ratio), height: Math.round(height * ratio) };
};

test('every drawn pixel is a whole number of device pixels, so the blocks stay even', () => {
  for (const [width, height, dpr] of [[402, 874, 3], [874, 402, 3], [390, 844, 3], [1440, 900, 2], [1920, 1080, 1], [1280, 720, 1.5], [768, 1024, 2]]) {
    const { block } = drawn(width, height, dpr);
    assert.equal(block, Math.round(block), `${width}x${height}@${dpr} block ${block}`);
    assert.ok(block >= 1);
  }
});

test('the short side lands near the PS1 target on phones and desks alike', () => {
  assert.equal(PS1_SHORT_SIDE, 360);
  for (const [width, height, dpr] of [[402, 874, 3], [874, 402, 3], [1440, 900, 2], [1920, 1080, 1], [1280, 720, 1.5]]) {
    const { width: w, height: h } = drawn(width, height, dpr);
    const short = Math.min(w, h);
    assert.ok(short >= 260 && short <= 540, `${width}x${height}@${dpr} draws ${w}x${h}`);
  }
  assert.deepEqual(drawn(1440, 900, 2), { ratio: .4, block: 5, width: 576, height: 360 });
  assert.deepEqual(drawn(402, 874, 3), { ratio: 1, block: 3, width: 402, height: 874 }, 'a phone keeps the crisp 3×3 blocks 精簡 already used');
});

test('nonsense sizes and ratios fall back safely', () => {
  assert.equal(ps1PixelRatio(0, 0, 0), 1);
  assert.equal(ps1PixelRatio(100, 100, Number.NaN), 1);
});
