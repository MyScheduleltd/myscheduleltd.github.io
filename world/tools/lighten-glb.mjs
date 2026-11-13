// Lighten chosen meshes of a meshopt-compressed GLB without touching anything
// else (the owner, 2026-11-12: "lighter models, same look").
//
// Index-only simplification (meshoptimizer): the surviving vertices keep their
// exact position, normal, UV, skin joints and weights, custom masks and morph
// deltas; only triangles are removed. Every other buffer view is copied byte
// for byte, compressed or not; changed streams are re-encoded with the same
// EXT_meshopt_compression mode and stride.
//
// meshoptimizer is not a project dependency; point MESHOPT_DIR at an installed
// copy (npm i --prefix /tmp/meshopt meshoptimizer@0.22.0):
//   MESHOPT_DIR=/tmp/meshopt/node_modules/meshoptimizer node tools/lighten-glb.mjs \
//     in.glb out.glb '{"0":0.002}' [maskWeight] [normalWeight] [freeBonesJson]
// Per mesh index: a relative error limit under 1, or a triangle count. With
// freeBonesJson, only vertices skinned wholly to those bones may go.
//
// The male avatar, 2026-11-12 (121,710 -> 78,030 body triangles, tests intact):
//   ... src/assets/avatars/male.glb out.glb '{"0":0.002}' 4 0.1 \
//     '["Head","head_end","headfront","Spine01","LeftArm","RightArm","LeftLeg","RightLeg"]'
// The hands, wrists, feet, neck, collar and swim-short hems stay exact (their
// repairs are pinned by male-wardrobe-fit and swim-body-match), and the tee is
// left alone: simplifying it opened its seams and floated its prints.
import { readFileSync, writeFileSync } from 'node:fs';
const M = process.env.MESHOPT_DIR;
if (!M) throw new Error('Set MESHOPT_DIR to an installed meshoptimizer package');
const { MeshoptSimplifier } = await import(`${M}/meshopt_simplifier.module.js`);
const { MeshoptEncoder } = await import(`${M}/meshopt_encoder.module.js`);
const { MeshoptDecoder } = await import(`${M}/meshopt_decoder.module.js`);
await Promise.all([MeshoptSimplifier.ready, MeshoptEncoder.ready, MeshoptDecoder.ready]);
MeshoptSimplifier.useExperimentalFeatures = true;

const [input, output, targetsJson, maskWeightArg, normalWeightArg, freeBonesArg] = process.argv.slice(2);
// Only vertices skinned wholly (>= .999) to these bones may move; all others are locked.
const freeBones = freeBonesArg ? JSON.parse(freeBonesArg) : undefined;
const targets = JSON.parse(targetsJson);
const maskWeight = Number(maskWeightArg ?? 1), normalWeight = Number(normalWeightArg ?? .5);
const file = readFileSync(input);
const jsonLength = file.readUInt32LE(12);
const json = JSON.parse(file.subarray(20, 20 + jsonLength).toString('utf8'));
const binStart = 20 + jsonLength + 8;
const bin = file.subarray(binStart, binStart + file.readUInt32LE(20 + jsonLength));
const { accessors, bufferViews } = json;

const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const ARRAY = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };

