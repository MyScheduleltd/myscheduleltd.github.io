// Usage (2026-10-17): sharp is not a project dependency, so install it beside
// a scratch copy and point NODE_PATH at it:
//   npm i --prefix /tmp/glb sharp@0.33.5
//   NODE_PATH=/tmp/glb/node_modules node tools/repack-glb-textures.mjs <outDir> src/assets/.../model.glb ...
// Then compare, copy over, and update art/VENUE_ASSET_PROVENANCE_20261009.json.
import { createRequire } from 'node:module';
// Re-encodes a GLB's large embedded textures as lossy WebP at the same size,
// leaving every other byte region (meshopt streams, skins, accessors) as it was.
import fs from 'node:fs';
import path from 'node:path';
const sharp = createRequire(import.meta.url)('sharp');

const [, , outDir, ...files] = process.argv;
const MIN_BYTES = 150 * 1024;

async function raw(bytes) {
  const { data, info } = await sharp(bytes, { failOn: 'none' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, info };
}
function psnr(a, b, alpha) {
  let se = 0, n = 0;
  for (let i = 0; i < a.length; i += 4) for (let c = 0; c < (alpha ? 4 : 3); c++) { const d = a[i + c] - b[i + c]; se += d * d; n++; }
  return se === 0 ? Infinity : 10 * Math.log10(255 * 255 / (se / n));
}
const align4 = (n) => (n + 3) & ~3;

for (const file of files) {
  const glb = fs.readFileSync(file);
  if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB`);
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
  const binStart = 20 + jsonLength + 8;
  const bin = glb.subarray(binStart, binStart + glb.readUInt32LE(20 + jsonLength));

  // Which images are normal maps, from the materials that use them.
  const textureSource = (t) => t.extensions?.EXT_texture_webp?.source ?? t.source;
  const normalImages = new Set();
  for (const m of json.materials ?? []) if (m.normalTexture) normalImages.add(textureSource(json.textures[m.normalTexture.index]));

  // Every region of buffer 0, whether a plain view or a meshopt stream.
  const regions = [];
  (json.bufferViews ?? []).forEach((view, index) => {
    if (view.buffer === 0) regions.push({ owner: view, key: 'byteOffset', offset: view.byteOffset ?? 0, length: view.byteLength, index });
    const ext = view.extensions?.EXT_meshopt_compression;
    if (ext && ext.buffer === 0) regions.push({ owner: ext, key: 'byteOffset', offset: ext.byteOffset ?? 0, length: ext.byteLength, index: -1 });
  });
  regions.sort((a, b) => a.offset - b.offset);
  for (let i = 1; i < regions.length; i++) if (regions[i].offset < regions[i - 1].offset + regions[i - 1].length) throw new Error(`${file}: overlapping regions`);

  const replaced = new Map();
  const report = [];
  for (const [imageIndex, image] of (json.images ?? []).entries()) {
    if (image.bufferView === undefined) continue;
    const view = json.bufferViews[image.bufferView];
    const original = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    if (original.length < MIN_BYTES) continue;
    const meta = await sharp(original).metadata();
    const normal = normalImages.has(imageIndex);
    const hasAlpha = Boolean(meta.hasAlpha);
    const before = await raw(original);
    // The visitor's own body is seen closest: its atlases carry lettering and
    // stripes, which quality 90 softens and 97 does not (crops, 2026-10-17).
    const ownBody = path.basename(file) === 'male.glb';
    const floor = normal ? 42 : ownBody ? 38.5 : 40;
    // Gentlest setting that still holds the floor and saves at least 15%.
    const ladder = normal
      ? [{ quality: 96 }, { quality: 99 }, { nearLossless: true, quality: 60 }, { nearLossless: true, quality: 80 }]
      : ownBody ? [{ quality: 97 }] : [{ quality: 90 }, { quality: 94 }, { quality: 97 }, { lossless: true }];
    let encoded = original, score = Infinity, keep = true;
    for (const step of ladder) {
      const candidate = await sharp(original, { failOn: 'none' })
        .webp({ alphaQuality: 100, smartSubsample: true, effort: 6, exact: hasAlpha, ...step })
        .toBuffer();
      const after = await raw(candidate);
      const s = psnr(before.data, after.data, false);
      const a = hasAlpha ? psnr(before.data, after.data, true) : Infinity;
      encoded = candidate; score = Math.min(s, a);
      if (candidate.length <= original.length * 0.85 && score >= floor && !meta.icc) { keep = false; break; }
    }
    report.push(`${(image.name ?? imageIndex).toString().padEnd(18)} ${meta.format}${meta.icc ? '+icc' : ''} ${meta.width}x${meta.height}${hasAlpha ? ' alpha' : ''}${normal ? ' normal' : ''}  ${Math.round(original.length / 1024)}KB -> ${Math.round(encoded.length / 1024)}KB  PSNR ${score.toFixed(1)}dB  ${keep ? 'KEPT ORIGINAL' : 'replaced'}`);
    if (!keep) replaced.set(image.bufferView, { bytes: encoded, imageIndex });
  }

  // Re-lay buffer 0 in its original order with the new image bytes.
  const chunks = [];
  let cursor = 0;
  for (const region of regions) {
    const swap = region.index >= 0 ? replaced.get(region.index) : undefined;
    const bytes = swap ? swap.bytes : bin.subarray(region.offset, region.offset + region.length);
    cursor = align4(cursor);
    region.owner[region.key] = cursor;
    if (region.index >= 0) json.bufferViews[region.index].byteLength = bytes.length;
    if (region.index < 0) region.owner.byteLength = bytes.length;
    chunks.push({ at: cursor, bytes });
    cursor += bytes.length;
  }
  const newBin = Buffer.alloc(align4(cursor));
  for (const c of chunks) Buffer.from(c.bytes.buffer, c.bytes.byteOffset, c.bytes.length).copy(newBin, c.at);
  json.buffers[0].byteLength = newBin.length;

  for (const { imageIndex } of replaced.values()) {
    json.images[imageIndex].mimeType = 'image/webp';
    for (const texture of json.textures ?? []) {
      if (texture.source === imageIndex) {
        delete texture.source;
        texture.extensions = { ...texture.extensions, EXT_texture_webp: { source: imageIndex } };
      }
    }
  }
  if (replaced.size) {
    json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), 'EXT_texture_webp'])];
    json.extensionsRequired = [...new Set([...(json.extensionsRequired ?? []), 'EXT_texture_webp'])];
  }

  let jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(align4(jsonBytes.length) - jsonBytes.length, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBytes.length + 8 + newBin.length, 8);
  const jsonHeader = Buffer.alloc(8); jsonHeader.writeUInt32LE(jsonBytes.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(newBin.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  const out = path.join(outDir, path.basename(file));
  fs.writeFileSync(out, Buffer.concat([header, jsonHeader, jsonBytes, binHeader, newBin]));
  console.log(`== ${path.basename(file)}  ${(glb.length / 1048576).toFixed(2)}MB -> ${(fs.statSync(out).size / 1048576).toFixed(2)}MB`);
  for (const line of report) console.log('   ' + line);
}
