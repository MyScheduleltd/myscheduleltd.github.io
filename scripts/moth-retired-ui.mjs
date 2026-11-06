// After unreachable gameplay/forge code is trimmed, these images have no
// remaining consumer. Remove their startup downloads and their declarations.
// The pocket window shell stays: the staff's pocket preview still draws it.
import assert from 'node:assert/strict';
import {RETIRED_METHODS} from './moth-code-trim.mjs';
import {analyzeReachability} from './moth-reachability.mjs';

const UNUSED_IMAGES = [
  ['FORGE_SHELL_IMAGE', 'assets/sprites/forge_device_shell/processed/sheet-transparent.webp'],
  ['POCKET_ICON_IMAGE', 'assets/sprites/mobile_round_button_kit/ui/pocket-icon.webp'],
  ['POCKET_ICON_ACTIVE_IMAGE', 'assets/sprites/mobile_round_button_kit/ui/pocket-icon-active.webp']
];
export const RETIRED_UI_IMAGES = UNUSED_IMAGES.map(([, file]) => file);
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function patchRetiredUiImages(source, {audit = false, ts} = {}) {
  let checked = source;
  if (audit) {
    assert(ts, 'Audit UI cleanup needs the same TypeScript parser as code trimming');
    const unreachable = new Set(analyzeReachability(source, ts).unreachable);
    let tree = ts.createSourceFile('game.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const iconHelper = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'drawPocketIcon');
    if (iconHelper) {
      let references = 0;
      const count = node => {
        if (ts.isIdentifier(node) && node.text === 'drawPocketIcon') references++;
        ts.forEachChild(node, count);
      };
      count(tree);
      assert.equal(references, 1, 'The old pocket-icon helper has no caller');
      // Normal trimming already removes this unreferenced top-level helper.
      // Audit mode retains class probes, but needs no uncaught UI downloads
      // for a helper that no entry point names.
      source = source.slice(0, iconHelper.getFullStart()) + source.slice(iconHelper.end);
      checked = source;
      tree = ts.createSourceFile('game.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    }
    const game = tree.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'BobbyGame');
    assert(game, 'Audit cleanup inspects the real game class');
    const retired = game.members.filter(member => RETIRED_METHODS.has(member.name?.getText(tree)));
    for (const member of retired) assert(unreachable.has(member.name.getText(tree)), 'Excluded audit consumer is proven unreachable');
    // Audit builds retain these methods solely to record unexpected calls.
    // All other references still count, including unlisted/dead helpers.
    for (const member of retired.sort((a, b) => b.getFullStart() - a.getFullStart())) {
      checked = checked.slice(0, member.getFullStart()) + checked.slice(member.end);
    }
  }
  for (const [symbol, file] of UNUSED_IMAGES) {
    const name = new RegExp(`\\b${symbol}\\b`, 'g');
    assert.equal([...checked.matchAll(name)].length, 2,
      `${symbol} has only its declaration and startup request outside proven retired methods`);
    const pair = new RegExp(`const ${symbol} = new Image\\(\\);\\nmirrorImageSource\\(${symbol}, "${escape(file)}(?:\\?[^"\\n]*)?"\\);\\n`, 'g');
    assert.equal([...source.matchAll(pair)].length, 1, `Retired UI initialization: ${symbol}`);
    const replacement = audit ? `const ${symbol} = null;\n` : '';
    source = source.replace(pair, replacement);
    checked = checked.replace(pair, replacement);
    assert.equal([...checked.matchAll(name)].length, audit ? 1 : 0, `No active image consumer: ${symbol}`);
    assert(!source.includes(file), `No remaining runtime image path: ${file}`);
  }
  return source;
}
