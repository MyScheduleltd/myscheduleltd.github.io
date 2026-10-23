import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the production method; the small DOM fixture records element
// replacement, just as a hovered/focused button would observe in a browser.
const source = await readFile('src/ui/App.ts', 'utf8');
const tree = ts.createSourceFile('App.ts', source, ts.ScriptTarget.Latest, true);
const app = tree.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'App');
const methods = ['showWishWall', 'seatMenuClose', 'onSeatMenuClose'].map(name => {
  const method = app.members.find(node => node.name?.getText(tree) === name);
  assert.ok(method, name);
  return method.getText(tree);
}).join('\n');
const globals = {};
runInNewContext(ts.transpileModule(`class WishHarness { ${methods} }; globalThis.WishHarness = WishHarness;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText, globals);

function fixture(wishes = [{ name: 'Visitor', message: 'A good film.' }]) {
  let html = '', replacements = 0, close, notes;
  const menu = {
    dataset: {}, hidden: true, scrollTop: 0,
    querySelector(selector) { return selector === '[data-seat-close]' ? close : selector === '[data-wish-wall-notes]' ? notes : null; },
    get innerHTML() { return html; },
    set innerHTML(value) {
      html = value; replacements++;
      close = { listeners: new Map(), addEventListener(event, callback) { this.listeners.set(event, callback); } };
      notes = { dataset: { language: value.match(/data-language="([^"]+)"/)?.[1] }, innerHTML: value.split(/<div data-wish-wall-notes[^>]*>/)[1]?.replace(/<\/div>$/, '') };
    },
  };
  const ui = new globals.WishHarness();
  Object.assign(ui, {
    root: { querySelector: () => menu }, language: 'zh-TW', networkState: { wishes }, openWishWall: false, wishWallRendered: '',
    prepareSeatMenu(target, owner) { target.dataset.menuOwner = owner; },
    escapeHtml(value) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); },
  });
  return { ui, menu, replacements: () => replacements };
}

test('wish-wall presence updates preserve the hovered close button, listener and scroll position', () => {
  const { ui, menu, replacements } = fixture();
  ui.showWishWall();
  const button = menu.querySelector('[data-seat-close]');
  menu.scrollTop = 150;
  for (let i = 0; i < 50; i++) {
    ui.networkState = { wishes: [{ name: 'Visitor', message: 'A good film.' }], attendeeTick: i };
    ui.showWishWall();
  }
  assert.equal(replacements(), 1, 'presence must not rebuild the dialog');
  assert.equal(menu.querySelector('[data-seat-close]'), button);
  assert.equal(menu.scrollTop, 150);
  button.listeners.get('click')();
  assert.equal(ui.openWishWall, false);
  assert.equal(menu.hidden, true);
  assert.equal(menu.dataset.menuOwner, undefined);
});

test('new wish content refreshes safely without replacing controls; newest is first', () => {
  const { ui, menu, replacements } = fixture();
  ui.showWishWall();
  const button = menu.querySelector('[data-seat-close]');
  ui.networkState.wishes.push({ name: '<new>', message: '<script>&' });
  ui.showWishWall();
  const html = menu.querySelector('[data-wish-wall-notes]').innerHTML;
  assert.equal(replacements(), 1);
  assert.equal(menu.querySelector('[data-seat-close]'), button);
  assert.ok(html.indexOf('&lt;new&gt;') < html.indexOf('Visitor'));
  assert.match(html, /&lt;script&gt;&amp;/);
  assert.doesNotMatch(html, /<script>/);
  ui.networkState.wishes = [];
  ui.showWishWall();
  assert.match(menu.querySelector('[data-wish-wall-notes]').innerHTML, /還沒有人留言/);
  assert.equal(menu.querySelector('[data-seat-close]'), button);
});

test('wish-wall language changes and reopening rebuild the relevant labels and control', () => {
  const { ui, menu, replacements } = fixture([]);
  ui.showWishWall();
  ui.language = 'en';
  ui.showWishWall();
  assert.match(menu.innerHTML, /WISH WALL/);
  assert.match(menu.innerHTML, /No notes yet/);
  const button = menu.querySelector('[data-seat-close]');
  button.listeners.get('click')();
  ui.showWishWall();
  assert.equal(menu.hidden, false);
  assert.equal(ui.openWishWall, true);
  assert.equal(replacements(), 3);
  assert.notEqual(menu.querySelector('[data-seat-close]'), button);
});
