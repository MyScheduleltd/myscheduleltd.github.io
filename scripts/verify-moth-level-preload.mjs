// Required resources must finish behind LOADING, on fresh desktop/mobile
// browser profiles. Local files and a stub scoreboard only; no production
// tickets, scores, CDN traffic or physical-device performance claims.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium, webkit} from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {stubScoreboard} from './moth-scoreboard-stub.mjs';

const root = path.resolve(import.meta.dirname, '..');
const base = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://127.0.0.1:5286/';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'This suite uses only an isolated local build');
const out = path.join(root, '.qa/moth/cleanup-20261106/preload');
await fs.mkdir(out, {recursive: true});
const config = JSON.parse(await fs.readFile(path.join(root, 'docs/moth/data/level1.json'), 'utf8'));
const fights = [
  ['level1-stage1', config.level1OfficeRhythm], ['level2-stage2', config.level2BathroomRhythm],
  ['level3-stage2', config.level3MassageRhythm], ['level4-stage1', config.level4ArcadeRhythm],
  ['studio-stage1', config.level5StudioRhythm], ['level5-stage2', config.level5RiverRhythm],
  ['level6-stage2', config.level6ConcertRhythm], ...config.secretLevels.map(level => [level.id, level.rhythm])
];
const narratives = [
  ['level3-stage1', 'level3'], ['level4-stage1', 'level4'], ['studio-stage1', 'studioPreDialogue'],
  ['level5-stage1', 'level5Dialogue'], ['level6-stage1', 'level6Dream'], ['finale-stage1', 'level6WakeUp']
];
const sceneImage = {
  'level1-stage1': config.sprites.level1OfficeForeground.source,
  'level2-stage2': config.sprites.level2BathroomBackground.source,
  'level3-stage2': config.sprites.level3MassageSofa.source,
  'level4-stage1': config.sprites.level4ArcadeRoom.source,
  'studio-stage1': config.sprites.level5StudioBg.source,
  'level5-stage2': config.sprites.level5RiverBg.source,
  'level6-stage2': config.sprites.level6ConcertBg.source,
  ...Object.fromEntries(config.secretLevels.map(level => [level.id, level.background.source]))
};
const engineOption = process.argv.find(arg => arg.startsWith('--engine='))?.slice(9);
const section = process.argv.includes('--interfaces-only') ? 'interfaces' : process.argv.find(arg => arg.startsWith('--section='))?.slice(10);
const smoke = process.argv.includes('--smoke');
assert(!engineOption || ['chrome', 'webkit'].includes(engineOption), 'Choose chrome or webkit');
assert(!section || ['fights', 'narratives', 'failures', 'lifecycle', 'interfaces'].includes(section), 'Unknown preload test section');
const reportPath = path.join(out, section ? `report-${section}${engineOption ? '-' + engineOption : ''}${smoke ? '-smoke' : ''}.json` : 'report.json');
const css = await fs.readFile(path.join(root, 'docs/moth/styles.css'), 'utf8');
const cssKeys = [...new Set([...css.matchAll(/var\((--moth-art-\d+)\)/g)].map(match => match[1]))];
const report = {scope: 'Local browser gate checks; physical hardware and real-network speed are separate',
  chartVersion: config.rhythmChartVersion, startedAt: new Date().toISOString(), cases: []};
const assetUrl = url => /\/moth\/(?:assets|songs)\//.test(url) && /\.(?:webp|png|jpe?g|wav|m4a|mp3|ogg)(?:\?|$)/.test(url);
const sourceFor = spec => spec.fullSong ? spec.audioSrc : spec.fightCut?.src || spec.audioSrc || config.audioSrc;
const deferred = () => {let resolve; const ready = new Promise(done => {resolve = done;}); return {ready, resolve};};
async function bounded(promise, label) {
  let timer;
  try {return await Promise.race([promise, new Promise((_, reject) => {timer = setTimeout(() => reject(Error(label + ': selected resource was not requested')), 30000);})]);}
  finally {clearTimeout(timer);}
}

