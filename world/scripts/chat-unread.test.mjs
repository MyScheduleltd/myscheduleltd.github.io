import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// The phone's 聊天 button counts new chat (the owner, 2026-11-14): everyone's
// lines but this visitor's, from entry on, across all three tabs; a tab's
// lines are read once it is on screen; tapping opens the newest one's tab.
const source = await readFile('src/ui/App.ts', 'utf8');
const css = await readFile('src/style.css', 'utf8');
const tree = ts.createSourceFile('App.ts', source, ts.ScriptTarget.Latest, true);
const app = tree.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'App');
const methods = ['startChatUnread', 'ownChatLine', 'unreadChat', 'chatBadgeShown', 'syncChatUnread']
  .map(name => { const method = app.members.find(node => node.name?.getText(tree) === name); assert.ok(method, name); return method.getText(tree); }).join('\n');
const globals = {};
runInNewContext(ts.transpileModule(`class UnreadHarness { ${methods} }; globalThis.UnreadHarness = UnreadHarness;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText, globals);

function fixture({ phone = true } = {}) {
  const ui = new globals.UnreadHarness();
  const classes = new Set();
  const badge = { hidden: true, textContent: '', offsetWidth: 0, classList: { add: c => classes.add(c), remove: c => classes.delete(c) },
    getClientRects: () => (phone && !badge.hidden ? [{}] : []) };
  const attributes = {};
  const button = { setAttribute: (k, v) => { attributes[k] = v; }, removeAttribute: k => { delete attributes[k]; } };
  const tabs = ['NEARBY', 'VENUE', 'FESTIVAL'].map(channel => ({ dataset: { chatChannel: channel } }));
  const panel = { hidden: true, querySelector: () => (panel.hidden ? null : {}), querySelectorAll: () => tabs };
  Object.assign(ui, {
    chatRead: new Set(), chatUnreadShown: 0, chatMessages: [], chatChannel: 'NEARBY', activePanel: undefined,
    serverClockOffset: 60_000, language: 'zh-TW', currentId: 'Phone', networkState: { selfId: 'me' },
    root: { querySelector: s => ({ '[data-chat-unread]': badge, '[data-world-chat]': button, '#panel': panel })[s] ?? null },
  });
  const line = (id, channel, at, extra = {}) => ({ id, author: 'Desk', authorId: 'desk', channel, text: id, timestamp: at, ...extra });
  return { ui, badge, classes, attributes, tabs, panel, line };
}

test('nothing counts before entry, and the history there at entry is read', () => {
  const { ui, badge, line } = fixture();
  const entry = Date.now();
  ui.chatMessages = [line('old', 'FESTIVAL', entry - 10_000 + 60_000), { id: 'npc-1', author: 'MENTOR', channel: 'NEARBY', text: '', timestamp: entry - 185_000, npc: true }];
  ui.syncChatUnread();
  assert.equal(badge.hidden, true);
  ui.startChatUnread();
  assert.deepEqual(ui.unreadChat(), []);
  assert.equal(badge.hidden, true);
  // History that only reaches the phone after entry, stamped (service clock) before it, is not new.
  ui.chatMessages.push(line('late-history', 'VENUE', entry - 30_000 + 60_000));
  ui.syncChatUnread();
  assert.equal(badge.hidden, true);
});

test('other visitors and NPCs answering count across every tab; own lines and offline chatter do not', () => {
  const { ui, badge, classes, attributes, line } = fixture();
  ui.startChatUnread();
  const now = Date.now();
  ui.chatMessages.push(line('a', 'FESTIVAL', now + 60_000));
  ui.syncChatUnread();
  assert.equal(badge.hidden, false); assert.equal(badge.textContent, '1');
  assert.ok(classes.has('is-new'), 'a short pop when the count grows');
  assert.equal(attributes['aria-label'], '聊天，1 則新訊息');
  ui.chatMessages.push(line('b', 'NEARBY', now + 61_000), { id: 'npc-thanks-1', author: 'MAZU', channel: 'NEARBY', text: '', timestamp: now + 2_000, npc: true });
  ui.chatMessages.push({ id: 'pending-1', author: 'Phone', authorId: 'me', channel: 'NEARBY', text: 'mine', timestamp: now });
  ui.chatMessages.push(line('echo', 'NEARBY', now + 62_000, { author: 'Phone', authorId: 'me' }));
  ui.chatMessages.push({ id: 'ambient-1', author: 'MICHAEL', channel: 'VENUE', text: '', timestamp: now, npc: true });
  ui.syncChatUnread();
  assert.equal(badge.textContent, '3');
  assert.deepEqual(ui.unreadChat().map(m => m.id), ['a', 'b', 'npc-thanks-1'], 'oldest first, on one clock');
  for (let i = 0; i < 8; i++) ui.chatMessages.push(line(`more-${i}`, 'VENUE', now + 70_000 + i));
  ui.syncChatUnread();
  assert.equal(badge.textContent, '9+');
});

test('an open tab is read at once and the other tabs with news are marked', () => {
  const { ui, badge, tabs, panel, line } = fixture();
  ui.startChatUnread();
  const now = Date.now();
  ui.chatMessages.push(line('f', 'FESTIVAL', now + 60_000), line('n', 'NEARBY', now + 61_000));
  ui.syncChatUnread();
  // The 聊天 button opens on the newest line's tab.
  ui.chatChannel = ui.unreadChat().at(-1).channel;
  assert.equal(ui.chatChannel, 'NEARBY');
  ui.activePanel = 'chat'; panel.hidden = false;
  ui.syncChatUnread();
  assert.deepEqual(tabs.filter(t => t.dataset.unread === 'true').map(t => t.dataset.chatChannel), ['FESTIVAL']);
  assert.equal(badge.textContent, '1');
  ui.chatChannel = 'FESTIVAL'; ui.syncChatUnread();
  assert.deepEqual(tabs.filter(t => t.dataset.unread === 'true'), []);
  assert.equal(badge.hidden, true);
  ui.chatMessages.push(line('live', 'FESTIVAL', now + 62_000));
  ui.syncChatUnread();
  assert.equal(badge.hidden, true, 'a line in the tab being read is read');
});

test('a desktop draws no badge and its chat button reads as before', () => {
  const { ui, attributes, line } = fixture({ phone: false });
  ui.startChatUnread();
  ui.chatMessages.push(line('a', 'FESTIVAL', Date.now() + 60_000));
  ui.syncChatUnread();
  assert.equal(ui.chatBadgeShown(), false);
  assert.equal(attributes['aria-label'], undefined);
});

test('the badge is drawn only in the phone layout, on the button\'s corner, and every chat change reaches it', () => {
  assert.match(source, /<span class="world-chat-unread" data-chat-unread hidden aria-hidden="true"><\/span>/);
  assert.match(css, /\.world-chat-unread \{ display: none; \}/);
  const phone = css.slice(css.indexOf('@media (max-width: 800px), (pointer: coarse) and (hover: none) {\n  .world-quick-actions {'));
  assert.match(phone.slice(0, 3000), /\.world-chat-unread:not\(\[hidden\]\) \{\s*position: absolute; left: -9px; bottom: 31px;/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{ :root \.world-chat-unread\.is-new \{ animation: none; \} \}/);
  const body = name => { const m = app.members.find(node => node.name?.getText(tree) === name); return m.getText(tree); };
  assert.match(body('renderChatStream'), /^\s*private renderChatStream\(\): void \{\s*\/\/[^\n]*\n\s*this\.syncChatUnread\(\);/);
  assert.match(body('refreshOpenChatFeed'), /this\.syncChatUnread\(\);/);
  assert.match(body('bindChatPanel'), /this\.syncChatUnread\(\);/);
  assert.match(body('completeGateEntry'), /this\.visits\?\.entered\(\);\s*this\.startChatUnread\(\);/);
  assert.match(source, /const newest = this\.chatBadgeShown\(\) \? this\.unreadChat\(\)\.at\(-1\) : undefined;\s*if \(newest\) this\.chatChannel = newest\.channel;\s*this\.openPanel\('chat'\);/);
});
