// The phone's 聊天 button counts new chat (the owner, 2026-11-14): a red
// ticket on its top-left corner, everyone's lines but your own, all three
// tabs; tapping opens the tab with the newest one and marks the others.
// Two visitors on the local service (8797) through the dev server (4201):
// a phone that receives, and a desktop that writes.
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
async function say(page, channel, text) {
  if (!(await page.evaluate(() => document.querySelector('#panel .chat-feed') && !document.querySelector('#panel').hidden))) {
    await page.keyboard.press('Enter');
    await page.waitForSelector('#panel .chat-feed', { timeout: 5_000 });
  }
  await page.click(`[data-chat-channel="${channel}"]`);
  await page.fill('#chat-message', text);
  await page.press('#chat-message', 'Enter');
  await page.waitForTimeout(2_500);
}
const until = async (page, test, ms = 15_000) => { const end = Date.now() + ms; let last; while (Date.now() < end) { last = await badge(page); if (test(last)) return last; await page.waitForTimeout(400); } return last; };

const phone = await visitor(`Phone${tag}`, { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const desk = await visitor(`Desk${tag}`, { viewport: { width: 1440, height: 900 } });
let state = await badge(phone);
check('phone: no badge on entry, the history already there is not new', !state.shown, JSON.stringify(state));

await say(desk, 'FESTIVAL', `hello from the desk ${tag}`);
state = await until(phone, s => s.shown);
check('phone: a visitor\'s line shows a count of 1', state.shown && state.text === '1', JSON.stringify(state));
check('phone: the ticket sits on the 聊天 button\'s top-left corner', state.corner && Math.abs(state.corner.dx) < 8 && Math.abs(state.corner.dy) < 8, JSON.stringify(state.corner));
check('phone: the button tells a screen reader', /1 則新訊息|1 new message/.test(state.label), state.label);
await phone.screenshot({ path: `${out}/phone-one-new.png` });

await say(desk, 'NEARBY', `over here ${tag}`);
await say(desk, 'NEARBY', `by the arcade ${tag}`);
state = await until(phone, s => s.text === '3');
check('phone: three lines across two tabs count 3', state.text === '3', JSON.stringify(state));
await phone.screenshot({ path: `${out}/phone-three-new.png` });
await phone.screenshot({ path: `${out}/phone-three-new-corner.png`, clip: { x: 230, y: 560, width: 172, height: 160 } });

// Tapping 聊天 opens the tab with the newest line; the other tab is marked.
await phone.tap('[data-world-chat]');
await phone.waitForSelector('#panel .chat-feed', { timeout: 5_000 });
await phone.waitForTimeout(500);
const opened = await phone.evaluate(() => ({
  tab: document.querySelector('[data-chat-channel][aria-pressed="true"]')?.dataset.chatChannel,
  marked: [...document.querySelectorAll('[data-chat-channel][data-unread="true"]')].map(b => b.dataset.chatChannel),
  dot: (() => { const b = document.querySelector('[data-chat-channel][data-unread="true"]'); return b ? getComputedStyle(b, '::after').backgroundColor : ''; })(),
}));
check('phone: 聊天 opens on the tab with the newest line', opened.tab === 'NEARBY', JSON.stringify(opened));
check('phone: the other tab with news carries a red mark', opened.marked.length === 1 && opened.marked[0] === 'FESTIVAL' && /169, 28, 36/.test(opened.dot), JSON.stringify(opened));
await phone.screenshot({ path: `${out}/phone-chat-open.png` });
// Leave by the panel's own close; FESTIVAL's line is still unread.
await phone.evaluate(() => document.querySelector('#panel [data-close-panel], #panel .panel-close, #panel button[aria-label*="關閉"], #panel button[aria-label*="Close"]')?.click());
await phone.waitForTimeout(600);
if (await phone.evaluate(() => !document.querySelector('#panel').hidden)) await phone.keyboard.press('Escape');
await phone.waitForTimeout(600);
state = await badge(phone);
check('phone: after reading 附近, 1 is still waiting in 影展', state.shown && state.text === '1', JSON.stringify(state));
await phone.tap('[data-world-chat]');
await phone.waitForSelector('#panel .chat-feed', { timeout: 5_000 });
const second = await phone.evaluate(() => document.querySelector('[data-chat-channel][aria-pressed="true"]')?.dataset.chatChannel);
check('phone: the next tap opens 影展', second === 'FESTIVAL', second);
await phone.evaluate(() => document.querySelector('#panel [data-close-panel], #panel .panel-close, #panel button[aria-label*="關閉"], #panel button[aria-label*="Close"]')?.click());
await phone.waitForTimeout(600);
if (await phone.evaluate(() => !document.querySelector('#panel').hidden)) await phone.keyboard.press('Escape');
await phone.waitForTimeout(600);
state = await badge(phone);
check('phone: everything read, no badge', !state.shown && !state.label, JSON.stringify(state));

// A line arriving while its tab is open is read at once.
await phone.tap('[data-world-chat]');
await phone.waitForSelector('#panel .chat-feed', { timeout: 5_000 });
await say(desk, 'FESTIVAL', `while you look ${tag}`);
await phone.waitForTimeout(2_500);
const whileOpen = await phone.evaluate(() => [...document.querySelectorAll('[data-chat-channel][data-unread="true"]')].map(b => b.dataset.chatChannel));
check('phone: a line in the open tab is read at once', whileOpen.length === 0, JSON.stringify(whileOpen));
await say(desk, 'VENUE', `in the venue ${tag}`);
await phone.waitForTimeout(2_500);
const otherTab = await phone.evaluate(() => [...document.querySelectorAll('[data-chat-channel][data-unread="true"]')].map(b => b.dataset.chatChannel));
check('phone: a line in another tab marks that tab while chat is open', otherTab.join() === 'VENUE', JSON.stringify(otherTab));

// The phone's own line never counts, on the phone.
await phone.fill('#chat-message', `my own line ${tag}`);
await phone.press('#chat-message', 'Enter');
await phone.waitForTimeout(2_500);
await phone.click('[data-chat-channel="VENUE"]');
await phone.waitForTimeout(500);
await phone.evaluate(() => document.querySelector('#panel [data-close-panel], #panel .panel-close, #panel button[aria-label*="關閉"], #panel button[aria-label*="Close"]')?.click());
await phone.waitForTimeout(600);
if (await phone.evaluate(() => !document.querySelector('#panel').hidden)) await phone.keyboard.press('Escape');
await phone.waitForTimeout(1_000);
state = await badge(phone);
check('phone: its own line does not count', !state.shown, JSON.stringify(state));

// Desktop draws no badge; its chat log is on screen.
const deskState = await until(desk, s => s.text !== '', 6_000);
check('desktop: no badge is drawn, and the button reads as before', !deskState.shown && !deskState.label, JSON.stringify(deskState));
check('no page errors', !phone.errors.length && !desk.errors.length, [...phone.errors, ...desk.errors].join(' | '));
await browser.close();
console.log(`${checks.filter(Boolean).length}/${checks.length}`);
process.exit(checks.every(Boolean) ? 0 : 1);