async function save() {
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
}

async function open(browser, phone, {kind, song, image = sceneImage['level1-stage1'], fail = false, holdAtBoot = false} = {}) {
  const context = await browser.newContext({viewport: phone ? {width: 393, height: 852} : {width: 1280, height: 900},
    isMobile: phone, hasTouch: phone});
  await context.route('https://cdn.jsdelivr.net/**', route => route.abort());
  await stubScoreboard(context);
  const requested = [], errors = [], frameErrors = [], seen = deferred(), release = deferred();
  const gate = {kind, song, fail, armed: holdAtBoot, selected: null, attempts: 0, seen, release};
  await context.route(/\/moth\/(?:assets|songs)\//, async route => {
    const request = route.request(), url = request.url(), pathname = decodeURIComponent(new URL(url).pathname);
    const match = kind === 'image' ? pathname.endsWith('/moth/' + image.split('?')[0])
      : kind === 'song' ? pathname.endsWith('/moth/' + song)
      : kind === 'sfx' ? /\/sfx\/.*\.wav$/.test(pathname) && !/\/sfx\/menu\//.test(pathname)
      : kind === 'menu' ? pathname.endsWith('/assets/sfx/menu/menu-click.wav')
      : kind === 'css' ? pathname.endsWith('/assets/ui/mobile_moth_buttons_20261017/sheet.webp')
      : kind === 'shell' ? pathname.endsWith('/assets/sprites/pocket_device_shell/processed/sheet-transparent.webp') : false;
    if (gate.armed && match && (!gate.selected || pathname === gate.selected)) {
      gate.selected ||= pathname; gate.attempts++; seen.resolve();
      if (fail) return route.fulfill({status: 503, body: 'required asset unavailable'});
      await release.ready;
    }
    await route.continue();
  });
  await context.addInitScript(() => {
    window.__preloadFetches = [];
    const fetchAsset = window.fetch;
    window.fetch = function(input, init) {
      const url = new URL(input instanceof Request ? input.url : String(input), document.baseURI).href;
      const game = window.bobbyGame;
      if (window.__preloadWatch) window.__preloadFetches.push({url, state: game?.state,
        loading: Boolean(game?.levelLoadingPresentation), at: performance.now()});
      return fetchAsset.call(this, input, init);
    };
  });
  const page = await context.newPage();
  page.on('request', request => requested.push({url: request.url(), type: request.resourceType(), at: Date.now()}));
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {if (message.type() === 'error' && message.text().startsWith('Frame step failed:')) frameErrors.push(message.text());});
  await page.goto(new URL('moth/staff/?device=' + (phone ? 'phone' : 'desktop'), base).href, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, {timeout: 90000});
  if (!holdAtBoot) await page.waitForLoadState('networkidle');
  await page.keyboard.press('Shift');
  await page.evaluate(() => {
    const g = bobbyGame;
    g.debugUnlockAllStages(); g.progress.flags.debugSecretLevelsUnlocked = true;
    window.__preloadSnapshots = [];
    window.__preloadSnapshot = () => {
      const game = bobbyGame, stage = window.__preloadStage || game.currentStageId;
      const images = new Set(), visited = new Set();
      const collect = value => {
        if (!value || typeof value !== 'object' || visited.has(value)) return;
        visited.add(value);
        if (value instanceof HTMLImageElement) {images.add(value); return;}
        if (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype) Object.values(value).forEach(collect);
      };
      collect(game.refs); collect(game.memeChestSheet);
      const groups = game.sceneGroups(stage), tracks = game.chapterTracks(groups);
      const audio = game.getActiveLevel1OfficeRhythmAudio();
      return {state: game.state, stage: game.currentStageId, wanted: stage, loading: Boolean(game.levelLoadingPresentation),
        sceneReady: game.sceneAssetsReady(stage), groups: [...game.loadedSceneGroups].sort(),
        images: images.size, incompleteImages: [...images].filter(image => !image.complete || !image.naturalWidth).length,
        undecodedImages: [...images].filter(image => !game.decodedSceneImages?.has(image)).length,
        sfx: Object.keys(game.sfxBuffers || {}).filter(name => !name.startsWith('menu-')).length,
        missingSfx: Object.keys(HIT_SFX).filter(name => !name.startsWith('menu-') && !game.sfxBuffers?.[name]),
        copies: tracks.map(track => {const source = game.canonicalAudioSource(track); return {source,
          blob: track.getAttribute('src')?.startsWith('blob:') || false,
          matches: Boolean(source && game.audioMirror?.get(source)?.url === track.getAttribute('src'))};}),
        songTime: game.songTime || 0, score: game.level1OfficeRhythm?.roundScore || 0,
        countdown: game.stageCountdown || 0,
        audio: audio && {blob: audio.getAttribute('src')?.startsWith('blob:') || false,
          duration: Number.isFinite(audio.duration) ? audio.duration : null, time: audio.currentTime, paused: audio.paused}};
    };
    let state = g.state;
    Object.defineProperty(g, 'state', {configurable: true, get: () => state, set: value => {
      const previous = state; state = value;
      if (window.__preloadWatch && value !== previous && !['title', 'loading'].includes(value)) {
        window.__preloadSnapshots.push(window.__preloadSnapshot());
      }
    }});
  });
  return {context, page, requested, errors, frameErrors, gate,
    close: async () => {release.resolve(); await context.close();}};
}

