
export const ACTION_MOVES = [
  { id: 'groove', zh: 'Breaking', en: 'Breaking', icon: 'dance' },
  { id: 'sit-ground', zh: '坐下休息', en: 'SIT ON THE GROUND', icon: 'sit' },
] as const;
export type ActionMove = typeof ACTION_MOVES[number]['id'];
export interface ActionMenuOptions {
  active?: ActionMove | 'chair-sit' | 'recline';
  canGroundSit: boolean;
}

/** Pointer, keyboard and gamepad all choose the same visible actions. */
export class ActionMenu {
  private selected = 0;
  private readonly overlay = document.createElement('div');
  private readonly previousFocus = document.activeElement as HTMLElement | null;
  private readonly options: ActionMenuOptions;
  constructor(root: HTMLElement, zh: boolean, options: ActionMenuOptions | boolean,
    private readonly select: (move: ActionMove | 'stop') => void,
    private readonly dismiss: () => void) {
    this.options = typeof options === 'boolean' ? { active: options ? 'groove' : undefined, canGroundSit: true } : options;
    this.overlay.className = 'dance-selector action-menu';
    this.overlay.innerHTML = `<section class="dance-selector__card action-menu__card" role="dialog" aria-modal="true" aria-labelledby="action-title">
      <h2 id="action-title">${zh ? '選擇動作' : 'CHOOSE A MOVE'}</h2>
      <div class="dance-wheel action-menu__wheel" role="group" aria-label="${zh ? '動作' : 'Actions'}">
        <div class="dance-wheel__centre" aria-hidden="true"><strong>ACTION</strong></div>
        ${[180, 270].map(angle => `<div class="action-menu__unused" style="--angle:${angle}deg" aria-hidden="true"></div>`).join('')}
        ${ACTION_MOVES.map((move, i) => `<button type="button" class="dance-wheel__move action-menu__move action-menu__move--${move.icon}" style="--angle:${i * 90}deg" data-action="${i}" aria-label="${zh ? move.zh : move.en}" ${move.id === 'sit-ground' && !this.options.canGroundSit ? 'disabled aria-describedby="action-water-note"' : ''} aria-pressed="false">
          <span class="action-menu__move-content"><svg viewBox="0 0 64 56" aria-hidden="true">${move.icon === 'dance'
            ? '<circle cx="24" cy="37" r="4"/><path d="M30 30L39 22L46 10L57 7M39 22L28 16L22 5M30 30L38 37L36 48L43 48M30 30L19 25L10 30M5 50H59"/>'
            : '<circle cx="29" cy="12" r="5"/><path d="M29 21L25 35L37 35L45 45L57 45M25 35L16 43L6 43M28 24L39 29L45 23M5 50H59"/>'}</svg>
          <span class="action-menu__label">${zh ? move.zh : move.id === 'sit-ground' ? 'SIT ON<br>THE GROUND' : move.en}</span></span>
        </button>`).join('')}
      </div>
      ${!this.options.canGroundSit ? `<p id="action-water-note" class="action-menu__note">${zh ? '回到陸地後，就能坐下休息。' : 'STEP ONTO DRY GROUND TO SIT DOWN.'}</p>` : ''}
      <p class="action-menu__hint">${zh ? '點選動作或按 Enter · 移動即起身或停止' : 'CLICK A MOVE OR PRESS ENTER · MOVE TO GET UP OR STOP'}</p>
      <div class="dance-selector__actions action-menu__footer">${this.options.active ? `<button type="button" data-stop-action>${zh ? (this.options.active === 'groove' ? '停止跳舞' : '起身') : (this.options.active === 'groove' ? 'STOP DANCING' : 'GET UP')}</button>` : ''}<button type="button" data-cancel-action>${zh ? '關閉' : 'CLOSE'} <kbd>B / ESC</kbd></button></div>
    </section>`;
    this.buttons().forEach((button, i) => {
      button.addEventListener('pointerenter', () => { if (!button.disabled) this.highlight(i); });
      button.addEventListener('focus', () => { if (!button.disabled) this.highlight(i); });
      button.addEventListener('click', () => { if (!button.disabled) this.select(ACTION_MOVES[i].id); });
    });
    this.overlay.querySelector('[data-stop-action]')?.addEventListener('click', () => this.select('stop'));
    this.overlay.querySelector('[data-cancel-action]')?.addEventListener('click', this.dismiss);
    this.overlay.addEventListener('pointerdown', event => { if (event.target === this.overlay) this.dismiss(); });
    root.append(this.overlay);
    window.addEventListener('keydown', this.keyDown, true);
    this.highlight(0); this.buttons()[0]?.focus();
  }
  private buttons(): HTMLButtonElement[] { return [...this.overlay.querySelectorAll<HTMLButtonElement>('[data-action]')]; }
  private highlight(index: number): void {
    const buttons = this.buttons();
    for (let attempt = 0; attempt < buttons.length; attempt++) {
      const candidate = ((index % buttons.length) + buttons.length) % buttons.length;
      if (!buttons[candidate].disabled) { this.selected = candidate; break; }
      index += index < this.selected ? -1 : 1;
    }
    buttons.forEach((button, i) => { button.classList.toggle('is-selected', i === this.selected); button.setAttribute('aria-pressed', String(i === this.selected)); });
  }
  navigate(nav: 'up' | 'down' | 'confirm' | 'back' | 'toggle'): void {
    if (nav === 'confirm') { const button = this.buttons()[this.selected]; if (!button.disabled) this.select(ACTION_MOVES[this.selected].id); }
    else if (nav === 'back' || nav === 'toggle') this.dismiss();
    else { this.highlight(this.selected + (nav === 'up' ? -1 : 1)); this.buttons()[this.selected]?.focus(); }
  }
  private readonly keyDown = (event: KeyboardEvent): void => {
    event.stopImmediatePropagation();
    const key = event.key.toLowerCase();
    event.preventDefault();
    if (event.repeat) return;
    if (key === 'b' || key === 'escape') this.dismiss();
    else if (key === 'enter' || key === ' ') (document.activeElement as HTMLElement)?.click();
    else if (key.startsWith('arrow')) this.navigate(key === 'arrowleft' || key === 'arrowup' ? 'up' : 'down');
    else if (key === 'tab') {
      const buttons = [...this.overlay.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
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
