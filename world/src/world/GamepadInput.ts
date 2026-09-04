/**
 * Game controllers, through the browser's own Gamepad API.
 *
 * Sticks walk and look; buttons do the things `E`, `SPACE` and the touch ring
 * already do. Three of the bindings are for menus instead — START opens PASS,
 * the D-pad moves the highlight — and while a panel is open the world reads
 * those and ignores the rest, so confirming a menu choice cannot also feed
 * MENTOR behind it. Where the highlight actually goes belongs to the interface;
 * this only reports the presses.
 *
 * Nothing is polled until a pad announces itself. `gamepadconnected` is the
 * signal; a browser will not even list a pad until a button has been pressed on
 * it, so a controller sitting idle costs this nothing at all.
 */

/** Every action a button can be bound to. One button each, by design. */
export type GamepadActionId =
  | 'jump'
  | 'interact'
  | 'pickUp'
  | 'punch'
  | 'offer'
  | 'camera'
  | 'photo'
  | 'run'
  | 'dance'
  // Menu bindings. Listed here so they share the same rebinding machinery, but
  // read only while a panel is open.
  | 'menuToggle'
  | 'menuUp'
  | 'menuDown';

export const GAMEPAD_ACTIONS: GamepadActionId[] = [
  'jump', 'interact', 'pickUp', 'punch', 'offer', 'camera', 'photo', 'run', 'dance',
  'menuToggle', 'menuUp', 'menuDown',
];

/**
 * Which button each action starts on, as indices into the **standard mapping**
 * — the layout the browser normalises every recognised pad into, so these mean
 * the same physical button on an Xbox pad and a DualSense alike.
 */
export const DEFAULT_BINDINGS: Record<GamepadActionId, number> = {
  jump: 0,      // A / ✕
  punch: 1,     // B / ○
  interact: 2,  // X / □
  pickUp: 3,    // Y / △
  offer: 4,     // LB / L1
  camera: 5,    // RB / R1
  photo: 6,     // LT / L2
  run: 7,       // RT / R2 — held, which is what a trigger is for
  dance: 10,    // L3, the left stick pressed in
  menuToggle: 9,  // MENU / OPTIONS — opens and closes PASS
  menuUp: 12,     // D-pad up
  menuDown: 13,   // D-pad down
};

/**
 * Button names, per family. The **indices** are standardised; the **labels** are
 * not, and a panel that says "button 2" to somebody holding a DualSense has
 * told them nothing.
 */
const XBOX_LABELS: Record<number, string> = {
  0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
  8: 'VIEW', 9: 'MENU', 10: 'L3', 11: 'R3',
  12: 'D-PAD ↑', 13: 'D-PAD ↓', 14: 'D-PAD ←', 15: 'D-PAD →', 16: 'XBOX',
};

const PLAYSTATION_LABELS: Record<number, string> = {
  0: '✕', 1: '○', 2: '□', 3: '△', 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2',
  8: 'CREATE', 9: 'OPTIONS', 10: 'L3', 11: 'R3',
  12: 'D-PAD ↑', 13: 'D-PAD ↓', 14: 'D-PAD ←', 15: 'D-PAD →', 16: 'PS',
};

export type GamepadFamily = 'xbox' | 'playstation' | 'generic';

/** Both names, so the controls panel can print either without guessing. */
export function buttonLabel(index: number, family: GamepadFamily): string {
  if (family === 'playstation') return PLAYSTATION_LABELS[index] ?? `BUTTON ${index}`;
  if (family === 'xbox') return XBOX_LABELS[index] ?? `BUTTON ${index}`;
  const xbox = XBOX_LABELS[index];
  const sony = PLAYSTATION_LABELS[index];
  if (!xbox || !sony) return `BUTTON ${index}`;
  return xbox === sony ? xbox : `${xbox} / ${sony}`;
}

/**
 * Sticks rest a long way from centre on a worn pad, so a deadzone is not
 * optional: without one the avatar walks slowly forever and the view drifts.
 * Radial rather than per-axis, or the corners of the deadzone leak diagonals.
 */
const STICK_DEADZONE = 0.18;

function applyDeadzone(x: number, y: number): [number, number] {
  const magnitude = Math.hypot(x, y);
  if (magnitude < STICK_DEADZONE) return [0, 0];
  // Rescaled so the first movement past the deadzone is gentle rather than a
  // jump to eighteen per cent.
  const scaled = (magnitude - STICK_DEADZONE) / (1 - STICK_DEADZONE);
  const curved = scaled * scaled; // squared: fine control near centre, full tilt still full speed
  return [(x / magnitude) * curved, (y / magnitude) * curved];
}

