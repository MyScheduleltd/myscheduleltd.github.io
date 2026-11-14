// Headless browser tests for browser-exposed USB/Bluetooth controllers. These
// inject fresh Gamepad-shaped snapshots; they do not assert physical hardware
// compatibility or the browser/OS's controller pairing behavior.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, webkit } from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { stubScoreboard } from './moth-scoreboard-stub.mjs';
const base = process.argv[2] || 'http://127.0.0.1:5286/';
const out = '.qa/moth/controllers';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
let checks = 0;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await stubScoreboard(context);
  await context.route('https://cdn.jsdelivr.net/**', route => route.abort());
  await context.addInitScript(() => {
    window.__pads = [];
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => window.__pads.map(p => p && ({ ...p, buttons: p.buttons.map(b => ({ ...b })), axes: [...p.axes] })) });
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(new URL('moth/staff/', base).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, { timeout: 60000 });
  assert.equal(await page.evaluate(() => typeof bobbyGame.pollGamepadInput), 'function');
  const makePad = (id = 'Xbox Wireless Controller', mapping = 'standard', index = 0, count = 17) => ({ id, mapping, index, connected: true, buttons: Array.from({ length: count }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0], timestamp: 0 });
  await page.evaluate(pad => { window.__pads = [pad]; bobbyGame.pollGamepadInput(); bobbyGame.pollGamepadInput(); }, makePad());
  const neutral = async (index = 0) => page.evaluate(index => {
    const pad = window.__pads[index]; if (pad) { pad.buttons.forEach(b => { b.pressed = false; b.value = 0; }); pad.axes.fill(0); }
    bobbyGame.pollGamepadInput(); bobbyGame.pollGamepadInput();
  }, index);
  const button = async (n, down = true, index = 0) => page.evaluate(({ n, down, index }) => {
    const pad = window.__pads[index]; pad.buttons[n] = { pressed: down, value: down ? 1 : 0 }; bobbyGame.pollGamepadInput();
  }, { n, down, index });
  const axis = async (n, value, index = 0) => page.evaluate(({ n, value, index }) => { window.__pads[index].axes[n] = value; bobbyGame.pollGamepadInput(); }, { n, value, index });
  await page.evaluate(() => { bobbyGame.resetHomeMenu('root'); bobbyGame.pollGamepadInput(); bobbyGame.pollGamepadInput(); });
  await button(13);
  assert.equal(await page.evaluate(() => bobbyGame.homeMenu.index), 1, 'd-pad navigates title');
  await page.evaluate(() => { for (let i = 0; i < 15; i++) bobbyGame.pollGamepadInput(); });
  assert.equal(await page.evaluate(() => bobbyGame.homeMenu.index), 1, 'held button does not create repeated edges'); checks++;
  await neutral(); await axis(1, 0.3);
  assert.equal(await page.evaluate(() => bobbyGame.homeMenu.index), 1, 'stick drift rejected');
  await axis(1, 0.8);
  assert.equal(await page.evaluate(() => bobbyGame.homeMenu.index), 2, 'standard stick navigation');
  await axis(1, 0.5);
  assert.equal(await page.evaluate(() => bobbyGame.controllerInput.down.has('KeyS')), true, 'axis hysteresis holds input');
  await axis(1, 0.3);
  assert.equal(await page.evaluate(() => bobbyGame.controllerInput.down.has('KeyS')), false, 'axis releases below hysteresis threshold'); checks++;
  await neutral();
  await page.evaluate(() => { bobbyGame.resetHomeMenu('settings'); bobbyGame.pollGamepadInput(); bobbyGame.pollGamepadInput(); });
  const controllerIndex = await page.evaluate(() => bobbyGame.getHomeMenuItems().findIndex(i => i.id === 'controller'));
  await page.evaluate(i => { bobbyGame.homeMenu.index = i; }, controllerIndex);
  await button(1);
  await page.locator('.moth-controller-panel').waitFor();
  assert.match(await page.locator('.moth-controller-status').innerText(), /Xbox Wireless Controller/); checks++;
  await neutral();
  await page.locator('#moth-bind-M').click(); await neutral(); await button(6);
  assert.deepEqual(await page.evaluate(() => bobbyGame.controllerBindings(window.__pads[0]).M), ['b:6'], 'custom button captured');
  assert.equal(await page.evaluate(() => bobbyGame.homeMenu.view), 'settings', 'capture does not enter gameplay'); checks++;
  await neutral();
  await page.locator('#moth-bind-M').click(); await neutral(); await button(1);
  assert.match(await page.locator('.moth-controller-message').innerText(), /Swapped with|已交換/);
  assert.deepEqual(await page.evaluate(() => bobbyGame.controllerBindings(window.__pads[0]).M), ['b:1'], 'occupied input swaps to selected action');
  assert.deepEqual(await page.evaluate(() => bobbyGame.controllerBindings(window.__pads[0]).O), ['b:6'], 'swap gives previous input to other action, preserving uniqueness');
  await neutral();
  await page.locator('#moth-bind-O').click(); await neutral(); await button(1); await neutral();
  assert.deepEqual(await page.evaluate(() => bobbyGame.controllerBindings(window.__pads[0]).O), ['b:1'], 'swaps can restore face-button order'); checks++;
  await page.locator('#moth-bind-M').click(); await neutral(); await axis(2, -0.9);
  assert.deepEqual(await page.evaluate(() => bobbyGame.controllerBindings(window.__pads[0]).M), ['a:2:-1'], 'custom stick direction captured'); checks++;
  await neutral();
  await page.screenshot({ path: out + '/settings-zh-desktop.png', fullPage: true });
  await page.locator('[data-controller-tool="close"]').click();
  await page.evaluate(() => { bobbyGame.setLanguage('en'); bobbyGame.openControllerSettings(); });
  await page.screenshot({ path: out + '/settings-en-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: out + '/settings-en-phone.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'phone panel does not overflow horizontally');
  await page.locator('[data-controller-tool="close"]').click();
  await page.setViewportSize({ width: 1280, height: 900 });
  // Isolate input routing from song loading: handlers below record the exact
  // press/release stream delivered by the existing gameplay keyboard listener.
  await page.evaluate(() => {
    const g = bobbyGame;
    g.update = () => g.pollGamepadInput(); g.render = g.renderTallScreen = g.updateMobileControls = g.updateDebugPanel = () => {};
    g.state = 'playing'; g.level1OfficeRhythm = { tutorial: { mode: 'done' }, skipAudio: true };
    g.getLevel1OfficeActionForKey = code => ['KeyM','KeyO','KeyT','KeyH'].includes(code);
    window.__events = [];
    g.handleLevel1OfficeRhythmPress = code => window.__events.push(['down', code]);
    g.handleLevel1OfficeRhythmRelease = code => window.__events.push(['up', code]);
    g.pauseLevel1Office = () => { g.state = 'level1OfficePaused'; g.releaseHeldInputs(); return true; };
    g.resumeLevel1Office = () => { g.state = 'playing'; g.releaseHeldInputs(); return true; };
    g.pollGamepadInput(); g.pollGamepadInput();
  });
  await neutral(); await axis(2, -0.9); await page.evaluate(() => { for (let i=0;i<10;i++) bobbyGame.pollGamepadInput(); }); await neutral();
  assert.deepEqual(await page.evaluate(() => window.__events), [['down','KeyM'],['up','KeyM']], 'held custom input delivers exactly one press and release'); checks++;
  await page.evaluate(() => { window.__events = []; });
  await page.keyboard.down('m'); await axis(2, -0.9); await page.keyboard.up('m');
  assert.equal(await page.evaluate(() => window.__events.filter(e => e[0] === 'down').length), 1, 'two input sources do not duplicate a held press');
  assert.equal(await page.evaluate(() => window.__events.filter(e => e[0] === 'up').length), 0, 'keyboard release preserves controller hold');
  await neutral();
  assert.equal(await page.evaluate(() => window.__events.filter(e => e[0] === 'up').length), 1, 'last input source releases hold'); checks++;
  await page.evaluate(() => { window.__events = []; });
  await axis(2, -0.9); await page.keyboard.down('m'); await neutral();
  assert.equal(await page.evaluate(() => window.__events.filter(e => e[0] === 'up').length), 0, 'controller release preserves keyboard hold');
  await page.keyboard.up('m'); checks++;
  await axis(2, -0.9);
  await page.evaluate(() => { window.__pads = []; bobbyGame.pollGamepadInput(); });
  assert.equal(await page.evaluate(() => bobbyGame.state), 'level1OfficePaused', 'disconnect pauses fight');
  assert.equal(await page.evaluate(() => bobbyGame.controllerInput.down.size), 0, 'disconnect releases held controller inputs'); checks++;
  const reconnect = makePad(); reconnect.axes[2] = -0.9;
  await page.evaluate(pad => { window.__pads = [pad]; bobbyGame.state = 'playing'; window.__events = []; bobbyGame.pollGamepadInput(); bobbyGame.pollGamepadInput(); }, reconnect);
  assert.deepEqual(await page.evaluate(() => window.__events), [], 'held input on reconnect cannot hit a note');
  await neutral(); await axis(2, -0.9); await neutral();
  assert.deepEqual(await page.evaluate(() => window.__events), [['down','KeyM'],['up','KeyM']], 'profile survives reconnect'); checks++;
  const generic = makePad('USB Arcade Stick (Vendor: 1234 Product: 5678)', '', 1, 12);
  await page.evaluate(pad => { window.__pads.push(pad); bobbyGame.pollGamepadInput(); }, generic);
  await button(0, true, 1);
  assert.equal(await page.evaluate(() => bobbyGame.controllerInput.index), 1, 'active controller selected by new input');
  assert.deepEqual(await page.evaluate(() => bobbyGame.controllerBindings(window.__pads[1]).M), ['b:3'], 'different model gets independent profile');
  assert.match(await page.evaluate(() => bobbyGame.controllerBindingLabel(window.__pads[1], ['b:3'])), /BUTTON 4/);
  await neutral(1); checks++;
  await page.evaluate(() => { bobbyGame.state = 'title'; bobbyGame.resetHomeMenu('settings'); bobbyGame.openControllerSettings(); });
  await page.locator('#moth-bind-M').click(); await neutral(1); await button(6, true, 1); await neutral(1);
  assert.deepEqual(await page.evaluate(() => bobbyGame.controllerBindings(window.__pads[1]).M), ['b:6']);
  await page.locator('[data-controller-tool="reset"]').click();
  assert.deepEqual(await page.evaluate(() => bobbyGame.controllerBindings(window.__pads[1]).M), ['b:3'], 'reset affects selected model only');
  assert.deepEqual(await page.evaluate(() => bobbyGame.controllerBindings(window.__pads[0]).M), ['a:2:-1'], 'other model profile preserved'); checks++;
  await page.locator('[data-controller-tool="close"]').click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, { timeout: 60000 });
  await page.evaluate(pad => { window.__pads = [pad]; bobbyGame.pollGamepadInput(); }, makePad());
  assert.deepEqual(await page.evaluate(() => bobbyGame.controllerBindings(window.__pads[0]).M), ['a:2:-1'], 'profile persists across page reload'); checks++;
  const profile = await page.evaluate(() => {
    const g = bobbyGame, pad = window.__pads[0];
    const saved = g.controllerInput.profiles[g.controllerProfileKey(pad)];
    Object.assign(saved, { pocket: ['b:8'], mount: ['b:4'], T: ['b:8'] });
    const bindings = g.controllerBindings(pad);
    return { remapped: bindings.M, reused: bindings.T, retired: Object.keys(bindings).filter(key => ['pocket', 'mount'].includes(key)) };
  });
  assert.deepEqual(profile, {remapped: ['a:2:-1'], reused: ['b:8'], retired: []}, 'Older profiles keep active remaps, including a formerly reserved input');
  await page.evaluate(() => {
    const g = bobbyGame;
    const saved = g.controllerInput.profiles[g.controllerProfileKey(window.__pads[0])];
    delete saved.T;
  });
  checks++;
  // Keep the song clock deterministic while retaining the actual input,
  // judgment, score and hold methods. Controller edges must score real notes,
  // not merely reach a mocked keyboard handler.
  await page.evaluate(() => {
    const g = bobbyGame;
    g.update = () => g.pollGamepadInput();
    g.render = g.renderTallScreen = g.updateMobileControls = g.updateDebugPanel = () => {};
    g.releaseHeldInputs();
    g.level1OfficeRhythm = g.createLevel1OfficeRhythmState('office');
    const r = g.level1OfficeRhythm;
    r.skipAudio = true; r.audioStartPending = false; r.tutorial.mode = 'done';
    r.notes = [
      {id: 'controller-tap', time: 10, button: 'T', key: 'T', action: 'do', task: 'stamp', status: 'pending'},
      {id: 'controller-hold', time: 11, holdEnd: 12, button: 'O', key: 'O', action: 'accent', task: 'stamp', status: 'pending'},
      {id: 'controller-disconnect', time: 14, holdEnd: 15, button: 'H', key: 'H', action: 'accent', task: 'stamp', status: 'pending'},
      {id: 'controller-axis', time: 17, button: 'M', key: 'M', action: 'do', task: 'stamp', status: 'pending'}
    ];
    g.score = 0; g.songTime = 10; g.stageCountdown = 0; g.state = 'playing';
    g.pollGamepadInput(); g.pollGamepadInput();
  });
  await neutral(); await button(0);
  assert.deepEqual(await page.evaluate(() => ({status: bobbyGame.level1OfficeRhythm.notes[0].status, score: bobbyGame.level1OfficeRhythm.roundScore, combo: bobbyGame.level1OfficeRhythm.combo})),
    {status: 'perfect', score: 1000, combo: 1}, 'controller tap earns a real perfect judgment and score');
  await page.evaluate(() => { bobbyGame.songTime = 11; bobbyGame.pollGamepadInput(); });
  assert.equal(await page.evaluate(() => bobbyGame.level1OfficeRhythm.notes[1].status), 'pending', 'held tap cannot press the next note');
  await neutral(); await button(1);
  assert.equal(await page.evaluate(() => bobbyGame.level1OfficeRhythm.notes[1].holding), true, 'controller starts an actual hold');
  await page.evaluate(() => { bobbyGame.songTime = 12; }); await neutral();
  assert.deepEqual(await page.evaluate(() => ({done: bobbyGame.level1OfficeRhythm.notes[1].holdDone, score: bobbyGame.level1OfficeRhythm.roundScore, combo: bobbyGame.level1OfficeRhythm.combo, misses: bobbyGame.level1OfficeRhythm.misses})),
    {done: true, score: 3000, combo: 3, misses: 0}, 'controller release at the tail completes the hold and awards its score'); checks++;
  await page.evaluate(() => { bobbyGame.songTime = 14; }); await button(2);
  await page.evaluate(() => { bobbyGame.songTime = 14.25; window.__pads = []; bobbyGame.pollGamepadInput(); });
  assert.deepEqual(await page.evaluate(() => ({state: bobbyGame.state, misses: bobbyGame.level1OfficeRhythm.misses, broken: Boolean(bobbyGame.level1OfficeRhythm.notes[2].holdBroken)})),
    {state: 'level1OfficePaused', misses: 0, broken: false}, 'disconnect pauses before releasing a real hold, without charging a miss'); checks++;
  await page.evaluate(pad => {
    window.__pads = [pad]; const g = bobbyGame;
    g.state = 'playing'; g.songTime = 17;
    // The paused hold is irrelevant to the next independent input check.
    g.level1OfficeRhythm.holds = {}; g.level1OfficeRhythm.notes[2].holding = false;
    g.pollGamepadInput(); g.pollGamepadInput();
  }, makePad());
  await neutral(); await axis(2, -0.9); await neutral();
  assert.deepEqual(await page.evaluate(() => ({status: bobbyGame.level1OfficeRhythm.notes[3].status, score: bobbyGame.level1OfficeRhythm.roundScore, misses: bobbyGame.level1OfficeRhythm.misses})),
    {status: 'perfect', score: 5000, misses: 0}, 'custom axis binding judges the actual M note after reconnect'); checks++;
  await page.evaluate(() => { bobbyGame.state = 'title'; bobbyGame.level1OfficeRhythm = null; bobbyGame.resetHomeMenu('settings'); });
  await page.evaluate(() => { Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => { throw new DOMException('Blocked', 'SecurityError'); } }); bobbyGame.openControllerSettings(); bobbyGame.pollGamepadInput(); });
  assert.match(await page.locator('.moth-controller-status').innerText(), /No controller/);
  assert.deepEqual(errors, [], 'no browser exceptions'); checks++;
  await context.close();
  console.log('PASS M.O.T.H controllers: ' + checks + ' checks; simulated standard/generic gamepads, bindings, holds, disconnect, persistence, desktop/phone UI. Physical controller validation remains required.');
} finally { await browser.close(); }

