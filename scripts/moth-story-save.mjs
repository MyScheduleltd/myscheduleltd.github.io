// Story mode keeps its place (owner, 2026-10-18: players could not use the
// main menu's 繼續 to get back to their story).
//
// The release kept a story only for the browser session ("closing the tab
// wipes everything"), and an iPhone ends that session whenever Safari is
// closed, the tab is cleared in the background or the game is opened from a
// home-screen icon. The story is now kept on the device, in the same keys,
// until the player starts a new one; a story still in a session from before
// the change is moved over. It stays on the phone: nothing more reaches the
// server.
//
// Leaving a story fight from its pause menu for the main menu keeps the fight
// (moth-fight-resume.mjs), so 繼續 returns to the same moment after the silent
// 3-2-1, with the same hearts, combo and score. The pause menu no longer asks
// whether to throw the round away in story mode, since it is not thrown away;
// a practice run still asks.

export function patchStorySave(once, edit) {
  edit('// One-time save rule: run progress lives in sessionStorage only, so closing\n', '    return window.sessionStorage || null;\n', () =>
    `// Story progress is kept on the device until a new story starts
// (moth-story-save.mjs).
function getRunStorage() {
  try {
    return window.localStorage || null;
`);
  edit('  purgeLegacyPersistentSaves() {\n', '      // Storage unavailable; nothing to purge.\n    }\n  }\n', () =>
    `  // A story kept in this tab's session from before saves moved to the device
  // is moved over, so it carries on.
  adoptSessionSaves() {
    try {
      for (const key of [SAVE_KEY, PROGRESS_KEY]) {
        const kept = window.sessionStorage?.getItem(key);
        if (kept && !window.localStorage?.getItem(key)) window.localStorage?.setItem(key, kept);
        window.sessionStorage?.removeItem(key);
      }
    } catch {
      // Storage unavailable; the game plays without a save.
    }
  }
`);
  once('      this.purgeLegacyPersistentSaves();\n', '      this.adoptSessionSaves();\n');
  // 返回主畫面 from a story fight's pause menu: kept for 繼續, so no warning.
  once('    if (!this.level1OfficePauseConfirm) {\n      // Quitting mid-shift throws the round away, so it asks once.',
    '    if (!this.level1OfficePauseConfirm && this.freePlay) {\n      // Quitting a practice run throws it away, so it asks once. A story fight\n      // is kept for the main menu\'s 繼續.');
  once('  quitLevel1OfficeToTitle() {\n    const rhythm = this.level1OfficeRhythm;\n',
    '  quitLevel1OfficeToTitle() {\n    const rhythm = this.level1OfficeRhythm;\n    if (!this.freePlay) this.keepFightForReload();\n');
}