async function enter(probe, stage, difficulty = 'chill', freePlay = true) {
  probe.gate.armed = true;
  await probe.page.evaluate(({stage, difficulty, freePlay}) => {
    window.__preloadStage = stage; window.__preloadWatch = true;
    const button = document.createElement('button');
    button.id = 'qa-preload-entry'; button.textContent = 'Enter test level';
    button.style.cssText = 'position:fixed;left:4px;top:4px;z-index:2147483647';
    button.onclick = event => {
      event.stopPropagation(); button.remove();
      bobbyGame.setDifficulty(difficulty, {persist: false, announce: false});
      bobbyGame.startStage(stage, {freePlay});
    };
    document.body.append(button);
  }, {stage, difficulty, freePlay});
  await probe.page.locator('#qa-preload-entry').click();
}

function assertReady(snapshot, label) {
  assert(snapshot.sceneReady, label + ': chapter group gate complete');
  assert(snapshot.images > 0, label + ': actual decoded scene images');
  assert.equal(snapshot.incompleteImages, 0, label + ': every required image finished');
  assert.equal(snapshot.undecodedImages, 0, label + ': image decode completed under LOADING');
  assert.equal(snapshot.sfx, 15, label + ': all 15 fight effects decoded');
  assert.deepEqual(snapshot.missingSfx, [], label + ': no missing decoded effects');
  assert(snapshot.copies.length && snapshot.copies.every(copy => copy.blob && copy.matches && !copy.source.startsWith('blob:')),
    label + ': complete audio copies adopted with canonical source identities: ' + JSON.stringify(snapshot.copies));
}

async function playing(page, stage, countdown = true) {
  await page.waitForFunction(({stage, countdown}) => {
    const g = bobbyGame, r = g.level1OfficeRhythm, audio = g.getActiveLevel1OfficeRhythmAudio();
    return g.state === 'playing' && g.currentStageId === stage && !g.levelLoadingPresentation
      && !r?.graphicsLoading && r?.tutorial?.mode === 'done'
      && (!countdown || (!(g.stageCountdown > 0) && audio && !audio.paused && audio.currentTime > .1));
  }, {stage, countdown}, {timeout: 120000});
}

