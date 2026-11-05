// Files the game publishes beyond the release: the owner's menu sounds
// (moth-menu-sfx.mjs), the deck's buttons in the pad's colours
// (moth-deck-art.mjs), and level 4's basement chest and its audio recording
// (moth-walk-scenes.mjs), plus Level 6's shorter music cut. Each lives in
// moth-asset-additions/ at its published
// path, with its hash in moth-asset-additions/manifest.json; build-moth.mjs
// publishes them alongside the release's files. jsDelivr serves them from the
// commit that added them, MOTH_MIRROR_ADDITIONS_COMMIT; a file added later
// loads from this site until that pin moves to a commit that has it.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
export const ADDED_ASSETS = JSON.parse(fs.readFileSync(path.join(root, 'moth-asset-additions/manifest.json'), 'utf8')).files;
export const addedAsset = file => path.join(root, 'moth-asset-additions', file);
export const MOTH_MIRROR_ADDITIONS_COMMIT = 'b130e49d02b4dc44af7ff7a4285a6a796fffb012';
// A new asset cannot be requested from an older commit that lacks its bytes.
// Null keeps it on this site's hash-checked loader until it has a real pin.
export const ADDITION_MIRROR_PINS = [
  { commit: MOTH_MIRROR_ADDITIONS_COMMIT, files: Object.keys(ADDED_ASSETS).filter(file => !Object.hasOwn(ADDED_ASSETS[file], 'mirrorCommit')) },
  ...Object.entries(ADDED_ASSETS).filter(([, entry]) => Object.hasOwn(entry, 'mirrorCommit'))
    .map(([file, entry]) => ({commit: entry.mirrorCommit, files: [file]}))
];
export const RETIRED_ADDED_ASSETS = ['assets/memes/level4-meme.png', 'assets/audio/fight-cuts/level6-river-short.m4a'];