export interface GamepadFrame {
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  /** Actions that went down this frame. */
  pressed: Set<GamepadActionId>;
  /** Actions currently held. */
  held: Set<GamepadActionId>;
}

export class GamepadInput {
  private bindings: Record<GamepadActionId, number> = { ...DEFAULT_BINDINGS };
  private previous: boolean[] = [];
  private connectedIndex?: number;
  private familyCache: GamepadFamily = 'generic';
  private padName = '';
  /** Set while the controls panel is waiting for a button to bind. */
  private listening?: (button: number) => void;

  private readonly onConnect = (event: Event): void => {
    const pad = (event as GamepadEvent).gamepad;
    this.connectedIndex = pad.index;
    this.padName = pad.id;
    this.familyCache = GamepadInput.familyOf(pad.id);
  };

  private readonly onDisconnect = (event: Event): void => {
    if ((event as GamepadEvent).gamepad.index !== this.connectedIndex) return;
    this.connectedIndex = undefined;
    this.padName = '';
    this.previous = [];
  };

  start(bindings?: Partial<Record<GamepadActionId, number>>): void {
    if (bindings) this.bindings = { ...DEFAULT_BINDINGS, ...bindings };
    window.addEventListener('gamepadconnected', this.onConnect);
    window.addEventListener('gamepaddisconnected', this.onDisconnect);
  }

  stop(): void {
    window.removeEventListener('gamepadconnected', this.onConnect);
    window.removeEventListener('gamepaddisconnected', this.onDisconnect);
    this.connectedIndex = undefined;
    this.previous = [];
  }

  setBinding(action: GamepadActionId, button: number): void {
    this.bindings[action] = button;
  }

  currentBindings(): Record<GamepadActionId, number> {
    return { ...this.bindings };
  }

  connected(): boolean {
    return this.pad() !== undefined;
  }

  family(): GamepadFamily {
    return this.familyCache;
  }

  name(): string {
    return this.padName;
  }

  /** Take the next button press instead of acting on it, for rebinding. */
  listenForButton(handler: (button: number) => void): void {
    this.listening = handler;
  }

  cancelListening(): void {
    this.listening = undefined;
  }

  private static familyOf(id: string): GamepadFamily {
    const lower = id.toLowerCase();
    if (/dualsense|dualshock|playstation|sony|054c/.test(lower)) return 'playstation';
    if (/xbox|xinput|microsoft|045e/.test(lower)) return 'xbox';
    return 'generic';
  }

  private pad(): Gamepad | undefined {
    if (!navigator.getGamepads) return undefined;
    const pads = navigator.getGamepads();
    if (this.connectedIndex !== undefined) {
      const known = pads[this.connectedIndex];
      if (known?.connected) return known;
    }
    // A pad that was already held when the page loaded never fires
    // `gamepadconnected`, so fall back to whatever the browser is listing.
    for (const pad of pads) {
      if (pad?.connected) {
        this.connectedIndex = pad.index;
        this.padName = pad.id;
        this.familyCache = GamepadInput.familyOf(pad.id);
        return pad;
      }
    }
    return undefined;
  }

  /** Read the pad once. Returns undefined when there is nothing to read. */
  poll(): GamepadFrame | undefined {
    const pad = this.pad();
    if (!pad) return undefined;
    const buttons = pad.buttons.map((button) => button.pressed || button.value > 0.5);

    if (this.listening) {
      for (let index = 0; index < buttons.length; index += 1) {
        if (buttons[index] && !this.previous[index]) {
          const handler = this.listening;
          this.listening = undefined;
          this.previous = buttons;
          handler(index);
          return undefined;
        }
      }
      this.previous = buttons;
      return undefined;
    }

    const pressed = new Set<GamepadActionId>();
    const held = new Set<GamepadActionId>();
    for (const action of GAMEPAD_ACTIONS) {
      const index = this.bindings[action];
      if (buttons[index]) {
        held.add(action);
        if (!this.previous[index]) pressed.add(action);
      }
    }
    this.previous = buttons;

    const [moveX, moveY] = applyDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    const [lookX, lookY] = applyDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0);
    return { moveX, moveY, lookX, lookY, pressed, held };
  }
}
