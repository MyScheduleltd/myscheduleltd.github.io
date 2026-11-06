// Pure source checks: normal builds remove unused startup images; reachability
// audit builds keep inert symbols and their call probes, with no image fetches.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {patchMothRuntime} from './moth-runtime-patches.mjs';
import {patchRetiredHighway} from './moth-retired-highway.mjs';
import {trimRetiredCode} from './moth-code-trim.mjs';
import {patchRetiredUiImages, RETIRED_UI_IMAGES} from './moth-retired-ui.mjs';
const require = createRequire(import.meta.url);
const ts = require(process.env.MOTH_TYPESCRIPT_PATH || '/Users/myscheduleai/Desktop/myschedule-pivot/band-repair-20261004/world/node_modules/typescript/lib/typescript.js');
const prepared = patchRetiredHighway(patchMothRuntime(await fs.readFile(new URL('../.qa/moth/published/src/game.js', import.meta.url), 'utf8'), ts));
const normal = trimRetiredCode(prepared, ts);
const audit = trimRetiredCode(prepared, ts, {audit: true});
const productionSource = patchRetiredUiImages(normal.source);
const auditSource = patchRetiredUiImages(audit.source, {audit: true, ts});
for (const file of RETIRED_UI_IMAGES) {
  assert(!productionSource.includes(file)); assert(!auditSource.includes(file));
}
for (const symbol of ['FORGE_SHELL_IMAGE', 'POCKET_ICON_IMAGE', 'POCKET_ICON_ACTIVE_IMAGE']) {
  assert(!productionSource.includes(symbol));
  assert(auditSource.includes(`const ${symbol} = null;`));
}
assert(auditSource.includes('(window.__retiredCalls ||= []).push("renderFinaleForgeWindow")'));
assert(!productionSource.includes('  renderFinaleForgeWindow('));
assert(productionSource.includes('drawImage(POCKET_SHELL_IMAGE'));
assert(auditSource.includes('drawImage(POCKET_SHELL_IMAGE'));
const activeConsumer = '\nfunction actualImageConsumer() { return FORGE_SHELL_IMAGE; }\n';
assert.throws(() => patchRetiredUiImages(normal.source + activeConsumer), /only its declaration and startup request/);
assert.throws(() => patchRetiredUiImages(audit.source + activeConsumer, {audit: true, ts}), /only its declaration and startup request/);
await fs.mkdir(new URL('../.qa/moth/cleanup-20261106/', import.meta.url), {recursive: true});
await fs.writeFile(new URL('../.qa/moth/cleanup-20261106/ui-retirement-proof.json', import.meta.url), JSON.stringify({
  normal: {removedStartupImages: RETIRED_UI_IMAGES, absentSymbols: true, retainedPocketPreview: true},
  audit: {retainedInertSymbols: true, retainedCallProbes: true, removedStartupImages: true, retainedPocketPreview: true},
  rejectedUnexpectedConsumers: {normal: true, audit: true}, removedMethods: normal.removedMethods
}, null, 2) + '\n');
console.log('PASS retired UI cleanup: normal removal, inert audit symbols/probes, retained pocket preview, unexpected consumers rejected');
