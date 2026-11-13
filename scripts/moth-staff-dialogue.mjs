// Staff dialogue previews use the same chapter asset gate as the story.
export function patchStaffDialoguePreview(once, edit) {
  once('const DEBUG_CONVERSATION_STORAGE_KEY = "bobby_debug_conversation_overrides_v1";',
    'const DEBUG_CONVERSATION_STORAGE_KEY = "bobby_debug_conversation_overrides_v2";');
  once('      await this.previewDebugConversationScene(scene.id, this.debugConversationEditor.lineIndex);\n      this.setDebugStatus(`Previewing ${scene.label}, line ${this.debugConversationEditor.lineIndex + 1}.`);',
    '      await this.previewDebugConversationScene(scene.id, this.debugConversationEditor.lineIndex);');
  once('    if (!this.getDebugConversationScene(sceneId)) {\n      this.setDebugStatus("That dialogue has been removed from the current story.");\n      return false;\n    }', `    const scene = this.getDebugConversationScene(sceneId);
    if (!scene) {
      this.setDebugStatus("That dialogue has been removed from the current story.");
      return false;
    }
    const stageId = {
      officeTutorial: "level1-stage1", officeReady: "level1-stage1", officeVictory: "level1-stage1",
      level2PreBoss: "level2-stage2", level2PostBoss: "level2-stage2",
      level3PreBoss: "level3-stage1", level3PostBoss: "level3-stage1",
      level4PreBoss: "level4-stage1", level4PostBoss: "level4-stage1", level4Exit: "level4-stage1",
      studioPre: "studio-stage1", studioPost: "studio-stage1",
      level5GanGan: "level5-stage1", level5Post: "level5-stage2",
      level6Dream: "level6-stage1", level6Wake: "finale-stage1"
    }[sceneId];
    if (this.deferSceneAssets(stageId, () => this.previewDebugConversationScene(sceneId, lineIndex))) return false;`);
  once('    if (slot) slot.object[slot.key] = clamp(lineIndex, 0, Math.max(0, this.getDialogueLines(sceneId).length - 1));',
    '    const index = clamp(lineIndex, 0, Math.max(0, this.getDialogueLines(sceneId).length - 1));\n    if (slot) slot.object[slot.key] = index;\n    this.setDebugStatus(`Previewing ${scene.label}, line ${index + 1}.`);');
  once('    if (this.debugPanelOpen) this.updateDebugPanel(true);\n  }\n\n  setDebugStatus',
    '    if (this.debugPanelOpen) this.updateDebugPanel(true);\n    else if (this.debugPanel.contains(document.activeElement)) this.debugToggleButton?.focus({ preventScroll: true });\n  }\n\n  setDebugStatus');
  once('            <button type="button" data-debug-action="heal">Restore health</button>\n', '');
  edit('    } else if (action === "heal") {\n', '    } else if (action === "unlockAll") {',
    () => '    } else if (action === "unlockAll") {');
  once('      ? `DR. BEAUTY · ${this.isHealthlessRun() ? "score run / no failure" : `health ${fmt(rhythm.health, 0)}/${rhythm.maxHealth}`}`', '      ? "DR. BEAUTY · score run"');
  once(' · HP ${this.player?.hearts ?? "—"}', '');
  once('      : this.state === "finaleEnding" ? `Ending · ${this.finaleEndingPhase || "credits"}`',
    '      : this.state === "level1UnlockPrompt" ? `Confirmation · ${this.storyAdvance?.levelLabel || "—"}`\n      : this.state === "finaleEnding" ? `Ending · ${this.finaleEndingPhase || "credits"}`');
  once('            <button type="button" data-debug-stage="level3-zuxian-exit">L3 祖賢 Exit</button>',
    '            <button type="button" data-debug-stage="level3-zuxian-exit">L3 祖賢 Exit</button>\n            <button type="button" data-debug-stage="level3-confirmation">L3 · Next-level card</button>');
  once('            <button type="button" data-debug-stage="level4-postboss-dialogue">L4 After Win Talk</button>',
    '            <button type="button" data-debug-stage="level4-postboss-dialogue">L4 After Win Talk</button>\n            <button type="button" data-debug-stage="level4-confirmation">L4 · Next-level card</button>');
  once('    } else if (stageId === "level3-stage1") {\n      this.enterLevel3Stage1({ forcePreBoss: true });', `    } else if (stageId === "level3-confirmation" || stageId === "level4-confirmation") {
      const level3 = stageId === "level3-confirmation";
      if (level3) this.enterLevel3Stage1({ forcePostBoss: true });
      else this.enterLevel4Stage1();
      const nextStage = level3 ? "level4-stage1" : "studio-stage1";
      const advance = () => this.debugJumpToStage(level3 ? "level4-stage1" : "studio-pre");
      this.showStoryAdvance(nextStage, advance, { preview: true });
    } else if (stageId === "level3-stage1") {
      this.enterLevel3Stage1({ forcePreBoss: true });`);
  once('            <button type="button" data-debug-stage="level1-stage1">L1 · Intro & tutorial</button>',
    '            <button type="button" data-debug-stage="level1-stage1">L1 · Intro & tutorial</button>\n            <button type="button" data-debug-stage="level1-practice">L1 · Tap and hold practice</button>');
  once('    if (stageId === "level1-stage1") {\n      await this.previewDebugConversationScene("officeTutorial");',
    `    if (stageId === "level1-stage1" || stageId === "level1-practice") {
      const practice = stageId === "level1-practice";
      const index = practice ? this.getDialogueLines("officeTutorial").length - 1 : 0;
      if (await this.previewDebugConversationScene("officeTutorial", index) && practice) this.advanceLevel1OfficeTutorial();`);
  once('            <button type="button" data-debug-stage="finale-ending">Credits & album</button>',
    '            <button type="button" data-debug-stage="level6-streak-break">L7 · Gan Gan combo-break line</button>\n            <button type="button" data-debug-stage="finale-ending">Ending credits</button>');
  once('    } else if (stageId === "level6-stage2") {\n      await this.startLevel6ConcertFight();\n    } else if (stageId === "finale-stage1") {',
    `    } else if (stageId === "level6-stage2") {
      await this.startLevel6ConcertFight();
    } else if (stageId === "level6-streak-break") {
      await this.startLevel6ConcertFight({ skipAudio: true });
      this.level1OfficeRhythm.judgment = { coachKind: "miss", brokenCombo: 10, color: "#ff5a72", timer: 5 };
    } else if (stageId === "finale-stage1") {`);
}
