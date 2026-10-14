/* Public M.O.T.H arcade hosting. The game and its controls remain private. */
(() => {
  'use strict';
  if (window.parent === window || new URLSearchParams(window.location.search).get('arcade') !== '1') return;
  let parentOrigin;
  try {
    const parent = new URL(document.referrer);
    const local = host => host === '127.0.0.1' || host === 'localhost';
    const trusted = parent.origin === 'https://myscheduleltd.com'
      || (local(window.location.hostname) && local(parent.hostname) && parent.protocol === 'http:');
    if (!trusted) return;
    parentOrigin = parent.origin;
  } catch { return; }
  document.documentElement.dataset.arcadePlay = 'true';
  const gameKey = code => typeof code === 'string'
    && /^(Arrow(?:Up|Down|Left|Right)|Key[ADWHSMOTRBPC]|Digit[1-9]|Enter|Space)$/.test(code);
  const held = new Set();
  window.addEventListener('keydown', event => {
    if (event.code === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation();
      window.parent.postMessage({ type: 'moth-arcade-exit' }, parentOrigin);
    } else if (gameKey(event.code)) held.add(event.code);
  }, { capture: true });
  window.addEventListener('keyup', event => held.delete(event.code), { capture: true });
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.origin !== parentOrigin) return;
    const data = event.data;
    if (data?.type === 'moth-arcade-release') {
      // The game stays private: deliver the same key releases its native input
      // handlers expect instead of reaching into an exported game instance.
      for (const code of [...held]) window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
      held.clear();
      return;
    }
    if (data?.type !== 'moth-arcade-key' || !gameKey(data.code)
      || !['keydown', 'keyup'].includes(data.eventType)) return;
    // This fallback is only for keys whose focus landed outside the frame.
    // Native in-frame keys never bubble into the parent and remain untouched.
    window.dispatchEvent(new KeyboardEvent(data.eventType, {
      code: data.code, key: typeof data.key === 'string' ? data.key.slice(0, 32) : '',
      repeat: data.repeat === true, shiftKey: data.shiftKey === true,
      bubbles: true, cancelable: true,
    }));
  });
  window.addEventListener('load', () => {
    window.parent.postMessage({ type: 'moth-arcade-ready' }, parentOrigin);
  }, { once: true });
})();
