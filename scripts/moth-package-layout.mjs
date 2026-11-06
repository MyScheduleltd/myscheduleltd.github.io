// One authoritative file list for the generated game package. Original
// sources and QA snapshots are outside this directory and are never pruned.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {TRIMMED_FILES} from './moth-asset-trim.mjs';
import {ADDED_ASSETS} from './moth-asset-additions.mjs';

export const SNAPSHOT_EXCLUDED_FILES = new Set([
  'index.html', 'src/game.js', 'manifest.json',
  'haptics-test.html', 'haptics-test2.html', 'sfx-test.html'
]);
const GENERATED_FILES = [
  'index.html', 'src/game.js', 'src/arcade-embed.js', 'manifest.json',
  'staff/index.html', 'staff/game.js', 'staff/manifest.json', 'asset-integrity.json'
];
export function packageFiles(snapshot) {
  return new Set([
    ...snapshot.files.map(file => file.path).filter(file => !TRIMMED_FILES.has(file) && !SNAPSHOT_EXCLUDED_FILES.has(file)),
    ...Object.keys(ADDED_ASSETS), ...GENERATED_FILES
  ]);
}

export async function prunePackageArtifacts(directory, expected) {
  const removed = [], actual = [];
  const walk = async relative => {
    const folder = path.join(directory, relative);
    for (const entry of await fs.readdir(folder, {withFileTypes: true})) {
      const file = relative ? relative + '/' + entry.name : entry.name;
      assert(!entry.isSymbolicLink(), 'Generated package cannot contain symlinks: ' + file);
      if (entry.isDirectory()) {
        await walk(file);
        if (!(await fs.readdir(path.join(directory, file))).length) await fs.rmdir(path.join(directory, file));
      } else if (!expected.has(file)) {
        // Only stale generated resources and the retired diagnostic pages
        // may be removed automatically. Unexpected source/code fails closed.
        const resource = /^(assets|data|songs|waveforms|referenceimages)\//.test(file)
          && /\.(webp|png|jpe?g|gif|svg|ico|wav|m4a|mp3|ogg|json|woff2?)$/i.test(file);
        assert(resource || /^(haptics-test2?|sfx-test)\.html$/.test(file), 'Unregistered package file needs inspection: ' + file);
        await fs.unlink(path.join(directory, file));
        removed.push(file);
      } else actual.push(file);
    }
  };
  await walk('');
  assert.deepEqual(actual.sort(), [...expected].sort(), 'Generated package contains exactly its active file list');
  let bytes = 0;
  for (const file of actual) bytes += (await fs.stat(path.join(directory, file))).size;
  return {files: actual.length, bytes, removedStaleFiles: removed.sort()};
}