/** Raw (decompressed) bytes of a buffer view. */
const raw = new Map();
function viewBytes(index) {
  if (raw.has(index)) return raw.get(index);
  const view = bufferViews[index], ext = view.extensions?.EXT_meshopt_compression;
  let bytes;
  if (ext) {
    bytes = new Uint8Array(ext.count * ext.byteStride);
    const source = bin.subarray(ext.byteOffset ?? 0, (ext.byteOffset ?? 0) + ext.byteLength);
    MeshoptDecoder.decodeGltfBuffer(bytes, ext.count, ext.byteStride, source, ext.mode, ext.filter);
  } else {
    if (view.buffer !== 0) throw new Error(`view ${index} is in buffer ${view.buffer}`);
    bytes = new Uint8Array(bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
  }
  raw.set(index, bytes);
  return bytes;
}
/** A tightly packed typed array of an accessor (dense part; zeros when it has no view). */
function read(index) {
  const a = accessors[index], size = SIZE[a.type], Type = ARRAY[a.componentType];
  const out = new Type(a.count * size);
  if (a.bufferView !== undefined) {
    const bytes = viewBytes(a.bufferView), view = bufferViews[a.bufferView];
    const stride = view.extensions?.EXT_meshopt_compression?.byteStride ?? view.byteStride ?? size * BYTES[a.componentType];
    const element = size * BYTES[a.componentType];
    for (let i = 0; i < a.count; i++) {
      const start = (a.byteOffset ?? 0) + i * stride;
      out.set(new Type(bytes.buffer.slice(bytes.byteOffset + start, bytes.byteOffset + start + element)), i * size);
    }
  }
  if (a.sparse) {
    const indices = new ARRAY[a.sparse.indices.componentType](viewBytes(a.sparse.indices.bufferView).slice().buffer, a.sparse.indices.byteOffset ?? 0, a.sparse.count);
    const values = new Type(viewBytes(a.sparse.values.bufferView).slice().buffer, a.sparse.values.byteOffset ?? 0, a.sparse.count * size);
    for (let i = 0; i < a.sparse.count; i++) for (let c = 0; c < size; c++) out[indices[i] * size + c] = values[i * size + c];
  }
  return out;
}

/** New buffer views appended for changed data: { bytes, meshopt?: {mode, count, stride} }. */
const added = [];
function addView(bytes, meshopt) { added.push({ bytes, meshopt }); return bufferViews.length + added.length - 1; }

const report = [];
for (const [meshIndex, targetTriangles] of Object.entries(targets)) {
  const mesh = json.meshes[Number(meshIndex)];
  for (const primitive of mesh.primitives) {
    const positions = read(primitive.attributes.POSITION);
    const vertexCount = accessors[primitive.attributes.POSITION].count;
    const indices = Uint32Array.from(read(primitive.indices));
    const normals = primitive.attributes.NORMAL !== undefined ? read(primitive.attributes.NORMAL) : undefined;
    const masks = Object.keys(primitive.attributes).filter(k => k.startsWith('_')).map(k => read(primitive.attributes[k]));
    // Attributes the error metric weighs: the normal, and each outfit/skin
    // mask, so a mask's edge (where clothing hides the body) stays put.
    const stride = (normals ? 3 : 0) + masks.length;
    const attributes = new Float32Array(vertexCount * Math.max(stride, 1));
    const weights = [...(normals ? [normalWeight, normalWeight, normalWeight] : []), ...masks.map(() => maskWeight)];
    for (let v = 0; v < vertexCount; v++) {
      let o = v * stride;
      if (normals) { attributes[o++] = normals[v * 3]; attributes[o++] = normals[v * 3 + 1]; attributes[o++] = normals[v * 3 + 2]; }
      for (const mask of masks) attributes[o++] = mask[v];
    }
    // A value under 1 is a relative error limit (as far down as that allows);
    // otherwise a triangle count.
    const byError = targetTriangles < 1;
    const target = byError ? 0 : Math.min(indices.length, Math.floor(targetTriangles) * 3);
    let lock = null, locked = 0;
    if (freeBones && primitive.attributes.JOINTS_0 !== undefined) {
      const joints = read(primitive.attributes.JOINTS_0), skinWeights = read(primitive.attributes.WEIGHTS_0);
      const skin = json.skins.find(s => true), names = skin.joints.map(n => json.nodes[n].name);
      lock = new Uint8Array(vertexCount);
      for (let v = 0; v < vertexCount; v++) {
        let free = 0;
        for (let c = 0; c < 4; c++) if (freeBones.includes(names[joints[v * 4 + c]])) free += skinWeights[v * 4 + c];
        if (free < .999) { lock[v] = 1; locked++; }
      }
    }
    const limit = byError ? targetTriangles : 1;
    const [simplified, error] = stride
      ? MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, attributes, stride, weights, lock, target, limit, [])
      : MeshoptSimplifier.simplify(indices, positions, 3, target, limit, []);
    // Vertex-cache order, and only the vertices still used, renumbered.
    const reordered = Uint32Array.from(simplified);
    const [remap, unique] = MeshoptEncoder.reorderMesh(reordered, true, true);
    const scale = MeshoptSimplifier.getScale(positions, 3);
    report.push({ mesh: mesh.name, locked, triangles: [indices.length / 3, reordered.length / 3], vertices: [vertexCount, unique], error: +(error * scale).toFixed(5) });

    const remapAccessor = (index) => {
      const a = accessors[index], size = SIZE[a.type], source = read(index), Type = ARRAY[a.componentType];
      const out = new Type(unique * size);
      for (let v = 0; v < vertexCount; v++) {
        const to = remap[v];
        if (to === 0xffffffff) continue;
        for (let c = 0; c < size; c++) out[to * size + c] = source[v * size + c];
      }
      return { a, size, out };
    };
    const writeDense = (index) => {
      const { a, size, out } = remapAccessor(index);
      const element = size * BYTES[a.componentType];
      const stride4 = Math.ceil(element / 4) * 4; // meshopt ATTRIBUTES needs a multiple of 4
      let bytes = new Uint8Array(out.buffer);
      if (stride4 !== element) {
        const padded = new Uint8Array(unique * stride4);
        for (let v = 0; v < unique; v++) padded.set(bytes.subarray(v * element, v * element + element), v * stride4);
        bytes = padded;
      }
      const copy = { ...a, count: unique, byteOffset: 0 };
      delete copy.sparse;
      copy.bufferView = addView(bytes, { mode: 'ATTRIBUTES', count: unique, stride: stride4 });
      if (a.min && a.max) {
        const min = Array(size).fill(Infinity), max = Array(size).fill(-Infinity);
        for (let v = 0; v < unique; v++) for (let c = 0; c < size; c++) { min[c] = Math.min(min[c], out[v * size + c]); max[c] = Math.max(max[c], out[v * size + c]); }
        copy.min = min; copy.max = max;
      }
      accessors.push(copy);
      return accessors.length - 1;
    };
    const writeTarget = (index) => {
      const { a, size, out } = remapAccessor(index);
      const copy = { type: a.type, componentType: a.componentType, count: unique };
      const nonzero = [];
      for (let v = 0; v < unique; v++) for (let c = 0; c < size; c++) if (out[v * size + c] !== 0) { nonzero.push(v); break; }
      if (a.min) { copy.min = a.min; copy.max = a.max; }
      if (nonzero.length) {
        const idx = Uint32Array.from(nonzero), values = new Float32Array(nonzero.length * size);
        nonzero.forEach((v, i) => { for (let c = 0; c < size; c++) values[i * size + c] = out[v * size + c]; });
        const min = Array(size).fill(Infinity), max = Array(size).fill(-Infinity);
        for (let i = 0; i < nonzero.length; i++) for (let c = 0; c < size; c++) { min[c] = Math.min(min[c], values[i * size + c]); max[c] = Math.max(max[c], values[i * size + c]); }
        copy.min = min; copy.max = max;
        copy.sparse = { count: nonzero.length, indices: { bufferView: addView(new Uint8Array(idx.buffer)), byteOffset: 0, componentType: 5125 }, values: { bufferView: addView(new Uint8Array(values.buffer)), byteOffset: 0 } };
      }
      accessors.push(copy);
      return accessors.length - 1;
    };
    for (const key of Object.keys(primitive.attributes)) primitive.attributes[key] = writeDense(primitive.attributes[key]);
    if (primitive.targets) primitive.targets = primitive.targets.map(t => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, writeTarget(v)])));
    const indexAccessor = { ...accessors[primitive.indices], count: reordered.length, byteOffset: 0 };
    delete indexAccessor.min; delete indexAccessor.max;
    indexAccessor.componentType = 5125;
    indexAccessor.bufferView = addView(new Uint8Array(reordered.buffer), { mode: 'TRIANGLES', count: reordered.length, stride: 4 });
    accessors.push(indexAccessor);
    primitive.indices = accessors.length - 1;
  }
}

