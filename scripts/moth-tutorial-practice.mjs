export function patchTutorialPractice(once, edit) {
  const lastTap = '      { id: "tutorial-3", time: 5.25, cueAt: 4.4, action: "accent", button: "H", key: "H", task: "stamp", status: "pending", cuePlayed: false }';
  once(lastTap, lastTap + ',\n      { id: "tutorial-4", time: 6.6, holdEnd: 7.8, action: "do", button: "T", key: "T", task: "stamp", status: "pending", cuePlayed: false }');
  once('    tutorialNotes.forEach(note => {\n      note.cueAt = Math.max(0, note.time - rhythmRingLeadSeconds(spec));\n    });',
    '    tutorialNotes.forEach(note => {\n      note.cueAt = Math.max(0, note.time - MOTH_RHYTHM_RING.lead);\n    });');

  edit('    if (tutorial.mode === "practice") {\n      tutorial.noteIndex += 1;',
    '    return true;\n  }\n\n  registerLevel1OfficeTutorialMiss', () => `    if (!counts && !target.holding) this.advanceLevel1OfficePractice();
    return true;
  }

  advanceLevel1OfficePractice() {
    const tutorial = this.level1OfficeRhythm.tutorial;
    tutorial.noteIndex += 1;
    const next = tutorial.notes[tutorial.noteIndex];
    if (next) this.scheduleLevel1OfficePracticeNote(next, 1.3);
    else tutorial.mode = "complete";
  }

  scheduleLevel1OfficePracticeNote(note, delay) {
    const rhythm = this.level1OfficeRhythm;
    const time = rhythm.tutorial.time + delay;
    if (note.holdEnd) note.holdEnd += time - note.time;
    note.time = time;
    note.cueAt = time - MOTH_RHYTHM_RING.lead;
    note.cuePlayed = false;
    note.status = "pending";
    note.holding = false;
    note.holdDone = false;
    note.holdBroken = false;
  }

  registerLevel1OfficeTutorialMiss`);

  once('        : this.tr("FOLLOW THE RING", "跟著圓環"),',
    '        : label === "HOLD BROKEN"\n          ? this.tr(`RELEASED EARLY · KEEP ${note.button} HELD`, `太早放開了 · 請按住 ${note.button}`)\n          : this.tr("FOLLOW THE RING", "跟著圓環"),');
  once('    if (note) {\n      note.status = "pending";\n      note.time = tutorial.time + 1.25;\n      note.cueAt = tutorial.time + 0.32;\n      note.cuePlayed = false;\n    }',
    '    if (note) this.scheduleLevel1OfficePracticeNote(note, 1.25);');
  once('      this.registerLevel1OfficeMiss(note, "HOLD BROKEN");',
    '      if (rhythm.tutorial?.mode === "practice") this.registerLevel1OfficeTutorialMiss(note, "HOLD BROKEN");\n      else this.registerLevel1OfficeMiss(note, "HOLD BROKEN");');
  once('        if (note && tutorial.time > note.time + tutorialMissWindow) {\n          this.registerLevel1OfficeTutorialMiss(note, "MISS");\n        }',
    `        this.updateLevel1OfficeHolds();
        if (note?.status === "pending" && tutorial.time > note.time + tutorialMissWindow) {
          this.registerLevel1OfficeTutorialMiss(note, "MISS");
        }
        // Keep the finished hold visible long enough for its confirmation.
        if (note?.holdDone && !rhythm.judgment) this.advanceLevel1OfficePractice();`);

  once('  releaseHeldInputs() {\n    this.resetGamepadInput();', `  releaseHeldInputs() {
    const rhythm = this.level1OfficeRhythm;
    const tutorial = rhythm?.tutorial;
    const note = tutorial?.mode === "practice" && tutorial.notes[tutorial.noteIndex];
    if (note?.holding) {
      delete rhythm.holds[note.button];
      this.scheduleLevel1OfficePracticeNote(note, 1.25);
      rhythm.judgment = null;
    }
    this.resetGamepadInput();`);
  once('      if (this.state !== "playing" || !this.level1OfficeRhythm) this.releaseHeldInputs();',
    '      if (this.state !== "playing" || !this.level1OfficeRhythm || this.level1OfficeRhythm.tutorial?.mode === "practice") this.releaseHeldInputs();');

  once('      const practiceHint = this.tr(`GANGAN: LET THE RING CLOSE, THEN PRESS ${practiceButton}.`, `GANGAN：等圓環縮合，再按 ${practiceButton}。`);',
    `      const practiceHint = rhythm.judgment?.coachKind === "miss" ? rhythm.judgment.detail
        : practiceNote?.holdDone ? this.tr("HOLD COMPLETE", "長按成功")
        : practiceNote?.holding ? this.tr(\`KEEP \${practiceButton} HELD UNTIL THE TAIL PASSES\`, \`按住 \${practiceButton}，直到尾端通過判定線\`)
        : practiceNote?.holdEnd ? this.tr(\`HOLD \${practiceButton} AS THE RING CLOSES\`, \`圓環縮合時長按 \${practiceButton}\`)
        : this.tr(\`TAP \${practiceButton} AS THE RING CLOSES\`, \`圓環縮合時輕按 \${practiceButton}\`);`);
}
