// Real rig CPU probe, excluding renderer/GPU work.
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 1024, height: 1024, close() {} });
globalThis.document = { createElement: () => ({ width: 64, height: 64, getContext: () => ({ fillRect() {} }) }) };
const bundle = await build({ stdin: { contents: "export * from './src/world/ImportedAvatar';export * from './src/world/CoastalAvatar';export * from './src/world/CoastalPose';export * as THREE from 'three'", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, loader: { '.png': 'dataurl' }, platform: 'node', format: 'esm', write: false });
const { THREE, loadImportedAvatar, attachImportedAvatar, createCoastalAvatar, walkCoastalPose, supportCoastalPose, syncImportedAvatars } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const bytes = Object.fromEntries(await Promise.all(['male', 'female'].map(async key => { const b = await readFile(`src/assets/avatars/${key}.glb`); return [key, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)]; })));
await loadImportedAvatar(bytes);
const scene = new THREE.Scene(), palette = { skin: '#dfb590', hair: '#3b3633', top: '#18191b', bottoms: '#44464a', swimwear: '#577467' };
const avatars = [], creation = [];
for (let i = 0; i < 20; i++) {
 const start = performance.now(), root = new THREE.Group(); root.position.set(i % 5 * 2, .28, Math.floor(i / 5) * 3); scene.add(root);
 const rig = attachImportedAvatar(root, createCoastalAvatar(root, palette, false, new THREE.Group()), palette);
 creation.push(performance.now() - start); avatars.push({root,rig});
}
const quantiles = a => { a.sort((x,y)=>x-y); return {p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:a.at(-1)}; };
const frames = [], snapshots = [];
for (let frame = 0; frame < 120; frame++) {
 const start = performance.now();
 for (const { root, rig } of avatars) { root.position.z += .01; walkCoastalPose(rig,frame*.1,.65); supportCoastalPose(rig,()=>0); }
 syncImportedAvatars(scene); scene.updateMatrixWorld(); frames.push(performance.now()-start);
 if(frame%8===0){const at=performance.now();for(const {root} of avatars){root.userData.setImportedSwimwear(false);root.userData.setImportedPalette({...palette});} snapshots.push(performance.now()-at);}
}
const report = {visitors:20,creationMs:creation,totalCreationMs:creation.reduce((a,b)=>a+b,0),frameCpuMs:quantiles(frames),unchangedAppearanceSnapshotMs:quantiles(snapshots),note:'Node CPU probe with real geometry/rigs and dimension-only bitmap stubs; excludes rendering, server and browser GPU cost'};
console.log(JSON.stringify(report)); if(process.argv[2]) await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');
for(const {root} of avatars)root.userData.disposeImportedAvatar();