// Drop accessors and buffer views nothing refers to any more.
const usedAccessors = new Set();
const markAccessors = (value) => {
  if (Array.isArray(value)) value.forEach(markAccessors);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) {
    if (['indices', 'POSITION'].includes(k) && typeof v === 'number') usedAccessors.add(v);
    markAccessors(v);
  }
};
for (const mesh of json.meshes) for (const p of mesh.primitives) {
  Object.values(p.attributes).forEach(i => usedAccessors.add(i)); usedAccessors.add(p.indices);
  for (const t of p.targets ?? []) Object.values(t).forEach(i => usedAccessors.add(i));
}
for (const skin of json.skins ?? []) if (skin.inverseBindMatrices !== undefined) usedAccessors.add(skin.inverseBindMatrices);
for (const anim of json.animations ?? []) for (const s of anim.samplers) { usedAccessors.add(s.input); usedAccessors.add(s.output); }
const accessorMap = new Map(); const newAccessors = [];
accessors.forEach((a, i) => { if (usedAccessors.has(i)) { accessorMap.set(i, newAccessors.length); newAccessors.push(a); } });
for (const mesh of json.meshes) for (const p of mesh.primitives) {
  for (const k of Object.keys(p.attributes)) p.attributes[k] = accessorMap.get(p.attributes[k]);
  p.indices = accessorMap.get(p.indices);
  if (p.targets) p.targets = p.targets.map(t => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, accessorMap.get(v)])));
}
for (const skin of json.skins ?? []) if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = accessorMap.get(skin.inverseBindMatrices);
for (const anim of json.animations ?? []) for (const s of anim.samplers) { s.input = accessorMap.get(s.input); s.output = accessorMap.get(s.output); }
json.accessors = newAccessors;

