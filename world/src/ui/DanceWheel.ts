/** Move definitions are shared by pointer, keyboard and controller selection. */
export const DANCE_MOVES = [{id: 'groove', zh: '律動舞', en: 'GROOVE'}] as const;
export type DanceMove = typeof DANCE_MOVES[number]['id'];

export class DanceWheel {
  private selected = 0;
  private readonly overlay = document.createElement('div');
  private readonly previousFocus = document.activeElement as HTMLElement | null;
  constructor(root: HTMLElement, zh: boolean, dancing: boolean,
    private readonly select: (move: DanceMove | 'stop') => void,
    private readonly dismiss: () => void) {
    this.overlay.className = 'dance-selector';
    this.overlay.innerHTML = `<section class="dance-selector__card" role="dialog" aria-modal="true" aria-labelledby="dance-title">
      <h2 id="dance-title">${zh ? '選擇舞步' : 'CHOOSE A DANCE'}</h2>
      <div class="dance-wheel" role="group" aria-label="${zh ? '舞步' : 'Dance moves'}">
        <div class="dance-wheel__centre" aria-hidden="true"><span>♪</span><strong>${zh ? '舞步' : 'DANCE'}</strong></div>
        ${DANCE_MOVES.map((move, i) => `<button type="button" class="dance-wheel__move" data-dance="${i}" style="--angle:${i * 360 / DANCE_MOVES.length}deg" aria-label="${zh ? move.zh : move.en}">
          <svg viewBox="0 0 48 56" aria-hidden="true"><circle cx="25" cy="8" r="5"/><path d="M23 18L17 32L6 27M23 18L33 24L42 17M17 32L29 37L22 50M17 32L8 48"/></svg><span>${zh ? move.zh : move.en}</span></button>`).join('')}
      </div>
      <p>${zh ? '點選舞步或按 Enter · 移動即停止' : 'CLICK A MOVE OR PRESS ENTER · MOVE TO STOP'}</p>
      <div class="dance-selector__actions">${dancing ? `<button type="button" data-stop-dance>${zh ? '停止跳舞' : 'STOP DANCING'}</button>` : ''}<button type="button" data-cancel-dance>${zh ? '取消' : 'CANCEL'} <kbd>B / ESC</kbd></button></div>
    </section>`;
    this.overlay.querySelectorAll<HTMLButtonElement>('[data-dance]').forEach((button, i) => {
      button.addEventListener('pointerenter', () => this.highlight(i));
      button.addEventListener('focus', () => this.highlight(i));
      button.addEventListener('click', () => this.choose());
    });
    this.overlay.querySelector('[data-stop-dance]')?.addEventListener('click', () => this.select('stop'));
    this.overlay.querySelector('[data-cancel-dance]')?.addEventListener('click', this.dismiss);
    this.overlay.addEventListener('pointerdown', event => { if (event.target === this.overlay) this.dismiss(); });
    root.append(this.overlay);
    window.addEventListener('keydown', this.keyDown, true);
    this.highlight(0);
    this.overlay.querySelector<HTMLButtonElement>('[data-dance]')?.focus();
  }
  private highlight(index: number): void {
    this.selected = (index + DANCE_MOVES.length) % DANCE_MOVES.length;
    this.overlay.querySelectorAll('[data-dance]').forEach((button, i) => {
      button.classList.toggle('is-selected', i === this.selected);
      button.setAttribute('aria-pressed', String(i === this.selected));
    });
  }
  navigate(nav: 'up' | 'down' | 'confirm' | 'back' | 'toggle'): void {
    if (nav === 'confirm') this.choose();
    else if (nav === 'back' || nav === 'toggle') this.dismiss();
    else this.highlight(this.selected + (nav === 'up' ? -1 : 1));
  }
  private choose(): void { this.select(DANCE_MOVES[this.selected].id); }
  private readonly keyDown = (event: KeyboardEvent): void => {
    // Capture prevents a menu press from also jumping, moving or opening chat.
    event.stopImmediatePropagation();
    const key = event.key.toLowerCase();
    if (key !== 'tab') event.preventDefault();
    if (event.repeat) return;
    if (key === 'b' || key === 'escape') this.dismiss();
    else if (key === 'enter' || key === ' ') (document.activeElement as HTMLElement)?.click();
    else if (key.startsWith('arrow')) {
      this.highlight(this.selected + (key === 'arrowleft' || key === 'arrowup' ? -1 : 1));
      this.overlay.querySelector<HTMLButtonElement>(`[data-dance="${this.selected}"]`)?.focus();
    } else if (key === 'tab') {
      event.preventDefault();
      const buttons = [...this.overlay.querySelectorAll<HTMLButtonElement>('button')];
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    }
  };
  close(): void {
    window.removeEventListener('keydown', this.keyDown, true);
    this.overlay.remove();
    if (this.previousFocus?.isConnected) this.previousFocus.focus();
  }
}
