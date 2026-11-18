// The fight's buttons, notes and phone layout (owner, 2026-10-17).
//
// Colours: the Super Famicom pad's, M blue, O red, T yellow, H green, on the
// notes and on the deck's buttons (scripts/make-moth-buttons.py makes their
// sheet from this table). T is a deeper yellow than the track's, so its notes
// stand out on it; its letter is cream like the others' (owner, 2026-10-18:
// the dark T looked out of place). On every device.
//
// The phone (the tall view, renderTallScreen): the timing track runs the whole
// width at the same size as before, its hit line and row of notes in the
// middle of it, 1.9 s of notes either side. Dr. Beauty's staff badge sits
// beside the track on desktop and above it as a strip on phones. Both runs
// show his portrait, mode stamp, miss tally and green screen. Level 7 adds
// its crowd meter. The phone draws GANGAN's feedback above the badge.
//
// No hearts (owner, 2026-10-22): story fights can no longer be lost. Misses
// cost nothing but the rank, as in practice; level 5's reach and level 7's
// hype are shown but no longer fail a story fight. Dr. Beauty's badge shows
// the 失誤 tally once he misses. (The heart back every 10 in a row went away
// with the hearts.)

export const MOTH_NOTE_COLOURS = { M: "#2457c5", O: "#e0463e", T: "#ecb300", H: "#2ea878" };

