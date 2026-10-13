// Key-fringe cleanup for the sprites cut from a magenta background (owner,
// 2026-10-13: a purple outline around Dr. Beauty's portraits after level 4's
// win talk). Every sprite with leftovers was reviewed before and after with
// the owner, who approved these 56; level 3's notes are left out (their purple
// is meant). The files are unchanged, so their verified mirror copies still
// load; the game cleans each as it loads (loadImage in moth-runtime-patches.mjs).
//
// Only a sprite's 2 px outer edge changes: a magenta-tinted edge pixel takes
// the hue of the solid colours around it, at its own brightness, so a dark
// outline stays dark. Edges beside genuinely pink or purple art inside the
// sprite are left alone, and translucent leftovers with nothing solid nearby
// are cleared. The prototype that drew the review images implemented the same
// rule in Python (2026-10-13 session).

export const KEY_FRINGE_SPRITES = [
  'assets/sprites/bobby_bathing_suit_level2/processed-v4/sheet-transparent.webp',
  'assets/sprites/bobby_black_hood_level5/processed-v5/sheet-transparent.webp',
  'assets/sprites/bobby_champion_fit_level4/processed-v5/sheet-transparent.webp',
  'assets/sprites/bobby_finale_bikini/processed-v4/sheet-transparent.webp',
  'assets/sprites/bobby_level6_performer/processed-v3/sheet-transparent.webp',
  'assets/sprites/bobby_orange_diaper_attack/processed-v4/sheet-transparent.webp',
  'assets/sprites/bobby_orange_onfoot/processed-v6/sheet-transparent.webp',
  'assets/sprites/bobby_orange_ride/processed-v4/sheet-transparent.webp',
  'assets/sprites/bobby_summer_fit_level2/processed-v7/sheet-transparent.webp',
  'assets/sprites/bobby_tutorial_intro/processed-v5/sheet-transparent.webp',
  'assets/sprites/bobby_underwear_level1/processed-v4/sheet-transparent.webp',
  'assets/sprites/bobby_vs_intro/processed-v3/sheet-transparent.webp',
  'assets/sprites/bonita_blanket_idle_v5/processed/sheet-transparent.webp',
  'assets/sprites/bonita_boss_placeholder/processed/sheet-transparent.webp',
  'assets/sprites/bonita_boss_star_shot/processed/sheet-transparent.webp',
  'assets/sprites/bonita_game_avatar_boss/processed/sheet-transparent.webp',
  'assets/sprites/gangan_bike_exit_level1/processed/sheet-transparent.webp',
  'assets/sprites/gangan_candy_eat/processed/sheet-transparent.webp',
  'assets/sprites/gangan_defeat_exit/processed/sheet-transparent.webp',
  'assets/sprites/gangan_scooter_ride/processed-v2/sheet-transparent.webp',
  'assets/sprites/home_lyrics_window_controls/processed/sheet-transparent.webp',
  'assets/sprites/level1_health_fx/processed/sheet-transparent.webp',
  'assets/sprites/level1_office_dialogue/processed-defringed-20260901/sheet-transparent.webp',
  'assets/sprites/level1_office_gangan/processed-gpt-20261001/sheet-transparent.webp',
  'assets/sprites/level1_office_gangan_coach/processed-20260902/sheet-transparent.webp',
  'assets/sprites/level1_office_props/processed-deskpaper-20260901/sheet-transparent.webp',
  'assets/sprites/level1_office_props/processed-stampfx-20260901/sheet-transparent.webp',
  'assets/sprites/level2_bathroom_dialogue/processed-bust-20260904/sheet-transparent.webp',
  'assets/sprites/level2_bathroom_hands/processed-chop-20260928/sheet-transparent.webp',
  'assets/sprites/level2_bathroom_mosquito/processed-20260902/sheet-transparent.webp',
  'assets/sprites/level2_boss_mosquito/processed/sheet-transparent.webp',
  'assets/sprites/level2_chest_bundle/processed-bobby-aligned/sheet-transparent.webp',
  'assets/sprites/level2_stage3_props/processed_clean/sheet-transparent.webp',
  'assets/sprites/level3_rhythm_hp_bottle_note/processed/sheet-transparent.webp',
  'assets/sprites/level3_rhythm_massage_loop/processed/sheet-transparent.webp',
  'assets/sprites/level3_ui_receptors_v2/processed/sheet-transparent.webp',
  'assets/sprites/level4_arcade_fight/bonita-left-20261009/processed/l4-players-left.webp',
  'assets/sprites/level4_arcade_fight/processed/l4-bonita-fighter.webp',
  'assets/sprites/level4_hidden_wall_chest/processed/sheet-transparent.webp',
  'assets/sprites/level5_boss_road_objects/processed/sheet-transparent.webp',
  'assets/sprites/level5_goat_run/processed/sheet-transparent.webp',
  'assets/sprites/level5_poop_obstacle/processed/sheet-transparent.webp',
  'assets/sprites/level5_rhythm_hit_fx/processed/sheet-transparent.webp',
  'assets/sprites/level5_river/processed-gpt-20261005/dr-beauty.webp',
  'assets/sprites/level5_river/processed-gpt-20261005/drive-car.webp',
  'assets/sprites/level5_river/processed-gpt-20261005/gangan.webp',
  'assets/sprites/level6_concert/processed-gpt-20261006/crowd.webp',
  'assets/sprites/level6_concert/processed-gpt-20261006/dr-beauty.webp',
  'assets/sprites/level6_concert/processed-gpt-20261006/dream-bubble.webp',
  'assets/sprites/level6_concert/processed-gpt-20261006/gangan.webp',
  'assets/sprites/level6_fans_profile/processed/sheet-transparent.webp',
  'assets/sprites/secret_levels/processed/drb-squat.webp',
  'assets/sprites/secret_levels/processed/gg-squat.webp',
  'assets/sprites/secret_levels/processed/spa-tickle.webp',
  'assets/sprites/zuxian_exit_right/processed/sheet-transparent.webp',
  'assets/sprites/zuxian_idle/processed/sheet-transparent.webp'
];

