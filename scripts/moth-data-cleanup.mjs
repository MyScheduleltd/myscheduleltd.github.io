// Remove metadata for retired resources from the generated configuration.
// The immutable release remains the build input; active charts stay intact.
import assert from 'node:assert/strict';
import {TRIMMED_FILES} from './moth-asset-trim.mjs';

export const UNUSED_MAP_POINTERS = [
  ['sewer', 'bossArena'], ['sewer', 'stage3'], ['level3', 'stage1'],
  ['level4', 'stage1'], ['level5', 'stage1']
];
export const UNUSED_SPRITE_METADATA = [
  'level1HealthFx', 'level2Stage3Props', 'homeMp3Menu',
  'homeLyricsWindowIcon', 'homeLyricsWindowControls', 'loadingTransition',
  'level4BobbyVsIntro', 'level4BonitaGameBoss', 'level4BossStarShot',
  'level4BossGroundWave', 'finaleDuoSinging', 'finaleEndingFilmOverlay',
  'finaleForgeMachine', 'finaleForgeMenuTexture', 'finaleForgeRewardIcons'
];

export function cleanRuntimeData(config, runtimeSource) {
  assert(!/\bmapDataSource\b/.test(runtimeSource), 'Retired map pointers have no runtime reader');
  for (const keys of UNUSED_MAP_POINTERS) {
    const node = keys.reduce((value, key) => value[key], config);
    assert(TRIMMED_FILES.has(node.mapDataSource.split('?')[0]), 'Only retired map resources lose their pointers');
    delete node.mapDataSource;
  }
  for (const key of UNUSED_SPRITE_METADATA) {
    const read = new RegExp('\\.\\s*' + key + '\\b|\\[\\s*["\x27]' + key + '["\x27]\\s*\\]');
    // The explicit reachability audit keeps retired method bodies to record
    // unexpected calls. Keep metadata those bodies inspect in that mode.
    if (read.test(runtimeSource) && runtimeSource.includes('window.__retiredCalls')) continue;
    assert(!read.test(runtimeSource), 'Retired sprite metadata has no runtime reader: ' + key);
    assert(TRIMMED_FILES.has(config.sprites[key].source.split('?')[0]), 'Only retired sprite resources lose their metadata');
    delete config.sprites[key];
  }
  return config;
}
