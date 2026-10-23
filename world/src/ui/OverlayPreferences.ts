export const DESKTOP_ACTIONS_KEY = 'myschedule-desktop-actions-v1';
export const JUKEBOX_PROMPT_MIN_MS = 6_000;
export interface JukeboxPromptMemory { key?: string; shownAt?: number; audibleSince?: number; dismissed?: boolean; }
export function readDesktopActions(storage?: Pick<Storage, 'getItem'>): boolean { try { return (storage ?? localStorage).getItem(DESKTOP_ACTIONS_KEY) === '1'; } catch { return false; } }
export function saveDesktopActions(value: boolean, storage?: Pick<Storage, 'setItem'>): void { try { (storage ?? localStorage).setItem(DESKTOP_ACTIONS_KEY, value ? '1' : '0'); } catch { /* Optional local preference. */ } }
/** A new iframe must earn its own stable playback acknowledgement. An unmute
 * report on a buffering/suspended video cannot dismiss the recovery button. */
export function jukeboxPromptVisible(memory: JukeboxPromptMemory, key: string | undefined, wantsSound: boolean, audibleAndPlaying: boolean, now: number): boolean {
  if (!key || !wantsSound) { memory.key = undefined; memory.shownAt = undefined; memory.audibleSince = undefined; memory.dismissed = false; return false; }
  if (memory.key !== key) { memory.key = key; memory.shownAt = now; memory.audibleSince = undefined; memory.dismissed = false; }
  if (!audibleAndPlaying) { memory.audibleSince = undefined; memory.dismissed = false; return true; }
  memory.audibleSince ??= now;
  if (now - (memory.shownAt ?? now) >= JUKEBOX_PROMPT_MIN_MS && now - memory.audibleSince >= 1_500) memory.dismissed = true;
  return !memory.dismissed;
}
export function drinkStatusText(count: number, zh: boolean): string { const n = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0)); return zh ? `已喝 ${n} 杯` : `${n} ${n === 1 ? 'DRINK' : 'DRINKS'}`; }
