// Report-only by default. Prune proven obsolete hashed assets, never source art,
// historical worktrees, M.O.T.H, public routes, licensing or unknown files.
//
//   node scripts/prune-published.mjs --deployments <verified-deployments.json>
//   node scripts/prune-published.mjs --deployments <verified-deployments.json> --apply
//
// Records are successful Pages deployments, not commit dates or file mtimes:
// { "deployments": [{ "entry": "main-xxxxxxxx.js", "deployedAt": "2026-10-24T01:21:28+08:00" }] }
// An old entry remains protected until 24 hours AFTER its next successful
// deployment. An entry absent from the records, or not yet superseded, stays.
import { readFile, readdir, lstat, unlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const RETENTION_MS = 24 * 60 * 60 * 1000;
const BASIS = ['basis/basis_transcoder.js', 'basis/basis_transcoder.wasm', 'basis/basis_worker.js'];
const HASHED = /(?:^|\/)[\w.-]+-[\w-]{8}\.(?:js|css|glb|png|jpe?g|webp|mp3|wav|json|svg|woff2?|ttf|ktx2|wasm)$/i;
const EXTENSION = /\.(?:js|css|glb|png|jpe?g|webp|mp3|wav|json|svg|woff2?|ttf|ktx2|wasm)(?:[?#].*)?$/i;
const TEXT = /\.(?:js|css|json)$/i;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function referencePath(value, from) {
  if (!EXTENSION.test(value) || /^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(value) || /[\s<>${}]/.test(value)) return;
  let decoded;
  try { decoded = decodeURIComponent(value.split(/[?#]/)[0]); } catch { return; }
  const resolved = decoded.startsWith('/beta/') ? decoded.slice('/beta/'.length)
    : decoded.startsWith('/') ? decoded.slice(1)
      : path.posix.normalize(path.posix.join(path.posix.dirname(from), decoded));
  if (!resolved.startsWith('assets/')) return;
  const key = resolved.slice('assets/'.length);
  return key && !key.startsWith('../') && !path.posix.isAbsolute(key) ? key : undefined;
}

/** Exact relative paths, including nested decoder files; no basename guessing. */
export function reachableAssets(page, files) {
  const seen = new Set();
  const missing = new Set();
  const queue = [{ text: page, from: 'index.html' }];
  while (queue.length) {
    const { text, from } = queue.pop();
    const values = [
      ...[...text.matchAll(/["'`(]([^"'`\r\n()<>\s]+)["'`)]/g)].map(match => ({ value: match[1], required: /(?:new\s+URL\(\s*|(?:import|from)\s*)$/.test(text.slice(Math.max(0, match.index - 30), match.index)) || /(?:^|\/)assets\//.test(match[1]) || /\.(?:js|css)(?:[?#].*)?$/.test(match[1]) })),
      ...[...text.matchAll(/url\(\s*([^\s)'"`]+)\s*\)/g)].map(match => ({ value: match[1], required: true })),
    ];
    for (const { value, required } of values) {
      const key = referencePath(value, from);
      if (!key || seen.has(key)) continue;
      const file = files.get(key);
      if (!file) { if (required && HASHED.test(key)) missing.add(key); continue; }
      seen.add(key);
      if (TEXT.test(key) && key !== 'asset-integrity.json') queue.push({ text: file.text ?? '', from: `assets/${key}` });
    }
  }
  // These names are composed by KTX2Loader at runtime, outside static imports.
  // Keep all three together whenever installed, even for a raster-only entry.
  const needsBasis = [...seen].some(key => key.endsWith('.js') && /(?:assets\/basis\/|basis_worker\.js)/.test(files.get(key).text ?? ''));
  for (const key of ['asset-integrity.json', ...BASIS]) {
    if (files.has(key)) seen.add(key);
    else if (needsBasis && BASIS.includes(key)) missing.add(key);
  }
  return { seen, missing };
}

export function validateDeployments(input, now) {
  const deployments = Array.isArray(input) ? input : input?.deployments;
  if (!Array.isArray(deployments)) throw new Error('Deployment records must contain a deployments array');
  return deployments.map(record => {
    if (!/^main-[\w-]{8}\.js$/.test(record?.entry ?? '') || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(record?.deployedAt ?? '')) throw new Error('Invalid successful deployment record');
    const time = Date.parse(record.deployedAt);
    if (!Number.isFinite(time) || time > now) throw new Error('Deployment timestamp is invalid or in the future');
    return { entry: record.entry, deployedAt: record.deployedAt, time };
  }).sort((a, b) => a.time - b.time);
}

export function createPrunePlan({ files, entries, deployments = [], now = Date.now() }) {
  if (!entries.length || !entries[0].page) throw new Error('Current published entry is required');
  const records = validateDeployments(deployments, now);
  const keep = new Set();
  const expired = new Set();
  const entryReports = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const { seen, missing } = reachableAssets(entry.page, files);
    if (!i && missing.size) throw new Error(`Current entry has missing hashed dependencies: ${[...missing].join(', ')}`);
    const last = records.findLastIndex(record => record.entry === entry.entry);
    const superseding = last < 0 ? undefined : records.slice(last + 1).find(record => record.entry !== entry.entry);
    const retainUntil = superseding ? new Date(superseding.time + RETENTION_MS).toISOString() : undefined;
    const protectedEntry = !i || !superseding || now < superseding.time + RETENTION_MS;
    for (const key of seen) (protectedEntry ? keep : expired).add(key);
    entryReports.push({ entry: entry.entry, commit: entry.commit, current: i === 0, retained: protectedEntry,
      reason: !i ? 'current entry on disk' : last < 0 ? 'successful deployment time unknown'
        : !superseding ? 'not superseded by a verified successful deployment'
          : protectedEntry ? 'within 24 hours after supersession' : '24-hour retention elapsed',
      retainUntil, files: seen.size, missing: [...missing].sort() });
  }
  // Unknowns are kept. File extension alone is never evidence of redundancy.
  const removals = [];
  const retained = [];
  for (const [key, file] of files) {
    const removable = HASHED.test(key) && expired.has(key) && !keep.has(key);
    (removable ? removals : retained).push({ path: key, bytes: file.bytes, sha256: file.sha256,
      ...(removable ? {} : { reason: keep.has(key) ? 'reachable from a retained entry or explicit runtime dependency'
        : !HASHED.test(key) ? 'unhashed or unknown file; protected' : 'not proven obsolete by recorded entry history' }) });
  }
  removals.sort((a, b) => a.path.localeCompare(b.path));
  retained.sort((a, b) => a.path.localeCompare(b.path));
  return { generatedAt: new Date(now).toISOString(), retentionHours: 24, entries: entryReports, removals, retained,
    removedBytes: removals.reduce((sum, file) => sum + file.bytes, 0), totalBytes: [...files.values()].reduce((sum, file) => sum + file.bytes, 0) };
}

async function readAssets(folder, relative = '') {
  const files = new Map();
  for (const name of await readdir(path.join(folder, relative))) {
    const key = path.posix.join(relative, name);
    const full = path.join(folder, key);
    const info = await lstat(full);
    if (info.isSymbolicLink()) throw new Error(`Refusing symlink in published assets: ${key}`);
    if (info.isDirectory()) { for (const [nested, file] of await readAssets(folder, key)) files.set(nested, file); }
    else if (info.isFile()) {
      const bytes = await readFile(full);
      files.set(key, { bytes: bytes.length, sha256: sha256(bytes), ...(TEXT.test(key) ? { text: bytes.toString('utf8') } : {}) });
    }
  }
  return files;
}

export async function applyPrunePlan(folder, plan) {
  const root = path.resolve(folder);
  if ((await lstat(root)).isSymbolicLink()) throw new Error('Refusing symlink asset root');
  // Validate every target before deleting any. Never recurse into directories.
  for (const file of plan.removals) {
    const full = path.resolve(root, file.path);
    if (!HASHED.test(file.path) || !full.startsWith(`${root}${path.sep}`)) throw new Error(`Invalid deletion target: ${file.path}`);
    for (let dir = path.dirname(full); dir !== root; dir = path.dirname(dir)) {
      if ((await lstat(dir)).isSymbolicLink()) throw new Error(`Refusing symlink parent: ${file.path}`);
    }
    const info = await lstat(full);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Deletion target is not a regular file: ${file.path}`);
    const bytes = await readFile(full);
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) throw new Error(`Deletion target changed since audit: ${file.path}`);
  }
  for (const file of plan.removals) await unlink(path.join(root, file.path));
}

async function main() {
  const args = process.argv.slice(2);
  const values = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') values.apply = true;
    else if (['--deployments', '--json'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) values[args[i].slice(2)] = args[++i];
    else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }
  if (values.apply && !values.deployments) throw new Error('--apply requires verified successful deployment records via --deployments');
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  const beta = path.join(repository, 'docs/beta');
  const assets = path.join(beta, 'assets');
  const current = await readFile(path.join(beta, 'index.html'), 'utf8');
  const entryName = page => /(?:\.\/)?assets\/(main-[\w-]{8}\.js)/.exec(page)?.[1];
  if (!entryName(current)) throw new Error('Cannot identify current published entry');
  const entries = [{ page: current, entry: entryName(current), commit: 'on-disk' }];
  // Missing old files are expected after an earlier reviewed cleanup. Current
  // dependencies must resolve, while unclassified remaining files are retained.
  const commits = execFileSync('git', ['log', '--format=%H', '-n', '64', '--', 'docs/beta/index.html'], { cwd: repository, encoding: 'utf8' });
  for (const commit of commits.split('\n').filter(Boolean)) {
    const page = execFileSync('git', ['show', `${commit}:docs/beta/index.html`], { cwd: repository, encoding: 'utf8' });
    const entry = entryName(page);
    if (entry && !entries.some(candidate => candidate.entry === entry)) entries.push({ page, entry, commit });
  }
  const files = await readAssets(assets);
  const deployments = values.deployments ? JSON.parse(await readFile(path.resolve(values.deployments), 'utf8')) : [];
  const plan = createPrunePlan({ files, entries, deployments });
  if (values.json) await writeFile(path.resolve(values.json), `${JSON.stringify(plan, null, 2)}\n`);
  console.log(`Published asset files: ${files.size}; protected: ${plan.retained.length}; proven obsolete: ${plan.removals.length}`);
  for (const entry of plan.entries) if (entry.files > 4) console.log(`  ${entry.retained ? 'keep' : 'expired'} ${entry.entry}: ${entry.reason}${entry.retainUntil ? ` (until ${entry.retainUntil})` : ''}`);
  console.log(`${values.apply ? 'Removing' : 'Would remove'} ${(plan.removedBytes / 1048576).toFixed(2)} MiB; no public route, source asset, unknown file or directory is a deletion target.`);
  if (values.apply) { await applyPrunePlan(assets, plan); console.log('Done. Review the exact docs/beta/assets diff before committing.'); }
  else console.log('Report only. No files changed. Missing deployment records fail closed: older files stay.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
