import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = await readFile('src/ui/App.ts', 'utf8');
const serverSource = await readFile('server/index.mjs', 'utf8');
const safeTextDefinition = serverSource.match(/^const safeText = (.+);$/m);
assert.ok(safeTextDefinition, 'the actual service text normalization is available');
const serverSafeText = runInNewContext(`(${safeTextDefinition[1]})`);
const tree = ts.createSourceFile('App.ts', source, ts.ScriptTarget.Latest, true);
const app = tree.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'App');
const methods = ['bindChatPanel', 'syncChatSendingControls', 'submitChatMessage', 'reconcileChatMessages', 'chatPanelContent']
  .map(name => { const method = app.members.find(node => node.name?.getText(tree) === name); assert.ok(method, name); return method.getText(tree); }).join('\n');
let now = 1000;
const globals = { initialChat: [], performance: { now: () => now }, setButtonPressed(button, pressed) { button.pressed = pressed; } };
runInNewContext(ts.transpileModule(`class ChatHarness { ${methods} }; globalThis.ChatHarness = ChatHarness;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText, globals);

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function element(properties = {}) {
  const listeners = new Map();
  return {
    ...properties,
    addEventListener(type, handler) { const handlers = listeners.get(type) ?? []; handlers.push(handler); listeners.set(type, handlers); },
    fire(type, details = {}) {
      const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...details };
      for (const handler of listeners.get(type) ?? []) handler(event);
      return event;
    },
  };
}
function panel(value = '') {
  const input = element({ value, readOnly: false, focusCount: 0, focus() { this.focusCount++; } });
  const button = element({ disabled: false });
  const form = element({ querySelector: selector => selector === '#chat-message' ? input : button });
  const channels = ['NEARBY', 'VENUE', 'FESTIVAL'].map(channel => element({ dataset: { chatChannel: channel } }));
  return { input, button, form, querySelector: selector => selector === '#chat-form' ? form : input, querySelectorAll: () => channels, channels };
}
function fixture() {
  const ui = new globals.ChatHarness(), calls = [], requests = [], alerts = [];
  let current = panel('hello');
  Object.assign(ui, {
    activePanel: 'chat', chatChannel: 'FESTIVAL', chatMessages: [], pendingChat: [], chatDrafts: {}, chatSending: false, chatSequence: 0,
    currentId: 'Visitor', networkState: { selfId: 'visitor-id', messages: [] }, language: 'zh-TW', connectionStatus: 'online',
    root: { querySelector: selector => selector === '#chat-form' ? current.form : selector === '#chat-message' ? current.input : null },
    festivalClient: { online: true, sendMessage(channel, text) { const request = deferred(); requests.push(request); calls.push({ channel, text }); return request.promise; } },
    addChatMessage(message) { this.chatMessages.push(message); }, renderChatStream() {}, refreshOpenChatFeed() {},
    showWorldAlert(message) { alerts.push(message); }, completeQuest() {}, chatFeedContent: () => '',
    escapeAttribute: value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'),
    openPanel() { current = panel(this.chatDrafts[this.chatChannel] ?? ''); this.bindChatPanel(current); },
  });
  ui.bindChatPanel(current);
  const state = messages => { ui.networkState.messages = messages; ui.reconcileChatMessages(messages); };
  return { ui, calls, requests, alerts, state, current: () => current };
}
const echo = (id, text = 'hello', overrides = {}) => ({ id, authorId: 'visitor-id', author: 'Visitor', channel: 'FESTIVAL', text, timestamp: 10000, ...overrides });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

test('repeated submit/Enter/click while awaiting the service makes one POST and one optimistic row', async () => {
  const f = fixture(), { input, button, form } = f.current();
  assert.equal(form.fire('submit').defaultPrevented, true);
  form.fire('submit');
  await f.ui.submitChatMessage(input, 'FESTIVAL');
  assert.equal(f.calls.length, 1); assert.equal(f.ui.chatMessages.length, 1);
  assert.equal(input.readOnly, true); assert.equal(button.disabled, true);
  assert.equal(input.value, 'hello', 'keep the draft until acceptance');
  f.requests[0].resolve({ ok: true }); await flush();
  assert.equal(input.readOnly, false); assert.equal(button.disabled, false); assert.equal(input.value, '');
  assert.equal(f.ui.chatSending, false);
});

test('channel and language redraws share the send lock, and a failed draft remains retryable', async () => {
  const f = fixture(), original = f.current();
  original.input.value = '  中文 <"草稿">  ';
  original.form.fire('submit');
  f.ui.language = 'en';
  const markup = f.ui.chatPanelContent();
  assert.match(markup, /value="  中文 &lt;&quot;草稿&quot;>  "/); assert.match(markup, /readonly/); assert.match(markup, /type="submit" disabled/);
  original.channels[0].fire('click');
  const nearby = f.current(); nearby.input.value = 'a different channel'; nearby.input.fire('input'); nearby.form.fire('submit');
  assert.equal(nearby.button.disabled, true); assert.equal(nearby.input.readOnly, true); assert.equal(f.calls.length, 1);
  f.requests[0].resolve({ ok: false, message: 'Please try again' }); await flush();
  assert.equal(f.ui.pendingChat.length, 0); assert.equal(f.ui.chatMessages.length, 0); assert.equal(f.alerts[0], 'Please try again');
  assert.equal(nearby.input.value, 'a different channel', 'failure does not overwrite a different channel draft');
  assert.equal(nearby.input.readOnly, false); assert.equal(nearby.button.disabled, false);
  nearby.channels[2].fire('click');
  assert.equal(f.current().input.value, original.input.value, 'the original draft survives returning to its channel');
  f.current().form.fire('submit'); assert.equal(f.calls.length, 2);
  f.requests[1].resolve({ ok: true }); await flush();
  assert.equal(f.current().input.value, '');
});

test('a server echo before the POST response replaces its optimistic row without duplicating it', async () => {
  const f = fixture(); f.current().form.fire('submit');
  f.state([echo('server-1')]);
  assert.equal(f.ui.pendingChat.length, 0); assert.equal(f.ui.chatMessages.length, 1);
  assert.equal(f.ui.chatMessages[0].id, 'server-1');
  f.requests[0].resolve({ ok: true }); await flush();
  assert.equal(f.ui.chatMessages.length, 1); assert.equal(f.ui.chatMessages[0].id, 'server-1');
  f.current().input.value = 'hello'; f.current().form.fire('submit');
  f.state([echo('server-1')]);
  assert.equal(f.ui.pendingChat.length, 1, 'an old identical line cannot acknowledge a new send');
  assert.equal(f.ui.chatMessages.length, 2, 'a deliberate repeated line appears immediately');
  f.state([echo('server-1'), echo('server-2')]);
  assert.equal(f.ui.pendingChat.length, 0); assert.equal(f.ui.chatMessages.length, 2);
  f.requests[1].resolve({ ok: true }); await flush();
});

test('one new echo can only acknowledge one of two intentionally identical sends awaiting broadcasts', async () => {
  const f = fixture(); f.current().form.fire('submit'); f.requests[0].resolve({ ok: true }); await flush();
  f.current().input.value = 'hello'; f.current().form.fire('submit'); f.requests[1].resolve({ ok: true }); await flush();
  assert.equal(f.calls.length, 2); assert.equal(f.ui.pendingChat.length, 2);
  assert.notEqual(f.ui.pendingChat[0].message.id, f.ui.pendingChat[1].message.id);
  f.state([echo('server-1')]); assert.equal(f.ui.pendingChat.length, 1); assert.equal(f.ui.chatMessages.length, 2);
  f.state([echo('server-1')]); assert.equal(f.ui.pendingChat.length, 1, 'the next snapshot cannot reuse the first acknowledgement');
  f.state([echo('server-1'), echo('server-2')]); assert.equal(f.ui.pendingChat.length, 0); assert.equal(f.ui.chatMessages.length, 2);
});

test('full-width punctuation and collapsed whitespace reconcile with the actual normalized service echo', async () => {
  for (const text of [
    '以及嘗試按左上角的任務表，完成裡面的任務',
    '連結：  https://example.com/path?a=1＆b=2\n下行　空格',
    '㍿'.repeat(100),
  ]) {
    const f = fixture(); f.current().input.value = text; f.current().form.fire('submit');
    const sentText = f.calls[0].text, normalized = serverSafeText(sentText, 160);
    assert.notEqual(normalized, sentText, 'exercise text the service actually transforms');
    assert.equal(f.ui.chatMessages[0].text, sentText, 'optimistic display retains the written text');
    f.state([echo('wrong-author', normalized, { authorId: 'other-id' }), echo('wrong-channel', normalized, { channel: 'NEARBY' })]);
    assert.equal(f.ui.pendingChat.length, 1, 'normalization cannot acknowledge another author or channel');
    f.state([echo('service-normalized', normalized)]);
    assert.equal(f.ui.pendingChat.length, 0); assert.equal(f.ui.chatMessages.length, 1);
    assert.equal(f.ui.chatMessages[0].text, normalized);
    f.requests[0].resolve({ ok: true }); await flush();
    assert.equal(f.ui.chatMessages.length, 1);
  }
});

test('echo matching uses author ID and channel, including a sender renamed before its echo arrives', async () => {
  const f = fixture(); f.current().form.fire('submit');
  f.state([echo('other-person', 'hello', { authorId: 'other-id' }), echo('other-channel', 'hello', { channel: 'NEARBY' })]);
  assert.equal(f.ui.pendingChat.length, 1);
  f.state([echo('renamed', 'hello', { author: 'New name' })]);
  assert.equal(f.ui.pendingChat.length, 0); assert.equal(f.ui.chatMessages.length, 1);
  f.requests[0].resolve({ ok: true }); await flush();
});

test('unexpected service rejection releases controls and preserves the draft for another attempt', async () => {
  const f = fixture(); f.current().form.fire('submit'); f.requests[0].reject(new Error('transport failed')); await flush();
  assert.equal(f.ui.chatSending, false); assert.equal(f.current().input.readOnly, false); assert.equal(f.current().button.disabled, false);
  assert.equal(f.current().input.value, 'hello'); assert.equal(f.ui.pendingChat.length, 0);
  f.current().form.fire('submit'); assert.equal(f.calls.length, 2); f.requests[1].resolve({ ok: true }); await flush();
});

test('IME acceptance and held Enter cannot submit a line; a later deliberate send still works', async () => {
  now = 1000;
  const f = fixture(), { input, form } = f.current();
  assert.equal(input.fire('keydown', { key: 'Enter', repeat: true }).defaultPrevented, true);
  assert.equal(input.fire('keydown', { key: 'Enter', isComposing: true }).defaultPrevented, true);
  assert.equal(input.fire('keydown', { key: 'Enter', keyCode: 229 }).defaultPrevented, true);
  input.fire('compositionstart'); form.fire('submit'); assert.equal(f.calls.length, 0);
  input.fire('compositionend'); form.fire('submit'); assert.equal(f.calls.length, 0);
  now += 249; assert.equal(input.fire('keydown', { key: 'Enter' }).defaultPrevented, true); form.fire('submit'); assert.equal(f.calls.length, 0);
  now += 1; assert.equal(input.fire('keydown', { key: 'Enter' }).defaultPrevented, false);
  form.fire('submit'); assert.equal(f.calls.length, 1); f.requests[0].resolve({ ok: true }); await flush();
});

test('offline and empty submissions retain their existing local-only behavior', async () => {
  const f = fixture(); f.ui.festivalClient.online = false;
  f.current().input.value = '  '; f.current().form.fire('submit'); assert.equal(f.ui.chatMessages.length, 0);
  f.current().input.value = 'offline'; f.current().form.fire('submit'); f.current().form.fire('submit');
  assert.equal(f.calls.length, 0); assert.equal(f.ui.chatMessages.length, 1); assert.equal(f.ui.chatMessages[0].text, 'offline');
  assert.equal(f.current().input.value, ''); assert.equal(f.current().input.readOnly, false); assert.equal(f.current().button.disabled, false);
});
