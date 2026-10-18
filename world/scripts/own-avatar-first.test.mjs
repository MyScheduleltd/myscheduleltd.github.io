import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

// The sign-in page draws her as soon as her own body is in (the owner,
// 2026-10-18), before his 8 MB has arrived. Her body alone must be enough to
// dress an avatar, and his must take over the moment it lands if it is chosen.
globalThis.self = globalThis;
globalThis.createImageBitmap = async blob => {
  const data = new DataView(await blob.arrayBuffer());
  return { width: data.getUint32(16), height: data.getUint32(20), close() {} };
};
globalThis.document = { createElement: () => ({ width: 64, height: 64, getContext: () => ({ fillRect() {} }) }) };
const bundle = await build({
  stdin: { contents: "export * from './src/world/ImportedAvatar'; export * from './src/world/CoastalAvatar'; export * from './src/world/CoastalPose'; export * as THREE from 'three';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, loader: { '.png': 'dataurl' }, platform: 'node', format: 'esm', write: false,
});
const { THREE, loadImportedAvatar, attachImportedAvatar, avatarLoadFraction, createCoastalAvatar, walkCoastalPose, syncImportedAvatars } =
  await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const body = async sex => { const bytes = await readFile(`src/assets/avatars/${sex}.glb`); return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); };
const PALETTE = { skin: '#fbcfb8', hair: '#483e3f', top: '#28191b', bottoms: '#383638', swimwear: '#141314' };
const shown = root => { let name; root.traverse(o => { if (/^Higgsfield avatar/.test(o.name)) name = o.name.split(' · ')[1]; }); return name; };
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

test('her body alone dresses her, and his replaces it only once it lands and is chosen', async () => {
  await loadImportedAvatar({ female: await body('female') });
  assert.equal(avatarLoadFraction('female'), 1, 'hers is ready to draw');
  assert.ok(avatarLoadFraction('male') < 1, 'his is not');

  const root = new THREE.Group();
  new THREE.Scene().add(root); // An avatar out of the world stops listening for bodies.
  const rig = createCoastalAvatar(root, PALETTE, true, new THREE.Group());
  assert.doesNotThrow(() => attachImportedAvatar(root, rig, PALETTE), 'no male body needed to draw her');
  walkCoastalPose(rig, 0, 0);
  syncImportedAvatars(root);
  assert.equal(shown(root), 'female');

  // Chosen before his body has arrived: hers stands in rather than failing.
  root.userData.setImportedPalette({ ...PALETTE, top: '#18191b' });
  assert.equal(shown(root), 'female');

  await loadImportedAvatar({ male: await body('male') });
  await settle();
  assert.equal(shown(root), 'male', 'his body is put on when it lands');
  root.userData.disposeImportedAvatar();
});