export function patchFightHud(once, edit) {
  once('const MOTH_NOTE_COLOURS = { T: "#ef3f78", O: "#4a4d53", M: "#3d7fd1", H: "#2f9467" };', `const MOTH_NOTE_COLOURS = ${JSON.stringify(MOTH_NOTE_COLOURS)};`);

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

  // Level 7's compact hype bar fits beneath the miss tally in either badge.
  once('  drawConcertCrowdMeter(target, bounds, rhythm, motionTime = 0) {\n    const hype = clamp(rhythm?.hype ?? 0.3, 0, 1);\n    const bar = { x: bounds.x + 22, y: bounds.y + 56, w: bounds.w - 44, h: 26 };',
    '  drawConcertCrowdMeter(target, bar, rhythm, motionTime) {\n    const hype = clamp(rhythm?.hype ?? 0.3, 0, 1);');
  once('    drawFittedText(target, label, bar.x + bar.w / 2, bar.y + bar.h + 13, bounds.w - 16, 12, 900, 8);\n', `    target.font = \`900 \${bar.h - 3}px 'Courier New', 'PingFang TC', monospace\`;
    target.lineJoin = "round";
    target.lineWidth = 3;
    target.strokeStyle = "#08090d";
    target.strokeText(label, bar.x + bar.w / 2, bar.y + bar.h / 2 + 1, bar.w - 12);
    target.fillText(label, bar.x + bar.w / 2, bar.y + bar.h / 2 + 1, bar.w - 12);
`);

  // No hearts: every run is healthless and uses the same staff badge layout.
  once('  isHealthlessRun() {\n    return Boolean(this.freePlay);\n  }', '  // No fight is lost on hearts, in story mode either (owner, 2026-10-22).\n  isHealthlessRun() {\n    return true;\n  }');
  edit('    // The lower ribbon carries only the information needed to play: the hearts,\n', '    if (failedCard && rhythm) rhythm.failureOptionRects = this.getLevel1OfficeFailureOptionRects();', () => `    // Draw the matching staff badge beside the beat track.
    target.fillStyle = "#08090d";
    target.fillRect(0, ribbonTop, VIEW_W, VIEW_H - ribbonTop);
    this.renderLevel1OfficeProfileBadge(target, lifeBounds, rhythm, motionTime);

    if (failedCard && rhythm) rhythm.failureOptionRects = this.getLevel1OfficeFailureOptionRects();`);
  // Level 5's reach and level 7's hype no longer fail a story fight.
  once('      if (this.isConcertRhythm()) rhythm.reviewResult = rhythm.hype >= 1 - 1e-9 ? "PASSED" : "COLD";',
    '      if (this.isConcertRhythm()) rhythm.reviewResult = rhythm.hype >= 1 - 1e-9 || !this.freePlay ? "PASSED" : "COLD";');
  once('        if (reach.bobby < reach.gangan) rhythm.reviewResult = "OUT-REACHED";',
    '        if (reach.bobby < reach.gangan && this.freePlay) rhythm.reviewResult = "OUT-REACHED";');
  // Their results say how it went: a cold crowd or GAN GAN ahead, though passed.
  once('    const outReached = rhythm.reviewResult === "OUT-REACHED";\n', '    const outReached = rhythm.reviewResult === "OUT-REACHED";\n    const ganganAhead = Boolean(rhythm.riverFinal && rhythm.riverFinal.bobby < rhythm.riverFinal.gangan);\n');
  once('      ? (passed ? this.tr("THE CROWD WENT WILD", "全場嗨翻") : this.tr("THE CROWD WENT COLD", "全場冷掉了"))',
    '      ? (passed && rhythm.hype >= 1 - 1e-9 ? this.tr("THE CROWD WENT WILD", "全場嗨翻") : this.tr("THE CROWD WENT COLD", "全場冷掉了"))');
  once('      ? (passed ? this.tr("FURTHEST STREAM", "尿得最遠") : outReached ? this.tr("GAN GAN WINS", "GAN GAN 尿得比較遠") : this.tr("RAN DRY", "尿不出來了"))',
    '      ? (passed && !ganganAhead ? this.tr("FURTHEST STREAM", "尿得最遠") : outReached || ganganAhead ? this.tr("GAN GAN WINS", "GAN GAN 尿得比較遠") : this.tr("RAN DRY", "尿不出來了"))');
  // The staff badge's parts the phone's strip shares.
  once('  renderLevel1OfficePracticeBadge(target, bounds, rhythm) {', '  renderLevel1OfficeProfileBadge(target, bounds, rhythm, motionTime) {');
  once('    const bathroom = this.isBathroomRhythm();\n    const accent = this.isConcertRhythm() ? "#8a3fb0" : this.isRiverRhythm() ? "#2f6f8f" : this.isArcadeRhythm() ? "#3552a8" : this.isMassageRhythm() ? "#c0506a" : bathroom ? "#3a9a8a" : "#2d7ec2";',
    '    const accent = this.getFightBadgeAccent();');
  once('    target.fillText(this.tr("STAFF ID  ·  PRACTICE", "員工證 · 練習"), x + w / 2 - 3, y + 26);',
    '    target.fillText(this.tr("STAFF ID", "員工證") + " · " + this.getFightBadgeModeLabel(), x + w / 2 - 3, y + 26);');
  once('    target.fillText(this.tr("DRILL", "練習"), 0, 1);\n    target.restore();',
    '    drawFittedText(target, this.getFightBadgeModeLabel(true), 0, 1, 40, 15, 900, 5);\n    target.restore();');
  edit('    const misses = Math.max(0, rhythm?.misses || 0);\n', '    target.fillText(String(misses), x + w - 16, rowY);\n', () => `    const misses = Math.max(0, rhythm?.misses || 0);
    const concert = this.isConcertRhythm();
    const rowY = y + (concert ? 102 : 110);
    this.drawMissTally(target, { x: x + 14, y: rowY, right: x + w - 16, indent: 38, glyph: 15, font: 12 }, misses, ink);
    if (concert) {
      this.drawConcertCrowdMeter(target, { x: x + 12, y: y + 114, w: w - 26, h: 14 }, rhythm, motionTime);
    } else {
      target.fillStyle = ink;
      target.fillRect(x + 12, rowY + 11, w - 26, 1);
    }
`);
  edit('    const lcd = { x: x + 12, y: y + h - 50, w: w - 26, h: 36 };\n', '    target.fillText(String(rhythm?.roundScore || 0).padStart(6, "0"), lcd.x + lcd.w - 7, lcd.y + 25);\n', () =>
    '    this.drawFightBadgeLcd(target, { x: x + 12, y: y + h - 50, w: w - 26, h: 36 }, rhythm, ink);\n');
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

  getFightBadgeModeLabel(stamp = false) {
    return this.freePlay ? this.tr(stamp ? "DRILL" : "PRACTICE", "練習") : this.tr("OFFICIAL", "正式");
  }

  getFightBadgeAccent() {
    return this.isConcertRhythm() ? "#8a3fb0" : this.isRiverRhythm() ? "#2f6f8f" : this.isArcadeRhythm() ? "#3552a8"
      : this.isMassageRhythm() ? "#c0506a" : this.isBathroomRhythm() ? "#3a9a8a" : "#2d7ec2";
  }

  // A fight's misses: 失誤, then a 正 for every five, stroke by stroke in the
  // character's own order (up to four, or row.maxGroups, then ×n where it
  // fits before the count), and the count at the right; the strokes in red,
  // or row.tally.
  drawMissTally(target, row, misses, ink) {
    const { x, y, right, glyph } = row;
    const fullGroups = Math.floor(misses / 5);
    const shownGroups = Math.min(fullGroups, row.maxGroups || 4);
    target.textAlign = "left";
    target.fillStyle = ink;
    target.font = \`900 \${row.font}px 'Courier New', 'PingFang TC', 'Noto Sans TC', monospace\`;
    target.fillText(this.tr("MISS", "失誤"), x, y);
    if (!misses) return;
    let tallyX = x + row.indent;
    target.fillStyle = row.tally || "#b3202c";
    for (let group = 0; group < shownGroups; group += 1) {
      drawTallyZheng(target, tallyX, y - glyph / 2, glyph, 5);
      tallyX += glyph + 5;
    }
    if (fullGroups > shownGroups) {
      target.font = \`900 \${row.font}px 'Courier New', monospace\`;
      const mark = \`×\${fullGroups}\`;
      if (tallyX + target.measureText(mark).width <= right - target.measureText(String(misses)).width - 8) target.fillText(mark, tallyX, y);
    } else if (misses % 5) {
      drawTallyZheng(target, tallyX, y - glyph / 2, glyph, misses % 5);
    }
    target.textAlign = "right";
    target.fillStyle = ink;
    target.font = \`900 \${row.font}px 'Courier New', monospace\`;
    target.fillText(String(misses), right, y);
  }

  // The combo and score on a small green screen, like the handheld's own.
  drawFightBadgeLcd(target, lcd, rhythm, ink) {
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

  // The phone lays the staff badge on its side above the track.
  drawTallFightStats(target, rhythm) {
    const box = PORTRAIT_FIGHT.stats;
    target.save();
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
    target.fillStyle = this.getFightBadgeAccent();
    target.fillRect(band.x, band.y, band.w, band.h);
    target.fillStyle = ink;
    target.fillRect(band.x + band.w, band.y, 2, band.h);
    target.fillStyle = "#f7f2de";
    target.textAlign = "center";
    target.font = "900 13px 'Courier New', 'PingFang TC', 'Noto Sans TC', monospace";
    target.fillText(this.tr("STAFF ID", "員工證"), band.x + band.w / 2, mid - 8);
    target.fillText(this.getFightBadgeModeLabel(), band.x + band.w / 2, mid + 9);

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

    // The mode stamp: red ink, knocked a few degrees off square.
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
    drawFittedText(target, this.getFightBadgeModeLabel(true), 0, 1, 34, 13, 900, 5);
    target.restore();
    at += 58;

    // The misses, and the counters on the green screen at the right end.
    const lcd = { x: card.x + card.w - 3 - 8 - 196, y: card.y + 5, w: 196, h: card.h - 10 };
    const concert = this.isConcertRhythm();
    this.drawMissTally(target, { x: at, y: mid + (concert ? -10 : 1), right: lcd.x - 14, indent: 40, glyph: 17, font: 14 }, Math.max(0, rhythm?.misses || 0), ink);
    if (concert) {
      this.drawConcertCrowdMeter(target, { x: at, y: mid + 2, w: lcd.x - at - 14, h: 14 }, rhythm, this.time || 0);
    }
    this.drawFightBadgeLcd(target, lcd, rhythm, ink);
    target.restore();
  }
`;
