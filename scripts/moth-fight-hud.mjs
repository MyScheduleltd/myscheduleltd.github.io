// The fight's buttons, notes and phone layout (owner, 2026-10-17).
//
// Colours: the Super Famicom pad's, M blue, O red, T yellow, H green, on the
// notes and on the deck's buttons (scripts/make-moth-buttons.py makes their
// sheet from this table). T is a deeper yellow than the track's, with a dark
// letter, so its notes stand out on it. On every device.
//
// The phone (the tall view, renderTallScreen): the timing track runs the whole
// width at the same size as before, its hit line and row of notes in the
// middle of it, 1.9 s of notes either side. Dr. Beauty's box beside it is now
// one row above it, drawn at the phone's own resolution: his hearts, combo and
// score, or level 7's hype bar in the hearts' place, or in practice runs his
// staff ID as a strip (the badge's ID photo, 練習 stamp, 正 miss tally and green
// screen). GANGAN's feedback moves off the track to just above that row, as
// wide as its line. Computers keep the box beside the track.

export const MOTH_NOTE_COLOURS = { M: "#2457c5", O: "#e0463e", T: "#ecb300", H: "#2ea878" };

export function patchFightHud(once, edit) {
  once('const MOTH_NOTE_COLOURS = { T: "#ef3f78", O: "#4a4d53", M: "#3d7fd1", H: "#2f9467" };', `const MOTH_NOTE_COLOURS = ${JSON.stringify(MOTH_NOTE_COLOURS)};
// The letter on a note: white, or dark on the yellow T.
const MOTH_NOTE_LETTERS = { T: "#16171b" };`);
  once('        target.fillStyle = missed ? "#747982" : completed ? "#16171b" : "#ffffff";', '        target.fillStyle = missed ? "#747982" : completed ? "#16171b" : MOTH_NOTE_LETTERS[button] || "#ffffff";');

  // The tall view's layout.
  edit('const PORTRAIT_FIGHT = {\n', '  letterboxY: (776 - 405) / 2\n};\n', () => `const PORTRAIT_FIGHT = {
  width: 720,
  height: 776,
  scene: { x: 280, y: 0, w: 720, h: 508 },
  // Where the frame's lower panel starts, under the scene and its gutter.
  hudY: 520,
  // Under the scene: Dr. Beauty's row, then the timing track across the whole
  // width: a slice of the frame's track centred on its hit line (x 760) and
  // its row of notes (y 616), scaled up so the notes read bigger than they do
  // full-width.
  stats: { x: 8, y: 520, w: 704, h: 46 },
  track: { src: { x: 760 - 352 / 1.35, y: 616 - 98 / 1.35, w: 704 / 1.35, h: 196 / 1.35 }, dest: { x: 8, y: 572, w: 704, h: 196 } },
  letterboxY: (776 - 405) / 2
};
`);
  once('    const trackOuterEdge = Math.floor(PORTRAIT_FIGHT.badge.src.y - trackBorderWidth / 2);', '    const trackOuterEdge = Math.floor(PORTRAIT_FIGHT.hudY - trackBorderWidth / 2);');
  once(`      const { scene: band, track, badge } = layout;
      target.drawImage(scene, band.x, band.y, band.w, band.h, 0, 0, band.w, band.h);
      target.drawImage(scene, badge.src.x, badge.src.y, badge.src.w, badge.src.h, badge.dest.x, badge.dest.y, badge.dest.w, badge.dest.h);
`, `      const { scene: band, track } = layout;
      target.drawImage(scene, band.x, band.y, band.w, band.h, 0, 0, band.w, band.h);
      this.drawTallFightStats(target, this.level1OfficeRhythm);
`);
  once(`    const { scene, track, badge } = layout;
    // Include the scene/HUD gutter so a celebration cutout meets the native
    // portrait track exactly, without changing the scene's camera or scale.
    const sceneCopyHeight = badge.src.y;
    target.drawImage(canvas, scene.x, scene.y, scene.w, sceneCopyHeight, 0, 0, scene.w, sceneCopyHeight);
    target.drawImage(canvas, badge.src.x, badge.src.y, badge.src.w, badge.src.h, badge.dest.x, badge.dest.y, badge.dest.w, badge.dest.h);
`, `    const { scene, track } = layout;
    // Include the scene/HUD gutter so a celebration cutout meets the native
    // portrait track exactly, without changing the scene's camera or scale.
    const sceneCopyHeight = layout.hudY;
    target.drawImage(canvas, scene.x, scene.y, scene.w, sceneCopyHeight, 0, 0, scene.w, sceneCopyHeight);
    this.drawTallFightStats(target, this.level1OfficeRhythm);
`);
  // The film's vignette darkens towards the 16:9 frame's edges. On a phone it
  // covers only the scene: across the whole width it would darken the track
  // towards its right end, where the notes come in. Its grain and warm tint
  // still cover the track.
  once('  renderLevel1OfficeFilmGrain(target, motionTime, sceneHeight = VIEW_H) {\n    const frame = Math.floor(motionTime * 12);\n    this.filmGrainCache ||= new Map();\n    let cached = this.filmGrainCache.get(sceneHeight);\n    if (!cached) {\n      const layer = document.createElement("canvas"); layer.width = VIEW_W; layer.height = sceneHeight;\n      cached = { layer, frame: null }; this.filmGrainCache.set(sceneHeight, cached);',
    '  renderLevel1OfficeFilmGrain(target, motionTime, sceneHeight = VIEW_H, vignetteHeight = sceneHeight) {\n    const frame = Math.floor(motionTime * 12);\n    this.filmGrainCache ||= new Map();\n    let cached = this.filmGrainCache.get(`${sceneHeight}/${vignetteHeight}`);\n    if (!cached) {\n      const layer = document.createElement("canvas"); layer.width = VIEW_W; layer.height = sceneHeight;\n      cached = { layer, frame: null }; this.filmGrainCache.set(`${sceneHeight}/${vignetteHeight}`, cached);');
  once('    target.fillStyle = vignette;\n    target.fillRect(0, 0, VIEW_W, sceneHeight);', '    target.fillStyle = vignette;\n    target.fillRect(0, 0, VIEW_W, vignetteHeight);');
  once('    this.renderLevel1OfficeFilmGrain(target, motionTime, VIEW_H);\n    target.restore();\n  }\n\n  getRhythmPaperInk() {',
    '    this.renderLevel1OfficeFilmGrain(target, motionTime, VIEW_H, this.isTallScreenView() ? PORTRAIT_FIGHT.hudY : VIEW_H);\n    target.restore();\n  }\n\n  getRhythmPaperInk() {');
  // GANGAN's feedback sits just above Dr. Beauty's row, over the foot of the
  // scene, so nothing but the notes is on the track (owner, 2026-10-17): from
  // the row's left edge, as wide as its line. The frame's own box would show
  // in the phone's slice of the track, so the phone leaves it out.
  once('    const coachPromptBounds = coachPrompt\n      ? { x: ribbonBounds.x + 18, y: ribbonBounds.y + 10, w: 432, h: 52 }',
    '    const coachPromptBounds = coachPrompt && !this.isTallScreenView()\n      ? { x: ribbonBounds.x + 18, y: ribbonBounds.y + 10, w: 432, h: 52 }');
  once(`    // GANGAN's box, drawn at this size rather than copied: in the wide frame
    // it sits on a part of the track this view leaves out. Across the top of
    // the track, clear of the notes.
`, `    // GANGAN's box, drawn at this size rather than copied: in the wide frame
    // it sits on a part of the track this view leaves out. Just above Dr.
    // Beauty's row, so the track holds only the notes.
`);
  once('      const chip = { x: track.dest.x + 10, y: track.dest.y + 12, w: track.dest.w - 20, h: 58 };', '      const chip = { x: layout.stats.x, y: layout.stats.y - 64, w: this.getTallCoachChipWidth(target, coachPrompt, 58), h: 58 };');
  // The frame's own legend and phase counter sit at the right end of its
  // track, which the phone's slice now takes in; the phone draws its legend
  // itself.
  edit('      // The legend identifies the musical source the player listens for.\n', '        ribbonBounds.y + 23\n      );\n', block => `      // The legend identifies the musical source the player listens for. The
      // phone draws its own under its slice of the track (renderTallScreen).
      if (!this.isTallScreenView()) {
${block.split('\n').slice(1, -1).map(line => '  ' + line).join('\n')}
      }
`);

  // Level 7's hype bar, also drawn into the phone's row with its label inside.
  once('  drawConcertCrowdMeter(target, bounds, rhythm, motionTime = 0) {\n    const hype = clamp(rhythm?.hype ?? 0.3, 0, 1);\n    const bar = { x: bounds.x + 22, y: bounds.y + 56, w: bounds.w - 44, h: 26 };',
    '  drawConcertCrowdMeter(target, bounds, rhythm, motionTime = 0, row = null) {\n    const hype = clamp(rhythm?.hype ?? 0.3, 0, 1);\n    const bar = row || { x: bounds.x + 22, y: bounds.y + 56, w: bounds.w - 44, h: 26 };');
  once('    drawFittedText(target, label, bar.x + bar.w / 2, bar.y + bar.h + 13, bounds.w - 16, 12, 900, 8);\n', `    if (row) {
      target.font = "900 15px 'Courier New', 'PingFang TC', monospace";
      target.lineJoin = "round";
      target.lineWidth = 4;
      target.strokeStyle = "#08090d";
      target.strokeText(label, bar.x + bar.w / 2, bar.y + bar.h / 2 + 1, bar.w - 16);
      target.fillText(label, bar.x + bar.w / 2, bar.y + bar.h / 2 + 1, bar.w - 16);
    } else {
      drawFittedText(target, label, bar.x + bar.w / 2, bar.y + bar.h + 13, bounds.w - 16, 12, 900, 8);
    }
`);

  // The practice badge's parts the phone's strip shares.
  once('    const bathroom = this.isBathroomRhythm();\n    const accent = this.isConcertRhythm() ? "#8a3fb0" : this.isRiverRhythm() ? "#2f6f8f" : this.isArcadeRhythm() ? "#3552a8" : this.isMassageRhythm() ? "#c0506a" : bathroom ? "#3a9a8a" : "#2d7ec2";',
    '    const accent = this.getPracticeBadgeAccent();');
  edit('    const misses = Math.max(0, rhythm?.misses || 0);\n', '    target.fillText(String(misses), x + w - 16, rowY);\n', () => `    const misses = Math.max(0, rhythm?.misses || 0);
    const rowY = y + 110;
    target.fillStyle = ink;
    target.fillRect(x + 12, rowY + 11, w - 26, 1);
    this.drawMissTally(target, { x: x + 14, y: rowY, right: x + w - 16, indent: 38, glyph: 15, font: 12 }, misses, ink);
`);
  edit('    const lcd = { x: x + 12, y: y + h - 50, w: w - 26, h: 36 };\n', '    target.fillText(String(rhythm?.roundScore || 0).padStart(6, "0"), lcd.x + lcd.w - 7, lcd.y + 25);\n', () =>
    '    this.drawPracticeLcd(target, { x: x + 12, y: y + h - 50, w: w - 26, h: 36 }, rhythm, ink);\n');
}

