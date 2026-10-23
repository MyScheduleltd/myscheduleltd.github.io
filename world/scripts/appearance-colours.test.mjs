import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import ts from 'typescript';

// Use the actual App handlers without requiring a WebGL context or constructing
// the rest of the gate. The fixtures only supply DOM events and profile storage.
const helpers = await build({ stdin: { contents: "export * from './src/world/CoastalOutfits';export * from './src/world/NativeAvatarPalette';export * from './src/world/AccessoryOptions';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm' });
const imports = await import('data:text/javascript;base64,' + Buffer.from(helpers.outputFiles[0].text).toString('base64'));
const source = await readFile('src/ui/App.ts', 'utf8');
const tree = ts.createSourceFile('App.ts', source, ts.ScriptTarget.Latest, true);
const app = tree.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'App');
const constants = ['PROFILE_KEY', 'defaultPalette', 'OLD_DEFAULTS', 'paletteInputs', 'paletteLabels', 'readProfile'].map(name => {
  const statement = tree.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => declaration.name.getText(tree) === name));
  assert.ok(statement, name); return statement.getText(tree);
}).join('\n');
const migration = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'withoutOldDefaults').getText(tree);
const methods = ['appearanceFields', 'bindAppearanceFields', 'rememberPalette'].map(name => {
  const method = app.members.find(node => node.name?.getText(tree) === name); assert.ok(method, name); return method.getText(tree);
}).join('\n');
const javascript = ts.transpileModule(`${constants}\n${migration}\nclass AppearanceHarness { language='en';palette={...defaultPalette};${methods} }\nglobalThis.AppearanceHarness=AppearanceHarness;globalThis.readSaved=()=>{const profile=readProfile();return profile?withoutOldDefaults({...defaultPalette,...profile.palette}):null;};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const PROFILE_KEY = 'myschedule-festival-profile-v1';
const plain = value => JSON.parse(JSON.stringify(value));

function fixture() {
  const saved = new Map();
  const context = { ...imports, localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) } };
  runInNewContext(javascript, context);
  const ui = new context.AppearanceHarness();
  return { ui, saved, restore: context.readSaved };
}

function controls(ui, attribute) {
  const node = (value, attrs = {}, type = '') => ({ value, type, disabled: false, handlers: {}, getAttribute: name => attrs[name], addEventListener(event, handler) { this.handlers[event] = handler; }, fire(event) { this.handlers[event]?.({ currentTarget: this }); } });
  const colours = new Map(['skin','hair','shirt','bottoms','swimwear','shoes'].map(slot => [slot, node(ui.palette[slot] ?? imports.AVATAR_CLOTHING_DEFAULTS[slot], { [attribute]: slot }, 'color')]));
  const outfit = node(ui.palette.top), body = node(imports.avatarSex(ui.palette.top));
  const options = imports.TOP_OUTFITS.map(o => ({ value: imports.outfitWire(o.id, body.value) }));
  const scope = {
    querySelector: selector => selector === `[${attribute}-outfit]` ? outfit : selector === `[${attribute}-body]` ? body : null,
    querySelectorAll: selector => selector === `[${attribute}-outfit] option` ? options
      : selector === `[${attribute}-wear]` ? []
      : selector === `input[${attribute}="shirt"]` ? [colours.get('shirt')]
      : [...colours.values()],
  };
  return { scope, colours, outfit, body, options };
}

test('both appearance panels expose independent garment pickers without replacing an untouched atlas', () => {
  for (const attribute of ['data-palette', 'data-world-palette']) for (const language of ['en', 'zh-TW']) {
    const { ui } = fixture(); ui.language = language;
    const before = plain(ui.palette), markup = ui.appearanceFields(attribute);
    for (const slot of ['shirt', 'shoes']) assert.match(markup, new RegExp(`${attribute}="${slot}" value="${imports.AVATAR_CLOTHING_DEFAULTS[slot]}"`));
    assert.deepEqual(plain(ui.palette), before, 'drawing the panel is not a dye choice');
    assert.equal(Object.hasOwn(ui.palette, 'shirt'), false); assert.equal(Object.hasOwn(ui.palette, 'shoes'), false);
    ui.palette.top = imports.outfitWire('4', 'female');
    const swim = ui.appearanceFields(attribute);
    assert.match(swim, new RegExp(`${attribute}="shirt"[^>]*disabled`));
    assert.doesNotMatch(swim, new RegExp(`${attribute}="shoes"[^>]*disabled`));
  }
});

test('real colour, outfit and body handlers retain dye independence, fixed outfit IDs and saved selections', () => {
  for (const attribute of ['data-palette', 'data-world-palette']) {
    const { ui, saved, restore } = fixture();
    saved.set(PROFILE_KEY, JSON.stringify({ id: 'ATTENDEE', palette: plain(ui.palette) }));
    const original = plain(ui.palette), fields = controls(ui, attribute); let commits = 0;
    ui.bindAppearanceFields(fields.scope, attribute, () => { commits++; ui.rememberPalette(); });
    fields.colours.get('shirt').value = '#b63b39'; fields.colours.get('shirt').fire('input');
    fields.colours.get('shoes').value = '#297dbc'; fields.colours.get('shoes').fire('input');
    assert.equal(ui.palette.top, original.top); assert.equal(ui.palette.bottoms, original.bottoms); assert.equal(ui.palette.swimwear, original.swimwear);
    for (const outfit of ['1','2','3','4','1']) {
      fields.outfit.value = imports.outfitWire(outfit, 'male'); fields.outfit.fire('change');
      assert.equal(imports.topOutfit(ui.palette.top), outfit); assert.equal(fields.colours.get('shirt').disabled, outfit === '4');
      assert.equal(ui.palette.shirt, '#b63b39'); assert.equal(ui.palette.shoes, '#297dbc');
    }
    fields.body.value = 'female'; fields.body.fire('change');
    assert.equal(ui.palette.top, imports.outfitWire('1', 'female'));
    assert.equal(ui.palette.shirt, '#b63b39'); assert.equal(ui.palette.shoes, '#297dbc');
    assert.equal(ui.palette.bottoms, imports.AVATAR_NATIVE.female.bottoms); assert.equal(ui.palette.swimwear, imports.AVATAR_NATIVE.female.swimwear);
    assert.deepEqual(plain(restore()), plain(ui.palette));
    assert.equal(JSON.parse(saved.get(PROFILE_KEY)).id, 'ATTENDEE'); assert.equal(commits, 8);
  }
});

test('a profile that opted out of remembering remains unsaved after garment changes', () => {
  const { ui, saved } = fixture(); ui.palette.shirt = '#803a25'; ui.palette.shoes = '#318b75'; ui.rememberPalette();
  assert.equal(saved.has(PROFILE_KEY), false);
});
