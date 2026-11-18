import assert from 'node:assert/strict';

// This small shell is in the document itself, so the requested loader is the
// first paint even when the main stylesheet or game bundle has not arrived.
const BOOT_LOADING_CSS = String.raw`
html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#ff5c21}
body:has(> #moth-boot-loading) canvas{max-width:100%}
#moth-boot-loading{--boot-top:max(34px,calc(env(safe-area-inset-top) + 6px));--boot-reserve:clamp(300px,40dvh,360px);--boot-width:min(calc(100dvw - 12px),calc((100dvh - var(--boot-top) - var(--boot-reserve) - 12px)/1.0778));--boot-height:calc(var(--boot-width)*1.0778);--boot-left:calc((100dvw - var(--boot-width))/2);position:fixed;inset:0;z-index:900;overflow:hidden;background:#ff5c21;color:#f7f2de;font-family:'Courier New',monospace;touch-action:none;-webkit-user-select:none;user-select:none}
#moth-boot-loading *{box-sizing:border-box}
.moth-boot-frame{position:absolute;left:var(--boot-left);top:var(--boot-top);width:var(--boot-width);height:var(--boot-height);border:2px solid #05070a;border-radius:6px;box-shadow:0 0 0 2px #0d1114;overflow:hidden;background:#000}
.moth-boot-content{position:absolute;left:50%;top:50%;width:76%;transform:translate(-50%,-45%);text-align:center}
.moth-boot-title{margin:0 0 clamp(25px,calc(var(--boot-width)*.066),52px);font-size:clamp(28px,calc(var(--boot-width)*.083),76px);font-weight:900;line-height:1;white-space:nowrap}
.moth-boot-progress{position:relative;height:clamp(4px,calc(var(--boot-width)*.009),10px);overflow:hidden;background:#203337}
.moth-boot-progress span{display:block;width:var(--boot-progress,24%);height:100%;background:#8fe8ff}
#moth-boot-loading[data-indeterminate] .moth-boot-progress span{animation:moth-boot-sweep 1.5s linear infinite}
.moth-boot-label{margin:13px 0 9px;color:#ffd36c;font-weight:900;font-size:clamp(10px,calc(var(--boot-width)*.023),20px);line-height:1.2}
.moth-boot-hint{margin:0;color:#b2afa0;font-weight:900;font-size:clamp(8px,calc(var(--boot-width)*.018),15px);line-height:1.45}
.moth-boot-brand{position:absolute;top:calc(var(--boot-top) + var(--boot-height) + 22px);left:24px;right:24px;display:flex;align-items:baseline;gap:7px;color:#fff3e8;white-space:nowrap}
.moth-boot-brand::before{content:'○';font-size:12px}
.moth-boot-brand strong{font:italic 900 clamp(12px,3.5vw,21px)/1 'Courier New',monospace;letter-spacing:-.08em}
.moth-boot-brand small{font-weight:900;font-size:7px;letter-spacing:.08em}
.moth-boot-brand span{margin-left:auto;font-size:9px}
.moth-boot-deck{position:absolute;left:8px;right:8px;top:calc(var(--boot-top) + var(--boot-height) + 64px);bottom:max(44px,env(safe-area-inset-bottom));border:1px solid #a13c24;border-radius:24px}
.moth-boot-deck::after{content:'SPACE';position:absolute;left:50%;bottom:28px;transform:translateX(-50%);font-size:10px;font-weight:900;letter-spacing:.1em}
.moth-boot-reload{margin:16px auto 0;padding:10px 16px;border:2px solid #f7f2de;background:#344439;color:#f7f2de;font:900 16px 'Courier New',monospace;cursor:pointer}
.moth-boot-reload[hidden]{display:none}
#moth-boot-loading[data-error] .moth-boot-label{color:#ff6b7d}
@keyframes moth-boot-sweep{from{transform:translateX(-100%)}to{transform:translateX(420%)}}
@media(prefers-reduced-motion:reduce){#moth-boot-loading[data-indeterminate] .moth-boot-progress span{animation:none;margin-left:38%}}
@media(orientation:landscape),(min-width:921px){#moth-boot-loading{--boot-width:min(calc(100vw - 72px),calc((100vh - 72px)*16/9),1280px);--boot-height:calc(var(--boot-width)*9/16);--boot-top:calc((100vh - var(--boot-height))/2);--boot-left:calc((100vw - var(--boot-width))/2)}.moth-boot-frame{border:4px solid #090b0d;border-radius:14px;box-shadow:0 0 0 5px #31373b,0 0 0 9px #4a5358,0 0 0 18px #ff5c21,0 0 0 21px #751c0eb8}.moth-boot-title{font-size:clamp(28px,calc(var(--boot-width)*.0594),76px)}.moth-boot-content{width:41%}.moth-boot-brand,.moth-boot-deck{display:none}}
`;

