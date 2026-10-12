import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';
const base = process.argv[2] || 'http://127.0.0.1:5286/';
const out = path.resolve(process.argv[3] || '.qa/moth/browser');
await fs.mkdir(out, { recursive: true });
const report = [];
for (const [name, type] of [['chrome', chromium], ['webkit', webkit]]) {
  const browser = await type.launch(name === 'chrome' ? {executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, args:['--no-sandbox']} : {headless:true});
  try {
    const context = await browser.newContext();
    await stubScoreboard(context);
    await context.addInitScript(() => {
      window.__qaDraws = [];
      window.__qaViolations = [];
      const original = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
        if (window.__qaDraws.length > 3000) window.__qaDraws.splice(0,1000);
        window.__qaDraws.push(String(text));
        return original.call(this, text, ...args);
      };
      document.addEventListener('securitypolicyviolation', e => window.__qaViolations.push({directive:e.effectiveDirective, blocked:e.blockedURI}));
    });
    const page = await context.newPage();
    const errors = [], failed = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('response', response => {if (response.status() >= 400 && new URL(response.url()).origin === new URL(base).origin) failed.push({url:response.url(), status:response.status()});});
    for (const [view, width, height, device] of [['desktop',1440,1000,'desktop'], ['portrait',390,844,'phone'], ['small-phone',320,568,'phone'], ['landscape',844,390,'phone']]) {
      await page.setViewportSize({width, height});
      const url = new URL('moth/', base);
      url.search = `device=${device}&debug=1&debugPanel=1&autostart=1&debugLevel6Boss=1&debugTextAudit=1`;
      await page.goto(url.href, {waitUntil:'domcontentloaded'});
      await page.waitForFunction(() => window.__qaDraws.some(text => /STORY MODE|故事模式/.test(text)), undefined, {timeout:180000});
      assert.equal(await page.locator('.debug-panel,.debug-panel-toggle').count(), 0);
      assert.equal(await page.evaluate(() => typeof window.bobbyGame), 'undefined');
      assert.equal(await page.evaluate(() => typeof window.BobbyGame), 'undefined');
      assert.equal(await page.evaluate(() => !!window.__bobbyTextAuditEnabled), false);
      await page.keyboard.press('KeyP');
      assert.equal(await page.locator('.debug-panel,.debug-panel-toggle').count(), 0);
      assert(!await page.evaluate(() => window.__qaDraws.some(text => text.includes('BOOT ERROR'))));
      await page.screenshot({path:path.join(out, `${name}-public-${view}.png`)});
      // Exercise the ordinary public story entry, without exposing a game test hook.
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.__qaDraws.slice(-300).some(t => /a little background|前情提要/.test(t)), undefined, {timeout:60000});
      await page.screenshot({path:path.join(out, `${name}-story-${view}.png`)});
      report.push({engine:name, audience:'public', view, queryAndKeyboardDebugBlocked:true, storyEntry:true, violations:await page.evaluate(() => window.__qaViolations)});
    }
    await page.goto(new URL('moth/staff/?device=desktop', base).href, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout:180000});
    assert.equal(await page.evaluate(() => Boolean(window.bobbyGame.loadError)), false);
    assert(await page.locator('.debug-panel-toggle').isVisible());
    await page.keyboard.press('KeyP');
    assert(await page.locator('.debug-panel').isVisible());
    await page.locator('[data-debug-action="unlockSecrets"]').click();
    assert(await page.evaluate(() => window.bobbyGame.isStageUnlocked('secret-xiaosi')));
    await page.locator('[data-debug-fight="level1-stage1"]').click();
    await page.waitForFunction(() => window.bobbyGame?.state === 'playing', undefined, {timeout:60000});
    await page.screenshot({path:path.join(out, `${name}-staff.png`)});
    const keys = await page.evaluate(() => Object.keys(sessionStorage).filter(key => /progress/.test(key)));
    assert(keys.some(key => key.startsWith('moth.staff')));
    report.push({engine:name, audience:'staff', debugWorks:true, isolatedStorage:true, violations:await page.evaluate(() => window.__qaViolations)});
    await page.goto(new URL('moth/', base).href, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => window.__qaDraws.some(text => /STORY MODE|故事模式/.test(text)), undefined, {timeout:180000});
    assert.equal(await page.locator('.debug-panel').count(),0);
    // Verify inline script injection is refused by the page policy.
    assert.equal(await page.evaluate(() => {const script = document.createElement('script'); script.textContent='window.__injected=true'; document.head.append(script); return !!window.__injected;}), false);
    assert((await page.evaluate(() => window.__qaViolations)).some(v => v.directive === 'script-src-elem' || v.directive === 'script-src'));
    assert.deepEqual(errors,[]);
    assert.deepEqual(failed,[]);
    await context.close();
    if (name === 'chrome') {
      const menuContext = await browser.newContext({viewport:{width:390,height:844}});
      await stubScoreboard(menuContext);
      await menuContext.addInitScript(() => {
        window.__menuViolations = [];
        document.addEventListener('securitypolicyviolation', event => window.__menuViolations.push(event.effectiveDirective));
      });
      const menuPage = await menuContext.newPage();
      const menuErrors = [];
      menuPage.on('pageerror', error => menuErrors.push(String(error)));
      for (const file of ['index.html','about.html','portfolio.html','drBeauty.html','contact.html']) {
        await menuPage.goto(new URL(file,base).href, {waitUntil:'domcontentloaded'});
        await menuPage.waitForFunction(() => Boolean(window.$?._data(document.querySelector('#toggle'), 'events')?.click));
        assert.equal(await menuPage.locator('.menu .moth-link').count(),1);
        assert.equal(await menuPage.locator('.menu .beta-link + .moth-link').count(),1);
        assert.equal(await menuPage.locator('a[href*="moth/staff"]').count(),0);
        assert.deepEqual(await menuPage.evaluate(() => window.__menuViolations), []);
        await menuPage.setViewportSize({width:390,height:844});
        await menuPage.locator('#toggle').click();
        assert(await menuPage.locator('.moth-link').isVisible());
        const rect = await menuPage.locator('.moth-link').boundingBox();
        assert(rect.y + rect.height <= 844, 'M.O.T.H stays inside mobile menu');
        await menuPage.screenshot({path:path.join(out, `menu-${file}.png`)});
        report.push({page:file, mobileMenu:true, belowBeta:true, staffUnlisted:true});
      }
      assert.deepEqual(menuErrors, []);
      await menuContext.close();
    }
  } finally {await browser.close();}
}
assert(report.filter(item=>item.violations).every(item=>item.violations.length === 0), 'No unexpected policy violations during play');
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(`PASS ${report.length} M.O.T.H browser/layout/menu cases, public debug blocking, staff access, storage separation, and CSP injection refusal.`);
