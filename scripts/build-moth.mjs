import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { patchMothRuntime, rewriteCssArtwork, cssArtworkLoader, MOTH_MIRROR_COMMIT, MOTH_MIRROR_PINS, mirrorPath } from './moth-runtime-patches.mjs';
import { SCOREBOARD_API, SCOREBOARD_CSS } from './moth-scoreboard-client.mjs';
import { patchCharts } from './moth-chart-patches.mjs';
import { TRIMMED_FILES } from './moth-asset-trim.mjs';
import { KEY_FRINGE_MANIFEST, patchedAsset } from './moth-sprite-fringe.mjs';
import { ADDED_ASSETS, addedAsset } from './moth-asset-additions.mjs';
import { trimRetiredCode } from './moth-code-trim.mjs';
import { patchDeckCss, DECK_ART_KEPT } from './moth-deck-art.mjs';
import { MEME_CSS } from './moth-walk-scenes.mjs';
const require = createRequire(import.meta.url);
const ts = require(process.env.MOTH_TYPESCRIPT_PATH || 'typescript');
const root = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(root, '.qa/moth/published');
const output = path.join(root, 'docs/moth');
const snapshot = JSON.parse(await fs.readFile(path.join(root, '.qa/moth/published-snapshot.json'), 'utf8'));
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
// The deck in the pad's colours, without the art of earlier decks (moth-deck-art.mjs).
const cssArtwork = rewriteCssArtwork(patchDeckCss(await fs.readFile(path.join(sourceRoot, 'styles.css'), 'utf8')));
assert.equal(cssArtwork.assets.length, DECK_ART_KEPT);
// The release with its patches, and without the code of its retired parts
// (moth-code-trim.mjs; MOTH_TRIM_AUDIT=1 keeps that code and records calls).
const trim = trimRetiredCode(patchMothRuntime(await fs.readFile(path.join(sourceRoot, 'src/game.js'), 'utf8'), ts) + cssArtworkLoader(cssArtwork.assets), ts,
  { audit: process.env.MOTH_TRIM_AUDIT === '1' });