async function observe(probe, label) {
  const started = probe.requested.length;
  await probe.page.waitForTimeout(700);
  const lateRequests = probe.requested.slice(started).filter(request => assetUrl(request.url));
  const traces = await probe.page.evaluate(() => ({snapshots: window.__preloadSnapshots, fetches: window.__preloadFetches}));
  const lateFetches = traces.fetches.filter(request => assetUrl(request.url) && !request.loading && !['title', 'loading'].includes(request.state));
  assert.deepEqual(lateRequests, [], label + ': no new game-asset requests after activation');
  assert.deepEqual(lateFetches, [], label + ': no resource fetching after the loading screen');
  for (const snapshot of traces.snapshots) assertReady(snapshot, label + '/' + snapshot.state);
  assert.deepEqual(probe.errors, [], label + ': no browser errors');
  assert.deepEqual(probe.frameErrors, [], label + ': no frame exceptions');
  return {activationStates: traces.snapshots.map(snapshot => snapshot.state), lateRequests: 0, lateFetches: 0};
}

async function fightCase(browser, engine, phone, stage, spec, difficulty, kind) {
  const label = `${engine}/${stage}/${difficulty}/${kind}`, probe = await open(browser, phone, {kind, song: sourceFor(spec), image: sceneImage[stage]});
  try {
    await enter(probe, stage, difficulty);
    await bounded(probe.gate.seen.ready, label);
    await probe.page.waitForTimeout(1500);
    const held = await probe.page.evaluate(() => window.__preloadSnapshot());
    assert(held.loading && held.state === 'loading', label + ': delayed resource keeps LOADING visible');
    assert.equal(held.songTime, 0, label + ': gameplay clock cannot run during loading');
    assert.equal(held.score, 0, label + ': score cannot change during loading');
    assert.equal(held.countdown, 0, label + ': count-in starts only after the resource gate');
    assert.equal(await probe.page.evaluate(() => window.__preloadSnapshots.length), 0, label + ': no scene activation while resource is held');
    if (stage === fights[0][0] && difficulty === 'chill') await probe.page.screenshot({path: path.join(out, engine + '-held-loading.png')});
    probe.gate.release.resolve();
    await playing(probe.page, stage);
    const ready = await probe.page.evaluate(() => window.__preloadSnapshot());
    assertReady(ready, label); assert(ready.audio.blob && ready.audio.duration > 1 && !ready.audio.paused);
    const observed = await observe(probe, label);
    return {label, kind: 'fight', delayed: kind, delayedPath: probe.gate.selected, held: {state: held.state, clock: held.songTime, score: held.score}, ready, ...observed};
  } finally {await probe.close();}
}

async function narrativeCase(browser, engine, phone, stage, state) {
  const label = `${engine}/${stage}/narrative`, probe = await open(browser, phone);
  try {
    await enter(probe, stage, 'chill', false);
    await probe.page.waitForFunction(state => bobbyGame.state === state && !bobbyGame.levelLoadingPresentation, state, {timeout: 120000});
    const ready = await probe.page.evaluate(() => window.__preloadSnapshot()); assertReady(ready, label);
    const observed = await observe(probe, label);
    return {label, kind: 'narrative', ready, ...observed};
  } finally {await probe.close();}
}

async function failedCase(browser, engine, phone, kind) {
  const stage = 'level1-stage1', label = `${engine}/failure/${kind}`;
  const probe = await open(browser, phone, {kind, song: sourceFor(fights[0][1]), fail: true});
  try {
    await enter(probe, stage);
    await probe.page.locator('.load-recovery').waitFor({state: 'visible', timeout: 90000});
    const state = await probe.page.evaluate(() => ({state: bobbyGame.state, score: bobbyGame.level1OfficeRhythm?.roundScore || 0,
      songTime: bobbyGame.songTime || 0, activated: window.__preloadSnapshots.map(snapshot => snapshot.state),
      ready: bobbyGame.sceneAssetsReady('level1-stage1')}));
    assert(!state.ready && state.state !== 'playing'); assert.equal(state.score, 0); assert.equal(state.songTime, 0);
    assert(!state.activated.includes('playing'), label + ': failed bytes never become a streaming fight');
    const fetchAttempts = probe.requested.filter(request => request.type === 'fetch' && decodeURIComponent(new URL(request.url).pathname) === probe.gate.selected).length;
    assert.equal(fetchAttempts, 3, label + ': whole-file loader retries are bounded independently of media priming');
    assert(probe.gate.attempts >= 3 && probe.gate.attempts <= 5, label + ': retries remain bounded including media priming');
    assert.deepEqual(probe.errors, []); assert.deepEqual(probe.frameErrors, []);
    return {label, kind: 'failure', failedAsset: kind, attempts: probe.gate.attempts, fetchAttempts, state};
  } finally {await probe.close();}
}

