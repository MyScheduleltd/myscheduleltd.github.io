/**
 * Saves the running festival's settings into the repository.
 *
 * The service runs on a plan with no disk that survives a deploy, so everything
 * STAFF set through the panel — running orders, venue names and subtitles, the
 * works they added, the gate wording, DJ pages, NPCs — lives only in the memory
 * of the instance currently serving. Deploying throws it away. Committing the
 * output of this script is what makes those settings outlive a deploy: the
 * service reads it at boot whenever it has nothing of its own.
 *
 * Run it before deploying, or after a session of changes worth keeping:
 *
 *     node world/scripts/capture-state.mjs
 *     node world/scripts/capture-state.mjs http://127.0.0.1:8787
 *
 * It reads only the public settings endpoint, so it needs no STAFF key, and it
 * deliberately captures neither the key nor the chat: the repository is public,
 * and neither belongs in it.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const service = (process.argv[2] ?? 'https://myschedule-festival.onrender.com').replace(/\/$/, '');
const target = fileURLToPath(new URL('../server/festival-seed.json', import.meta.url));

const response = await fetch(`${service}/api/config`);
if (!response.ok) {
  console.error(`Could not read ${service}/api/config — HTTP ${response.status}.`);
  console.error('The free instance sleeps when idle; the first request can take a moment. Try again.');
  process.exit(1);
}
const live = await response.json();

if (!live.schedule || typeof live.schedule !== 'object') {
  console.error('That response carried no programme, so there is nothing to save.');
  process.exit(1);
}

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
  gateBackground: live.gateBackground,
  gateCopy: live.gateCopy,
  shopLink: live.shopLink,
  templeSign: live.templeSign,
  djProfiles: live.djProfiles,
  npcNames: live.npcNames,
  // Job titles live on the profiles, not beside the names, and were being left
  // behind — STAFF renaming a resident's title saw it reset on the next deploy.
  npcTitles: Object.fromEntries((live.npcProfiles ?? []).map((profile) => [profile.id, profile.title])),
  pamphlet: live.pamphlet,
  trackTempos: live.trackTempos,
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
console.log('Commit world/server/festival-seed.json for these to survive the next deploy.');
