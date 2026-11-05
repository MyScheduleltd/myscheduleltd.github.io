// Controller input stays on the same key handlers as the keyboard, so menus,
// timing judgment and held-note releases have one implementation. Only the
// browser's standard mapping supplies physical-position names; unknown devices
// expose their actual button/axis numbers and can be configured in Settings.
export const GAMEPAD_ACTIONS = [
  ['M', 'KeyM', 'M / HEAVY', 'M／重攻擊', 3],
  ['O', 'KeyO', 'O / CONFIRM / INTERACT', 'O／確認／互動', 1],
  ['T', 'KeyT', 'T / BLOCK', 'T／格擋', 0],
  ['H', 'KeyH', 'H / BACK / LIGHT', 'H／返回／輕攻擊', 2],
  ['up', 'KeyW', 'UP', '上', 12], ['down', 'KeyS', 'DOWN', '下', 13],
  ['left', 'KeyA', 'LEFT', '左', 14], ['right', 'KeyD', 'RIGHT', '右', 15],
  ['space', 'Space', 'SPACE / JUMP', 'SPACE／跳躍', 5],
  ['pause', 'Escape', 'PAUSE', '暫停', 9],
  ['pocket', 'KeyC', 'POCKET', '口袋', 8],
  ['mount', 'KeyR', 'RIDE / DISMOUNT', '上車／下車', 4]
];

export function patchGamepad(once) {
  once('const HOME_SETTINGS_MENU_ITEMS = [', 'const HOME_SETTINGS_MENU_ITEMS = [\n  { id: "controller", label: "CONTROLLER" },');
  once('      settings: this.tr("SETTINGS", "設定")', '      controller: this.tr("CONTROLLER", "控制器"),\n      settings: this.tr("SETTINGS", "設定")');
  once('    if (this.homeMenu.view === "settings") {\n      if (item.id === "calibrate") {', '    if (this.homeMenu.view === "settings") {\n      if (item.id === "controller") {\n        this.openControllerSettings();\n      } else if (item.id === "calibrate") {');
  once('    this.bindInput();\n', '    this.installGamepadInput();\n    this.bindInput();\n');
  once('  update(dt) {\n', '  update(dt) {\n    this.pollGamepadInput();\n');
  once('  releaseHeldInputs() {\n', '  releaseHeldInputs() {\n    this.resetGamepadInput();\n');
  once('const HOME_SETTINGS_MENU_ITEMS = [', 'const MOTH_GAMEPAD_ACTIONS = ' + JSON.stringify(GAMEPAD_ACTIONS) + ';\nconst HOME_SETTINGS_MENU_ITEMS = [');
}

