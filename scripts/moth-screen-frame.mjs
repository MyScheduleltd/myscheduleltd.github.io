// Keep the live canvas inside a real rounded aperture. Borders/shadows on an
// opaque, desynchronized canvas do not reliably clip its compositor surface.
// The existing layout and molded bezel belong to the enclosing element; only
// its child canvas is clipped, so the hardware's outer shadows stay visible.
import assert from 'node:assert/strict';

export function patchScreenFrameCss(css) {
  assert(css.includes('#game {') && css.includes('#portraitFight {'));
  return css.replace(/#game\b/g, '#game-viewport').replace(/#portraitFight\b/g, '#portrait-viewport') + `

/* Live pictures are behind the cabinet aperture, including portrait mode. */
#game-viewport,
#portrait-viewport {
  overflow: hidden;
  isolation: isolate;
  /* Gesture policy stays on the input canvas. A restrictive ancestor would
     override the game's runtime pinch-zoom allowance outside rhythm fights. */
  touch-action: auto;
}
#game,
#portraitFight {
  display: block;
  position: relative;
  z-index: 0;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  margin: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  background: #07080f;
  image-rendering: pixelated;
  touch-action: none;
}
@media (orientation: landscape), (min-width: 921px) {
  .film-grain-overlay {
    --film-edge: 4px;
    clip-path: inset(var(--film-edge) round calc(14px - var(--film-edge)));
  }
}
`;
}

export function wrapScreenFrameHtml(html) {
  const canvas = '<canvas id="game" width="1280" height="720" aria-label="Master of the House canvas"></canvas>';
  assert.equal(html.split(canvas).length, 2, 'One main screen canvas');
  return html.replace(canvas, '<div id="game-viewport">' + canvas + '</div>');
}

export function patchScreenFrame(once) {
  once('    canvas.insertAdjacentElement("afterend", element);', `    const viewport = document.createElement("div");
    viewport.id = "portrait-viewport";
    viewport.appendChild(element);
    document.getElementById("game-viewport").insertAdjacentElement("afterend", viewport);`);
}
