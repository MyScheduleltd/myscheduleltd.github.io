// The phone's 聊天 button counts new chat (the owner, 2026-11-14): a red
// ticket on its top-left corner, everyone's lines but your own, read when the
// chat is opened. Chat is one list for the whole festival (same night): no
// tabs, no channel tags, and a line reaches visitors anywhere on the island.
// Two visitors on the local service (8797) through the dev server (4201):
// a phone that receives, and a desktop that writes from across the map.
//   node art/ps1-restyle-20261109/chat-unread-check.mjs
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const out = 'art/ps1-restyle-20261109/chat-unread';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const checks = [];
const check = (name, ok, detail = '') => { checks.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` · ${detail}` : ''}`); };
const tag = Date.now() % 1000;
async function visitor(name, device) {
  const page = await (await browser.newContext(device)).newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e).slice(0, 160)));
  await page.goto('http://localhost:4201/?era=ps2&island&cycleMinute=12', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#gate-form', { timeout: 120_000 });
  await page.fill('#festival-id', name);
  await page.locator('#gate-form button[data-audio="muted"]').click();
  await page.waitForFunction(() => !document.querySelector('.gate--live') && document.querySelector('.objective-count'), undefined, { timeout: 300_000 });
  await page.waitForTimeout(2_000);
  return page;
}
const badge = page => page.evaluate(() => {
  const node = document.querySelector('[data-chat-unread]'), button = document.querySelector('[data-world-chat]');
  const shown = Boolean(node && !node.hidden && node.getClientRects().length && getComputedStyle(node).display !== 'none');
  const b = node?.getBoundingClientRect(), c = button?.getBoundingClientRect();
  return { shown, text: node?.textContent ?? '', label: button?.getAttribute('aria-label') ?? '',
    corner: shown && b && c ? { dx: +(b.left + b.width / 2 - c.left).toFixed(1), dy: +(b.top + b.height / 2 - c.top).toFixed(1) } : undefined };
});
// The desktop writes through its own chat panel, as a visitor would.
async function say(page, text) {
  if (!(await page.evaluate(() => document.querySelector('#panel .chat-feed') && !document.querySelector('#panel').hidden))) {
    await page.keyboard.press('Enter');
    await page.waitForSelector('#panel .chat-feed', { timeout: 5_000 });
  }
  await page.fill('#chat-message', text);
  await page.press('#chat-message', 'Enter');
  await page.waitForTimeout(2_500);
}
const until = async (page, test, ms = 15_000) => { const end = Date.now() + ms; let last; while (Date.now() < end) { last = await badge(page); if (test(last)) return last; await page.waitForTimeout(400); } return last; };

const close = async page => {
  await page.evaluate(() => document.querySelector('#panel-close')?.click());
  await page.waitForTimeout(800);
};
const phone = await visitor(`Phone${tag}`, { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const desk = await visitor(`Desk${tag}`, { viewport: { width: 1440, height: 900 } });
// The writer walks off to the far side of the island, into another venue.
const apart = await desk.evaluate(async () => {
  const w = window.__islandWorld, x = -28, z = -22;
  w.player.position.set(x, w.groundHeightAt(x, z, 0), z); w.airborne = false;
  await new Promise(resolve => setTimeout(resolve, 2_500));
  return { at: [x, z], location: w.snapshot?.location ?? '' };
});
const phoneAt = await phone.evaluate(() => { const p = window.__islandWorld.player.position; return [+p.x.toFixed(1), +p.z.toFixed(1)]; });
console.log('desk', JSON.stringify(apart), 'phone', JSON.stringify(phoneAt));
let state = await badge(phone);
check('phone: no badge on entry, the history already there is not new', !state.shown, JSON.stringify(state));

await say(desk, `hello from across the island ${tag}`);
state = await until(phone, s => s.shown);
check('phone: a line from a visitor far away, in another venue, arrives and counts 1', state.shown && state.text === '1', JSON.stringify(state));
check('phone: the ticket sits on the 聊天 button\'s top-left corner', state.corner && Math.abs(state.corner.dx) < 8 && Math.abs(state.corner.dy) < 8, JSON.stringify(state.corner));
await say(desk, `second line ${tag}`);
await say(desk, `third line ${tag}`);
state = await until(phone, s => s.text === '3');
check('phone: three lines count 3', state.text === '3', JSON.stringify(state));
await phone.screenshot({ path: `${out}/phone-three-new.png` });

await phone.tap('[data-world-chat]');
await phone.waitForSelector('#panel .chat-feed', { timeout: 5_000 });
await phone.waitForTimeout(500);
const panel = await phone.evaluate(tag => ({
  tabs: document.querySelectorAll('#panel [data-chat-channel], #panel .chat-channels').length,
  label: document.querySelector('#chat-form label')?.textContent?.trim(),
  lines: [...document.querySelectorAll('#panel .chat-feed article p')].map(p => p.textContent).filter(text => text.endsWith(String(tag))),
}), tag);
check('phone: the chat is one list, with no 附近 / 影廳 / 全影展 tabs', panel.tabs === 0, JSON.stringify(panel));
check('phone: all three lines are in that one list', panel.lines.length === 3, JSON.stringify(panel.lines));
check('phone: the input is labelled plain 訊息', panel.label === '訊息', panel.label);
const scroll = await phone.evaluate(() => { const feed = document.querySelector('#panel .chat-feed'); return { top: Math.round(feed.scrollTop), bottom: Math.round(feed.scrollHeight - feed.clientHeight) }; });
check('phone: the list opens at the newest line', scroll.bottom > 0 && Math.abs(scroll.top - scroll.bottom) <= 2, JSON.stringify(scroll));
await phone.screenshot({ path: `${out}/phone-chat-open.png` });
await close(phone);
state = await badge(phone);
check('phone: everything read, no badge', !state.shown && !state.label, JSON.stringify(state));

await phone.tap('[data-world-chat]');
await phone.waitForSelector('#panel .chat-feed', { timeout: 5_000 });
await say(desk, `while you look ${tag}`);
await close(phone);
state = await badge(phone);
check('phone: a line arriving while the chat is open is read', !state.shown, JSON.stringify(state));

await phone.tap('[data-world-chat]');
await phone.waitForSelector('#panel .chat-feed', { timeout: 5_000 });
await phone.fill('#chat-message', `my own line ${tag}`);
await phone.press('#chat-message', 'Enter');
await phone.waitForTimeout(2_500);
await close(phone);
state = await badge(phone);
check('phone: its own line does not count', !state.shown, JSON.stringify(state));

// The desktop, far away, gets the phone's line too; its floating lines carry no tag.
await desk.keyboard.press('Escape');
await desk.waitForTimeout(800);
await close(desk);
const stream = await desk.evaluate(tag => ({
  tags: document.querySelectorAll('.chat-stream__channel').length,
  lines: [...document.querySelectorAll('#chat-stream .chat-stream__item p')].map(p => p.textContent),
  hasPhone: [...document.querySelectorAll('#chat-stream .chat-stream__item p')].some(p => p.textContent === `my own line ${tag}`),
}), tag);
check('desktop: the phone\'s line reaches it across the island', stream.hasPhone, JSON.stringify(stream.lines));
check('desktop: floating chat lines carry no channel tag', stream.tags === 0, JSON.stringify(stream));
await desk.screenshot({ path: `${out}/desk-stream.png` });
const deskState = await badge(desk);
check('desktop: no badge is drawn, and the button reads as before', !deskState.shown && !deskState.label, JSON.stringify(deskState));
check('no page errors', !phone.errors.length && !desk.errors.length, [...phone.errors, ...desk.errors].join(' | '));
await browser.close();
console.log(`${checks.filter(Boolean).length}/${checks.length}`);
process.exit(checks.every(Boolean) ? 0 : 1);
