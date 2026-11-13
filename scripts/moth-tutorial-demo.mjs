import { MOTH_RHYTHM_RING } from './moth-chart-playability.mjs';

// Keep the examples on the same approach and hold timing as the warm-up.
export function getTutorialRhythmDemoFrame(kind, elapsed) {
  const hold = kind === "hold";
  const approach = MOTH_RHYTHM_RING.lead + 0.22;
  const duration = hold ? 1.2 : 0.16;
  const time = Math.max(0, elapsed) % (approach + duration + 0.75) - approach;
  const pressed = time >= 0 && time < duration;
  const action = time < 0 ? "wait" : hold
    ? (time < 0.18 ? "press" : pressed ? "hold" : "release")
    : "tap";
  return { hold, approach, duration, time, pressed, action };
}

function drawTutorialKeycap(target, button, x, y, size, pressed) {
  const half = size / 2;
  const cut = size * 0.22;
  const faceY = y + (pressed ? 2 : 0);
  const octagon = (radius, corner, offset) => [
    [x - radius + corner, faceY - radius + offset],
    [x + radius - corner, faceY - radius + offset],
    [x + radius, faceY - radius + corner + offset],
    [x + radius, faceY + radius - corner + offset],
    [x + radius - corner, faceY + radius + offset],
    [x - radius + corner, faceY + radius + offset],
    [x - radius, faceY + radius - corner + offset],
    [x - radius, faceY - radius + corner + offset]
  ];
  target.fillStyle = "#0e0d11";
  pixelPoly(target, octagon(half + 3, cut + 1, 3));
  target.fillStyle = pressed ? "#a06b11" : "#795117";
  pixelPoly(target, octagon(half, cut, 3));
  target.fillStyle = pressed ? "#fff1aa" : "#edbd33";
  pixelPoly(target, octagon(half, cut, 0));
  target.fillStyle = pressed ? "#f5cc52" : "#bf891d";
  pixelPoly(target, octagon(half - 3, cut - 1, 0));
  target.fillStyle = pressed ? "#302315" : "#fff4ce";
  drawCentredGlyph(target, button, x, faceY, MOTH_RHYTHM_HEAD.font);
}

function drawTutorialRhythmDemo(target, kind, rect, elapsed) {
  const { hold, approach, duration, time, pressed, action } = getTutorialRhythmDemoFrame(kind, elapsed);
  const prompts = {
    wait: ["WAIT", "等待"],
    tap: ["TAP", "輕按"],
    press: ["PRESS", "按下"],
    hold: ["HOLD", "按住"],
    release: ["RELEASE", "放開"]
  };
  const { x, y, w, h } = rect;
  const button = "T";
  const keyColumn = Math.min(138, w * 0.25);
  const railLeft = x + 8;
  const railRight = x + w - keyColumn - 7;
  const railY = y + h / 2;
  const cursorX = railLeft + (railRight - railLeft) * 0.42;
  const scale = Math.min(0.86, (h - 10) / (2 * (MOTH_RHYTHM_RING.radius + 5)));
  const speed = (railRight - cursorX - MOTH_RHYTHM_RING.radius * scale - 6) / (approach + (hold ? duration : 0));
  const headX = cursorX - time * speed;
  const tailX = cursorX + (duration - time) * speed;
  const hitAge = hold && time >= duration ? time - duration : time;

  target.save();
  target.fillStyle = "#100e11";
  target.fillRect(x, y + 3, w, h);
  target.fillStyle = "#2b2624";
  target.fillRect(x, y, w, h);
  target.strokeStyle = "#e3cda0";
  target.lineWidth = 2;
  target.strokeRect(x + 1, y + 1, w - 2, h - 2);

  const paper = target.createLinearGradient(0, y + 4, 0, y + h - 4);
  paper.addColorStop(0, "#ffe16d");
  paper.addColorStop(0.45, "#f1c62d");
  paper.addColorStop(1, "#d4a525");
  target.fillStyle = paper;
  target.fillRect(x + 4, y + 4, w - keyColumn - 4, h - 8);

  target.save();
  target.beginPath();
  target.rect(railLeft, y + 4, railRight - railLeft, h - 8);
  target.clip();
  target.fillStyle = "rgba(45, 31, 15, 0.58)";
  target.fillRect(railLeft, railY - 1, railRight - railLeft, 2);
  target.fillStyle = "rgba(49, 34, 19, 0.48)";
  target.fillRect(cursorX - 3, y + 9, 6, h - 18);
  target.fillStyle = "#fff7dc";
  target.fillRect(cursorX - 2, y + 9, 4, h - 18);

  if (hitAge >= 0 && hitAge < 0.32) {
    target.save();
    target.globalAlpha = 1 - hitAge / 0.32;
    target.strokeStyle = "#fff6c0";
    target.lineWidth = 3;
    target.beginPath();
    target.arc(cursorX, railY, (25 + hitAge * 84) * scale, 0, TAU);
    target.stroke();
    target.restore();
  }

  // The demo uses the live note art, including the remaining part of a hold.
  const held = hold && pressed;
  const completed = time >= 0;
  if (hold && time < duration) {
    drawRhythmHoldTail(target, {
      x: headX, endX: tailX, y: railY, hitX: cursorX, button, held, completed
    }, scale);
  }
  if (time < (hold ? duration + 0.28 : 0.42)) {
    drawRhythmNoteHead(target, { x: headX, y: railY, button, held, completed }, scale);
  }
  if (held && headX + MOTH_RHYTHM_HEAD.radius * scale < railLeft) {
    drawRhythmHoldMarker(target, cursorX, railY, button, scale);
  }
  const cue = calculateRhythmTimingCue({ status: completed ? "perfect" : "pending", time: 0 }, time, 0);
  if (cue) drawRhythmTimingRing(target, headX, railY, cue, scale);
  target.restore();

  target.fillStyle = "#1c1921";
  target.fillRect(x + w - keyColumn, y + 4, keyColumn - 4, h - 8);
  target.strokeStyle = "#776545";
  target.lineWidth = 1;
  target.strokeRect(x + w - keyColumn + 3, y + 7, keyColumn - 10, h - 14);
  const keyX = x + w - (keyColumn + 4) / 2;
  drawTutorialKeycap(target, button, keyX, y + h * 0.37, Math.round(h * 0.38), pressed);
  target.fillStyle = pressed ? "#ffe8a6" : "#f3ead0";
  target.textAlign = "center";
  target.textBaseline = "middle";
  drawFittedText(target, uiText(...prompts[action]), keyX, y + h * 0.79, keyColumn - 16, 18, 900, 12);
  target.restore();
}

