import { cp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copies a finished build into docs/beta for GitHub Pages.
 *
 * The point of copying rather than building straight into docs/beta is that the
 * previous build's files are left alone. Pages serves index.html with
 * `cache-control: max-age=600`, so for ten minutes after a deploy a returning
 * visitor can still be holding the *old* index.html — which names the old,
 * hashed bundle. Emptying the directory on every publish deleted exactly the
 * file that HTML asks for, and the page came up black until its cache expired.
 *
 * Old assets are pruned once they are a day stale, which is far longer than the
 * ten minutes any cached HTML can survive, and keeps the directory bounded.
 */
const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '..', 'dist');
const target = resolve(here, '..', '..', 'docs', 'beta');
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const listAssets = async (directory) => {
  try {
    return await readdir(directory);
  } catch {
    return [];
  }
};

await mkdir(target, { recursive: true });
// force overwrites index.html and any asset whose name repeated; everything
// else already in the directory is untouched.
await cp(source, target, { recursive: true, force: true });

const html = await readFile(join(target, 'index.html'), 'utf8');
const assetsDirectory = join(target, 'assets');
const now = Date.now();
let kept = 0;
let pruned = 0;

for (const name of await listAssets(assetsDirectory)) {
  if (html.includes(name)) {
    kept += 1;
    continue;
  }
  const file = join(assetsDirectory, name);
  const { mtimeMs } = await stat(file);
  if (now - mtimeMs < STALE_AFTER_MS) {
    // Still reachable from HTML a visitor might be holding. Leave it.
    kept += 1;
    continue;
  }
  await rm(file);
  pruned += 1;
}

console.log(`published to docs/beta — ${kept} asset(s) kept, ${pruned} stale asset(s) pruned`);
