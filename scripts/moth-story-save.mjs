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
  patchSecretStageClears(once);
}

function patchSecretStageClears(once) {
  // The game's existing storage namespace separates public and staff saves.
  // One key per stage lets two tabs clear different songs independently.
  once('const PROGRESS_KEY = "bobby_progress_v1";', `const PROGRESS_KEY = "bobby_progress_v1";
const SECRET_CLEAR_STORAGE_PREFIX = PROGRESS_KEY + ".secret-clear.";`);

  once('    await this.startStage(pick.stageId);',
    '    await this.startStage(pick.stageId, { fromLevelSelection: true });');
  once('      await this.startSecretRhythmFight(secret.id, { deferSong: true, skipAudio: options.skipAudio });',
    `      await this.startSecretRhythmFight(secret.id, {
        deferSong: true,
        skipAudio: options.skipAudio,
        fromLevelSelection: options.fromLevelSelection
      });`);
  once('      await this.startSecretRhythmFight(stageId, { deferSong: true, skipAudio });',
    `      await this.startSecretRhythmFight(stageId, {
        deferSong: true,
        skipAudio,
        fromLevelSelection: this.level1OfficeRhythm?.levelSelectionSecretStage === stageId
      });`);
  once('    this.level1OfficeRhythm = this.createLevel1OfficeRhythmState(level.theme);',
    `    this.level1OfficeRhythm = this.createLevel1OfficeRhythmState(level.theme);
    if (options.fromLevelSelection === true) {
      this.level1OfficeRhythm.levelSelectionSecretStage = stageId;
    }`);

  once('  isStageCompleted(stageId) {\n', `  getSecretStageClears() {
    if (this.secretStageClears) return this.secretStageClears;
    this.secretStageClears = new Set();
    try {
      const storage = getRunStorage();
      for (const { id } of this.config?.secretLevels || []) {
        if (storage?.getItem(SECRET_CLEAR_STORAGE_PREFIX + id) === "1") this.secretStageClears.add(id);
      }
    } catch {
      // A clear remains visible for this visit when storage is unavailable.
    }
    return this.secretStageClears;
  }

  recordSecretStageClear() {
    const stageId = this.currentStageId;
    const rhythm = this.level1OfficeRhythm;
    if (!this.freePlay || !rhythm?.ending || rhythm.reviewResult !== "PASSED"
      || rhythm.levelSelectionSecretStage !== stageId || this.getSecretLevel(stageId)?.theme !== rhythm.theme) return;
    this.getSecretStageClears().add(stageId);
    try {
      getRunStorage()?.setItem(SECRET_CLEAR_STORAGE_PREFIX + stageId, "1");
    } catch {
      // The in-memory clear still updates Level Selection.
    }
  }

  isStageCompleted(stageId) {
    if (this.getSecretLevel(stageId)) return this.getSecretStageClears().has(stageId);
`);
  once('  startLevel1OfficeResults() {\n    if (!this.level1OfficeRhythm || this.state !== "playing") return;',
    `  startLevel1OfficeResults() {
    if (!this.level1OfficeRhythm || this.state !== "playing") return;
    this.recordSecretStageClear();`);
  once(`      // Every fight is open here. Stage select is a practice shelf: it is free
      // play, so nothing is written back to the save, and STORY MODE still has
      // to be played through for the story itself.`,
    `      // Level Selection shows story clears for the main fights and saved
      // practice clears for the hidden stages.`);
  once(`        secrets: this.areSecretLevelsUnlocked()
          ? \`笑死 + 蹲得低 · unlocked (\${this.isStageCompleted("finale-stage1") ? "story completion" : "debug / this saved session"})\`
          : "笑死 + 蹲得低 · locked until story completion"`,
    `        secrets: this.areSecretLevelsUnlocked()
          ? [
            this.isStageCompleted("finale-stage1")
              ? this.tr("Unlocked by completing Story Mode", "已完成故事模式並解鎖")
              : this.tr("Unlocked for staff testing", "已為測試解鎖"),
            ...this.getSecretLevelDefs().map(stage => {
              const status = this.isStageCompleted(stage.id) ? this.tr("CLEAR", "已通關") : this.tr("UNCLEARED", "尚未通關");
              return stage.title + " · " + status;
            })
          ].join("\\n")
          : this.tr("Hidden levels unlock after completing Story Mode", "完成故事模式後解鎖隱藏關卡")`);
}