export const BOOT_LOADING_SCRIPT = String.raw`(() => {
  const root = document.getElementById('moth-boot-loading');
  if (!root) return;
  let stylesheet = document.getElementById('moth-game-styles');
  const label = root.querySelector('.moth-boot-label');
  const hint = root.querySelector('.moth-boot-hint');
  const meter = root.querySelector('.moth-boot-progress');
  const reload = root.querySelector('.moth-boot-reload');
  let language = 'zh-TW', complete = false, failed = false, stylesReady = false;
  let last = '', frame = '';
  const text = (en, zh) => language === 'en' ? en : zh;
  try {
    const audience = location.pathname.includes('/staff/') ? 'staff' : 'public';
    if (localStorage.getItem('moth.' + audience + '_language_v1') === 'en') language = 'en';
  } catch { /* The loader works when browser storage is unavailable. */ }
  hint.textContent = text('Downloading game resources. Please wait.', '首次載入需要下載遊戲資源，請稍候');
  root.querySelector('.moth-boot-brand span').textContent = text('FULLSCREEN', '全螢幕');
  meter.setAttribute('aria-label', text('Loading game resources', '載入遊戲資源'));
  try {
    const audience = location.pathname.includes('/staff/') ? 'staff' : 'public';
    language = localStorage.getItem('moth.' + audience + '_language_v1') === 'en' ? 'en' : 'zh-TW';
  } catch { /* Keep the default language when browser storage is unavailable. */ }
  const copy = () => {
    hint.textContent = text('Downloading game resources. Please wait.', '首次載入需要下載遊戲資源，請稍候');
    meter.setAttribute('aria-label', text('Loading game resources', '載入遊戲資源'));
    root.querySelector('.moth-boot-brand span').textContent = text('FULLSCREEN', '全螢幕');
  };
  copy();
  const syncFrame = () => {
    if (!stylesReady) return;
    const portrait = document.getElementById('portrait-viewport');
    const main = document.getElementById('game-viewport');
    const tall = portrait?.getBoundingClientRect();
    const rect = tall?.width > 20 && tall?.height > 20 ? tall : main?.getBoundingClientRect();
    if (!rect || rect.width < 20 || rect.height < 20) return;
    const key = [rect.x, rect.y, rect.width, rect.height].join('/');
    if (key === frame) return;
    frame = key;
    for (const [name, value] of [['left', rect.x], ['top', rect.y], ['width', rect.width], ['height', rect.height]])
      root.style.setProperty('--boot-' + name, value + 'px');
  };
  const finish = () => {
    if (!complete || !stylesReady || failed || !root.isConnected) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      root.remove();
      document.getElementById('moth-boot-styles')?.remove();
      window.removeEventListener('keydown', stopInput, true);
      window.removeEventListener('resize', syncFrame);
    }));
  };
  const fail = () => {
    if (!root.isConnected) return;
    failed = true;
    root.dataset.error = '1';
    root.removeAttribute('data-indeterminate');
    label.textContent = text('LOADING PAUSED', '載入暫停');
    hint.textContent = text('Refresh the page to try again.', '請重新整理網頁再試一次。');
    reload.textContent = text('REFRESH', '重新整理網頁');
    reload.hidden = false;
    reload.focus({preventScroll: true});
    reload.focus({preventScroll: true});
  };
  function stopInput(event) {
    if (root.isConnected && event.target !== reload) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  reload.addEventListener('click', () => location.reload());
  window.addEventListener('keydown', stopInput, true);
  window.addEventListener('resize', syncFrame);
  window.addEventListener('error', event => {
    if (event.target?.tagName === 'SCRIPT' || event.target === window) fail();
  }, true);
  document.addEventListener('moth:boot-progress', event => {
    if (!root.isConnected) return;
    const {started = 0, settled = 0} = event.detail || {};
    language = event.detail?.language === 'en' ? 'en' : 'zh-TW';
    syncFrame();
    const key = [started, settled, language].join('/');
    if (key === last || failed) return;
    last = key;
    copy();
    if (started > 0) {
      const done = Math.min(started, settled), percent = Math.round(done / started * 100);
      root.removeAttribute('data-indeterminate');
      root.style.setProperty('--boot-progress', percent + '%');
      meter.setAttribute('aria-valuenow', String(percent));
      label.textContent = 'LOADING ' + done + ' / ' + started;
    }
  });
  document.addEventListener('moth:boot-complete', () => { complete = true; finish(); }, {once: true});
  const ready = () => {
    // Some browsers retain an empty CSSStyleSheet after an HTTP error. It is
    // not a usable game stylesheet and must not dismiss the loading card.
    if (!validStyles()) { fail(); return; }
    stylesheet.media = 'all';
    stylesReady = true;
    syncFrame();
    finish();
  };
  const validStyles = () => {
    try { return (stylesheet.sheet?.cssRules.length || 0) > 0; }
    catch { return false; }
  };
  if (validStyles()) ready();
  else {
    // An early failed CSS request may settle before this small script arrives.
    // Attach listeners before inserting a replacement link, so both a cached
    // response and a pending coalesced request reliably complete the handoff.
    const previous = stylesheet;
    stylesheet = previous.cloneNode();
    stylesheet.addEventListener('load', ready, {once: true});
    stylesheet.addEventListener('error', fail, {once: true});
    previous.after(stylesheet);
    previous.remove();
  }
})();
`;

