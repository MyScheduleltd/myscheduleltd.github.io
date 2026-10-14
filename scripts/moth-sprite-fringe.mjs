// Key-fringe cleanup for the sprites cut from a magenta background (owner,
// 2026-10-13: a purple outline around Dr. Beauty's portraits after level 4's
// win talk). Every sprite with leftovers was reviewed before and after with
// the owner, who approved them; level 3's notes were left out, and the ones
// in retired parts of the game were then removed (moth-asset-trim.mjs).
//
// The cleanup is baked into the files: scripts/bake-key-fringe.py writes a
// lossless cleaned copy of each sprite in moth-asset-patches/key-fringe.json to
// moth-asset-patches/, with its release hash in manifest.json; build-moth.mjs
// publishes those copies in place of the release files.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
export const KEY_FRINGE_MANIFEST = JSON.parse(fs.readFileSync(path.join(root, 'moth-asset-patches/manifest.json'), 'utf8')).files;
export const KEY_FRINGE_SPRITES = Object.keys(KEY_FRINGE_MANIFEST);
export const patchedAsset = file => path.join(root, 'moth-asset-patches', file);
