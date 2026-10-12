import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'docs/moth');
const snapshot = JSON.parse(await fs.readFile(path.join(root, '.qa/moth/published-snapshot.json'), 'utf8'));
const publicCode = await fs.readFile(path.join(dir, 'src/game.js'), 'utf8');
const staffCode = await fs.readFile(path.join(dir, 'staff/game.js'), 'utf8');
const config = await fs.readFile(path.join(dir, 'data/level1.json'), 'utf8');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const excluded = new Set(['index.html','src/game.js','manifest.json','haptics-test.html','haptics-test2.html','sfx-test.html']);
let preserved = 0;
for (const file of snapshot.files) {
  if (excluded.has(file.path)) continue;
  const data = await fs.readFile(path.join(dir, file.path));
  if (file.path === 'styles.css') {
    assert.equal(hash(data.subarray(0, file.bytes)),file.sha256,'Original game styles preserved');
    assert(data.toString().includes('.load-recovery section'));
    continue;
  }
  assert.equal(hash(data),file.sha256,`Published release asset changed: ${file.path}`);
  preserved++;
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
  assert.match(policy, /^'self' https:\/\/cdn\.jsdelivr\.net\/gh\/MyScheduleltd\/myscheduleltd\.github\.io@[0-9a-f]{40}\/docs\/moth\/$/, 'Only the pinned mirror path may be fetched');
}
assert(!/createDebugPanel|toggleDebugPanel|data-debug-action|debug-panel-toggle|window\.bobbyGame\s*=/.test(publicCode));
assert(staffCode.includes('createDebugPanel'));
assert(publicCode.includes('moth.public_progress_v1'));
assert(staffCode.includes('moth.staff_progress_v1'));
for (const file of excluded) {
  if (file.endsWith('test.html')) await assert.rejects(fs.stat(path.join(dir,file)),{code:'ENOENT'});
}
const report = {files:files.length, preservedReleaseAssets:preserved, audioFiles:files.filter(f=>/\.(wav|m4a|mp3|ogg)$/.test(f)).length, integrity:true, debugSeparation:true, credentialPatternsFound:0, diagnosticPages:0};
await fs.writeFile(path.join(root,'.qa/moth/package-report.json'),JSON.stringify(report,null,2)+'\n');
console.log('PASS',JSON.stringify(report));
