import { cp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copies a finished build into docs/beta for GitHub Pages.
 *
 * Two channels live under that directory. `docs/beta` is the festival visitors
 * get; `docs/beta/ps2` is the art redesign, reached by `?era=ps2`, which the
 * published index.html redirects into. Pass `--channel ps2` to publish there
 * instead. Each channel keeps its own index.html and its own hashed assets, so
 * neither can invalidate the other's cache.
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
const flag = process.argv.indexOf('--channel');
const channel = flag === -1 ? '' : (process.argv[flag + 1] ?? '');
if (channel && !/^[a-z0-9-]+$/.test(channel)) {
  throw new Error(`Not a channel name: ${channel}`);
}
const target = resolve(here, '..', '..', 'docs', 'beta', channel);
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const listAssets = async (directory) => {
  try {
    return await readdir(directory);
  } catch {
    return [];
  }
};

/**
 * The tripwire.
 *
 * The redesign once reached the live festival not because anyone published it,
 * but because it was sitting uncommitted in the same tree as an unrelated
 * change and got swept into the commit. So the check is on the *source*, not on
 * the build: if the redesign's modules are present, this build is the redesign,
 * and the redesign does not go to the channel visitors land on.
 *
 * It knows one name. If the redesign is ever renamed, this stops protecting
 * anything and says nothing about it — which is why the rule it enforces is
 * written down here as well as encoded.
 */
if (!channel) {
  const redesign = (await listAssets(resolve(here, '..', 'src', 'world')))
    .filter((name) => name.startsWith('Coastal'));
  if (redesign.length > 0) {
    console.error(
      `Refusing to publish: this tree carries the art redesign (${redesign.join(', ')}).\n`
      + 'That build belongs on its own channel — `npm run build && '
      + 'node scripts/publish-beta.mjs --channel ps2` — and reaches people at '
      + '/beta/?era=ps2.\nThe festival at /beta/ is only published from a tree '
      + 'without it.',
    );
    process.exit(1);
  }
}

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

console.log(`published to ${target} — ${kept} asset(s) kept, ${pruned} stale asset(s) pruned`);
