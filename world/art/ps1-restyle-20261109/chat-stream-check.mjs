// The chat stream, Twitch-style (the owner, 2026-11-13): sends four messages
// a second and a half apart, samples the stream every 100ms, and checks that
// each new one slides in at the bottom, the others move up, at most three stay,
// the oldest slides off the top, and every card fades about 12s after it was
// written. Screenshots mid-slide go to art/ps1-restyle-20261109/chat-stream/.
//   node art/ps1-restyle-20261109/chat-stream-check.mjs
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const out = 'art/ps1-restyle-20261109/chat-stream';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.goto('http://localhost:4201/?era=ps2&island', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#gate-form', { timeout: 120_000 });
await page.fill('#festival-id', 'StreamCheck');
await page.locator('#gate-form button[data-audio="muted"]').click();
await page.waitForFunction(() => !document.querySelector('.gate--live') && document.querySelector('.objective-count'), undefined, { timeout: 300_000 });
await page.waitForTimeout(2_000);
// Sample the stream from inside the page.
await page.evaluate(() => {
  window.__streamSamples = [];
  const stream = document.querySelector('#chat-stream');
  const take = () => {
    const frame = stream.getBoundingClientRect();
    window.__streamSamples.push({ at: performance.now(), cards: [...stream.children].map(node => ({
      id: node.dataset.messageId, text: node.querySelector('p')?.textContent ?? '', leaving: node.classList.contains('is-leaving'),
      top: Math.round(node.getBoundingClientRect().top - frame.top), bottom: Math.round(node.getBoundingClientRect().bottom - frame.top), opacity: +getComputedStyle(node).opacity,
      anims: node.getAnimations().map(a => `${a.constructor.name}:${a.playState}:${(a.effect?.getComputedTiming().progress ?? -1).toFixed(2)}`).join(' '),
    })) });
  };
  window.__streamTimer = setInterval(take, 100);
});
const send = async text => {
  await page.locator('.world-chat-shortcut, [data-world-chat]').first().click().catch(async () => {
    await page.locator('#pass-toggle').click(); await page.locator('#festival-pass [data-panel="chat"]').click();
  });
  await page.waitForSelector('#chat-message', { timeout: 10_000 });
  await page.fill('#chat-message', text);
  await page.locator('#chat-form [type="submit"]').first().click();
  await page.locator('#panel-close').click().catch(() => undefined);
};
for (const [index, text] of ['stream check one', 'stream check two', 'stream check three', 'stream check four'].entries()) {
  await send(text);
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${out}/0${index + 1}-mid-slide.png`, clip: { x: 0, y: 420, width: 760, height: 480 } });
  await page.waitForTimeout(1_400);
}
await page.screenshot({ path: `${out}/05-settled.png`, clip: { x: 0, y: 420, width: 760, height: 480 } });
await page.evaluate(() => { window.__settledAt = performance.now(); });
await page.waitForTimeout(14_000);
await page.screenshot({ path: `${out}/06-quiet-faded.png`, clip: { x: 0, y: 420, width: 760, height: 480 } });
const { samples, settledAt } = await page.evaluate(() => { clearInterval(window.__streamTimer); return { samples: window.__streamSamples, settledAt: window.__settledAt }; });
await browser.close();

const mine = sample => sample.cards.filter(card => card.text.startsWith('stream check') && !card.leaving);
const checks = [];
const check = (name, ok, detail = '') => { checks.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` · ${detail}` : ''}`); };
check('never more than three cards in place', samples.every(sample => sample.cards.filter(card => !card.leaving).length <= 3));
const firstSeen = new Map();
for (const sample of samples) for (const card of mine(sample)) if (!firstSeen.has(card.text)) firstSeen.set(card.text, { sample, card });
const arrivals = [...firstSeen.values()];
check('each new message arrives at the bottom', arrivals.every(({ sample, card }) => card.top >= Math.max(...sample.cards.filter(c => !c.leaving).map(c => c.top))), arrivals.map(a => a.card.top).join(','));
// Over its first 300ms a new card must have been part-transparent (a single
// sample can land on the very frame it was created, before the slide applies).
const entrance = text => { const start = firstSeen.get(text).sample.at; return Math.min(...samples.filter(sample => sample.at - start <= 300).flatMap(sample => sample.cards.filter(card => card.text === text && !card.leaving).map(card => card.opacity))); };
check('it slides in (fades up from transparent)', [...firstSeen.keys()].every(text => entrance(text) < .95), [...firstSeen.keys()].map(text => entrance(text).toFixed(2)).join(','));
const leftAtTop = samples.some(sample => sample.cards.some(card => card.leaving && card.text === 'stream check one'));
check('the oldest of mine slides off the top when the fourth arrives', leftAtTop);
const settled = samples.filter(sample => sample.at <= settledAt).at(-1);
check('after the burst, the newest three sit in order, newest at the bottom', Boolean(settled) && mine(settled).map(c => c.text).join('|') === 'stream check two|stream check three|stream check four',
  settled ? mine(settled).map(c => `${c.text.split(' ').pop()}@${c.top}`).join(' ') : '');
const last = samples.at(-1);
// The top card rides up and fades; nothing passes over it on the way (2026-11-13).
const overlapping = samples.filter(sample => sample.cards.some(gone => gone.leaving && gone.opacity > .05
  && sample.cards.some(card => !card.leaving && card.top < gone.bottom - 1 && gone.top < card.bottom - 1)));
check('a leaving card is never covered by the one below', overlapping.length === 0, `${overlapping.length} overlapping samples`);
const risesOff = samples.flatMap(sample => sample.cards.filter(card => card.leaving && card.text === 'stream check one').map(card => card.top));
check('the leaving card rides up as it fades', risesOff.length > 0 && Math.min(...risesOff) < risesOff[0], risesOff.join(','));
check('a quiet stream fades away', last.cards.every(card => card.opacity < .05), last.cards.map(c => c.opacity.toFixed(2)).join(','));
check('no page errors', errors.length === 0, errors.join(' | '));
console.log(`${checks.filter(Boolean).length}/${checks.length}`);
process.exit(checks.every(Boolean) ? 0 : 1);
