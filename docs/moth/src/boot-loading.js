(() => {
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