export function patchTutorialDemo(once) {
  once('function localizeDialogueLine(line) {', `${getTutorialRhythmDemoFrame.toString()}

${drawTutorialKeycap.toString()}

${drawTutorialRhythmDemo.toString()}

function localizeDialogueLine(line) {`);
  once('  renderLevel1OfficeDialogueBox(line, index, total, options = {}) {', `  drawOfficeTutorialDemo(target, kind, textRect, textLayout, height) {
    const time = this.time || 0;
    const start = this.dialogueScroll.rhythmDemoStart ??= time;
    const lineCount = Math.min(textLayout.lines.length, textLayout.visibleCount);
    const textHeight = Math.min(textRect.h, lineCount * Math.round(textLayout.fontSize * 1.18) + 6);
    const rect = { ...textRect, y: textRect.y + textHeight + 7, h: height };
    drawTutorialRhythmDemo(target, kind, rect, time - start);
  }

  renderLevel1OfficeDialogueBox(line, index, total, options = {}) {`);
  once('      speaker, text: line?.text || "", index, total, sceneBottom: namePlate.y - 4, portraitRect: portrait,',
    '      speaker, text: line?.text || "", index, total, sceneBottom: namePlate.y - 4, portraitRect: portrait, rhythmDemo: line?.rhythmDemo,');
  once(`    this.drawScrollableDialogue(target, line?.text || "", {
      x: panel.x + 38, y: panel.y + 62, w: 838, h: panel.h - 126
    }, { lineHeightRatio: 1.32, hintY: panel.y + panel.h - 38 });`, `    const demo = line?.rhythmDemo;
    const textRect = { x: panel.x + 38, y: panel.y + 62, w: 838, h: demo ? 97 : panel.h - 126 };
    const footerY = panel.y + panel.h - 38;
    const textLayout = this.drawScrollableDialogue(target, line?.text || "", textRect, {
      size: demo ? 26 : 30, lineHeightRatio: demo ? 1.18 : 1.32, hintY: footerY
    });
    if (demo) {
      this.drawOfficeTutorialDemo(target, demo, textRect, textLayout, 84);
    }`);
  once(`    this.drawScrollableDialogue(target, dialogue.text || "", {
      x: panel.x + 28, y: panel.y + 34, w: textW, h: panel.h - 94
    }, { tall: true, center: Boolean(dialogue.narration), hintY: panel.y + panel.h - 34 });`, `    const demo = dialogue.rhythmDemo;
    const textRect = { x: panel.x + 28, y: panel.y + 34, w: textW, h: demo ? 114 : panel.h - 94 };
    const textLayout = this.drawScrollableDialogue(target, dialogue.text || "", textRect, {
      tall: true, center: Boolean(dialogue.narration), hintY: panel.y + panel.h - 34,
      size: demo ? 23 : 30, lineHeightRatio: demo ? 1.18 : 1.38
    });
    if (demo) {
      this.drawOfficeTutorialDemo(target, demo, textRect, textLayout, 75);
    }`);
  once('    if (line.zuxianFace) cloned.zuxianFace = String(line.zuxianFace);',
    '    if (line.zuxianFace) cloned.zuxianFace = String(line.zuxianFace);\n    if (["tap", "hold"].includes(line.rhythmDemo)) cloned.rhythmDemo = line.rhythmDemo;');
  // Staff drafts saved before the demos can keep their edited copy.
  once('        if (lines?.length) normalized[scene.id] = this.cloneDialogueLines(lines);', `        if (!lines?.length) return;
        const cloned = this.cloneDialogueLines(lines);
        if (scene.id === "officeTutorial") {
          for (const line of cloned) {
            if (line.rhythmDemo) continue;
            const match = scene.defaultLines.find(original => original.zh === line.text && original.rhythmDemo);
            if (match) line.rhythmDemo = match.rhythmDemo;
          }
        }
        normalized[scene.id] = cloned;`);
  once('    if (original?.zuxianFace) line.zuxianFace = original.zuxianFace;',
    '    if (original?.zuxianFace) line.zuxianFace = original.zuxianFace;\n    if (original?.rhythmDemo) line.rhythmDemo = original.rhythmDemo;');
}
