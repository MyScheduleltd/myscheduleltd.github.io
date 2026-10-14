// Files the game publishes beyond the release: the owner's menu sounds
// (moth-menu-sfx.mjs). Each lives in moth-asset-additions/ at its published
// path, with its hash in moth-asset-additions/manifest.json; build-moth.mjs
// publishes them alongside the release's files. jsDelivr serves them from the
// commit that added them, MOTH_MIRROR_ADDITIONS_COMMIT (set once that commit is
// on GitHub; until then they load from this site).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
export const ADDED_ASSETS = JSON.parse(fs.readFileSync(path.join(root, 'moth-asset-additions/manifest.json'), 'utf8')).files;
export const addedAsset = file => path.join(root, 'moth-asset-additions', file);
export const MOTH_MIRROR_ADDITIONS_COMMIT = null;
