// The owner-provided recording, byte-for-byte, as Level 4's chest reward.
// Real browser AAC playback/downloads plus simulated native-share capabilities.
// No publication or live scoreboard writes. Physical share sheets remain a
// device check; native share behavior here is injected at the browser API edge.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from '/Users/myscheduleai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { stubScoreboard } from './moth-scoreboard-stub.mjs';

const base = process.argv[2] || 'http://127.0.0.1:5286/';
const asset = 'assets/audio/easter-eggs/dr-beauty-private-message.m4a';
const filename = 'A private message from Dr.Beauty.m4a';
const titles = { en: 'A private message from Dr.Beauty', 'zh-TW': '一段來自美麗本人的錄音' };
const ownerSha = 'd734a67a01b1e73f45e90cf0887590da3ad921cc23c3000896b68a60e55a2ebe';
const source = await fs.readFile(new URL('../moth-asset-additions/' + asset, import.meta.url));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(source.length, 95100, 'Original attachment size');
assert.equal(hash(source), ownerSha, 'Original attachment bytes');
const out = path.resolve('.qa/moth/easter-egg');
await fs.mkdir(out, { recursive: true });
const browsers = {
  chrome: () => chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] }),
  webkit: () => webkit.launch({ headless: true })
};

async function open(browser, { phone = false, language = 'en', routeAudio } = {}) {
  const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    isMobile: phone, hasTouch: phone, acceptDownloads: true });
  await stubScoreboard(context);
  await context.route('https://cdn.jsdelivr.net/**', route => route.abort());
  const page = await context.newPage(), errors = [], requests = [], downloads = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', request => requests.push(request.url()));
  page.on('download', download => downloads.push(download));
  if (routeAudio) await page.route('**/dr-beauty-private-message.m4a*', routeAudio);
  await page.goto(new URL('moth/staff/?device=' + (phone ? 'phone' : 'desktop'), base).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.bobbyGame?.bootDone, undefined, { timeout: 60000 });
  await page.keyboard.press('Shift');
  await page.evaluate(language => {
    const g = bobbyGame;
    g.setLanguage(language, { persist: false, announce: false });
    g.debugJumpToStage('level4-meme-chest');
  }, language);
  await page.waitForFunction(() => bobbyGame.state === 'level4' && bobbyGame.level4Rail === 'lower'
    && bobbyGame.memeChestSheet && !bobbyGame.levelLoadingPresentation, undefined, { timeout: 90000 });
  return { context, page, errors, requests, downloads };
}

async function chest(page, { ready = true } = {}) {
  await page.keyboard.press('KeyO');
  await page.locator('.moth-meme').waitFor();
  if (ready) await page.waitForFunction(() => {
    const audio = document.querySelector('.moth-meme audio');
    return audio?.readyState > 0 && !document.querySelector('[data-meme-save]')?.disabled;
  }, undefined, { timeout: 30000 });
}

async function saveDownload(page, action = () => page.locator('[data-meme-save]').click()) {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), action()]);
  assert.equal(download.suggestedFilename(), filename);
  assert.equal(hash(await fs.readFile(await download.path())), ownerSha, 'Downloaded recording equals the original attachment');
}

async function clickGesture(page, kind) {
  await page.evaluate(kind => {
    const button = document.createElement('button'); button.id = 'qa-audio-gesture'; button.textContent = 'Test playback';
    button.addEventListener('click', () => {
      const g = bobbyGame;
      if (kind === 'walk') {
        g.sewerAudio.muted = true;
        g.playMusicAudio(g.sewerAudio).catch(() => {});
      } else if (kind === 'resume-walk') g.resumeWalk();
      else {
        const audio = document.querySelector('.moth-meme audio');
        audio.muted = true; audio.play().catch(() => {});
      }
    });
    (document.querySelector('.moth-meme section') || document.body).appendChild(button);
  }, kind);
  await page.locator('#qa-audio-gesture').click();
  await page.locator('#qa-audio-gesture').evaluate(button => button.remove());
}

