// Walks the sign-in, submit and back flows on the local dev build (the owner,
// 2026-11-12: "把登錄、提交、返回這幾條流程全部走一遍"), desktop and phone, and
// saves a screenshot at each step. Stops before any payment: the offering
// sheet is opened, filled and closed, never sent to ECPay.
//   node art/ps1-restyle-20261109/walk-flows.mjs
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire('/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const out = 'art/ps1-restyle-20261109/flows';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
const check = (device, step, ok, detail = '') => { results.push({ device, step, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${device} · ${step}${detail ? ` · ${detail}` : ''}`); };
try {
  for (const device of [
    { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    { name: 'phone', viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  ]) {
    const context = await browser.newContext(device);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error).slice(0, 200)));
    const shot = name => page.screenshot({ path: `${out}/${device.name}-${name}.png` });
    await page.goto('http://localhost:4201/?era=ps2&island', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#gate-form', { timeout: 120_000 });
    await page.waitForTimeout(1_500);
    await shot('01-sign-in');

    // Submit with no name: the browser's own required check stops it.
    await page.fill('#festival-id', '');
    await page.locator('#gate-form button[type="submit"]').first().click();
    check(device.name, 'an empty name is stopped by the required check', await page.evaluate(() => document.querySelector('#festival-id').matches(':invalid') && Boolean(document.querySelector('.gate--live'))));
    // A reserved name: refused with the gate's own message, focus on the field.
    await page.fill('#festival-id', 'STAFF');
    await page.locator('#gate-form button[type="submit"]').first().click();
    check(device.name, 'a reserved name is refused with its message', await page.locator('#id-error').isVisible(), await page.locator('#id-error').textContent());
    await shot('02-name-error');

    // Donate from the sign-in page. ECPay is configured only on Render, so the
    // service's two donation replies are stood in for, in this browser only:
    // the sheet opens, takes an amount, a note and an email, hands over to a
    // stand-in checkout address (never ECPay), and back is the sheet's ×.
    const checkouts = [];
    await page.route('**/api/donation/options', route => route.fulfill({ json: { enabled: true, production: false, presets: [52, 520, 5920], min: 52, max: 100000, invoice: true, receiptOptional: true } }));
    await page.route('**/api/donation', route => { checkouts.push(route.request().postDataJSON()); return route.fulfill({ json: { id: 'flow-check', checkoutUrl: 'http://localhost:4201/flow-check-checkout' } }); });
    await page.route('**/flow-check-checkout', route => route.fulfill({ body: '<title>stand-in checkout</title>stand-in checkout', contentType: 'text/html' }));
    await page.locator('[data-gate-donate]').click();
    const sheet = page.locator('[data-offering-close]');
    await sheet.waitFor({ timeout: 10_000 }).catch(() => undefined);
    const sheetOpen = await sheet.isVisible().catch(() => false);
    check(device.name, 'Donate opens the offering sheet', sheetOpen);
    if (sheetOpen) {
      await page.locator('[data-offering-amount]').first().click();
      await page.fill('[data-offering-message]', 'flow check');
      await shot('03-offering-sheet');
      await sheet.click();
      check(device.name, 'the offering sheet closes (back)', !(await sheet.isVisible().catch(() => false)));
      // Again, and this time submitted.
      await page.locator('[data-gate-donate]').click();
      await sheet.waitFor({ timeout: 10_000 });
      await page.locator('[data-offering-amount]').first().click();
      const email = page.locator('[data-offering-email]');
      if (await email.isVisible().catch(() => false)) await email.fill('flow-check@example.com');
      const [popup] = await Promise.all([
        page.waitForEvent('popup', { timeout: 8_000 }).catch(() => undefined),
        page.locator('[data-offering-go]').click(),
      ]);
      await page.waitForTimeout(1_500);
      const landed = popup ? popup.url() : page.url();
      check(device.name, 'Donate submits and hands over to checkout', checkouts.length === 1 && /flow-check-checkout/.test(landed), `${JSON.stringify(checkouts[0] ?? {})} → ${landed}`);
      await popup?.close();
      if (/flow-check-checkout/.test(page.url())) { await page.goBack(); await page.waitForSelector('#gate-form'); }
      check(device.name, 'back from checkout returns to the sign-in page', await page.locator('#gate-form').isVisible());
    }
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    // Enter before everything is downloaded: held, then goes in by itself.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#gate-form');
    await page.fill('#festival-id', `Flow${device.name}`);
    const pressedAt = Date.now();
    await page.locator('#gate-form button[data-audio="sound"]').click();
    const held = await page.evaluate(() => ({ notice: document.querySelector('#gate-waiting')?.textContent ?? '', disabled: [...document.querySelectorAll('#gate-form button[type="submit"]')].every(b => b.disabled) }));
    check(device.name, 'an early ENTER is held while downloads finish', held.disabled, held.notice);
    await shot('04-enter-held');
    await page.waitForFunction(() => !document.querySelector('.gate--live') && document.querySelector('.objective-count'), undefined, { timeout: 300_000 });
    check(device.name, 'it goes in by itself once everything is in', true, `${((Date.now() - pressedAt) / 1000).toFixed(1)} s after the press`);
    await page.waitForTimeout(4_000);
    await shot('05-inside');
    // The interface as before (the owner, 2026-11-13), with the chat fading,
    // and on phones the stick running at its edge and the keys in an arc.
    const hud = await page.evaluate(() => {
      const shown = selector => { const node = document.querySelector(selector); return Boolean(node) && getComputedStyle(node).display !== 'none' && node.getBoundingClientRect().width > 0; };
      const keys = [...document.querySelectorAll('.touch-ring > button, .world-chat-shortcut')].filter(node => getComputedStyle(node).display !== 'none' && node.getBoundingClientRect().width > 0)
        .map(node => ({ name: node.textContent.trim(), box: node.getBoundingClientRect() }));
      const overlaps = [];
      for (let a = 0; a < keys.length; a++) for (let b = a + 1; b < keys.length; b++) {
        const p = keys[a].box, q = keys[b].box;
        if (p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom) overlaps.push(`${keys[a].name}/${keys[b].name}`);
      }
      return {
        keyHints: shown('.controls-hint'), cameraChip: shown('.mobile-view-cycle'), statusChips: Boolean(document.querySelector('#inventory-status span')),
        onlineChip: shown('#connection-status'), runKey: shown('[data-touch-act="run"]'), stickCaption: Boolean(document.querySelector('.touch-stick__caption')),
        chatFades: getComputedStyle(document.querySelector('.chat-stream__item') ?? document.body).animationName,
        keys: keys.map(k => k.name), overlaps,
      };
    });
    const phone = device.name === 'phone';
    check(device.name, 'HUD as before: key hints (desktop), 鏡頭 chip, status chips and the online chip',
      hud.keyHints === !phone && hud.cameraChip && hud.statusChips && hud.onlineChip, JSON.stringify({ keyHints: hud.keyHints, cameraChip: hud.cameraChip, statusChips: hud.statusChips, onlineChip: hud.onlineChip }));
    check(device.name, 'chat messages fade', hud.chatFades === 'chat-stream-fade', hud.chatFades);
    if (phone) {
      check(device.name, 'phone: no 跑 key or stick caption, and no two keys overlap', !hud.runKey && !hud.stickCaption && hud.overlaps.length === 0, `${hud.keys.join(' ')} ${hud.overlaps.join(', ')}`);
      await page.setViewportSize({ width: 874, height: 402 });
      await page.waitForTimeout(600);
      const landscape = await page.evaluate(() => {
        const keys = [...document.querySelectorAll('.touch-ring > button, .world-chat-shortcut')].filter(node => getComputedStyle(node).display !== 'none' && node.getBoundingClientRect().width > 0).map(node => node.getBoundingClientRect());
        let overlaps = 0;
        for (let a = 0; a < keys.length; a++) for (let b = a + 1; b < keys.length; b++) { const p = keys[a], q = keys[b]; if (p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom) overlaps++; }
        return { keys: keys.length, overlaps };
      });
      await shot('05b-inside-landscape');
      check(device.name, 'phone on its side: no two keys overlap', landscape.overlaps === 0, JSON.stringify(landscape));
      await page.setViewportSize(device.viewport);
      await page.waitForTimeout(600);
    }

    // 通行證 → 操作, then back out with × and the menu.
    await page.locator('#pass-toggle').click();
    await page.waitForTimeout(400);
    await shot('06-pass-menu');
    await page.locator('#festival-pass [data-panel="controls"]').click();
    await page.waitForTimeout(400);
    check(device.name, '操作 page opens from 通行證', await page.locator('#panel').isVisible());
    await shot('07-controls-page');
    await page.locator('#panel-close').click();
    await page.waitForTimeout(300);
    check(device.name, 'its × closes it (back)', !(await page.locator('#panel').isVisible()));

    // Chat: open, send, see it, close.
    const chatOpener = page.locator('[data-world-chat]');
    if (await chatOpener.isVisible().catch(() => false)) await chatOpener.click();
    else { await page.locator('#pass-toggle').click(); await page.locator('#festival-pass [data-panel="chat"]').click(); }
    await page.waitForSelector('#chat-message', { timeout: 10_000 });
    await page.fill('#chat-message', 'hello from the flow check');
    await page.locator('#chat-form button[type="submit"], #chat-form [type="submit"]').first().click();
    await page.waitForTimeout(800);
    const sent = await page.evaluate(() => document.body.textContent.includes('hello from the flow check'));
    check(device.name, 'a chat message is sent and shown', sent);
    await shot('08-chat-sent');
    await page.locator('#panel-close').click().catch(() => undefined);
    await page.waitForTimeout(300);
    check(device.name, 'chat closes (back)', !(await page.locator('#panel').isVisible()));
    await shot('09-back-in-world');
    check(device.name, 'no page errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
}
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
process.exit(failed.length ? 1 : 0);
