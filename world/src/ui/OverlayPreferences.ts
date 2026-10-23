export const DESKTOP_ACTIONS_KEY = 'myschedule-desktop-actions-v1';
export function readDesktopActions(storage?: Pick<Storage, 'getItem'>): boolean { try { return (storage ?? localStorage).getItem(DESKTOP_ACTIONS_KEY) === '1'; } catch { return false; } }
export function saveDesktopActions(value: boolean, storage?: Pick<Storage, 'setItem'>): void { try { (storage ?? localStorage).setItem(DESKTOP_ACTIONS_KEY, value ? '1' : '0'); } catch { /* Optional local preference. */ } }
/**
 * What DROP THE BEAT in the PASS menu does (owner, 2026-10-23). It used to
 * float at the top of the screen whenever the record could not yet be heard,
 * which was the start of every record; now it is asked for. With no record on
 * it says so; where the jukebox is silent by design (a theatre, the club, the
 * deck, a film on a phone) it says where to hear it; when the record can
 * already be heard it does nothing; otherwise it starts the record's sound.
 */
export type DropBeatAction = 'no-music' | 'outdoors-only' | 'already-playing' | 'start';
export function dropBeatAction(state: { recordOn: boolean; silentHere: boolean; audible: boolean }): DropBeatAction {
  if (!state.recordOn) return 'no-music';
  if (state.silentHere) return 'outdoors-only';
  return state.audible ? 'already-playing' : 'start';
}
export function drinkStatusText(count: number, zh: boolean): string { const n = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0)); return zh ? `已喝 ${n} 杯` : `${n} ${n === 1 ? 'DRINK' : 'DRINKS'}`; }
