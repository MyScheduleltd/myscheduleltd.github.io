// Trims the published BETA folder after a release (owner, 2026-10-17).
//
//   node scripts/prune-published.mjs            # report only; nothing is touched
//   node scripts/prune-published.mjs --apply    # delete what the report lists
//
// What goes:
// - docs/beta/ps2/: the retired PS2 channel, a byte-for-byte copy of /beta/.
//   No redirect, by the owner's choice.
// - the review pages and their fixtures, which no longer ship;
// - hashed files in docs/beta/assets that neither the entry page on disk nor
//   the previously published one can reach. Two releases are kept because
//   Pages caches index.html for ten minutes: a visitor still holding the old
//   page must find every chunk it imports later.
//
// Run it in the release checkout after `publish-beta.mjs --channel beta`, so
// "on disk" is the release being made and "previous" is what `main` publishes.
import { readFile, readdir, rm, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const apply = process.argv.includes('--apply');
const beta = fileURLToPath(new URL('../../docs/beta/', import.meta.url));
const assets = path.join(beta, 'assets');
const repository = fileURLToPath(new URL('../../', import.meta.url));
const REVIEW_PAGES = ['rebuild-review.html', 'avatar-review.html', 'webcam-review.html', 'band-review.html', 'location-review.html', 'review'];

const exists = (p) => stat(p).then(() => true, () => false);
async function size(p) {
  const info = await stat(p);
  if (!info.isDirectory()) return info.size;
  let total = 0;
  for (const entry of await readdir(p)) total += await size(path.join(p, entry));
  return total;
}

/** The entry page as published by the last commit that changed it, if that differs from disk. */
function previousEntry(current) {
  const log = execFileSync('git', ['log', '--format=%H', '-n', '8', '--', 'docs/beta/index.html'], { cwd: repository, encoding: 'utf8' });
  for (const commit of log.split('\n').filter(Boolean)) {
    const page = execFileSync('git', ['show', `${commit}:docs/beta/index.html`], { cwd: repository, encoding: 'utf8' });
    if (page !== current) return page;
  }
  return undefined;
}

const files = new Set(await readdir(assets));
const NAME = /[\w.-]+\.(?:js|css|glb|png|jpe?g|webp|mp3|wav|json|svg|woff2?)\b/g;
async function reachable(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const text = queue.pop();
    for (const name of text.match(NAME) ?? []) {
      if (!files.has(name) || seen.has(name)) continue;
      seen.add(name);
      if (/\.(js|css|json)$/.test(name)) queue.push(await readFile(path.join(assets, name), 'utf8'));
    }
  }
  return seen;
}

const current = await readFile(path.join(beta, 'index.html'), 'utf8');
const previous = previousEntry(current);
const keep = new Set(['asset-integrity.json', ...await reachable(current), ...(previous ? await reachable(previous) : [])]);
const stale = [...files].filter((name) => !keep.has(name)).sort();

const removals = [];
if (await exists(path.join(beta, 'ps2'))) removals.push(path.join(beta, 'ps2'));
for (const page of REVIEW_PAGES) if (await exists(path.join(beta, page))) removals.push(path.join(beta, page));
for (const name of stale) removals.push(path.join(assets, name));

let total = 0;
for (const target of removals) total += await size(target);
console.log(`Entry pages kept: on disk${previous ? ' + previously published' : ' only (no earlier version found)'}`);
console.log(`Hashed files: ${files.size} — keeping ${keep.size}, removing ${stale.length}`);
for (const target of removals.filter((t) => !t.startsWith(assets))) console.log(`  remove ${path.relative(repository, target)}`);
console.log(`${apply ? 'Removing' : 'Would remove'} ${removals.length} paths, ${(total / 1048576).toFixed(1)} MB.`);
if (!apply) {
  console.log('Report only. Re-run with --apply to delete.');
  process.exit(0);
}
for (const target of removals) await rm(target, { recursive: true, force: true });
console.log('Done. Review `git status docs/` before committing.');