export const FIGHT_HUD_METHODS = `
  // The width of the phone's feedback box (drawGanganCoachChip, h tall): its
  // line at full size and the box's margins, at least 240 (scaled from the
  // box's own 52-px height) and at most the row's width.
  getTallCoachChipWidth(target, prompt, h) {
    const k = h / 52;
    target.save();
    const measure = (text, size) => {
      target.font = \`900 \${Math.round(size * k)}px \${CANVAS_UI_FONT}\`;
      return target.measureText(String(text ?? "")).width;
    };
    const line = prompt.timingOnly
      ? Math.max(138 * k + measure(prompt.text, 18), 30 * k + measure(prompt.detail, 15))
      : 80 * k + measure(prompt.text, 14);
    target.restore();
    return clamp(Math.ceil(line + 6 * k), Math.round(240 * k), PORTRAIT_FIGHT.stats.w);
  }

  // The practice badge's colour: the fight's.
  getPracticeBadgeAccent() {
    return this.isConcertRhythm() ? "#8a3fb0" : this.isRiverRhythm() ? "#2f6f8f" : this.isArcadeRhythm() ? "#3552a8"
      : this.isMassageRhythm() ? "#c0506a" : this.isBathroomRhythm() ? "#3a9a8a" : "#2d7ec2";
  }

  // A practice run's misses: 失誤, then a 正 for every five, stroke by stroke
  // in the character's own order (up to four, then ×n), and the count at the
  // right.
  drawMissTally(target, row, misses, ink) {
    const { x, y, right, glyph } = row;
    const fullGroups = Math.floor(misses / 5);
    const shownGroups = Math.min(fullGroups, 4);
    target.textAlign = "left";
    target.fillStyle = ink;
    target.font = \`900 \${row.font}px 'Courier New', 'PingFang TC', 'Noto Sans TC', monospace\`;
    target.fillText(this.tr("MISS", "失誤"), x, y);
    let tallyX = x + row.indent;
    target.fillStyle = "#b3202c";
    for (let group = 0; group < shownGroups; group += 1) {
      drawTallyZheng(target, tallyX, y - glyph / 2, glyph, 5);
      tallyX += glyph + 5;
    }
    if (fullGroups > shownGroups) {
      target.font = \`900 \${row.font}px 'Courier New', monospace\`;
      target.fillText(\`×\${fullGroups}\`, tallyX, y);
    } else if (misses % 5 || !misses) {
      if (misses % 5) drawTallyZheng(target, tallyX, y - glyph / 2, glyph, misses % 5);
      else target.fillText("—", tallyX, y);
    }
    target.textAlign = "right";
    target.fillStyle = ink;
    target.font = \`900 \${row.font}px 'Courier New', monospace\`;
    target.fillText(String(misses), right, y);
  }

  // A practice run's combo and score on a small green screen, like the
  // handheld's own.
  drawPracticeLcd(target, lcd, rhythm, ink) {
    target.fillStyle = ink;
    target.fillRect(lcd.x - 2, lcd.y - 2, lcd.w + 4, lcd.h + 4);
    target.fillStyle = "#2a3a22";
    target.fillRect(lcd.x, lcd.y, lcd.w, lcd.h);
    target.fillStyle = "rgba(168, 224, 112, 0.08)";
    for (let row = lcd.y + 2; row < lcd.y + lcd.h; row += 3) target.fillRect(lcd.x, row, lcd.w, 1);
    target.font = "900 9px 'Courier New', monospace";
    target.fillStyle = "#6f9a4c";
    target.textAlign = "left";
    target.fillText("COMBO", lcd.x + 7, lcd.y + 9);
    target.textAlign = "right";
    target.fillText("SCORE", lcd.x + lcd.w - 7, lcd.y + 9);
    target.font = "900 16px 'Courier New', monospace";
    target.fillStyle = "#b6ec7c";
    target.textAlign = "left";
    target.fillText(String(rhythm?.combo || 0).padStart(3, "0"), lcd.x + 7, lcd.y + 25);
    target.textAlign = "right";
    target.fillText(String(rhythm?.roundScore || 0).padStart(6, "0"), lcd.x + lcd.w - 7, lcd.y + 25);
  }

  // The phone's row above the track (PORTRAIT_FIGHT.stats): Dr. Beauty's
  // name, hearts (level 7: the hype bar), combo and score in a line; in a
  // practice run, his staff ID as a strip.
  drawTallFightStats(target, rhythm) {
    const box = PORTRAIT_FIGHT.stats;
    target.save();
    if (this.isHealthlessRun()) {
      this.drawTallPracticeStrip(target, box, rhythm);
      target.restore();
      return;
    }
    target.fillStyle = "#08090d";
    target.fillRect(box.x, box.y, box.w, box.h);
    target.strokeStyle = "#f4f0dc";
    target.lineWidth = 4;
    target.strokeRect(box.x + 2, box.y + 2, box.w - 4, box.h - 4);
    const mid = box.y + box.h / 2 + 1;
    target.textBaseline = "middle";
    target.font = "900 22px 'Courier New', monospace";
    target.textAlign = "left";
    target.fillStyle = "#f4f0dc";
    target.fillText(HERO_TAG, box.x + 16, mid);
    const nameEnd = box.x + 16 + target.measureText(HERO_TAG).width;
    target.textAlign = "right";
    target.fillStyle = "#f7f2de";
    const score = \`SCORE \${String(rhythm?.roundScore || 0).padStart(6, "0")}\`;
    target.fillText(score, box.x + box.w - 16, mid);
    const comboEnd = box.x + box.w - 16 - target.measureText(score).width - 22;
    const combo = \`COMBO \${rhythm?.combo || 0}\`;
    target.fillStyle = "#8fe8ff";
    target.fillText(combo, comboEnd, mid);
    const left = nameEnd + 22, right = comboEnd - target.measureText(combo).width - 22;
    if (this.isConcertRhythm()) {
      this.drawConcertCrowdMeter(target, box, rhythm, this.time || 0, { x: left, y: box.y + 9, w: right - left, h: box.h - 18 });
    } else {
      const maxHearts = Math.max(1, rhythm?.maxHealth || 3);
      const hearts = clamp(rhythm?.health ?? maxHearts, 0, maxHearts);
      const pitch = Math.min(38, (right - left) / maxHearts);
      target.font = "900 32px 'Courier New', monospace";
      target.textAlign = "center";
      for (let index = 0; index < maxHearts; index += 1) {
        target.fillStyle = index < hearts ? "#ef3f78" : "#30343a";
        target.fillText("♥", (left + right) / 2 + (index - (maxHearts - 1) / 2) * pitch, mid);
      }
    }
    target.restore();
  }

  // The practice badge laid on its side: the fight's colour band with
  // 員工證 · 練習, his ID photo and name, the 練習 stamp, the miss tally and
  // the green screen.
  drawTallPracticeStrip(target, box, rhythm) {
    const ink = "#1b2130";
    const paper = "#efe6cc";
    const card = { x: box.x, y: box.y, w: box.w - 4, h: box.h - 4 };
    target.textBaseline = "middle";
    target.fillStyle = "rgba(0, 0, 0, 0.45)";
    target.fillRect(card.x + 4, card.y + 4, card.w, card.h);
    target.fillStyle = ink;
    target.fillRect(card.x, card.y, card.w, card.h);
    target.fillStyle = paper;
    target.fillRect(card.x + 3, card.y + 3, card.w - 6, card.h - 6);
    target.fillStyle = "rgba(255, 255, 255, 0.5)";
    target.fillRect(card.x + 3, card.y + 3, card.w - 6, 2);
    const mid = card.y + card.h / 2;

    // The colour band, with the card's title in two lines.
    const band = { x: card.x + 3, y: card.y + 3, w: 92, h: card.h - 6 };
    target.fillStyle = this.getPracticeBadgeAccent();
    target.fillRect(band.x, band.y, band.w, band.h);
    target.fillStyle = ink;
    target.fillRect(band.x + band.w, band.y, 2, band.h);
    target.fillStyle = "#f7f2de";
    target.textAlign = "center";
    target.font = "900 13px 'Courier New', 'PingFang TC', 'Noto Sans TC', monospace";
    target.fillText(this.tr("STAFF ID", "員工證"), band.x + band.w / 2, mid - 8);
    target.fillText(this.tr("PRACTICE", "練習"), band.x + band.w / 2, mid + 9);

    // ID photo and name.
    let at = band.x + band.w + 12;
    drawPortrait(target, this.refs.bobby, at + 3, card.y + 9, card.h - 18, true);
    at += card.h - 18 + 14;
    target.textAlign = "left";
    target.fillStyle = ink;
    target.font = "900 16px 'Courier New', monospace";
    target.fillText(HERO_TAG, at, mid - 7);
    target.font = "900 11px 'PingFang TC', 'Noto Sans TC', 'Courier New', sans-serif";
    target.fillText(HERO_NAME_ZH, at, mid + 10);
    at += 108;

    // The practice stamp: red ink, knocked a few degrees off square.
    target.save();
    target.translate(at + 22, mid);
    target.rotate(-0.21);
    target.globalAlpha = 0.86;
    target.strokeStyle = "#c8323c";
    target.lineWidth = 2.5;
    target.strokeRect(-22, -12, 44, 24);
    target.lineWidth = 1;
    target.strokeRect(-18, -8, 36, 16);
    target.fillStyle = "#c8323c";
    target.textAlign = "center";
    target.font = "900 13px 'PingFang TC', 'Noto Sans TC', 'Courier New', sans-serif";
    target.fillText(this.tr("DRILL", "練習"), 0, 1);
    target.restore();
    at += 58;

    // The misses, and the counters on the green screen at the right end.
    const lcd = { x: card.x + card.w - 3 - 8 - 196, y: card.y + 5, w: 196, h: card.h - 10 };
    this.drawMissTally(target, { x: at, y: mid + 1, right: lcd.x - 14, indent: 40, glyph: 17, font: 14 }, Math.max(0, rhythm?.misses || 0), ink);
    this.drawPracticeLcd(target, lcd, rhythm, ink);
  }
`;
