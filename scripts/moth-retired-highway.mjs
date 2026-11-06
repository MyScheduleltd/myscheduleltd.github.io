// The highway walk and goat chase were replaced by the night-drive dialogue
// and the M.O.T.H river fight. Keep old entry points compatible, but prevent
// them from reviving those retired states or loading their unused layers.
import assert from 'node:assert/strict';

export const RETIRED_HIGHWAY_LAYERS = [
  'assets/maps/level5_highway/layers/level5-skyline-20260616.webp',
  'assets/maps/level5_highway/layers/level5-underground-20260616.webp',
  'assets/maps/level5_boss/layers/level5-boss-previous-style-foreground-loop-20260624.webp'
];

const ROAD = 'assets/maps/level5_highway/layers/level5-road-20260616.webp';
const SKYLINE = 'assets/maps/level5_boss/layers/level5-boss-previous-style-background-loop-20260624.webp';

export function cleanRetiredHighwayConfig(config) {
  for (const [stage, keep] of [['stage1', ROAD], ['stage2', SKYLINE]]) {
    const spec = config.level5?.[stage];
    assert(spec && Array.isArray(spec.parallaxLayers), `Highway layer metadata: ${stage}`);
    const active = spec.parallaxLayers.filter(layer => layer.source?.split('?')[0] === keep);
    assert.equal(active.length, 1, `Keep the current night-drive ${stage} layer`);
    spec.parallaxLayers = active;
  }
  return config;
}

export function patchRetiredHighway(source) {
  const once = (before, after) => {
    assert.equal(source.split(before).length, 2, `Highway cleanup anchor: ${before.slice(0, 90)}`);
    source = source.replace(before, after);
  };
  const method = (start, next, replacement) => {
    assert.equal(source.split(start).length, 2, `Highway cleanup method: ${start}`);
    const from = source.indexOf(start), to = source.indexOf(next, from + start.length);
    assert(to > from, `Highway cleanup next method: ${next}`);
    source = source.slice(0, from) + replacement + source.slice(to);
  };
  // The normal dialogue always reaches the current river engine. Old saves
  // or developer calls without a level5Drive marker follow that route too.
  method('  finishLevel5GanGanDialogue() {', '\n  boardLevel5Car() {', `  finishLevel5GanGanDialogue() {
    this.level5Drive = null;
    return this.startLevel5RiverFight();
  }
`);
  // Preserve the old API/URL as an alias. A developer preview remains free
  // play and cannot write story completion; normal legacy entries retain
  // their stage-one completion before entering the current fight.
  method('  enterLevel5BossFight(options = {}) {', '\n  spawnLevel5BossObject(', `  enterLevel5BossFight(options = {}) {
    if (options.fromDebug) this.freePlay = true;
    else if (!this.freePlay) this.completeStage("level5-stage1");
    return this.startLevel5RiverFight(options);
  }
`);
  // The 120 ms debug dispatcher already enters the alias. Its old second
  // attempt entered the office before retrying the retired chase.
  once(`        if (params.get("debugLevel5Boss") === "1") {
          window.setTimeout(async () => {
            if (this.state !== "title") return;
            await this.startLevel({ skipAudio: true });
            this.enterLevel5BossFight({ fromDebug: true });
          }, 900);
        }
`, '');
  once('image: this.refs.level5ParallaxLayers?.[1],', 'image: this.refs.level5ParallaxLayers?.[0],');
  return source;
}
