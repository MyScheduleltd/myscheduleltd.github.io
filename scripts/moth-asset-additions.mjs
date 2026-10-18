// Files the game publishes beyond the release: the owner's menu sounds
// (moth-menu-sfx.mjs), the deck's buttons in the pad's colours
// (moth-deck-art.mjs), and level 4's basement chest and its picture
// (moth-walk-scenes.mjs). Each lives in moth-asset-additions/ at its published
// path, with its hash in moth-asset-additions/manifest.json; build-moth.mjs
// publishes them alongside the release's files. jsDelivr serves them from the
// commit that added them, MOTH_MIRROR_ADDITIONS_COMMIT; a file added later
// loads from this site until that pin moves to a commit that has it.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
export const ADDED_ASSETS = JSON.parse(fs.readFileSync(path.join(root, 'moth-asset-additions/manifest.json'), 'utf8')).files;
export const addedAsset = file => path.join(root, 'moth-asset-additions', file);
export const MOTH_MIRROR_ADDITIONS_COMMIT = '7874c83e84e717569e126502a7795bd0befd1572';