for (const [engine, launch] of Object.entries(browsers)) {
  const browser = await launch();
  try {
    // Bilingual preview, native decoding, exact download, and playback cleanup.
    for (const phone of engine === 'chrome' ? [false, true] : [true]) {
      const { context, page, errors, requests, downloads } = await open(browser, { phone });
      if (phone) await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }));
      await clickGesture(page, 'walk');
      await page.waitForFunction(() => bobbyGame.sewerAudio && !bobbyGame.sewerAudio.paused, undefined, { timeout: 10000 });
      await chest(page);
      const audio = page.locator('.moth-meme audio');
      const shown = await audio.evaluate(audio => ({ controls: audio.controls, autoplay: audio.autoplay, paused: audio.paused,
        source: audio.src.slice(0, 5), duration: audio.duration, type: document.querySelector('.moth-meme img')?.tagName || null }));
      assert.deepEqual({ controls: shown.controls, autoplay: shown.autoplay, paused: shown.paused, source: shown.source, type: shown.type },
        { controls: true, autoplay: false, paused: true, source: 'blob:', type: null });
      assert(shown.duration > 10.5 && shown.duration < 11, 'Original AAC duration');
      await audio.focus();
      await page.keyboard.press('Shift+Tab');
      assert(await page.evaluate(() => document.activeElement?.matches('[data-meme-close]')), 'Shift+Tab from the native player wraps to the close control');
      const savedCount = downloads.length;
      await audio.focus();
      await page.keyboard.press('Space');
      await page.waitForTimeout(100);
      assert.equal(downloads.length, savedCount, 'Native player Space never triggers a download');
      await audio.evaluate(audio => audio.pause());
      for (const language of ['en', 'zh-TW']) {
        await page.evaluate(language => {
          const g = bobbyGame; g.closeMeme(); g.setLanguage(language, { persist: false, announce: false }); g.showMeme();
        }, language);
        await page.waitForFunction(() => document.querySelector('.moth-meme audio')?.readyState > 0, undefined, { timeout: 10000 });
        assert.equal(await page.locator('.moth-meme h2').innerText(), titles[language]);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No phone horizontal overflow');
        await page.screenshot({ path: path.join(out, `${engine}-${phone ? 'phone' : 'desktop'}-${language}.png`) });
      }
      await saveDownload(page, () => page.keyboard.press('KeyO'));
      const fileType = await page.evaluate(async () => (await bobbyGame.memeRecording).file.type);
      assert.equal(fileType, 'audio/mp4', 'M4A MIME supports audio sharing');
      await clickGesture(page, 'preview');
      await page.waitForFunction(() => document.querySelector('.moth-meme audio')?.currentTime > .1, undefined, { timeout: 10000 });
      assert(await page.evaluate(() => bobbyGame.sewerAudio.paused), 'Walking music does not play over the recording');
      const nativeOwnership = await page.evaluate(() => {
        const audio = document.querySelector('.moth-meme audio');
        window.__qaPreview = audio; window.__qaHidden = false;
        Object.defineProperty(document, 'hidden', {configurable:true, get:() => window.__qaHidden});
        Object.defineProperty(document, 'visibilityState', {configurable:true, get:() => window.__qaHidden ? 'hidden' : 'visible'});
        window.__qaHidden = true; document.dispatchEvent(new Event('visibilitychange'));
        const pausedWhileHidden = audio.paused;
        window.__qaHidden = false; document.dispatchEvent(new Event('visibilitychange'));
        const stayedPaused = audio.paused;
        bobbyGame.rebuildMusicAudioContext();
        return {pausedWhileHidden, stayedPaused, sameElement:document.querySelector('.moth-meme audio')===audio && bobbyGame.memeView.audio===audio,
          sameSource:audio.src.startsWith('blob:'), registered:bobbyGame.gameAudioRegistry?.has(audio) || false};
      });
      assert.deepEqual(nativeOwnership, {pausedWhileHidden:true, stayedPaused:true, sameElement:true, sameSource:true, registered:false},
        'Preview stays native and paused across hide/show and game-audio context rebuild');
      await clickGesture(page, 'preview');
      await page.waitForFunction(() => !document.querySelector('.moth-meme audio')?.paused, undefined, {timeout:10000});
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', {persisted:false})));
      assert(await audio.evaluate(audio => audio.paused), 'Pagehide pauses the native voice recording');
      await clickGesture(page, 'preview');
      await page.waitForFunction(() => !document.querySelector('.moth-meme audio')?.paused, undefined, {timeout:10000});
      await page.evaluate(() => { window.__closedPreview = document.querySelector('.moth-meme audio'); });
      await page.evaluate(() => bobbyGame.pauseForControllerDisconnect());
      assert(await page.evaluate(() => Boolean(bobbyGame.walkPause)), 'Controller disconnect pauses the walk behind the recording');
      await page.locator('[data-meme-close]').click();
      assert(await page.evaluate(() => window.__closedPreview.paused && !window.__closedPreview.isConnected
        && !window.__closedPreview.hasAttribute('src') && !bobbyGame.memeView), 'Close stops, unloads and detaches the preview');
      assert(await page.evaluate(() => bobbyGame.sewerAudio.paused && Boolean(bobbyGame.walkPause)
        && bobbyGame.walkPause.bgm === bobbyGame.sewerAudio), 'Close transfers BGM ownership to the paused walk without resuming it');
      await clickGesture(page, 'resume-walk');
      await page.waitForFunction(() => !bobbyGame.sewerAudio.paused, undefined, { timeout: 10000 });
      assert(await page.evaluate(() => !bobbyGame.walkPause), 'Walk resume restores its music');
      await page.evaluate(() => bobbyGame.showMeme());
      await page.waitForFunction(() => document.querySelector('.moth-meme audio')?.readyState > 0, undefined, {timeout:10000});
      await clickGesture(page, 'preview');
      await page.waitForFunction(() => !document.querySelector('.moth-meme audio')?.paused, undefined, {timeout:10000});
      const left = await page.evaluate(() => {
        const audio = document.querySelector('.moth-meme audio');
        bobbyGame.returnToTitle();
        return {state:bobbyGame.state, voicePaused:audio.paused, detached:!audio.isConnected, unloaded:!audio.hasAttribute('src'), modalClosed:!bobbyGame.memeView, walkMusicPaused:bobbyGame.sewerAudio.paused};
      });
      assert.deepEqual(left, {state:'title',voicePaused:true,detached:true,unloaded:true,modalClosed:true,walkMusicPaused:true}, 'Returning to title cannot leave an orphaned recording or restart old walk music');
      assert(!requests.some(url => /level4-meme\.png/.test(url)), 'Retired picture never requested');
      assert.equal(requests.filter(url => url.includes('dr-beauty-private-message.m4a')).length, 1, 'Verified recording is fetched once and reused');
      assert.deepEqual(errors, []);
      console.log(engine, phone ? 'phone' : 'desktop', 'PASS audio preview, bilingual title, native decode, exact download, BGM pause/restore, close cleanup');
      await context.close();
    }

    // Browser API boundary: correct File/title, cancellation and failed share.
    if (engine === 'chrome') {
      const { context, page, downloads, errors } = await open(browser, { phone: true });
      await page.evaluate(() => {
        window.__shareMode = 'success'; window.__shares = [];
        Object.defineProperty(navigator, 'canShare', { configurable: true, value: ({ files }) => files?.length === 1 });
        Object.defineProperty(navigator, 'share', { configurable: true, value: async ({ files, title }) => {
          const file = files[0], digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
          window.__shares.push({ title, name: file.name, size: file.size, type: file.type, hash: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') });
          if (window.__shareMode === 'cancel') throw new DOMException('Cancelled', 'AbortError');
          if (window.__shareMode === 'fail') throw new DOMException('Blocked', 'NotAllowedError');
        }});
      });
      await chest(page);
      await page.locator('[data-meme-save]').click();
      await page.waitForFunction(() => window.__shares.length === 1);
      assert.deepEqual(await page.evaluate(() => window.__shares[0]), { title: titles.en, name: filename, size: source.length, type: 'audio/mp4', hash: ownerSha });
      assert.equal(downloads.length, 0, 'Native share creates no extra browser download');
      await page.evaluate(() => { window.__shareMode = 'cancel'; });
      await page.locator('[data-meme-save]').click();
      await page.waitForFunction(() => window.__shares.length === 2);
      await page.waitForTimeout(100);
      assert.equal(downloads.length, 0, 'Cancelling the share sheet does not download unexpectedly');
      assert(await page.locator('.moth-meme').isVisible(), 'Cancellation keeps the chest preview open');
      const priorStatus = await page.locator('.moth-meme [role="status"]').innerText();
      await page.evaluate(() => { window.__shareMode = 'fail'; });
      await page.locator('[data-meme-save]').click();
      await page.waitForFunction(() => window.__shares.length === 3);
      await page.waitForFunction(prior => document.querySelector('.moth-meme [role="status"]')?.textContent.trim()
        && document.querySelector('.moth-meme [role="status"]').textContent !== prior, priorStatus);
      assert.equal(downloads.length, 0, 'Failed sharing asks before a fallback download');
      const fallback = page.locator('[data-meme-download]');
      if (await fallback.count() && await fallback.isVisible()) await saveDownload(page, () => fallback.click());
      else {
        await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }));
        await saveDownload(page);
      }
      assert.deepEqual(errors, []);
      console.log('share PASS exact original File/title, cancelled share, accessible share failure, deliberate download fallback');
      await context.close();

      // Unavailable bytes cannot be saved; retry goes through the same loader.
      const failed = await open(browser, { phone: true, routeAudio: route => route.fulfill({ status: 503, body: 'temporarily unavailable' }) });
      await chest(failed.page, { ready: false });
      await failed.page.locator('[data-meme-retry]:visible').waitFor({ timeout: 30000 });
      assert(await failed.page.locator('[data-meme-save]').isDisabled(), 'Cannot save an unverified or unavailable file');
      await failed.page.unroute('**/dr-beauty-private-message.m4a*');
      await failed.page.locator('[data-meme-retry]').click();
      await failed.page.waitForFunction(() => document.querySelector('.moth-meme audio')?.readyState > 0 && !document.querySelector('[data-meme-save]')?.disabled, undefined, { timeout: 30000 });
      await failed.page.evaluate(() => Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }));
      await saveDownload(failed.page);
      assert.deepEqual(failed.errors, []);
      console.log('retry PASS failed load blocks saving; successful retry downloads original attachment');
      await failed.context.close();

      // A successful HTTP response is still untrusted until its bytes match.
      const tampered = Buffer.from(source); tampered[Math.floor(tampered.length / 2)] ^= 1;
      const corrupt = await open(browser, {phone:true, routeAudio:route => route.fulfill({status:200, contentType:'audio/mp4', body:tampered})});
      await chest(corrupt.page, {ready:false});
      await corrupt.page.locator('[data-meme-retry]:visible').waitFor({timeout:30000});
      assert(await corrupt.page.locator('[data-meme-save]').isDisabled(), 'A tampered HTTP200 response cannot enable saving');
      assert(await corrupt.page.evaluate(() => !bobbyGame.memeView.file && !document.querySelector('.moth-meme audio').hasAttribute('src')),
        'Hash mismatch creates neither a File reward nor a playable object URL');
      await corrupt.page.unroute('**/dr-beauty-private-message.m4a*');
      await corrupt.page.locator('[data-meme-retry]').click();
      await corrupt.page.waitForFunction(() => document.querySelector('.moth-meme audio')?.readyState > 0 && !document.querySelector('[data-meme-save]')?.disabled, undefined, {timeout:30000});
      await corrupt.page.evaluate(() => Object.defineProperty(navigator, 'canShare', {configurable:true, value:() => false}));
      await saveDownload(corrupt.page);
      assert.deepEqual(corrupt.errors, []);
      console.log('integrity PASS tampered200 blocked before audio/File/save; verified retry downloads original attachment');
      await corrupt.context.close();
    }
  } finally { await browser.close(); }
}
console.log('PASS Easter egg: original audio download and preview; bilingual desktop/phone; Chrome/WebKit; share/failure/retry/cleanup');