const original = trim.source;
assert.match(await fs.readFile(path.join(sourceRoot, 'index.html'), 'utf8'), /mobile-deck-20261012a/);
for (const file of snapshot.files) assert.equal(sha(await fs.readFile(path.join(sourceRoot, file.path))), file.sha256);
await fs.mkdir(output, { recursive: true });
const published = new Map(snapshot.files.map(file => [file.path, file.sha256]));
for (const file of snapshot.files) {
  if (['index.html', 'src/game.js', 'manifest.json', 'haptics-test.html', 'haptics-test2.html', 'sfx-test.html'].includes(file.path)) continue;
  const dest = path.join(output, file.path);
  // Retired parts of the game are not published (moth-asset-trim.mjs).
  if (TRIMMED_FILES.has(file.path)) {
    await fs.rm(dest, { force: true });
    published.delete(file.path);
    continue;
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  // Sprites with their key fringe cleaned (moth-sprite-fringe.mjs).
  const baked = KEY_FRINGE_MANIFEST[file.path];
  if (baked) {
    assert.equal(baked.release, file.sha256, `Baked copy made from this release: ${file.path}`);
    assert.equal(sha(await fs.readFile(patchedAsset(file.path))), baked.sha256);
    await fs.copyFile(patchedAsset(file.path), dest);
    published.set(file.path, baked.sha256);
    continue;
  }
  if (file.path === 'data/level1.json') {
    // The release's game data with the chart additions (moth-chart-patches.mjs),
    // compact: the game fetches it fresh at every start-up, and the release's
    // indentation was more than half its size.
    const release = await fs.readFile(path.join(sourceRoot, file.path), 'utf8');
    await fs.writeFile(dest, JSON.stringify(patchCharts(JSON.parse(release))) + '\n');
    continue;
  }
  await fs.copyFile(path.join(sourceRoot, file.path), dest);
}
// Files beyond the release (moth-asset-additions.mjs).
for (const [file, added] of Object.entries(ADDED_ASSETS)) {
  assert(!published.has(file), `An addition replaces no release file: ${file}`);
  assert.equal(sha(await fs.readFile(addedAsset(file))), added.sha256, `Addition as listed: ${file}`);
  await fs.mkdir(path.dirname(path.join(output, file)), { recursive: true });
  await fs.copyFile(addedAsset(file), path.join(output, file));
  published.set(file, added.sha256);
}
// The game takes images and sound effects from jsDelivr only when they hash
// to these values (moth-runtime-patches.mjs, fetchGameAsset).
assert(TRIMMED_FILES.size + Object.keys(KEY_FRINGE_MANIFEST).length > 0 && [...TRIMMED_FILES].every(file => !published.has(file)));
const integrity = Object.fromEntries([...published].filter(([file]) => /\.(webp|png|jpe?g|wav|m4a|mp3|ogg)$/.test(file)));
await fs.writeFile(path.join(output, 'asset-integrity.json'), JSON.stringify(integrity) + '\n');
const recoveryCss = `
.load-recovery { background: #1216134d; }
.load-recovery section { background: repeating-linear-gradient(#242b28 0 3px, #202623 3px 4px); color: #f7f2de; border: 4px solid #ce3f49; box-shadow: 8px 8px 0 #111613; }
.load-recovery small { color: #8fe8ff; }
.load-recovery button { background: #344439; color: #f7f2de; border-color: #dcd8bd; box-shadow: 4px 5px 0 #111613; }
.load-recovery button:focus-visible { outline: 3px solid #ffd36c; outline-offset: 5px; }
`;
await fs.writeFile(path.join(output, 'styles.css'), cssArtwork.css + recoveryCss + SCOREBOARD_CSS + MEME_CSS);

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, `Expected one occurrence: ${before.slice(0, 80)}`);
  return source.replace(before, after);
}
function namespace(source, audience) {
  return source.replace(/"bobby([_.][^"]*)"/g, (_, suffix) => `"moth.${audience}${suffix}"`);
}
let publicCode = original;
const tree = ts.createSourceFile('game.js', original, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
assert.equal(tree.parseDiagnostics.length, 0);
const edits = [];
const retained = new Set(['getDebugConversationScene', 'cloneDialogueLine', 'cloneDialogueLines', 'getDialogueLines']);
const replacements = { isDebugPanelElement: 'isDebugPanelElement() { return false; }', updateDebugPanel: 'updateDebugPanel() {}', getDialogueLines: 'getDialogueLines(sceneId) { return this.getDebugConversationScene(sceneId)?.defaultLines || []; }' };
const gameClass = tree.statements.find(s => ts.isClassDeclaration(s) && s.name?.text === 'BobbyGame');
for (const method of gameClass.members) {
  const name = method.name?.getText(tree);
  const debugSection = (method.getStart(tree) >= original.indexOf('  createDebugPanel()') && method.getStart(tree) < original.indexOf('  loadDeviceModePreference()'))
    || (method.getStart(tree) >= original.indexOf('  isDebugPanelElement(') && method.getStart(tree) < original.indexOf('  createDefaultHomeMenuState()'));
  if (replacements[name]) edits.push({ start: method.getStart(tree), end: method.end, text: replacements[name] });
  else if (debugSection && !retained.has(name)) edits.push({ start: method.getStart(tree), end: method.end, text: '' });
}
for (const edit of edits.sort((a, b) => b.start - a.start)) publicCode = publicCode.slice(0, edit.start) + edit.text + publicCode.slice(edit.end);
publicCode = replaceOnce(publicCode, 'this.debugConversationOverrides = this.loadDebugConversationOverrides();', 'this.debugConversationOverrides = {};');
publicCode = replaceOnce(publicCode, 'this.debugPanel = this.createDebugPanel();', 'this.debugPanel = null;');
const queryStart = publicCode.indexOf('      if (params.get("debugPanel")');
const queryEnd = publicCode.indexOf('\n    } catch (error)', queryStart);
assert(queryStart > 0 && queryEnd > queryStart);
publicCode = publicCode.slice(0, queryStart) + publicCode.slice(queryEnd);
const listenerStart = publicCode.indexOf('    window.addEventListener("keydown", (event) => {\n      const debugPanelTarget');
const listenerEnd = publicCode.indexOf('    }, { capture: true });', listenerStart) + '    }, { capture: true });'.length;
assert(listenerStart > 0 && listenerEnd > listenerStart);
publicCode = publicCode.slice(0, listenerStart) + publicCode.slice(listenerEnd);
publicCode = publicCode.replace('this.toggleDebugPanel(false);', 'this.debugPanelOpen = false;');
publicCode = replaceOnce(publicCode, '&& new URLSearchParams(window.location.search).get("debugLevel5Boss") === "1"', '&& false');
publicCode = replaceOnce(publicCode, 'const DEBUG_TEXT_AUDIT = typeof window !== "undefined"\n  && new URLSearchParams(window.location.search).get("debugTextAudit") === "1";', 'const DEBUG_TEXT_AUDIT = false;');
// The public game is not a window global, but several drawing helpers outside
// the class read it (dialogue text and portraits, the hotbar, the pocket icon,
// phone prompts). They get a reference private to the closure instead.
publicCode = replaceOnce(publicCode, 'window.bobbyGame = game;', 'mothGame = game;');
publicCode = replaceOnce(publicCode, 'if (window.bobbyGame && window.bobbyGame.bootDone) return;', 'if (game.bootDone) return;');
publicCode = publicCode.replaceAll('window.bobbyGame', 'mothGame');
publicCode = replaceOnce(publicCode, '  loadDeviceModePreference() {', '  loadDeviceModePreference() {\n    if (document.documentElement.dataset.arcadePlay === "true") return "desktop";');
publicCode = replaceOnce(publicCode, ' || this.progress?.flags?.debugSecretLevelsUnlocked === true', '');
publicCode = `(() => {\n"use strict";\nlet mothGame = null;\n${namespace(publicCode, 'public')}\n})();\n`;
assert(!/createDebugPanel|toggleDebugPanel|data-debug-action|debug-panel-toggle|window\.bobbyGame/.test(publicCode));
assert.equal(ts.createSourceFile('public.js', publicCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS).parseDiagnostics.length, 0);
let staffCode = namespace(original, 'staff');
staffCode = replaceOnce(staffCode, 'toggle.hidden = new URLSearchParams(window.location.search).get("debug") !== "1";', 'toggle.hidden = false;');
await fs.mkdir(path.join(output, 'src'), { recursive: true });
await fs.mkdir(path.join(output, 'staff'), { recursive: true });
await fs.writeFile(path.join(output, 'src/game.js'), publicCode);
await fs.writeFile(path.join(output, 'staff/game.js'), staffCode);
const arcadeBridge = await fs.readFile(path.join(root, 'scripts/moth-arcade-embed.js'), 'utf8');
await fs.writeFile(path.join(output, 'src/arcade-embed.js'), arcadeBridge);
const arcadeSri = 'sha384-' + crypto.createHash('sha384').update(arcadeBridge).digest('base64');
const csp = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' " + [MOTH_MIRROR_COMMIT, ...new Set(MOTH_MIRROR_PINS.map(pin => pin.commit).filter(Boolean))].map(mirrorPath).join(" ") + " " + SCOREBOARD_API + "; font-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; worker-src 'none'";
for (const audience of ['public', 'staff']) {
  const staff = audience === 'staff';
  const code = staff ? staffCode : publicCode;
  const sri = 'sha384-' + crypto.createHash('sha384').update(code).digest('base64');
  let html = await fs.readFile(path.join(sourceRoot, 'index.html'), 'utf8');
  html = html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />${staff ? '\n    <meta name="robots" content="noindex, nofollow, noarchive" />\n    <base href="/moth/" />' : ''}`);
  html = html.replace('<html lang="en">', '<html lang="zh-Hant-TW">');
  html = html.replace('./manifest.json', staff ? '/moth/staff/manifest.json' : './manifest.json');
  html = html.replace('<script src="./src/game.js?v=mobile-deck-20261012a"></script>', `${staff ? '' : `<script src="./src/arcade-embed.js?v=moth-arcade-input-20261014a" integrity="${arcadeSri}" crossorigin="anonymous"></script>\n    `}<script src="${staff ? '/moth/staff/game.js' : './src/game.js'}?v=${staff ? 'moth-loading-20261022a' : 'moth-cabinet-20261022a'}" integrity="${sri}" crossorigin="anonymous"></script>`);
  html = html.replace('mobile-deck-20261012a', 'moth-loading-20261022a');
  await fs.writeFile(path.join(output, staff ? 'staff/index.html' : 'index.html'), html);
  const manifest = JSON.parse(await fs.readFile(path.join(sourceRoot, 'manifest.json'), 'utf8'));
  manifest.start_url = staff ? '/moth/staff/' : '/moth/';
  manifest.scope = manifest.start_url;
  manifest.icons.forEach(icon => icon.src = '/moth/' + icon.src);
  await fs.writeFile(path.join(output, staff ? 'staff/manifest.json' : 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}
for (const page of ['index', 'about', 'portfolio', 'drBeauty', 'contact']) {
  const file = path.join(root, 'docs', page + '.html');
  let html = await fs.readFile(file, 'utf8');
  if (!html.includes('class="moth-link"')) html = replaceOnce(html, '>BETA</a>', '>BETA</a><a class="moth-link" href="/moth/">M.O.T.H</a>');
  const mainCsp = "default-src 'self'; script-src 'self' https://code.jquery.com/jquery-3.7.1.min.js https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js https://cdn.jsdelivr.net/npm/swiper@10.3.1/swiper-bundle.min.js; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; font-src 'self' data: https://cdn.jsdelivr.net; img-src 'self' data: https:; frame-src https://www.youtube.com https://www.youtube-nocookie.com; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'";
  if (!html.includes('http-equiv="Content-Security-Policy"')) html = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n    <meta http-equiv="Content-Security-Policy" content="${mainCsp}">\n    <meta name="referrer" content="strict-origin-when-cross-origin">`);
  await fs.writeFile(file, html);
}
const headerFile = path.join(root, 'pug/_header.pug');
let header = await fs.readFile(headerFile, 'utf8');
if (!header.includes('a.moth-link')) header = header.replace(' BETA\n', ' BETA\n            a.moth-link(href="/moth/") M.O.T.H\n');
await fs.writeFile(headerFile, header);
await fs.writeFile(path.join(root, '.qa/moth/build-report.json'), JSON.stringify({sourceRelease: 'mobile-deck-20261012a', publicSha256: sha(publicCode), staffSha256: sha(staffCode), removedDebugMethods: edits.length, csp, publicRuntimeGlobal: false, isolatedStorage: true}, null, 2) + '\n');
console.log(`Built M.O.T.H public/staff pages from published release; removed ${trim.removedMethods} retired methods and ${trim.removedHelpers.length} helpers${process.env.MOTH_TRIM_AUDIT === '1' ? ' (AUDIT BUILD: kept, recording calls)' : ''}, and ${edits.length} public debug methods.`);
