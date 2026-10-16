import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {rewriteCssArtwork} from './moth-runtime-patches.mjs';
import {patchCharts} from './moth-chart-patches.mjs';
import {TRIMMED_FILES} from './moth-asset-trim.mjs';
import {KEY_FRINGE_MANIFEST} from './moth-sprite-fringe.mjs';
import {ADDED_ASSETS} from './moth-asset-additions.mjs';
import {patchDeckCss} from './moth-deck-art.mjs';
const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'docs/moth');
const snapshot = JSON.parse(await fs.readFile(path.join(root, '.qa/moth/published-snapshot.json'), 'utf8'));
const publicCode = await fs.readFile(path.join(dir, 'src/game.js'), 'utf8');
const staffCode = await fs.readFile(path.join(dir, 'staff/game.js'), 'utf8');
const config = await fs.readFile(path.join(dir, 'data/level1.json'), 'utf8');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const excluded = new Set(['index.html','src/game.js','manifest.json','haptics-test.html','haptics-test2.html','sfx-test.html']);
let preserved = 0;
let trimmed = 0, baked = 0;
for (const file of snapshot.files) {
  if (excluded.has(file.path)) continue;
  if (TRIMMED_FILES.has(file.path)) {
    // Retired parts of the game are left out (moth-asset-trim.mjs).
    await assert.rejects(fs.access(path.join(dir, file.path)), `Retired file published: ${file.path}`);
    trimmed++;
    continue;
  }
  const data = await fs.readFile(path.join(dir, file.path));
  if (KEY_FRINGE_MANIFEST[file.path]) {
    // The release sprite with its key fringe cleaned (moth-sprite-fringe.mjs).
    assert.equal(KEY_FRINGE_MANIFEST[file.path].release, file.sha256);
    assert.equal(hash(data), KEY_FRINGE_MANIFEST[file.path].sha256, `Cleaned sprite: ${file.path}`);
    baked++;
    continue;
  }
  if (file.path === 'styles.css') {
    // The release's styles, with the deck's pad-coloured buttons and without
    // earlier decks' rules (moth-deck-art.mjs), and with their artwork url()s
    // turned into the custom properties the game fills from the verified
    // mirror.
    const releaseCss = await fs.readFile(path.join(root, '.qa/moth/published/styles.css'));
    assert.equal(hash(releaseCss), file.sha256);
    assert(data.toString().startsWith(rewriteCssArtwork(patchDeckCss(releaseCss.toString())).css), 'Original game styles preserved');
    assert(!/url\("assets\//.test(data.toString()), 'No artwork fetched straight from Pages by the stylesheet');
    assert(data.toString().includes('.load-recovery section'));
    continue;
  }
  if (file.path === 'data/level1.json') {
    // The release's game data plus only the chart additions.
    const release = await fs.readFile(path.join(root, '.qa/moth/published/data/level1.json'));
    assert.equal(hash(release), file.sha256);
    assert.deepEqual(JSON.parse(data), patchCharts(JSON.parse(release)), 'Game data is the release plus the chart additions');
    continue;
  }
  assert.equal(hash(data),file.sha256,`Published release asset changed: ${file.path}`);
  preserved++;
}
// Files beyond the release, as listed (moth-asset-additions.mjs).
let added = 0;
for (const [file, entry] of Object.entries(ADDED_ASSETS)) {
  assert(!snapshot.files.some(release => release.path === file), `An addition replaces no release file: ${file}`);
  assert.equal(hash(await fs.readFile(path.join(dir, file))), entry.sha256, `Addition: ${file}`);
  added++;
}
async function walk(dir) {
  const results = [];
  for (const entry of await fs.readdir(dir, {withFileTypes:true})) {
    const p = path.join(dir, entry.name);
    assert(!entry.isSymbolicLink(),'No symlinks in public package');
    results.push(...(entry.isDirectory() ? await walk(p) : [p]));
  }
  return results;
}
const files = await walk(dir);
for (const file of files) {
  assert(!/\.(zip|exe|dmg|pkg|apk|sh|command|php|py|map)$|\/\.env|\/\.git\//.test(file),'No development/archive/secret artifacts');
  if (/\.(html|js|json|css)$/.test(file)) {
    const text = await fs.readFile(file,'utf8');
    assert(!/sk-(?:proj-)?[A-Za-z0-9_-]{24,}|(?:ghp_|github_pat_)[A-Za-z0-9_]{25,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AIza[0-9A-Za-z_-]{30,}|(?:AKIA|ASIA)[A-Z0-9]{16}/.test(text),'No recognized credential patterns in M.O.T.H');
  }
  if (/\.(wav|m4a|mp3|ogg)$/.test(file)) assert((publicCode+staffCode+config).includes(path.relative(dir,file)),'Only referenced runtime audio is packaged');
}
for (const [page, code] of [['index.html',publicCode],['staff/index.html',staffCode]]) {
  const html = await fs.readFile(path.join(dir,page),'utf8');
  const sri = 'sha384-' + crypto.createHash('sha384').update(code).digest('base64');
  assert(html.includes(sri),'Entry script matches integrity hash');
  assert(html.includes("object-src 'none'"));
  assert(html.includes("manifest-src 'self'"));
}
// Every image and sound file is listed with its real hash, so a mirror copy is
// accepted only when it is byte-identical to the file this site serves.
const integrity = JSON.parse(await fs.readFile(path.join(dir, 'asset-integrity.json'), 'utf8'));
const media = files.filter(f => /\.(webp|png|jpe?g|wav|m4a|mp3|ogg)$/.test(f)).map(f => path.relative(dir, f));
assert.deepEqual(Object.keys(integrity).sort(), media.sort(), 'Integrity list covers exactly the packaged media');
for (const file of media) assert.equal(integrity[file], hash(await fs.readFile(path.join(dir, file))), `Integrity hash: ${file}`);
for (const page of ['index.html', 'staff/index.html']) {
  const policy = (await fs.readFile(path.join(dir, page), 'utf8')).match(/connect-src ([^;]+);/)[1];
  assert.match(policy, /^'self' (https:\/\/cdn\.jsdelivr\.net\/gh\/MyScheduleltd\/myscheduleltd\.github\.io@[0-9a-f]{40}\/docs\/moth\/ ){1,3}https:\/\/beauty-boy\.vercel\.app\/api\/moth-scoreboard$/, 'Only the pinned mirror paths and the scoreboard API may be fetched');
}
assert(!/createDebugPanel|toggleDebugPanel|data-debug-action|debug-panel-toggle|window\.bobbyGame\s*=/.test(publicCode));
assert(staffCode.includes('createDebugPanel'));
assert(publicCode.includes('moth.public_progress_v1'));
assert(staffCode.includes('moth.staff_progress_v1'));
for (const file of excluded) {
  if (file.endsWith('test.html')) await assert.rejects(fs.stat(path.join(dir,file)),{code:'ENOENT'});
}
const report = {files:files.length, preservedReleaseAssets:preserved, retiredLeftOut:trimmed, cleanedSprites:baked, addedFiles:added, audioFiles:files.filter(f=>/\.(wav|m4a|mp3|ogg)$/.test(f)).length, integrity:true, debugSeparation:true, credentialPatternsFound:0, diagnosticPages:0};
await fs.writeFile(path.join(root,'.qa/moth/package-report.json'),JSON.stringify(report,null,2)+'\n');
console.log('PASS',JSON.stringify(report));
