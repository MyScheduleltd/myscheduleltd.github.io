import { readFileSync } from 'node:fs';

// The bilingual credits supplied in 美麗音遊文本.docx. The same credit lines
// appear in the home menu and the story finale, in album track order.
export const GAME_CREDIT_LINES = readFileSync(new URL('./moth-credits.txt', import.meta.url), 'utf8').trimEnd().split(/\r?\n/);
const GAME_CREDIT_PRODUCTION = ['我的檔期有限公司出品', 'A MY SCHEDULE PRODUCTION', '@myscheduleltd'];
const GAME_CREDIT_SECTIONS = [
  '遊戲製作團隊 Game Credits',
  '唱片公司／發行團隊 Label & Distribution Team',
  '視覺與宣傳製作 Visual & Promotional Team'
];

export function patchCredits(once, edit) {
  edit('// The game credits as the user supplied them on 2026-09-30', '// Every song\'s lyrics', () =>
    `const GAME_CREDIT_PRODUCTION = new Set(${JSON.stringify(GAME_CREDIT_PRODUCTION)});
const GAME_CREDIT_SECTIONS = new Set(${JSON.stringify(GAME_CREDIT_SECTIONS)});
const GAME_CREDIT_LINES = ${JSON.stringify(GAME_CREDIT_LINES, null, 2)};

function isGameCreditHeading(text) {
  return GAME_CREDIT_SECTIONS.has(text) || text.startsWith("♪ ");
}
// Every song's lyrics`);
  once('credits: this.tr("GAME CREDITS", "GAME CREDIT")',
    'credits: this.tr("GAME CREDITS", "遊戲製作名單")');
  once('    drawFittedText(target, "Game created by Michael. The Alchemist. @myscheduleltd", layout.title.x',
    '    drawFittedText(target, uiText("Game Credits", "遊戲製作名單"), layout.title.x');
  once('        headingColor: "#a43d2e",\n        trackColor: "rgba(32, 37, 42, 0.2)",',
    '        headingColor: "#a43d2e",\n        centredLines: GAME_CREDIT_PRODUCTION,\n        trackColor: "rgba(32, 37, 42, 0.2)",');

  once('match(/\\s+|[A-Za-z0-9]+', 'match(/\\s+|[$@]?[A-Za-z0-9]+');

  // The sheet and the roll both need to wrap long bilingual contributor lists.
  // Cache text measurement per sheet, width and font so scrolling does not
  // remeasure every credit or lyric each frame.
  once('function drawHomeLyricsText(target, lines, x, y, maxWidth, maxHeight, scroll = 0, options = {}) {',
    `const HOME_SHEET_WRAPS = new WeakMap();
function getHomeSheetWraps(target, lines, maxWidth) {
  let sizes = HOME_SHEET_WRAPS.get(lines);
  if (!sizes) {
    sizes = new Map();
    HOME_SHEET_WRAPS.set(lines, sizes);
  }
  const key = target.font + "/" + maxWidth;
  if (!sizes.has(key)) {
    sizes.set(key, lines.map(line => line ? getWrappedCanvasLines(target, line, maxWidth) : []));
  }
  return sizes.get(key);
}

function drawHomeLyricsText(target, lines, x, y, maxWidth, maxHeight, scroll = 0, options = {}) {`);
  edit('  let cursorY = contentTop - scroll;\n  lines.forEach((line) => {', '  });\n  target.restore();\n  const total = topInset', () =>
    `  target.font = "900 " + fontSize + "px " + CANVAS_UI_FONT;
  let cursorY = contentTop - scroll;
  getHomeSheetWraps(target, lines, maxWidth).forEach((wrapped, index) => {
    if (!wrapped.length) {
      cursorY += lineHeight * 0.65;
      return;
    }
    if (cursorY > contentBottom || cursorY + wrapped.length * lineHeight < contentTop) {
      cursorY += wrapped.length * lineHeight;
      return;
    }
    const line = lines[index];
    const centred = options.centredLines?.has(line);
    const heading = options.headingColor && (centred || isGameCreditHeading(line));
    target.textAlign = centred ? "center" : "left";
    target.fillStyle = heading ? options.headingColor : color;
    const lineX = centred ? x + maxWidth / 2 : x;
    for (const fragment of wrapped) {
      target.fillText(fragment, lineX, cursorY, maxWidth);
      cursorY += lineHeight;
    }
  });
  target.restore();
  const total = topInset`);
  edit('function measureWrappedHomeLineHeight(', 'const CANVAS_UI_FONT', () => 'const CANVAS_UI_FONT');

  once('      { kind: "title", text: "Game created by Michael. The Alchemist. @myscheduleltd" },\n      ...GAME_CREDIT_LINES.map(text => ({ kind: !text ? "spacer" : text.startsWith("♪ ") ? "song" : "line", text }))',
    `      { kind: "title", text: GAME_TITLE },
      ...GAME_CREDIT_LINES.map(text => ({
        kind: !text ? "spacer" : GAME_CREDIT_PRODUCTION.has(text) ? "title" : isGameCreditHeading(text) ? "heading" : "line",
        text
      }))`);
  once('      const size = entry.kind === "title" ? 26 : entry.kind === "song" ? 24 : 20;',
    '      const size = entry.kind === "title" ? 26 : entry.kind === "heading" ? 24 : 20;');
  once(`      const lines = entry.kind === "spacer" ? [] : entry.kind === "title"
        ? [...getWrappedCanvasLines(target, "Game created by Michael.", width - 28),
          ...getWrappedCanvasLines(target, "The Alchemist.", width - 28), "@myscheduleltd"]
        : getWrappedCanvasLines(target, entry.text, width - 28);`,
    '      const lines = entry.kind === "spacer" ? [] : getWrappedCanvasLines(target, entry.text, width - 28);');
  once('      target.fillStyle = row.kind === "song" ? "#e8c27d" : "#efe8d8";',
    '      target.fillStyle = row.kind === "heading" ? "#e8c27d" : "#efe8d8";');
  once('        target.fillText(line, rect.x + rect.w / 2, y);\n        y += row.size * 1.4;',
    '        target.fillText(line, rect.x + rect.w / 2, y, rect.w - 28);\n        y += row.size * 1.4;');
  // The final card belongs to the full credits sequence, including replays.
  once('    if (this.finaleEndingPhase === "thanks" && !this.freePlay) {\n      this.completeStage("finale-stage1");',
    '    if (this.finaleEndingPhase === "thanks") {\n      if (!this.freePlay) this.completeStage("finale-stage1");');
  edit('      const notices = [\n', '      target.restore();\n      return;', () => `      const notices = [
        this.tr("All songs have been unlocked in the playlist.", "所有歌曲已在播放清單解鎖。"),
        this.tr("Two hidden levels have been unlocked in Stage Select.", "兩個隱藏關卡已在關卡選擇解鎖。")
      ];
      const blocks = notices.map(text => getWrappedCanvasLines(target, text, W - 96));
      const lineHeight = size * 1.5;
      const paragraphGap = 32;
      const promptGap = 48;
      const blockH = blocks.reduce((sum, lines) => sum + lines.length * lineHeight, 0);
      let y = (H - blockH - paragraphGap - promptGap - 22) / 2;
      blocks.forEach((lines, index) => {
        if (index > 0) y += paragraphGap;
        for (const line of lines) {
          target.fillText(line, W / 2, y);
          y += lineHeight;
        }
      });
      target.font = "900 22px 'Courier New', monospace";
      target.fillText(this.tr("O / ENTER / TAP", "O / ENTER / 點一下"), W / 2, y + promptGap);
      target.restore();
      return;`);
  once('      drawFittedText(target, "THANK YOU FOR PLAYING", W / 2, H * 0.45,',
    '      drawFittedText(target, this.tr("THANK YOU FOR PLAYING", "感謝遊玩"), W / 2, H * 0.45,');
  once('    target.fillText("SKIP", skip.x + skip.w / 2, skip.y + skip.h / 2);',
    '    target.fillText(this.tr("SKIP", "跳過"), skip.x + skip.w / 2, skip.y + skip.h / 2);');
}
