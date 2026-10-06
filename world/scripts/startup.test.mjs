import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

// Follow the real dependency graph, stopping at dynamic imports: these are
// the modules a cold visitor must download before the gate can render.
test('the gate renders without the 3D engine, terrain or avatar animation dependencies', async () => {
  const result = await build({entryPoints:['src/ui/App.ts'], bundle:true, write:false, metafile:true,
    loader:{'.png':'dataurl'}, format:'esm', splitting:true, outdir:'/tmp/startup-test'});
  const inputs = result.metafile.inputs;
  const visited = new Set();
  const visit = path => {
    if (visited.has(path)) return;
    visited.add(path);
    for (const dependency of inputs[path]?.imports ?? []) {
      if (!dependency.external && dependency.kind !== 'dynamic-import') visit(dependency.path);
    }
  };
  visit('src/ui/App.ts');
  for (const path of visited) {
    assert.ok(!/node_modules\/three\/|\/ImportedAvatar\.ts|\/CoastalTerrain\.ts|\/moves\.json/.test(path), path);
  }
});

test('the embedded brand image is the original PNG, without a separate image download', async () => {
  const result = await build({entryPoints:['src/ui/App.ts'], bundle:true, write:false,
    loader:{'.png':'dataurl'}, format:'esm'});
  const original = await readFile('src/assets/company-logo.png');
  assert.ok(result.outputFiles[0].text.includes(`data:image/png;base64,${original.toString('base64')}`));
});