export function patchBootLoadingRuntime(source) {
  const once = (before, after) => {
    assert.equal(source.split(before).length, 2, 'Boot loader runtime anchor: ' + before.slice(0, 70));
    source = source.replace(before, after);
  };
  once('    const done = Math.min(BOOT_LOAD.settled, total);', `    const done = Math.min(BOOT_LOAD.settled, total);
    document.dispatchEvent(new CustomEvent("moth:boot-progress", {
      detail: { started: total, settled: done, language: this.language }
    }));`);
  once('    this.listenForMenuSounds();\n    requestAnimationFrame(this.loop);', `    this.listenForMenuSounds();
    requestAnimationFrame(this.loop);
    requestAnimationFrame(() => document.dispatchEvent(new CustomEvent("moth:boot-complete")));`);
  return source;
}

export function patchBootLoadingHtml(html, {sri, version}) {
  assert.equal(html.split('<body>').length, 2);
  assert.equal(html.split('<link rel="stylesheet"').length, 2);
  html = html.replace('<link rel="stylesheet"', '<link id="moth-game-styles" rel="stylesheet" media="print"');
  html = html.replace('</head>', '<style id="moth-boot-styles">' + BOOT_LOADING_CSS + '</style>\n  </head>');
  const loader = `<section id="moth-boot-loading" data-indeterminate role="status" aria-live="polite">
      <div class="moth-boot-frame"><div class="moth-boot-content">
        <h1 class="moth-boot-title">DR.BEAUTY</h1>
        <div class="moth-boot-progress" role="progressbar" aria-label="載入遊戲資源" aria-valuemin="0" aria-valuemax="100"><span></span></div>
        <p class="moth-boot-label">LOADING</p>
        <p class="moth-boot-hint">首次載入需要下載遊戲資源，請稍候</p>
        <noscript><p class="moth-boot-hint">請啟用 JavaScript 以開始遊戲。<br>Enable JavaScript to play.</p></noscript>
        <button class="moth-boot-reload" type="button" hidden>重新整理網頁</button>
      </div></div>
      <div class="moth-boot-brand" aria-hidden="true"><strong>MASTER OF THE HOUSE</strong><small>BEAUTY BOY</small><span>全螢幕</span></div>
      <div class="moth-boot-deck" aria-hidden="true"></div>
    </section>`;
  html = html.replace('<body>', '<body>\n    ' + loader);
  html = html.replace('    <script ', `    <script src="/moth/src/boot-loading.js?v=${version}" integrity="${sri}" crossorigin="anonymous"></script>\n    <script `);
  return html;
}
