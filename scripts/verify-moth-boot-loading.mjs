// Cold-start the actual entry pages while independently withholding the
// stylesheet, bootstrap, large game bundle, config, and first artwork batch.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium, webkit} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';

const base = process.argv[2] || 'http://127.0.0.1:5297/';
// Waiting for document.fonts.ready would itself wait for the stylesheet that
// this cold-paint test deliberately withholds. The loader uses system fonts.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const out = path.resolve(process.env.MOTH_BOOT_AUDIT_OUTPUT || '.qa/moth/opening-rollin-20261118/boot');
await fs.mkdir(out, {recursive: true});
const report = [];
const gate = () => { let open; const wait = new Promise(resolve => {open = resolve;}); return {wait, open}; };
for (const engine of ['chrome', 'webkit']) {
  const phone = engine === 'webkit';
  const browser = await (phone ? webkit : chromium).launch(phone ? {headless: true} : {
    headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox']
  });
  try {
    for (const audience of ['public', 'staff']) {
      const language = audience === 'staff' ? 'en' : 'zh-TW';
      const label = engine + '-' + audience;
      const context = await browser.newContext({viewport: phone ? {width: 390, height: 844} : {width: 1280, height: 800},
        isMobile: phone, hasTouch: phone});
      await stubScoreboard(context);
      const held = Object.fromEntries(['css', 'bootstrap', 'game', 'config', 'images'].map(name => [name, gate()]));
      await context.addInitScript(({audience, language}) => {
        localStorage.setItem('moth.' + audience + '_language_v1', language);
        window.__bootAudit = {progress: [], complete: 0, violations: []};
        document.addEventListener('moth:boot-progress', event => window.__bootAudit.progress.push(event.detail));
        document.addEventListener('moth:boot-complete', () => window.__bootAudit.complete++);
        document.addEventListener('securitypolicyviolation', event => window.__bootAudit.violations.push(event.effectiveDirective));
      }, {audience, language});
      await context.route('**/moth/**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('/styles.css')) await held.css.wait;
        else if (url.pathname.endsWith('/boot-loading.js')) await held.bootstrap.wait;
        else if (/\/(src|staff)\/game\.js$/.test(url.pathname)) await held.game.wait;
        else if (url.pathname.endsWith('/data/level1.json')) await held.config.wait;
        else if (/\.(png|webp)$/.test(url.pathname)) await held.images.wait;
        return route.continue();
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      const route = audience === 'staff' ? 'moth/staff/' : 'moth/';
      let navigationError;
      const navigation = page.goto(new URL(route + '?device=' + (phone ? 'phone' : 'desktop'), base).href,
        {waitUntil: 'domcontentloaded', timeout: 90000}).catch(error => { navigationError = error; });
      // The parser has already delivered the complete requested loading card
      // even though no game code, bootstrap, main CSS, config or art can run.
      await page.locator('#moth-boot-loading .moth-boot-title').waitFor({state: 'visible'});
      assert.equal(await page.locator('.moth-boot-title').textContent(), 'DR.BEAUTY');
      assert.equal(await page.locator('.moth-boot-frame').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(0, 0, 0)');
      assert.equal(await page.locator('.moth-boot-progress span').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(143, 232, 255)');
      await page.screenshot({path: path.join(out, label + '-first-paint.png')});
      console.log(label, 'static first paint');
      held.bootstrap.open();
      held.css.open();
      await page.waitForFunction(lang => document.querySelector('.moth-boot-hint')?.textContent.includes(lang === 'en' ? 'Downloading' : '首次載入'), language);
      await page.waitForFunction(() => document.getElementById('moth-game-styles')?.media === 'all');
      console.log(label, 'stylesheet ready');
      assert(await page.locator('#moth-boot-loading').isVisible());
      held.game.open();
      await page.waitForFunction(() => window.__bootAudit.progress.length > 0, undefined, {timeout: 30000});
      console.log(label, 'runtime progress with config withheld');
      assert(await page.locator('#moth-boot-loading').isVisible(), 'Loader remains while config is downloading');
      await page.screenshot({path: path.join(out, label + '-resource-progress.png')});
      held.images.open();
      held.config.open();
      await navigation;
      assert.ifError(navigationError);
      await page.locator('#moth-boot-loading').waitFor({state: 'detached', timeout: 90000});
      const state = await page.evaluate(() => ({...window.__bootAudit,
        css: document.getElementById('moth-game-styles').media,
        bootStyleRemoved: !document.getElementById('moth-boot-styles'),
        publicGlobalAbsent: !Object.hasOwn(window, 'bobbyGame')}));
      assert.equal(state.complete, 1);
      assert.equal(state.css, 'all');
      assert(state.bootStyleRemoved);
      assert.deepEqual(state.violations, []);
      assert.deepEqual(errors, []);
      if (audience === 'public') assert(state.publicGlobalAbsent);
      await page.screenshot({path: path.join(out, label + '-ready.png')});
      report.push({label, language, firstPaint: true, withheld: ['main CSS', 'bootstrap', 'game JS', 'config', 'artwork'],
        progressSamples: state.progress.length, complete: state.complete, cspViolations: state.violations, errors});
      console.log('PASS', label, 'first paint, live progress, ready handoff');
      await context.close();
    }
    const context = await browser.newContext({viewport: phone ? {width: 390, height: 844} : {width: 1280, height: 800}});
    await stubScoreboard(context);
    await context.route('**/moth/styles.css*', route => route.fulfill({status: 503, body: 'temporary loading failure'}));
    const page = await context.newPage();
    await page.goto(new URL('moth/?device=' + (phone ? 'phone' : 'desktop'), base).href, {waitUntil: 'domcontentloaded'});
    await page.locator('#moth-boot-loading[data-error] .moth-boot-reload').waitFor({state: 'visible'});
    assert(await page.locator('.moth-boot-frame').isVisible());
    const recovery = await page.evaluate(() => {
      const rect = document.querySelector('.moth-boot-reload').getBoundingClientRect();
      return {x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight,
        scrollWidth: document.documentElement.scrollWidth, viewport: {width: visualViewport.width, height: visualViewport.height, offsetTop: visualViewport.offsetTop}};
    });
    assert(recovery.x >= 0 && recovery.y >= 0 && recovery.right <= recovery.width && recovery.bottom <= recovery.height,
      'Refresh must remain inside the failed-CSS viewport: ' + JSON.stringify(recovery));
    await page.screenshot({path: path.join(out, engine + '-css-recovery.png')});
    report.push({label: engine + '-css-recovery', failedCssKeepsLoader: true, reloadAvailable: true, recovery});
    console.log('PASS', engine, 'failed stylesheet keeps a usable refresh card');
    await context.close();
  } finally { await browser.close(); }
}
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify({checkedAt: new Date().toISOString(), report}, null, 2) + '\n');