export const GAMEPAD_METHODS = String.raw`
  installGamepadInput() {
    this.controllerInput = { profiles: {}, down: new Set(), physical: new Set(), previous: new Map(), neutral: true, index: null, id: null };
    try {
      const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY + '.controllers_v1') || '{}');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) this.controllerInput.profiles = saved;
    } catch {}
    // Capture before bindInput's game listeners: releasing either source must
    // not release a key that the other source still holds.
    const keyboard = event => {
      const input = this.controllerInput;
      if (event.mothControllerInput) return;
      if (this.controllerPanel) {
        if (event.type === 'keyup') input.physical.delete(event.code);
        event.stopImmediatePropagation();
        this.handleControllerPanelKey(event);
        return;
      }
      if (event.type === 'keydown') {
        input.physical.add(event.code);
        if (input.down.has(event.code)) event.stopImmediatePropagation();
      } else {
        input.physical.delete(event.code);
        if (input.down.has(event.code)) event.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', keyboard, true);
    window.addEventListener('keyup', keyboard, true);
    const suspend = () => {
      if (this.controllerInput.index != null) this.pauseForControllerDisconnect();
      this.resetGamepadInput();
      this.controllerInput.physical.clear();
    };
    window.addEventListener('blur', suspend);
    document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });
    window.addEventListener('pagehide', suspend);
    window.addEventListener('gamepadconnected', () => this.pollGamepadInput());
    window.addEventListener('gamepaddisconnected', () => this.pollGamepadInput());
  }

  readControllers() {
    try { return [...(navigator.getGamepads?.() || [])].filter(pad => pad && pad.connected); }
    catch { return []; }
  }

  controllerProfileKey(pad) {
    return JSON.stringify([pad.id, pad.mapping || '', pad.buttons.length, pad.axes.length]);
  }

  controllerDefaults(pad) {
    const bindings = {};
    for (const [id, , , , button] of MOTH_GAMEPAD_ACTIONS) {
      bindings[id] = button < pad.buttons.length ? ['b:' + button] : [];
    }
    // Axis assumptions apply only after the browser normalizes the layout.
    if (pad.mapping === 'standard' && pad.axes.length >= 2) {
      bindings.left.push('a:0:-1'); bindings.right.push('a:0:1');
      bindings.up.push('a:1:-1'); bindings.down.push('a:1:1');
    }
    return bindings;
  }

  controllerBindings(pad) {
    const key = this.controllerProfileKey(pad), input = this.controllerInput;
    const saved = input.profiles[key], defaults = this.controllerDefaults(pad);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return defaults;
    for (const [id] of MOTH_GAMEPAD_ACTIONS) {
      if (Array.isArray(saved[id])) defaults[id] = saved[id].filter(token => {
        if (typeof token !== 'string') return false;
        const parts = token.split(':'), index = Number(parts[1]);
        return Number.isInteger(index) && index >= 0 && (parts[0] === 'b' && parts.length === 2 && index < pad.buttons.length
          || parts[0] === 'a' && parts.length === 3 && index < pad.axes.length && ['-1', '1'].includes(parts[2]));
      }).slice(0, 4);
    }
    return defaults;
  }

  controllerRawDown(pad) {
    const raw = new Set(), prior = this.controllerInput.previous.get(pad.index) || new Set();
    pad.buttons.forEach((button, index) => {
      const token = 'b:' + index;
      if (button.pressed || button.value >= (prior.has(token) ? 0.35 : 0.55)) raw.add(token);
    });
    pad.axes.forEach((axis, index) => {
      for (const sign of [-1, 1]) {
        const token = 'a:' + index + ':' + sign;
        if (axis * sign >= (prior.has(token) ? 0.35 : 0.65)) raw.add(token);
      }
    });
    return raw;
  }

  sendControllerKey(code, down) {
    const input = this.controllerInput;
    if (down) input.down.add(code); else input.down.delete(code);
    if (input.physical.has(code)) return;
    // Cabinet Escape belongs to the outer shell. A controller's pause is an
    // in-game action and must not accidentally exit the embedded cabinet.
    if (code === 'Escape') {
      if (down) {
        if (this.state === 'level1OfficePaused') this.resumeLevel1Office();
        else if (this.walkPause) this.resumeWalk();
        else if (this.state === 'title') this.backHomeMenu();
        else this.pauseForControllerDisconnect();
      }
      return;
    }
    const event = new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'mothControllerInput', { value: true });
    window.dispatchEvent(event);
  }

  resetGamepadInput() {
    const input = this.controllerInput;
    if (!input) return;
    for (const code of [...input.down]) this.sendControllerKey(code, false);
    input.neutral = true;
    input.context = null;
    input.repeatAt = 0;
  }

  pauseForControllerDisconnect() {
    if (this.state === 'playing' && this.canPauseLevel1Office()) this.pauseLevel1Office();
    else if (!this.walkPause && this.canPauseWalk?.()) this.pauseWalk();
  }

  pollGamepadInput() {
    const input = this.controllerInput;
    if (!input) return;
    const pads = this.readControllers(), rawByIndex = new Map(pads.map(pad => [pad.index, this.controllerRawDown(pad)]));
    let pad = pads.find(pad => pad.index === input.index && this.controllerProfileKey(pad) === input.id);
    if (!pad && input.index != null) {
      // Pause before keyup: releasing a held note while still in the playing
      // state would count a disconnected controller as an early release.
      this.pauseForControllerDisconnect();
      this.resetGamepadInput();
      input.index = null; input.id = null;
      if (this.controllerCapture) this.cancelControllerCapture(this.tr('Controller disconnected. Reconnect and try again.', '控制器已中斷連線。請重新連線後再試。'));
    }
    // A new edge on a second controller selects it automatically. Merely
    // leaving a stick held on an unused controller never steals control.
    const used = pads.find(other => other.index !== input.index && [...rawByIndex.get(other.index)].some(token => !input.previous.get(other.index)?.has(token)));
    if (used && !this.controllerCapture && input.down.size === 0) pad = used;
    if (!pad) pad = pads[0];
    if (pad && (input.index !== pad.index || input.id !== this.controllerProfileKey(pad))) {
      this.resetGamepadInput();
      input.index = pad.index; input.id = this.controllerProfileKey(pad);
    }
    const raw = pad ? rawByIndex.get(pad.index) : new Set();
    if (this.controllerPanel) this.refreshControllerPanel(pads, pad);
    if (document.hidden || !document.hasFocus() || this.levelLoadingPresentation || this.audioInterruption || this.audioRecoveryVisible()) {
      this.resetGamepadInput();
    } else if (this.controllerCapture) {
      const capture = this.controllerCapture;
      if (performance.now() > capture.expires) this.cancelControllerCapture(this.tr('No input received. Select a control to try again.', '未收到輸入。請選擇按鍵後再試。'));
      else if (!raw.size) capture.ready = true;
      else if (capture.ready) {
        const fresh = [...raw].filter(token => !input.previous.get(pad?.index)?.has(token));
        if (fresh.length === 1) this.assignControllerBinding(pad, fresh[0]);
        else if (fresh.length > 1) this.setControllerPanelMessage(this.tr('Use one button or one stick direction at a time.', '一次請只按一個按鈕，或推動一個搖桿方向。'));
      }
    } else if (pad) {
      const context = this.controllerPanel ? 'controller-settings' : [this.state, this.homeMenu?.view, Boolean(this.homeMenu?.difficultyPick), Boolean(this.walkPause), Boolean(this.pocketOpen), Boolean(this.scoreboard), Boolean(this.memeView)].join('|');
      if (context !== input.context) { this.resetGamepadInput(); input.context = context; }
      if (input.neutral) { if (!raw.size) input.neutral = false; }
      else {
        const bindings = this.controllerBindings(pad), next = new Set();
        for (const [id, code] of MOTH_GAMEPAD_ACTIONS) if (bindings[id].some(token => raw.has(token))) next.add(code);
        const old = new Set(input.down);
        for (const code of old) if (!next.has(code)) this.sendControllerKey(code, false);
        for (const code of next) if (!old.has(code)) {
          if (this.controllerPanel) this.handleControllerPanelAction(code);
          else this.sendControllerKey(code, true);
          // An action may change the screen or open the panel. The remaining
          // controls must await a fresh press in that screen.
          const after = this.controllerPanel ? 'controller-settings' : [this.state, this.homeMenu?.view, Boolean(this.homeMenu?.difficultyPick), Boolean(this.walkPause), Boolean(this.pocketOpen), Boolean(this.scoreboard), Boolean(this.memeView)].join('|');
          if (after !== context) { this.resetGamepadInput(); break; }
        }
        if (this.controllerPanel) input.down = next;
        const direction = [...next].find(code => ['KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(code));
        const menu = this.controllerPanel || this.state === 'title' || this.walkPause || this.pocketOpen || this.state === 'level1OfficePaused';
        if (direction !== input.repeatCode) { input.repeatCode = direction; input.repeatAt = performance.now() + 420; }
        else if (direction && menu && performance.now() >= input.repeatAt && !input.neutral) {
          input.repeatAt = performance.now() + 160;
          if (this.controllerPanel) this.handleControllerPanelAction(direction);
          else this.sendControllerKey(direction, true);
        }
      }
    }
    input.previous = rawByIndex;
  }

  controllerBindingLabel(pad, tokens) {
    if (!tokens?.length) return this.tr('UNASSIGNED', '未設定');
    const standard = [this.tr('SOUTH', '下方'), this.tr('EAST', '右方'), this.tr('WEST', '左方'), this.tr('NORTH', '上方'), 'L1 / LB', 'R1 / RB', 'L2 / LT', 'R2 / RT', 'SELECT', 'START', 'L3', 'R3', 'D-PAD ↑', 'D-PAD ↓', 'D-PAD ←', 'D-PAD →'];
    return tokens.map(token => {
      const [kind, index, sign] = token.split(':');
      if (kind === 'b') return pad.mapping === 'standard' && standard[index] || this.tr('BUTTON ', '按鈕 ') + (Number(index) + 1);
      return this.tr('AXIS ', '軸 ') + (Number(index) + 1) + (sign === '-1' ? ' −' : ' +');
    }).join(' / ');
  }

  openControllerSettings() {
    if (this.controllerPanel) return;
    this.releaseHeldInputs();
    this.controllerInput.physical.clear();
    const panel = document.createElement('section');
    panel.className = 'moth-controller-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'moth-controller-title');
    // Scoped styles follow the game's cream/green home screen. The panel
    // scrolls independently on small phones without covering the close button.
    if (!document.getElementById('moth-controller-style')) {
      const style = document.createElement('style'); style.id = 'moth-controller-style';
      style.textContent = '.moth-controller-panel{position:fixed;inset:0;z-index:2147483000;background:rgba(4,9,7,.96);color:#efe3c4;overflow:auto;padding:20px max(14px,env(safe-area-inset-right)) max(20px,env(safe-area-inset-bottom));box-sizing:border-box;font:700 16px "Courier New","PingFang TC",monospace;text-align:left;touch-action:pan-y}.moth-controller-panel>div{max-width:760px;margin:auto}.moth-controller-panel h2{font-size:25px}.moth-controller-panel p{line-height:1.55;overflow-wrap:anywhere}.moth-controller-panel select,.moth-controller-panel button{font:inherit;min-height:44px;color:#efe3c4;background:#22372a;border:2px solid #b8aa87;border-radius:4px;padding:8px;cursor:pointer}.moth-controller-panel select{width:100%;margin:8px 0}.moth-controller-panel button:focus-visible,.moth-controller-panel select:focus-visible{outline:4px solid #f1c62d;outline-offset:2px}.moth-controller-panel button:disabled{opacity:.5;cursor:default}.moth-controller-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(130px,1fr);gap:8px;align-items:center;margin:9px 0}.moth-controller-row button{overflow-wrap:anywhere}.moth-controller-tools{display:flex;gap:12px;flex-wrap:wrap;position:sticky;bottom:0;background:#07110c;padding:12px 0}.moth-controller-message{color:#f1c62d;min-height:3.1em}';
      document.head.appendChild(style);
    }
    const content = document.createElement('div'); panel.appendChild(content);
    const title = document.createElement('h2'); title.id = 'moth-controller-title'; title.textContent = this.tr('CONTROLLER SETTINGS', '控制器設定'); content.appendChild(title);
    const status = document.createElement('p'); status.className = 'moth-controller-status'; status.setAttribute('role', 'status'); content.appendChild(status);
    const select = document.createElement('select'); select.setAttribute('aria-label', this.tr('Active controller', '目前使用的控制器')); content.appendChild(select);
    select.addEventListener('change', () => {
      const pad = this.readControllers().find(pad => pad.index === Number(select.value));
      if (!pad) return;
      this.cancelControllerCapture(); this.resetGamepadInput();
      this.controllerInput.index = pad.index; this.controllerInput.id = this.controllerProfileKey(pad);
      this.refreshControllerPanel(this.readControllers(), pad, true);
    });
    const hint = document.createElement('p');
    hint.textContent = this.tr('Connect by USB or Bluetooth, then press a controller button. Select a control below, release all controls, then press its new button or move one stick direction. An occupied input swaps controls. M/O/T/H use the same keys as the deck; O confirms and H goes back in menus. Settings are saved for each controller model on this browser. If audio is blocked, tap the screen or press a keyboard key once.', '以 USB 或藍牙連線後，按一下控制器按鈕。選擇下方功能，放開所有按鍵，再按新的按鈕或推動一個搖桿方向。若按鍵已有用途，將交換兩個功能。M／O／T／H 對應遊戲面板；選單中 O 確認、H 返回。設定會依控制器型號儲存在此瀏覽器。若無法播放聲音，請先輕觸螢幕或按一次鍵盤。'); content.appendChild(hint);
    for (const [id, , en, zh] of MOTH_GAMEPAD_ACTIONS) {
      const row = document.createElement('div'); row.className = 'moth-controller-row';
      const label = document.createElement('label'); label.htmlFor = 'moth-bind-' + id; label.textContent = this.tr(en, zh);
      const button = document.createElement('button'); button.id = label.htmlFor; button.type = 'button'; button.dataset.controllerAction = id;
      button.addEventListener('click', () => this.beginControllerCapture(id)); row.append(label, button); content.appendChild(row);
    }
    const message = document.createElement('p'); message.className = 'moth-controller-message'; message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite'); content.appendChild(message);
    const tools = document.createElement('div'); tools.className = 'moth-controller-tools';
    for (const [id, en, zh, action] of [
      ['cancel', 'CANCEL ASSIGNMENT', '取消設定', () => this.cancelControllerCapture()],
      ['reset', 'RESTORE DEFAULTS', '恢復預設', () => this.restoreControllerDefaults()],
      ['close', 'BACK', '返回', () => this.closeControllerSettings()]
    ]) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.controllerTool = id; button.textContent = this.tr(en, zh); button.addEventListener('click', action); tools.appendChild(button);
    }
    content.appendChild(tools);
    panel.addEventListener('pointerdown', event => event.stopPropagation());
    this.controllerPanel = panel; document.body.appendChild(panel);
    this.refreshControllerPanel(this.readControllers(), null, true);
    panel.querySelector('[data-controller-tool="close"]').focus();
  }

  setControllerPanelMessage(text) {
    const target = this.controllerPanel?.querySelector('.moth-controller-message');
    if (target) target.textContent = text || '';
  }

  refreshControllerPanel(pads, pad, force = false) {
    const panel = this.controllerPanel;
    if (!panel) return;
    pad ||= pads.find(p => p.index === this.controllerInput.index);
    const signature = JSON.stringify([pads.map(p => [p.index, p.id, p.mapping]), pad?.index, this.controllerInput.profiles, this.controllerCapture?.action]);
    if (!force && signature === panel.dataset.signature) return;
    panel.dataset.signature = signature;
    panel.querySelector('.moth-controller-status').textContent = pad
      ? this.tr('DETECTED: ', '已偵測：') + pad.id + ' · ' + (pad.mapping === 'standard' ? this.tr('STANDARD LAYOUT', '標準配置') : this.tr('CUSTOM LAYOUT — configure buttons below', '自訂配置－請設定下方按鍵'))
      : typeof navigator.getGamepads !== 'function' ? this.tr('This browser does not expose controllers. Use a browser with Gamepad API support.', '此瀏覽器無法讀取控制器。請使用支援 Gamepad API 的瀏覽器。')
        : this.tr('No controller detected. Connect it and press a button while this page is focused.', '尚未偵測到控制器。連線後，請在此頁面按一下控制器按鈕。');
    const select = panel.querySelector('select'); select.replaceChildren(); select.disabled = !pads.length || Boolean(this.controllerCapture);
    for (const item of pads) {
      const option = document.createElement('option'); option.value = String(item.index); option.textContent = item.id + ' (#' + (item.index + 1) + ')'; option.selected = item.index === pad?.index; select.appendChild(option);
    }
    const bindings = pad ? this.controllerBindings(pad) : {};
    for (const button of panel.querySelectorAll('[data-controller-action]')) {
      const id = button.dataset.controllerAction;
      button.disabled = !pad || Boolean(this.controllerCapture && this.controllerCapture.action !== id);
      button.textContent = this.controllerCapture?.action === id ? this.tr('PRESS NEW INPUT…', '請按新的按鍵…') : pad ? this.controllerBindingLabel(pad, bindings[id]) : '—';
    }
    panel.querySelector('[data-controller-tool="cancel"]').disabled = !this.controllerCapture;
    panel.querySelector('[data-controller-tool="reset"]').disabled = !pad || Boolean(this.controllerCapture);
  }

  beginControllerCapture(action) {
    const pad = this.readControllers().find(p => p.index === this.controllerInput.index);
    if (!pad) return;
    this.resetGamepadInput();
    this.controllerCapture = { action, ready: false, expires: performance.now() + 15000 };
    this.setControllerPanelMessage(this.tr('Release all controls, then press the new button or stick direction. Esc cancels.', '請先放開所有按鍵，再按新的按鈕或推動搖桿。Esc 可取消。'));
    this.refreshControllerPanel(this.readControllers(), pad, true);
  }

  assignControllerBinding(pad, token) {
    const action = this.controllerCapture?.action;
    if (!pad || !action) return;
    const bindings = this.controllerBindings(pad), conflict = MOTH_GAMEPAD_ACTIONS.find(([id]) => id !== action && bindings[id].includes(token));
    // Swap an occupied input with this action's previous inputs. This also
    // lets a four-button controller swap its face buttons without needing an
    // unused fifth button, while every physical input still has one action.
    if (conflict) bindings[conflict[0]] = [...bindings[conflict[0]].filter(item => item !== token), ...bindings[action]];
    bindings[action] = [token]; this.controllerInput.profiles[this.controllerProfileKey(pad)] = bindings;
    const saved = this.saveControllerProfiles();
    this.controllerCapture = null; this.resetGamepadInput();
    const swap = conflict ? this.tr(' Swapped with ', ' 已交換：') + this.tr(conflict[2], conflict[3]) + '.' : '';
    this.setControllerPanelMessage((saved ? this.tr('Saved. Release the button before continuing.', '已儲存。請放開按鈕後再繼續。') : this.tr('Applied for this session. Browser storage is unavailable.', '已套用於本次遊戲。瀏覽器無法儲存設定。')) + swap);
    this.refreshControllerPanel(this.readControllers(), pad, true);
  }

  saveControllerProfiles() {
    try { localStorage.setItem(PROGRESS_KEY + '.controllers_v1', JSON.stringify(this.controllerInput.profiles)); return true; }
    catch { return false; }
  }

  cancelControllerCapture(message = '') {
    this.controllerCapture = null; this.resetGamepadInput(); this.setControllerPanelMessage(message);
    if (this.controllerPanel) this.refreshControllerPanel(this.readControllers(), null, true);
  }

  restoreControllerDefaults() {
    const pad = this.readControllers().find(p => p.index === this.controllerInput.index);
    if (!pad) return;
    delete this.controllerInput.profiles[this.controllerProfileKey(pad)];
    const saved = this.saveControllerProfiles(); this.resetGamepadInput();
    this.setControllerPanelMessage(saved ? this.tr('Defaults restored.', '已恢復預設。') : this.tr('Defaults restored for this session. Browser storage is unavailable.', '本次遊戲已恢復預設。瀏覽器無法儲存設定。'));
    this.refreshControllerPanel(this.readControllers(), pad, true);
  }

  closeControllerSettings() {
    this.cancelControllerCapture();
    this.controllerPanel?.remove(); this.controllerPanel = null; this.resetGamepadInput();
    this.homeMenu.index = Math.max(0, this.getHomeMenuItems().findIndex(item => item.id === 'controller'));
    canvas.focus?.();
  }

  handleControllerPanelKey(event) {
    if (event.type !== 'keydown') return;
    if (event.code === 'Escape') {
      event.preventDefault(); if (this.controllerCapture) this.cancelControllerCapture(); else this.closeControllerSettings();
      return;
    }
    if (event.code === 'Tab') {
      const controls = [...this.controllerPanel.querySelectorAll('button:not(:disabled),select:not(:disabled)')];
      const index = controls.indexOf(document.activeElement);
      if (event.shiftKey && index <= 0 || !event.shiftKey && index === controls.length - 1) {
        event.preventDefault(); controls[event.shiftKey ? controls.length - 1 : 0]?.focus();
      }
      return;
    }
    if (this.controllerCapture) { event.preventDefault(); return; }
    const map = { ArrowUp: 'KeyW', ArrowDown: 'KeyS', KeyW: 'KeyW', KeyS: 'KeyS', KeyO: 'KeyO', KeyH: 'KeyH' };
    if (map[event.code]) { event.preventDefault(); this.handleControllerPanelAction(map[event.code]); }
    // Enter and Space retain native button/select keyboard behavior.
  }

  handleControllerPanelAction(code) {
    if (!this.controllerPanel || this.controllerCapture) return;
    const controls = [...this.controllerPanel.querySelectorAll('button:not(:disabled),select:not(:disabled)')];
    if (code === 'KeyH' || code === 'Escape') { this.closeControllerSettings(); return; }
    const active = document.activeElement;
    if (code === 'KeyO' || code === 'Space') { active?.click?.(); return; }
    if (['KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(code)) {
      const delta = ['KeyW', 'KeyA'].includes(code) ? -1 : 1;
      const index = controls.indexOf(active);
      const next = controls[(index + delta + controls.length) % controls.length];
      next?.focus(); next?.scrollIntoView({ block: 'nearest' });
    }
  }
`;
