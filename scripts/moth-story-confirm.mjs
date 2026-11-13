// Use the same confirmation card after a chapter's post-fight story has played.
export function patchStoryConfirm(once, edit) {
  once('    this.level1UnlockRects = [];', '    this.level1UnlockRects = [];\n    this.storyAdvance = null;');

  edit('    this.level1UnlockChoice = 0;\n    this.state = "level1UnlockPrompt";',
    '\n  updatePhase() {', () => `    this.showStoryAdvance("level2-stage2", () => {
      if (this.freePlay) this.returnToTitle();
      else return this.startStage("level2-stage2", { freePlay: false });
    });
  }

  showStoryAdvance(stageId, advance, { preview = false } = {}) {
    if (this.freePlay && !preview) return advance();
    const levelLabel = this.getHomeStageDefs().find(stage => stage.id === stageId)?.levelLabel;
    this.storyAdvance = { stageId, levelLabel, advance };
    this.level1UnlockChoice = 0;
    this.state = "level1UnlockPrompt";
    this.updateMobileControls(true);
  }

  async activateLevel1UnlockChoice() {
    if (this.state !== "level1UnlockPrompt" || !this.storyAdvance) return;
    const { advance } = this.storyAdvance;
    this.storyAdvance = null;
    if (this.level1UnlockChoice === 0) return advance();
    // The prior chapter's clear already saved the next story checkpoint.
    this.returnToTitle();
  }

  updatePhase() {`);

  // Keep each chapter's existing loader or scene change behind confirmation.
  once('    this.level1OfficeRhythm = null;\n    this.recordLatestProgressLoadout();\n    this.saveProgress();\n    this.startLevelLoading("level3-stage1", () => this.enterLevel3Stage1());',
    `    this.recordLatestProgressLoadout();
    this.saveProgress();
    this.showStoryAdvance("level3-stage1", () => {
      this.level1OfficeRhythm = null;
      this.startLevelLoading("level3-stage1", () => this.enterLevel3Stage1());
    });`);
  once('        this.startSewerTransition("level4");',
    '        this.showStoryAdvance("level4-stage1", () => this.startSewerTransition("level4"));');
  once('    this.startLevelLoading("studio-stage1", () => this.enterStudioDialogue());',
    '    this.showStoryAdvance("studio-stage1", () => this.startLevelLoading("studio-stage1", () => this.enterStudioDialogue()));');
  once('    if (post) this.startLevelLoading("level5-stage1", () => this.enterLevel5Stage1());',
    '    if (post) this.showStoryAdvance("level5-stage1", () => this.startLevelLoading("level5-stage1", () => this.enterLevel5Stage1()));');
  once('    this.startLevelLoading("level6-stage1", () => this.startLevel6Dream());',
    '    this.showStoryAdvance("level6-stage1", () => this.startLevelLoading("level6-stage1", () => this.startLevel6Dream()));');
  once('      this.level1OfficeRhythm = null;\n      this.startLevel6WakeUp();\n      this.updateMobileControls(true);',
    `      this.showStoryAdvance("finale-stage1", () => {
        this.level1OfficeRhythm = null;
        this.startLevel6WakeUp();
      });`);

  once('    if (this.walkPause) return "card";',
    '    if (this.walkPause || this.state === "level1UnlockPrompt") return "card";');
  once('      || this.state === "failure" || this.state === "level1UnlockPrompt")) return "card";',
    '      || this.state === "failure")) return "card";');
  once('    } else if (this.state === "level1UnlockPrompt") {\n      this.renderLevel1OfficeScene(true);',
    '    } else if (this.state === "level1UnlockPrompt") {\n      this.renderStoryAdvanceBackdrop();');
  once('  renderLevel1UnlockPrompt() {\n    const target = this.ctx;',
    `  renderStoryAdvanceBackdrop() {
    switch (this.storyAdvance?.stageId) {
      case "level4-stage1":
        this.renderLevel3Scene(true);
        break;
      case "studio-stage1":
        this.renderLevel4Scene(true);
        break;
      case "level5-stage1":
        this.renderStudioScene(this.ctx, { dialogue: true });
        break;
      case "level6-stage1":
        this.ctx.fillStyle = "#05070d";
        this.ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        this.renderLevel5RiverScene(this.ctx, {
          frozen: true, motionTime: this.time || 0, sceneHeight: VIEW_H,
          renderTime: 0, rhythm: null, aftermath: true
        });
        break;
      default:
        this.renderLevel1OfficeScene(true);
    }
  }

  renderLevel1UnlockPrompt() {
    const target = this.ctx;
    const levelLabel = this.storyAdvance?.levelLabel || "LEVEL 2";
    const ending = this.storyAdvance?.stageId === "finale-stage1";`);
  once('this.tr("NEXT LEVEL UNLOCKED", "下一關已解鎖"), VIEW_W / 2, panel.y + 78,',
    '(ending ? this.tr("ENDING UNLOCKED", "片尾已解鎖") : this.tr("NEXT LEVEL UNLOCKED", "下一關已解鎖")), VIEW_W / 2, panel.y + 78,');
  once('      this.tr("LEVEL 2 + THE NEXT SONG ARE READY", "LEVEL 2 與下一首歌曲已開放"),',
    `      ending
        ? this.tr("THE ENDING CREDITS ARE READY", "片尾字幕已開放")
        : this.tr(levelLabel + " + THE NEXT SONG ARE READY", levelLabel + " 與下一首歌曲已開放"),`);
  once('      this.tr("PLAY LEVEL 2 NOW", "立即遊玩 LEVEL 2"),',
    `      ending
        ? this.tr("WATCH THE ENDING", "觀看片尾")
        : this.tr("PLAY " + levelLabel + " NOW", "立即遊玩 " + levelLabel),`);
}