export const CLEAN_KEY_FRINGE = String.raw`
const KEY_FRINGE_SPRITES = new Set(${JSON.stringify(KEY_FRINGE_SPRITES)});

// Resolves to a drawable copy of the image with its key fringe cleaned (an
// ImageBitmap that answers naturalWidth/complete like the image), or the image
// itself if anything fails.
async function cleanKeyFringe(image) {
  try {
    const w = image.naturalWidth, h = image.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const context = canvas.getContext('2d', {willReadFrequently: true});
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, w, h), d = pixels.data;
    const tinted = i => d[i] - d[i + 1] > 40 && d[i + 2] - d[i + 1] > 25;
    // Within 2 px of a fully transparent pixel (worked out when first asked).
    const near = new Int8Array(w * h).fill(-1);
    const edge = (x, y) => {
      const k = y * w + x;
      if (near[k] < 0) {
        near[k] = 0;
        for (let yy = Math.max(0, y - 2); yy <= Math.min(h - 1, y + 2) && !near[k]; yy++)
          for (let xx = Math.max(0, x - 2); xx <= Math.min(w - 1, x + 2); xx++) if (d[(yy * w + xx) * 4 + 3] === 0) { near[k] = 1; break; }
      }
      return near[k] === 1;
    };
    const fixes = [], clear = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (!d[i + 3] || !tinted(i) || !edge(x, y)) continue;
        let pink = false, n = 0, r = 0, g = 0, b = 0, solid = false;
        for (let yy = Math.max(0, y - 3); yy <= Math.min(h - 1, y + 3) && !pink; yy++) {
          for (let xx = Math.max(0, x - 3); xx <= Math.min(w - 1, x + 3); xx++) {
            const j = (yy * w + xx) * 4;
            if (d[j + 3] < 250) continue;
            if (Math.abs(yy - y) <= 2 && Math.abs(xx - x) <= 2) solid = true;
            if (edge(xx, yy)) continue;
            if (tinted(j)) { pink = true; break; }
            n++; r += d[j]; g += d[j + 1]; b += d[j + 2];
          }
        }
        if (pink) continue;
        if (n) fixes.push(i, r / n, g / n, b / n);
        else if (d[i + 3] < 160 && !solid) clear.push(i);
      }
    }
    const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
    for (let f = 0; f < fixes.length; f += 4) {
      const i = fixes[f], scale = luma(d[i], d[i + 1], d[i + 2]) / Math.max(1, luma(fixes[f + 1], fixes[f + 2], fixes[f + 3]));
      for (let c = 0; c < 3; c++) d[i + c] = Math.min(255, Math.round(fixes[f + 1 + c] * scale));
    }
    for (const i of clear) d[i + 3] = 0;
    const bitmap = await createImageBitmap(pixels);
    canvas.width = canvas.height = 0;
    return Object.assign(bitmap, {naturalWidth: w, naturalHeight: h, complete: true, fringeCleaned: fixes.length / 4 + clear.length});
  } catch {
    return image;
  }
}
`;