async function lifecycleCase(browser, engine, phone) {
  const probe = await open(browser, phone, {kind: 'image'}), label = engine + '/cancellation-revisit';
  try {
    await enter(probe, 'level1-stage1');
    await bounded(probe.gate.seen.ready, label);
    await probe.page.evaluate(() => {bobbyGame.returnToTitle(); window.__preloadStage = 'level2-stage2'; bobbyGame.startStage('level2-stage2', {freePlay: true});});
    probe.gate.release.resolve(); await playing(probe.page, 'level2-stage2');
    const cancelled = await probe.page.evaluate(() => ({stage: bobbyGame.currentStageId, groups: [...bobbyGame.loadedSceneGroups],
      activations: window.__preloadSnapshots.filter(snapshot => snapshot.state === 'playing').map(snapshot => snapshot.stage)}));
    assert(!cancelled.groups.includes('office')); assert(cancelled.activations.every(stage => stage === 'level2-stage2'));
    const visits = [];
    for (const [stage] of [...fights.slice(2), fights[0]]) {
      await probe.page.evaluate(() => bobbyGame.returnToTitle()); await enter(probe, stage);
      await playing(probe.page, stage, false);
      if (stage === fights[0][0]) await playing(probe.page, stage, true);
      const memory = await probe.page.evaluate(() => {
        const g = bobbyGame; g.trimAudioMirror();
        const idle = [...g.audioMirror].filter(([, entry]) => entry.url && !g.audioUsing(entry.url));
        return {stage: g.currentStageId, idle: idle.length, total: g.audioMirror.size,
          source: g.stageTrackSource(g.currentStageId), blob: g.getActiveLevel1OfficeRhythmAudio().getAttribute('src').startsWith('blob:'),
          incomplete: window.__preloadSnapshot().incompleteImages,
          playing: !g.getActiveLevel1OfficeRhythmAudio().paused,
          time: g.getActiveLevel1OfficeRhythmAudio().currentTime};
      });
      assert(memory.idle <= 2, label + ': idle blobs are bounded');
      assert(memory.source && !memory.source.startsWith('blob:') && memory.blob && !memory.incomplete, label + ': canonical revisit remains playable');
      visits.push(memory);
    }
    assert.equal(visits.at(-1).stage, 'level1-stage1');
    assert(visits.at(-1).playing && visits.at(-1).time > .1, label + ': an evicted chapter plays again with its rebuilt canonical player');
    assert.deepEqual(probe.errors, []); assert.deepEqual(probe.frameErrors, []);
    return {label, kind: 'lifecycle', cancelled, visits};
  } finally {await probe.close();}
}

