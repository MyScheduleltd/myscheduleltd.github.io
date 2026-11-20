// Staff-only controls keep full-song tests, continuous Story chapters, and
// individual scene previews separate. They remain inside stripped methods.
export function patchDebugStory(once) {
  once('            <button type="button" data-debug-stage="finale-stage1">Ending flow · Cutscene → board → credits</button>\n', '');
  once('          <h2>02 / Rhythm fights</h2>', '          <h2>02 / Level Selection · Full songs / 選關・完整歌曲</h2>');
  once('          <p class="debug-hint">M O T H taps & holds · score runs · no story progress saved</p>',
    '          <p class="debug-hint">Full-song charts · Easy / Hard · No Story progress / 完整歌曲譜面，不推進故事。</p>');
  for (const [id, label] of FIGHTS) {
    once('            <button type="button" data-debug-fight="' + id + '">' + label + '</button>',
      ['chill', 'shoot'].map(mode => '            <button type="button" data-debug-fight="' + id + '" data-debug-mode="' + mode + '">'
        + label + ' · ' + (mode === 'chill' ? 'Easy / 簡單' : 'Hard / 困難') + '</button>').join('\n'));
  }
  once('          <h2>03 / Story & ending previews</h2>', `          <h2>Story mode / 故事模式</h2>
          <p class="debug-hint">Full dialogue, fights and ending · Staff save / 完整劇情、關卡與片尾，使用工作人員存檔。</p>
          <div class="debug-actions debug-actions--grid">
            <button type="button" data-debug-action="storyEasy">New Story · Easy / 新故事・簡單</button>
            <button type="button" data-debug-action="storyHard">New Story · Hard / 新故事・困難</button>
            <button type="button" data-debug-action="storyContinue">Continue Story / 繼續故事</button>
            <button type="button" data-debug-stage="finale-stage1">Ending flow / 片尾流程</button>
          </div>
          <p class="debug-hint">Chapter entry → dialogue, exploration, Story fight and next chapter. Jumps are unranked. / 從章節開頭遊玩，接續劇情與故事譜面；跳關不計排名。</p>
          <div class="debug-actions debug-actions--grid">
${CHAPTERS.flatMap(([id, label]) => ['chill', 'shoot'].map(mode => '            <button type="button" data-debug-story="' + id + '" data-debug-mode="' + mode + '">'
  + label + ' · ' + (mode === 'chill' ? 'Easy / 簡單' : 'Hard / 困難') + '</button>')).join('\n')}
          </div>
        </section>
        <section>
          <h2>03 / Scene previews only / 單一場景預覽</h2>`);
  once('          <p class="debug-hint">Preview scenes without completing the story.</p>',
    '          <p class="debug-hint">Single scenes only. Use Story mode above to play the chapter. / 僅預覽單一場景；遊玩完整章節請用上方故事模式。</p>');
  once('"[data-debug-action], [data-debug-stage], [data-debug-fight]"',
    '"[data-debug-action], [data-debug-stage], [data-debug-fight], [data-debug-story]"');
  once('      await this.startStage(id);\n      this.setDebugStatus(`Score run: ${this.getStageTitle(id)} · M O T H.`);',
    `      this.endingScoreboardPreview = false;
      this.setDifficulty(button.dataset.debugMode === "shoot" ? "shoot" : "chill", {persist: false, announce: false});
      this.toggleDebugPanel(false);
      await this.startStage(id, {freePlay: true, fromLevelSelection: true});
      this.setDebugStatus(\`Full song / 完整歌曲: \${this.getStageTitle(id)} · \${this.getDifficultyLabel()}\`);`);
  once('    const stageId = button.dataset.debugStage;\n', `    if (button.dataset.debugStory) {
      const id = button.dataset.debugStory;
      const mode = button.dataset.debugMode === "shoot" ? "shoot" : "chill";
      this.debugUnlockAllStages();
      // A chapter jump follows real Story transitions but cannot submit an
      // incomplete, staff-selected run to the public Story leaderboard.
      this.progress.storyRun = {id: "debug-story-" + Date.now(), difficulty: mode,
        chartVersion: this.config?.rhythmChartVersion || "debug", scores: {}, startedAt: Date.now(), legacy: true};
      this.progress.storyCheckpoint = id;
      this.progress.flags = {...this.progress.flags, level3PostBossReady: false,
        level3PostBossComplete: false, level4BossDefeated: false, level4MemeChestPending: false};
      this.storyDifficultyId = null;
      this.endingScoreboardPreview = false;
      this.stageSelectRhythmId = null;
      this.setDifficulty(mode, {persist: false, announce: false});
      this.toggleDebugPanel(false);
      await this.startStage(id, {freePlay: false});
      this.saveProgress({debugOverride: true});
      this.setDebugStatus("Story chapter / 故事章節: " + this.getStageTitle(id));
      return;
    }
    const stageId = button.dataset.debugStage;
`);
  once('            <dt>Hidden</dt><dd data-debug-field="secrets">—</dd>', `            <dt>Hidden</dt><dd data-debug-field="secrets">—</dd>
            <dt>Story mode</dt><dd data-debug-field="storyRun">—</dd>
            <dt>Chart arrangement</dt><dd data-debug-field="arrangement">—</dd>
            <dt>Concert LED</dt><dd data-debug-field="concertVideo">—</dd>
            <dt>Combo texture</dt><dd data-debug-field="comboTexture">—</dd>`);
  once('    else if (action === "title") {', `    else if (action === "storyEasy" || action === "storyHard") {
      this.endingScoreboardPreview = false;
      this.toggleDebugPanel(false);
      this.startStoryRun(action === "storyHard" ? "shoot" : "chill");
      this.setDebugStatus("Started full Story Mode / 已開始完整故事模式。");
      return;
    } else if (action === "storyContinue") {
      if (!this.getContinueStageId()) {
        this.setDebugStatus("No saved Story checkpoint / 尚無故事進度。");
        return;
      }
      this.endingScoreboardPreview = false;
      this.toggleDebugPanel(false);
      this.continueStory();
      return;
    } else if (action === "title") {`);
  once('  updateDebugPanel(force = false) {', `  updateDebugPanel(force = false) {
    const storyDebugRun = this.progress?.storyRun;
    const storyDebugVideo = this.concertMusicVideo;
    const storyDebugCombo = this.cinematicComboTelemetry;
    const storyDebugFields = {
      arrangement: this.level1OfficeRhythm
        ? (this.stageSelectRhythmId ? "Level Selection · full song / 選關・完整歌曲" : "Story chart / 故事譜面")
          + " · " + this.scoreboardModeLabel(this.difficultyId)
        : (this.freePlay ? "Scene preview / 場景預覽" : "Story route / 故事流程"),
      storyRun: storyDebugRun
        ? this.scoreboardModeLabel(storyDebugRun.difficulty) + " · "
          + Object.keys(storyDebugRun.scores || {}).length + "/7 · "
          + (storyDebugRun.finishedAt ? "finished / 完成" : "in progress / 進行中")
        : "No active run / 尚未開始",
      concertVideo: storyDebugVideo
        ? (storyDebugVideo.paused ? "paused" : "playing") + " · muted · "
          + Math.round((storyDebugVideo.currentTime - this.getConcertVideoTime()) * 1000) + "ms"
        : "Not loaded / 尚未載入",
      comboTexture: storyDebugCombo
        ? storyDebugCombo.backend + " · 2px fixed dither · " + (storyDebugCombo.cached ? "cached" : "composed")
        : "Ready / 待命"
    };
    for (const [field, value] of Object.entries(storyDebugFields)) {
      const label = this.debugPanel?.querySelector('[data-debug-field="' + field + '"]');
      if (label) label.textContent = value;
    }
`);
}

const FIGHTS = [
  ['level1-stage1', 'L1 · Office'], ['level2-stage2', 'L2 · Bathroom'],
  ['level3-stage2', 'L3 · Okay Okay'], ['level4-stage1', 'L4 · Arcade'],
  ['studio-stage1', 'L5 · Studio'], ['level5-stage2', 'L6 · River'],
  ['level6-stage2', 'L7 · Concert'], ['secret-xiaosi', 'Hidden · 笑死'],
  ['secret-getdown', 'Hidden · 蹲得低']
];
const CHAPTERS = [
  ['level1-stage1', 'L1 · Intro / 辦公室'], ['level2-stage2', 'L2 · Bathroom / 浴室'],
  ['level3-stage1', 'L3 · Home / 客廳'], ['level4-stage1', 'L4 · Bedroom / 房間'],
  ['studio-stage1', 'L5 · Recording / 錄音室'], ['level5-stage1', 'L6 · Night drive / 夜遊'],
  ['level6-stage1', 'L7 · Dream / 夢境']
];
