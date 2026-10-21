// The game credits (owner, 2026-10-21).
//
// The GAME CREDITS page's bar read "Game created by Michael. The Alchemist.
// @myscheduleltd"; it now reads "Game Credits". The sheet under it opens with
// who made the game, as the owner typed it, then the production lines, centred
// in the song titles' red, then every song's credits as before. The roll at
// the end of the story follows: "Game Credits" as its large title, the same
// lines, the production lines large, then the songs.

// The owner's lines, spaces and all, after a blank line (owner: room at the
// top of the sheet).
export const GAME_CREDIT_HEAD = [
  '',
  '遊戲製作 Game Development ｜麥克爾·大島秀夫 Michael.',
  '遊戲企劃 Game Design｜美麗本人 Dr. Beauty ／就叫麥克爾吧 Michael. ／小賊賊  MinYun Lee',
  '',
  '我的檔期有限公司出品',
  'A MY SCHEDULE PRODUCTION',
  '@myscheduleltd',
  ''
];
export const GAME_CREDIT_PRODUCTION = ['我的檔期有限公司出品', 'A MY SCHEDULE PRODUCTION', '@myscheduleltd'];

export function patchCredits(once) {
  once('// The "Game created by ..." line heads the page, above the sheet.\nconst GAME_CREDIT_LINES = [\n',
    `// Who made the game and the production lines open it (moth-credits.mjs).
const GAME_CREDIT_PRODUCTION = new Set(${JSON.stringify(GAME_CREDIT_PRODUCTION)});
const GAME_CREDIT_LINES = [
${GAME_CREDIT_HEAD.map(line => '  ' + JSON.stringify(line) + ',\n').join('')}`);
  // The page: its bar, and the production lines centred in the headings' red.
  once('    drawFittedText(target, "Game created by Michael. The Alchemist. @myscheduleltd", layout.title.x',
    '    drawFittedText(target, "Game Credits", layout.title.x');
  once('        headingColor: "#a43d2e",\n        trackColor: "rgba(32, 37, 42, 0.2)",',
    '        headingColor: "#a43d2e",\n        centredLines: GAME_CREDIT_PRODUCTION,\n        trackColor: "rgba(32, 37, 42, 0.2)",');
  once('    const heading = options.headingColor && line.startsWith("♪ ");\n    cursorY = drawWrappedHomeLine(target, line, x, cursorY, maxWidth, lineHeight, fontSize, heading ? options.headingColor : color);',
    `    const heading = options.headingColor && line.startsWith("♪ ");
    // A centred line (the credits' production lines) takes the headings' colour.
    if (options.centredLines?.has(line)) {
      target.textAlign = "center";
      cursorY = drawWrappedHomeLine(target, line, x + maxWidth / 2, cursorY, maxWidth, lineHeight, fontSize, options.headingColor || color);
      target.textAlign = "left";
      return;
    }
    cursorY = drawWrappedHomeLine(target, line, x, cursorY, maxWidth, lineHeight, fontSize, heading ? options.headingColor : color);`);
  // The roll: "Game Credits" for its title, and the production lines as large.
  once('      { kind: "title", text: "Game created by Michael. The Alchemist. @myscheduleltd" },\n      ...GAME_CREDIT_LINES.map(text => ({ kind: !text ? "spacer" : text.startsWith("♪ ") ? "song" : "line", text }))',
    '      { kind: "title", text: "Game Credits" },\n      ...GAME_CREDIT_LINES.map(text => ({ kind: !text ? "spacer" : GAME_CREDIT_PRODUCTION.has(text) ? "title" : text.startsWith("♪ ") ? "song" : "line", text }))');
  once(`      const lines = entry.kind === "spacer" ? [] : entry.kind === "title"
        ? [...getWrappedCanvasLines(target, "Game created by Michael.", width - 28),
          ...getWrappedCanvasLines(target, "The Alchemist.", width - 28), "@myscheduleltd"]
        : getWrappedCanvasLines(target, entry.text, width - 28);`,
    `      const lines = entry.kind === "spacer" ? [] : getWrappedCanvasLines(target, entry.text, width - 28);`);
}
