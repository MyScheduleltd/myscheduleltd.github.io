/** Personal display preference only. Never part of the festival/network state. */
export const NOIR_PREFERENCE_KEY = 'myschedule-noir-mode-v1';
type ReadStorage = Pick<Storage, 'getItem'>;
type WriteStorage = Pick<Storage, 'setItem'>;

export function readNoirPreference(storage?: ReadStorage): boolean {
  try { return (storage ?? window.localStorage).getItem(NOIR_PREFERENCE_KEY) === '1'; }
  catch { return false; }
}

export function saveNoirPreference(enabled: boolean, storage?: WriteStorage): void {
  try { (storage ?? window.localStorage).setItem(NOIR_PREFERENCE_KEY, enabled ? '1' : '0'); }
  catch { /* The switch still works when private browsing denies persistence. */ }
}

/** The document root includes WebGL, CSS3D/YouTube and body-mounted sheets.
 * Unlike a filter on body/#app, a root filter does not establish a new fixed
 * containing block. Native fullscreen video and immersive XR leave this DOM.
 */
export function applyNoirMode(root: Pick<HTMLElement, 'dataset'>, enabled: boolean): void {
  root.dataset.noir = enabled ? 'on' : 'off';
}

export function noirButtonMarkup(enabled: boolean, zh: boolean): string {
  const label = zh ? '黑白電影 / NOIR' : 'NOIR / 黑白電影';
  const state = enabled ? 'ON' : 'OFF';
  return `<button type="button" class="festival-pass__noir" data-noir-toggle aria-pressed="${enabled}" aria-label="${label}: ${state}">
    <svg class="festival-pass__power" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v10M6.3 5.5a9 9 0 1 0 11.4 0" /></svg>
    <span class="festival-pass__noir-label">${label}</span><small data-noir-status>${state}</small>
  </button>`;
}

/** Update in place, preserving PASS scroll position and keyboard focus. */
export function syncNoirButton(button: HTMLButtonElement, enabled: boolean, zh: boolean): void {
  const label = zh ? '黑白電影 / NOIR' : 'NOIR / 黑白電影';
  const state = enabled ? 'ON' : 'OFF';
  button.setAttribute('aria-pressed', String(enabled));
  button.setAttribute('aria-label', `${label}: ${state}`);
  const status = button.querySelector<HTMLElement>('[data-noir-status]');
  if (status) status.textContent = state;
}
