/**
 * Saves the running festival's settings into the repository.
 *
 * The service runs on a plan with no disk that survives a deploy, so everything
 * STAFF set through the panel — running orders, venue names and subtitles, the
 * works they added, the gate wording, DJ pages, NPCs and their introductions —
 * lives only in the memory of the instance currently serving. Deploying throws
 * it away. Committing the output of this script is what makes those settings
 * outlive a deploy: the service reads it at boot whenever it has nothing of
 * its own.
 *
 * Run it before deploying, or after a session of changes worth keeping:
 *
 *     node world/scripts/capture-state.mjs
 *     node world/scripts/capture-state.mjs http://127.0.0.1:8787
 *     node world/scripts/capture-state.mjs --jukebox-only
 *
 * FESTIVAL_SEED_FILE, the variable the service boots from, writes the capture
 * somewhere other than the committed seed; the tests use it to check that a
 * capture really does come back after a deploy.
 *
 * It reads only the public settings endpoint, so it needs no STAFF key, and it
 * deliberately captures neither the key nor the chat: the repository is public,
 * and neither belongs in it.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const arguments_=process.argv.slice(2);
const jukeboxOnly=arguments_.includes('--jukebox-only');
const service = (arguments_.find(argument=>!argument.startsWith('--')) ?? 'https://myschedule-festival.onrender.com').replace(/\/$/, '');
const configuredTarget = (process.env.FESTIVAL_SEED_FILE ?? '').trim();
const target = configuredTarget && configuredTarget !== 'off'
  ? resolve(configuredTarget)
  : fileURLToPath(new URL('../server/festival-seed.json', import.meta.url));

const response = await fetch(`${service}/api/config`);
if (!response.ok) {
  console.error(`Could not read ${service}/api/config — HTTP ${response.status}.`);
  console.error('The free instance sleeps when idle; the first request can take a moment. Try again.');
  process.exit(1);
}
const live = await response.json();
// The receipt mailbox is committed by hand, not captured: the public endpoint
// is not where it belongs (see server.test.mjs), so it is carried over from the
// seed already in the repository rather than dropped.
const previous = await readFile(target, 'utf8').then(JSON.parse).catch(() => ({}));

// A catalogue-only capture cannot overwrite newer local venue/NPC edits.
// The array order is itself the shelf order, not the temporary request queue.
if(jukeboxOnly){
  if(!Array.isArray(live.jukebox?.tracks))throw new Error('The service returned no jukebox catalogue; the seed was left unchanged.');
  const jukeboxTracks=live.jukebox.tracks.map(track=>({id:track.id,youtubeId:track.youtubeId,title:track.title}));
  await writeFile(target,`${JSON.stringify({...previous,jukeboxTracks,jukeboxCapturedAt:new Date().toISOString(),jukeboxCapturedFrom:service},null,2)}\n`,'utf8');
  console.log(`Saved ${jukeboxTracks.length} jukebox records in shelf order from ${service}; other seeded settings were preserved.`);
  process.exit(0);
}

if (!live.schedule || typeof live.schedule !== 'object') {
  console.error('That response carried no programme, so there is nothing to save.');
  process.exit(1);
}

// Without the edition the service drops the DJ profiles below as stale, and
// every STAFF edit to a DJ card goes with them. A service from before
// 2026-10-12 does not report it; the seed already here is then the best guess,
// since the edition only moves when the code's own defaults are corrected.
const djProfileSeed = live.djProfileSeed ?? previous.djProfileSeed;

// Timestamps are left out on purpose. A schedule's startedAt belongs to the
// process that wrote it, and the service stamps its own on boot anyway.
const seed = {
  version: 1,
  capturedAt: new Date().toISOString(),
  capturedFrom: service,
  schedule: Object.fromEntries(Object.entries(live.schedule).map(([venue, entry]) => [venue, {
    name: entry.name,
    subtitle: entry.subtitle,
    order: entry.order,
    currentIndex: entry.currentIndex,
    mode: entry.mode,
    special: entry.special ?? null,
    updatedAt: entry.updatedAt,
  }])),
  customVideos: live.customVideos ?? {},
  siteStyle: live.siteStyle,
  // Absolute weather windows and bounded shared brushes outlive redeploys.
  // Preserve a prior seed when capturing from an older server without weather.
  ...(live.weather ? { weather: live.weather } : previous.weather ? { weather: previous.weather } : {}),
  // Older services still return the retired video/kicker/intro settings.
  // A capture must not reintroduce controls removed from the live entrance.
  gateCopy: live.gateCopy ? Object.fromEntries(['title', 'titleZh', 'nameLabel', 'nameLabelZh', 'updatedAt']
    .filter(field => live.gateCopy[field] !== undefined).map(field => [field, live.gateCopy[field]])) : undefined,
  shopLink: live.shopLink,
  templeSign: live.templeSign,
  djProfiles: live.djProfiles,
  djProfileSeed,
  npcNames: live.npcNames,
  // Job titles live on the profiles, not beside the names, and were being left
  // behind — STAFF renaming a resident's title saw it reset on the next deploy.
  npcTitles: Object.fromEntries((live.npcProfiles ?? []).map((profile) => [profile.id, profile.title])),
  // The introductions and the Chinese job titles, for the same reason. Empty
  // ones are left out rather than saved as blanks, which is how the service
  // stores them.
  ...Object.fromEntries([
    ['npcTitlesZh', 'titleZh'],
    ['npcIntroductions', 'introduction'],
    ['npcIntroductionsZh', 'introductionZh'],
  ].map(([key, field]) => [key, Object.fromEntries((live.npcProfiles ?? [])
    .filter((profile) => profile[field])
    .map((profile) => [profile.id, profile[field]]))])),
  pamphlet: live.pamphlet,
  trackTempos: live.trackTempos,
  // The works' lengths, which every venue's clock runs on. Lost on a deploy,
  // they were relearned from whichever visitor reported first; visitors can no
  // longer shorten a known one, so the seed carries them.
  trackDurations: live.trackDurations ?? {},
  // The headset copies of the films (VR 連結). Left out, every deploy dropped
  // the links STAFF had pasted, and the films showed only a poster in a Quest.
  immersiveSources: live.immersiveSources ?? {},
  ...(previous.offeringReceipt ? { offeringReceipt: previous.offeringReceipt } : {}),
  // Titles STAFF rewrote in the running order.
  videoTitles: live.videoTitles ?? {},
  // The jukebox's shelf, so records STAFF put in it outlive a deploy the way
  // everything else here does. Only the shelf: the waiting list is requests
  // made by people who are in the square at that moment, and bringing it back
  // hours later would resume an evening belonging to nobody still there.
  jukeboxTracks: (live.jukebox?.tracks ?? []).map((track) => ({
    id: track.id,
    youtubeId: track.youtubeId,
    title: track.title,
  })),
};

await writeFile(target, `${JSON.stringify(seed, null, 2)}\n`, 'utf8');

const customCount = Object.values(seed.customVideos).reduce((total, list) => total + (list?.length ?? 0), 0);
console.log(`saved the festival as it runs on ${service}`);
for (const [venue, entry] of Object.entries(seed.schedule)) {
  console.log(`  ${venue.padEnd(9)} ${String(entry.name ?? '').padEnd(14)} ${String(entry.order?.length ?? 0).padStart(2)} work(s), ${entry.mode}`);
}
console.log(`  ${customCount} work(s) STAFF added by hand`);
console.log(`  ${seed.jukeboxTracks.length} record(s) on the jukebox's shelf`);
console.log(`  ${Object.keys(seed.immersiveSources).length} VR link(s)`);
console.log(`  ${Object.keys(seed.videoTitles).length} retitled film(s)`);
console.log(`  ${Object.keys(seed.npcIntroductions).length} English and ${Object.keys(seed.npcIntroductionsZh).length} Chinese resident introduction(s)`);
console.log(`  ${Object.keys(seed.djProfiles ?? {}).length} DJ card(s), edition ${djProfileSeed ?? 'MISSING'}`);
if (!live.djProfileSeed) {
  console.warn(djProfileSeed
    ? `  ! ${service} did not report its DJ card edition; kept ${djProfileSeed} from the previous seed.`
    : '  ! No DJ card edition: the next deploy will drop these DJ cards and serve the defaults in the code.');
}
console.log('Commit world/server/festival-seed.json for these to survive the next deploy.');