const allViews = [...bufferViews.map((view, index) => ({ view, index })), ...added.map((entry, i) => ({ entry, index: bufferViews.length + i }))];
const usedViews = new Set();
for (const a of json.accessors) { if (a.bufferView !== undefined) usedViews.add(a.bufferView); if (a.sparse) { usedViews.add(a.sparse.indices.bufferView); usedViews.add(a.sparse.values.bufferView); } }
for (const image of json.images ?? []) if (image.bufferView !== undefined) usedViews.add(image.bufferView);

// Lay out buffer 0 (real bytes) and buffer 1 (meshopt's virtual fallback).
const chunks = []; let offset0 = 0, offset1 = 0;
const align = (n, to = 4) => Math.ceil(n / to) * to;
const viewMap = new Map(); const newViews = [];
for (const { view, entry, index } of allViews) {
  if (!usedViews.has(index)) continue;
  let out;
  if (view) {
    const ext = view.extensions?.EXT_meshopt_compression;
    if (ext) {
      const bytes = bin.subarray(ext.byteOffset ?? 0, (ext.byteOffset ?? 0) + ext.byteLength);
      offset0 = align(offset0); chunks.push([offset0, bytes]);
      offset1 = align(offset1, 16);
      out = { ...view, buffer: 1, byteOffset: offset1, byteLength: ext.count * ext.byteStride,
        extensions: { ...view.extensions, EXT_meshopt_compression: { ...ext, buffer: 0, byteOffset: offset0, byteLength: bytes.length } } };
      offset0 += bytes.length; offset1 += ext.count * ext.byteStride;
    } else {
      const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
      offset0 = align(offset0); chunks.push([offset0, bytes]);
      out = { ...view, buffer: 0, byteOffset: offset0 }; offset0 += bytes.length;
    }
  } else if (entry.meshopt) {
    const { mode, count, stride } = entry.meshopt;
    const encoded = MeshoptEncoder.encodeGltfBuffer(entry.bytes, count, stride, mode);
    offset0 = align(offset0); chunks.push([offset0, encoded]);
    offset1 = align(offset1, 16);
    out = { buffer: 1, byteOffset: offset1, byteLength: count * stride, ...(mode === 'ATTRIBUTES' ? { byteStride: stride } : {}),
      extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: offset0, byteLength: encoded.length, byteStride: stride, mode, count } } };
    offset0 += encoded.length; offset1 += count * stride;
  } else {
    offset0 = align(offset0); chunks.push([offset0, entry.bytes]);
    out = { buffer: 0, byteOffset: offset0, byteLength: entry.bytes.length }; offset0 += entry.bytes.length;
  }
  viewMap.set(index, newViews.length); newViews.push(out);
}
for (const a of json.accessors) { if (a.bufferView !== undefined) a.bufferView = viewMap.get(a.bufferView); if (a.sparse) { a.sparse.indices.bufferView = viewMap.get(a.sparse.indices.bufferView); a.sparse.values.bufferView = viewMap.get(a.sparse.values.bufferView); } }
for (const image of json.images ?? []) if (image.bufferView !== undefined) image.bufferView = viewMap.get(image.bufferView);
json.bufferViews = newViews;
const binLength = align(offset0);
json.buffers[0].byteLength = binLength;
json.buffers[1].byteLength = align(offset1, 16);

const outBin = Buffer.alloc(binLength);
for (const [at, bytes] of chunks) Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).copy(outBin, at);
let jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(align(jsonBytes.length) - jsonBytes.length, 0x20)]);
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
const jsonHeader = Buffer.alloc(8); jsonHeader.writeUInt32LE(jsonBytes.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(outBin.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
const total = 12 + 8 + jsonBytes.length + 8 + outBin.length; header.writeUInt32LE(total, 8);
writeFileSync(output, Buffer.concat([header, jsonHeader, jsonBytes, binHeader, outBin]));
console.log(JSON.stringify({ input: file.length, output: total, report }, null, 1));