async function interfaceCase(browser, engine, phone, kind, fail = false) {
  const label = `${engine}/interface/${kind}${fail ? '-failure' : ''}`;
  const probe = await open(browser, phone, {kind, fail, holdAtBoot: true});
  try {
    await bounded(probe.gate.seen.ready, label);
    await enter(probe, 'level1-stage1');
    if (fail) {
      await probe.page.locator('.load-recovery').waitFor({state: 'visible', timeout: 90000});
      const state = await probe.page.evaluate(() => ({state: bobbyGame.state, ready: bobbyGame.sceneAssetsReady('level1-stage1'),
        score: bobbyGame.level1OfficeRhythm?.roundScore || 0, clock: bobbyGame.songTime || 0,
        activations: window.__preloadSnapshots.map(snapshot => snapshot.state)}));
      assert(!state.ready && state.state !== 'playing' && !state.activations.includes('playing'));
      assert.equal(state.score, 0); assert.equal(state.clock, 0);
      assert(probe.gate.attempts >= 3 && probe.gate.attempts <= 6, label + ': failed optimistic boot and entry retries stay bounded');
      assert.deepEqual(probe.errors, []); assert.deepEqual(probe.frameErrors, []);
      return {label, kind: 'interface-failure', attempts: probe.gate.attempts, state};
    }
    await probe.page.waitForTimeout(1500);
    const held = await probe.page.evaluate(() => window.__preloadSnapshot());
    assert(held.loading && held.state === 'loading', label + ': required interface bytes still gate the level');
    assert.equal(held.songTime, 0); assert.equal(held.score, 0); assert.equal(held.countdown, 0);
    assert.equal(await probe.page.evaluate(() => window.__preloadSnapshots.length), 0);
    probe.gate.release.resolve();
    await playing(probe.page, 'level1-stage1');
    const ready = await probe.page.evaluate(() => window.__preloadSnapshot()); assertReady(ready, label);
    const ui = await probe.page.evaluate(keys => ({
      menu: Object.keys(MENU_SFX).map(name => ({name, decoded: Boolean(bobbyGame.sfxBuffers?.[name])})),
      pocket: {complete: POCKET_SHELL_IMAGE.complete, width: POCKET_SHELL_IMAGE.naturalWidth},
      css: keys.map(key => ({key, value: document.documentElement.style.getPropertyValue(key)}))
    }), cssKeys);
    assert.equal(ui.menu.length, 2); assert(ui.menu.every(sound => sound.decoded), label + ': menu buffers decoded before play');
    assert(ui.pocket.complete && ui.pocket.width > 0, label + ': retained pocket shell is ready');
    assert(ui.css.length > 0 && ui.css.every(texture => texture.value.includes('blob:')), label + ': CSS artwork is decoded and installed');
    const observed = await observe(probe, label);
    return {label, kind: 'interface', held: {clock: held.songTime, score: held.score}, ready, ui, ...observed};
  } finally {await probe.close();}
}

try {
  for (const engine of engineOption ? [engineOption] : ['chrome', 'webkit']) {
    assert(['chrome', 'webkit'].includes(engine));
    const phone = engine === 'webkit';
    const browser = engine === 'chrome'
      ? await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
        args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']})
      : await webkit.launch({headless: true});
    const record = async job => {const result = await job; report.cases.push(result); await save(); console.log(result.label, 'PASS');};
    try {
      if (!section || section === 'fights') {
        let index = 0;
        for (const [stage, spec] of smoke ? fights.slice(0, 1) : fights) {
          for (const mode of smoke ? ['chill'] : ['chill', 'shoot']) await record(fightCase(browser, engine, phone, stage, spec, mode, ['image', 'song', 'sfx'][index++ % 3]));
        }
      }
      if (!section || section === 'narratives') for (const [stage, state] of smoke ? narratives.slice(0, 1) : narratives) await record(narrativeCase(browser, engine, phone, stage, state));
      if (!section || section === 'failures') for (const kind of smoke ? ['song'] : ['image', 'song', 'sfx']) await record(failedCase(browser, engine, phone, kind));
      if ((!section || section === 'lifecycle') && !smoke) await record(lifecycleCase(browser, engine, phone));
      if (!section || section === 'interfaces') {
        for (const kind of ['menu', 'css', 'shell']) await record(interfaceCase(browser, engine, phone, kind));
        await record(interfaceCase(browser, engine, phone, 'menu', true));
      }
    } finally {await browser.close();}
  }
  assert(report.cases.length > 0, 'The selected options must exercise at least one scenario');
  report.allPassed = true;
  console.log('PASS required-level preload: delayed resources, complete images/audio/SFX, no late fetches, failures and bounded revisits', report.cases.length, 'cases');
} catch (error) {
  report.allPassed = false; report.error = String(error?.stack || error); throw error;
} finally {report.completedAt = new Date().toISOString(); await save();}