// The modal handles narrow mobile displays with the footer after its rows.
const phoneBrowser = await webkit.launch({headless:true});
try {
  const context = await phoneBrowser.newContext({viewport:{width:320,height:568}, isMobile:true, hasTouch:true});
  await stubScoreboard(context);
  await context.addInitScript(() => Object.defineProperty(navigator, 'getGamepads', {configurable:true, value:() => []}));
  const page = await context.newPage();
  await page.goto(new URL('moth/staff/?device=phone', base).href, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout:60000});
  for (const language of ['zh-TW', 'en']) {
    await page.evaluate(language => {
      bobbyGame.setLanguage(language, {persist:false, announce:false});
      bobbyGame.openControllerSettings();
    }, language);
    const modal = page.getByRole('dialog', {name: language === 'en' ? 'CONTROLLER SETTINGS' : '控制器設定'});
    assert(await modal.getByText(language === 'en' ? 'Select an action, then press a button or move the stick.'
      : '選擇功能，再按新按鍵或推動搖桿。', {exact: true}).isVisible());
    const actions = modal.locator('[data-controller-action]');
    assert.deepEqual(await actions.evaluateAll(nodes => nodes.map(node => node.dataset.controllerAction)),
      ['M', 'O', 'T', 'H', 'up', 'down', 'left', 'right', 'space', 'pause']);
    const labels = await modal.locator('.moth-controller-row label').allTextContents();
    assert.deepEqual(labels.slice(0, 4), language === 'en'
      ? ['M / CYMBALS', 'O / SNARE / CONFIRM / INTERACT', 'T / KICK DRUM', 'H / OTHER PERCUSSION / BACK']
      : ['M／鈸', 'O／小鼓／確認／互動', 'T／大鼓', 'H／其他打擊樂／返回']);
    const layout = () => modal.evaluate(panel => {
      const scroll = panel.querySelector('.moth-controller-scroll');
      const footer = panel.querySelector('.moth-controller-tools');
      const lastRow = panel.querySelector('#moth-bind-pause').closest('.moth-controller-row');
      return {top: scroll.scrollTop, width: scroll.scrollWidth, available: scroll.clientWidth,
        footerTop: footer.getBoundingClientRect().top, footerBottom: footer.getBoundingClientRect().bottom,
        lastRowBottom: lastRow.getBoundingClientRect().bottom, bottom: scroll.getBoundingClientRect().bottom};
    });
    const opening = await layout();
    assert.equal(opening.top, 0, 'Open at the top of the menu');
    assert.equal(opening.width, opening.available, 'No horizontal scrolling');
    assert(opening.footerTop >= opening.bottom, 'Footer starts below the visible rows on a small screen');
    const back = modal.locator('[data-controller-tool=close]');
    await back.scrollIntoViewIfNeeded();
    const scrolled = await layout();
    assert(scrolled.top > 0 && scrolled.lastRowBottom <= scrolled.footerTop, 'Footer follows the final mapping while scrolling');
    assert(scrolled.footerBottom <= scrolled.bottom, 'All footer controls fit after scrolling');
    await page.screenshot({path: out + '/settings-' + language + '-webkit-footer.png'});
    await back.tap();
    await modal.waitFor({state:'detached'});
  }
  await context.close();
  console.log('PASS WebKit phone controller menu: bilingual mapping labels, scroll flow, footer and Back');
} finally { await phoneBrowser.close(); }
