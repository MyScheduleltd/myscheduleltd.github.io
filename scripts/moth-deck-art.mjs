// The touch deck's art in styles.css (owner, 2026-10-17).
//
// The M/O/T/H buttons wear the Super Famicom pad's colours: a sheet made by
// scripts/make-moth-buttons.py and published as an addition
// (moth-asset-additions/), in place of the release's grey sheet, which the
// game used to tint as it loaded.
//
// The stylesheet also kept the art of earlier decks, which the game downloaded
// at every start-up (about 2 MB) and never showed: a joystick, orange and B
// buttons, an orange key, round and square caps, and the dark key art under
// every button, which later rules always replace. Checked by computing every
// element's art in every deck mode, layout, orientation and pressed state
// (only the ones listed in DECK_ART_KEPT ever show). Rules for buttons the
// game never creates go, and so do the old art's declarations; the files are
// not published (moth-asset-trim.mjs).
import assert from 'node:assert/strict';

export const MOTH_BUTTON_SHEET = {
  release: 'assets/ui/mobile_moth_buttons_20261002/sheet.webp?v=moth-gpt-20261002c',
  current: 'assets/ui/mobile_moth_buttons_20261017/sheet.webp?v=snes-20261017a'
};

export const RETIRED_DECK_ART = [
  'assets/sprites/mobile_control_pad_kit/ui/joystick-base.webp',
  'assets/sprites/mobile_control_pad_kit/ui/joystick-knob.webp',
  'assets/sprites/mobile_control_pad_kit/ui/key-dark.webp',
  'assets/sprites/mobile_control_pad_kit/ui/key-dark-pressed.webp',
  'assets/sprites/mobile_control_pad_kit/ui/key-orange.webp',
  'assets/sprites/mobile_control_pad_kit/ui/key-orange-pressed.webp',
  'assets/sprites/mobile_round_button_kit/ui/round-orange.webp',
  'assets/sprites/mobile_round_button_kit/ui/round-orange-pressed.webp',
  'assets/sprites/mobile_b_button_press/higgsfield-20260713/processed/b-press-strip.webp',
  'assets/ui/mobile_handheld_20260825/processed/button-flat-press-strip.webp',
  'assets/ui/mobile_flat_buttons_20260902/processed/rounds-transparent.webp',
  'assets/ui/mobile_flat_buttons_20260902/processed/squares-transparent.webp',
  MOTH_BUTTON_SHEET.release.split('?')[0]
];

// The art that does show: the grain, the arrow pad, the R button (walking,
// landscape), SPACE, 全螢幕 and the M/O/T/H buttons.
export const DECK_ART_KEPT = 7;

// Buttons and button groups of earlier decks, which the game never creates
// (createMobileControls makes the menu, system, arrow pad and actions groups).
const GONE = /mobile-joystick|mobile-button--(arc-[jbk]|arc-space|primary|cap-round|cap-square|cap-enter|office-accent|office-do|rhythm(-[dfjk])?|blank|wide)\b|mobile-control-group--(dialogue|overlay|failure|rhythm|office-rhythm)\b/;

// Splits a selector list at its top-level commas.
const selectors = text => {
  const parts = [];
  let depth = 0, from = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') depth--;
    else if (text[i] === ',' && !depth) { parts.push(text.slice(from, i)); from = i + 1; }
  }
  return [...parts, text.slice(from)];
};

export function patchDeckCss(css) {
  assert.equal(css.split(MOTH_BUTTON_SHEET.release).length, 2, 'the release button sheet');
  css = css.replace(MOTH_BUTTON_SHEET.release, MOTH_BUTTON_SHEET.current);
  // No comment or string in the stylesheet holds a brace, so the innermost
  // blocks are its rules.
  css = css.replace(/([^{}]*)\{([^{}]*)\}/g, (rule, prelude, body) => {
    const lead = prelude.match(/^(\s*(?:\/\*[\s\S]*?\*\/\s*)*)/)[1];
    const trail = prelude.slice(lead.length).match(/\s*$/)[0];
    const list = selectors(prelude.slice(lead.length, prelude.length - trail.length));
    // A :not() of a button that never exists excludes nothing; it is the rest
    // of the selector that has to match.
    const live = list.filter(selector => !GONE.test(selector.replace(/:not\([^)]*\)/g, '')));
    // A rule for those buttons goes with the comment in front of it.
    if (!live.length) return '';
    body = body.replace(/\n[^\n;]*url\("assets\/sprites\/mobile_control_pad_kit\/ui\/key-dark(-pressed)?\.webp[^\n]*;/g, '');
    return `${lead}${live.map((selector, index) => index ? selector : selector.replace(/^\s+/, '')).join(',')}${trail}{${body}}`;
  });
  css = css.replace(/\n@media[^{}]*\{\s*\}\n?/g, '');
  // Close up the gaps the removed rules left.
  css = css.replace(/\n{3,}/g, '\n\n').replace(/\}\n\s*\n\}/g, '}\n}');
  // The B button's press animation, which only it played.
  css = css.replace(/\n@keyframes mobile-b-button-press \{[^{}]*\{[^{}]*\}[^{}]*\{[^{}]*\}\s*\}\n/, '');
  assert(!css.includes('mobile-b-button-press'), 'the B button animation');
  css = replaceOnce(css, '/* Buttons wear the Higgsfield retro MP3-hardware key art. border-image keeps\n   the cream rim and corners crisp at every button aspect ratio. */\n',
    '/* Every deck button; each kind wears its own art below. */\n');
  for (const file of RETIRED_DECK_ART) assert(!css.includes(file), `Retired deck art still named: ${file}`);
  return css;
}

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, `Deck CSS anchor: ${before.slice(0, 60)}`);
  return source.replace(before, after);
}
