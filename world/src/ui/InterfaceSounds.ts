import type { AmbientAudio } from '../world/AmbientAudio';

/**
 * The click and hover of every menu, prompt and button, the sign-in page's
 * included (owner, 2026-10-17).
 *
 * One delegated listener on the document rather than one per control: the
 * panels are re-rendered all the time, and a sound wired to the button that
 * was there at start-up would be gone the first time that happened.
 *
 * Text fields and sliders stay silent. They are not choices, and a hover
 * sound on the volume sliders would be the one thing they adjust.
 */
const PRESSABLE = [
  'button', 'a[href]', 'summary',
  'input[type="checkbox"]', 'input[type="radio"]', 'input[type="button"]', 'input[type="submit"]',
  '[role="button"]', '[role="tab"]', '[role="menuitem"]', '[role="menuitemradio"]', '[role="menuitemcheckbox"]',
  '[role="option"]', '[role="switch"]', '[role="checkbox"]', '[role="radio"]',
].join(', ');
const HOVERABLE = `${PRESSABLE}, select`;

/** A focus this soon after a press came from the press, not from a keyboard or a controller. */
const POINTER_FOCUS_MS = 600;

const live = (element: Element | null): element is HTMLElement =>
  element instanceof HTMLElement
  && !element.matches(':disabled, [aria-disabled="true"]')
  && !element.closest('[inert], [hidden]');

export function installInterfaceSounds(audio: AmbientAudio, root: Document = document): () => void {
  let hovered: Element | null = null;
  let pressedAt = -Infinity;
  const find = (target: EventTarget | null, selector: string): HTMLElement | null => {
    const element = target instanceof Element ? target.closest(selector) : null;
    return live(element) ? element : null;
  };

  // Browsers start sound only from inside a gesture, so every gesture offers.
  const unlock = (): void => audio.unlock();
  const press = (): void => { pressedAt = performance.now(); unlock(); };

  const click = (event: MouseEvent): void => {
    if (find(event.target, PRESSABLE)) audio.playInterfaceSound('click');
  };
  // A list box's click opens it; choosing from it is the press that counts.
  const change = (event: Event): void => {
    if (event.target instanceof HTMLSelectElement && live(event.target)) audio.playInterfaceSound('click');
  };
  const over = (event: PointerEvent): void => {
    // Phones have no hover: a tap reports one, which would sound twice.
    if (event.pointerType !== 'mouse') return;
    const element = find(event.target, HOVERABLE);
    if (element && element !== hovered) audio.playInterfaceSound('hover');
    hovered = element;
  };
  // Walking a menu with the keyboard or a controller moves focus instead.
  const focus = (event: FocusEvent): void => {
    if (performance.now() - pressedAt < POINTER_FOCUS_MS) return;
    const element = find(event.target, HOVERABLE);
    if (element && element !== hovered) audio.playInterfaceSound('hover');
    if (element) hovered = element;
  };

  root.addEventListener('pointerdown', press, true);
  root.addEventListener('pointerup', unlock, true);
  root.addEventListener('touchend', unlock, true);
  root.addEventListener('keydown', unlock, true);
  root.addEventListener('click', click, true);
  root.addEventListener('change', change, true);
  root.addEventListener('pointerover', over, true);
  root.addEventListener('focusin', focus, true);
  return () => {
    root.removeEventListener('pointerdown', press, true);
    root.removeEventListener('pointerup', unlock, true);
    root.removeEventListener('touchend', unlock, true);
    root.removeEventListener('keydown', unlock, true);
    root.removeEventListener('click', click, true);
    root.removeEventListener('change', change, true);
    root.removeEventListener('pointerover', over, true);
    root.removeEventListener('focusin', focus, true);
  };
}
