import assert from 'node:assert/strict';
import { RETIRED_HIT_SFX } from './moth-asset-trim.mjs';

// A chapter is ready only when its images, full audio copies and decoded hit
// sounds are usable. Keep this gate separate from playback/latency handling.
const CHAPTER_METHODS = String.raw`
  async loadChapterAssets(stageId) {
    const groups = this.sceneGroups(stageId);
    let released = false;
    for (const group of this.loadedSceneGroups) {
      if (groups.includes(group)) continue;
      for (const job of this.sceneAssetJobs.filter(job => job.group === group)) job.release();
      this.loadedSceneGroups.delete(group);
      released = true;
    }
    if (released) this.rhythmBackdropCache = [];
    const tracks = this.chapterTracks(groups);
    const sources = [...new Set(tracks.map(track => this.canonicalAudioSource(track)).filter(Boolean))];
    this.sceneAudioSources = new Set(sources);
    const jobs = this.sceneAssetJobs.filter(job => groups.includes(job.group) && !this.loadedSceneGroups.has(job.group));
    const songs = sources.filter(src => !this.mirroredAudioUrl(src));
    const progress = this.sceneLoadProgress = {done: 0, total: jobs.length + songs.length + 2};
    let next = 0, failure;
    const images = Promise.all(Array.from({length: Math.min(3, jobs.length)}, async () => {
      while (next < jobs.length && !failure) {
        try { await jobs[next++].run(); progress.done++; }
        catch (error) { failure = error; }
      }
    })).then(() => { if (failure) throw failure; });
    const music = Promise.all(songs.map(async src => {
      const copy = await this.songCopy(src);
      if (!copy) throw new Error('A required song could not be downloaded');
      progress.done++;
    }));
    const sounds = Promise.allSettled([this.loadHitSfx(), this.prepareMenuSfx()]).then(results => {
      const failed = results.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
      progress.done++;
    });
    // Settle the whole batch before reporting an error: a failed scene may
    // not leave downloads writing refs while the next entry starts.
    const results = await Promise.allSettled([images, music, sounds]);
    const rejected = results.find(result => result.status === 'rejected');
    if (rejected) throw rejected.reason;
    for (const track of tracks) {
      await this.adoptSongCopy(track);
      const source = this.canonicalAudioSource(track);
      if (source && track.getAttribute('src') !== this.mirroredAudioUrl(source)) {
        throw new Error('A required song is not ready for playback');
      }
    }
    await this.prepareChapterGraphics();
    progress.done++;
    groups.forEach(group => this.loadedSceneGroups.add(group));
    if (this.sceneLoadProgress === progress) this.sceneLoadProgress = null;
    this.trimAudioMirror();
  }

  canonicalAudioSource(track) {
    if (!track) return null;
    const source = track.getAttribute('src');
    if (!source?.startsWith('blob:')) {
      if (source) track.mothAudioSource = source;
      return source || track.mothAudioSource || null;
    }
    for (const [original, entry] of this.audioMirror || []) {
      if (entry.url === source) { track.mothAudioSource = original; return original; }
    }
    return track.mothAudioSource || null;
  }

  async prepareMenuSfx() {
    const context = this.ensureToneContext();
    this.loadMenuSfx();
    await Promise.all(Object.values(this.menuSfxLoading || {}));
    // Title inputs may load these optimistically. Dialogue and pause controls
    // need both buffers before entering a level, even if that earlier attempt
    // failed silently or is still downloading.
    if (context && Object.keys(MENU_SFX).some(name => !this.sfxBuffers?.[name])) {
      throw new Error('Required menu sound effects are not decoded');
    }
  }

  async prepareChapterGraphics() {
    await Promise.all(interfaceAssetRequests);
    const images = new Set(), seen = new Set();
    const collect = value => {
      if (!value || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      if (value instanceof HTMLImageElement) { images.add(value); return; }
      if (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype) Object.values(value).forEach(collect);
    };
    collect(this.refs);
    collect(this.memeChestSheet);
    this.decodedSceneImages ||= new WeakSet();
    const warm = this.getScratchLayer('rhythm-warm', VIEW_W, VIEW_H);
    warm.clearRect(0, 0, VIEW_W, VIEW_H);
    for (const image of images) {
      if (this.decodedSceneImages.has(image)) continue;
      if (typeof image.decode === 'function') {
        try { await image.decode(); }
        catch (error) { if (!image.complete || !image.naturalWidth) throw error; }
      }
      if (!image.complete || !image.naturalWidth) throw new Error('A required image is not ready');
      warm.drawImage(image, 0, 0, 64, 64);
      this.decodedSceneImages.add(image);
    }
    // Compile the shared grading pass and upload its first surface under the
    // loading screen; the first visible gameplay frame does no shader setup.
    if (this.cinematicRenderer === undefined) this.renderCinematicScene(warm, VIEW_W, VIEW_H, 'office');
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  replaceIdleAudioPlayer(track, source) {
    const fresh = new Audio(source);
    fresh.preload = 'none';
    fresh.loop = track.loop;
    fresh.playbackRate = track.playbackRate;
    fresh.volume = track.volume;
    fresh.mothAudioSource = source;
    for (const name of ['audio', 'sewerAudio', 'level2BossAudio', 'level3RhythmAudio', 'level4ArcadeAudio',
      'level6RhythmAudio', 'dialogueOverlayAudio', 'dialogueBgmTrack']) if (this[name] === track) this[name] = fresh;
    for (const name of Object.keys(this.fightCutAudio || {})) if (this.fightCutAudio[name] === track) this.fightCutAudio[name] = fresh;
    for (const [id, cached] of this.homePlaylistAudioCache || []) if (cached === track) this.homePlaylistAudioCache.delete(id);
    this.gameAudioRegistry?.delete(track);
    const route = this.musicAudioRoutes?.get(track);
    try { route?.source.disconnect(); route?.gain.disconnect(); } catch {}
    this.musicAudioRoutes?.delete(track);
    // A routed/played iOS element keeps its source for its entire lifetime.
    // Detach it only after every owner has released it, then use a fresh
    // element on a future visit, instead of switching the old player's song.
    track.pause();
    track.removeAttribute('src');
    track.load();
  }
`;

export function patchLevelAssetLoading(once, edit) {
  edit('const HIT_SFX = {\n', '\n};', block => {
    const names = new Set(RETIRED_HIT_SFX);
    const kept = block.split('\n').filter(line => {
      const match = line.match(/^  "([^"]+)": "assets\/sfx\/[^"]+\.wav",?$/);
      return !match || !names.delete(match[1]);
    });
    assert.equal(names.size, 0, 'Every retired hit sound had a manifest entry');
    return kept.join('\n').replace(/,\n};$/, '\n};');
  });
  const next = "  // The fight songs a chapter's fights play: their players, and their files.";
  edit('  async loadChapterAssets(stageId) {', next, () => CHAPTER_METHODS + '\n' + next);
  edit('  chapterTracks(groups) {', '  chapterSongs(groups) {', () => String.raw`  chapterTracks(groups) {
    const themes = {office: 'office', level2: 'bathroom', level3: 'massage', level4: 'arcade', studio: 'studio', level5: 'river', level6: 'concert'};
    const tracks = groups.map(group => themes[group] || this.getSecretLevel(group)?.theme).filter(Boolean)
      .map(theme => this.getRhythmAudioFor(theme)).filter(Boolean);
    // Walking maps and dialogue share this BGM. Its two players get the same
    // already-downloaded bytes, including an overlay created after a fight.
    if (groups.some(group => Object.hasOwn(themes, group)) && this.getSewerExploreBgmSrc()) {
      if (this.sewerAudio) tracks.push(this.sewerAudio);
      tracks.push(this.ensureDialogueOverlayAudio());
    }
    return [...new Set(tracks)];
  }

  chapterSongs(groups) {`);
  once("    return this.chapterTracks(groups).map(track => track.getAttribute('src')).filter(Boolean);", "    return [...new Set(this.chapterTracks(groups).map(track => this.canonicalAudioSource(track)).filter(Boolean))];");
  once('    this.loadedSceneGroups = new Set();\n  }', String.raw`    this.sceneAssetJobs.push({key: 'level4RecordingChest', group: 'level4',
      run: async () => { this.memeChestSheet = await loadImage(MEME_CHEST.sheet); },
      release: () => { this.memeChestSheet = null; }});
    this.sceneAssetJobs.push({key: 'level4Recording', group: 'level4',
      run: async () => { if (!await this.getMemeRecording()) { this.memeRecording = null; throw new Error('A required recording could not be downloaded'); } },
      release: () => {
        if (this.memeView) this.closeMeme({resumeBgm: false});
        const recording = this.memeRecording; this.memeRecording = null;
        Promise.resolve(recording).then(value => { if (value?.url) URL.revokeObjectURL(value.url); });
      }});
    this.loadedSceneGroups = new Set();
  }`);
  once('    if (!this.memeChestSheet) loadImage(MEME_CHEST.sheet).then(image => { this.memeChestSheet = image; }).catch(() => {});\n', '');
  once('    if (!copy || !track.paused) return;\n    await this.rhythmTrackPriming?.get(track);', '    if (!copy) return;\n    await this.rhythmTrackPriming?.get(track);');
  once('    track.src = copy;\n    try {\n      await Promise.race', '    track.mothAudioSource = src;\n    track.src = copy;\n    try {\n      await Promise.race');
  once('      track.src = copy;\n      return;\n', '      track.mothAudioSource = src;\n      track.src = copy;\n      return;\n');
  // A later dialogue must keep its prepared blob, not replace it with an
  // origin stream when ensureDialogueOverlayAudio is called again.
  once('      this.dialogueOverlayAudio.src = src;\n', '      this.dialogueOverlayAudio.src = this.mirroredAudioUrl(src) || src;\n      this.dialogueOverlayAudio.mothAudioSource = src;\n');
  once('      this.sewerAudio.src = audioSrc;\n', '      this.sewerAudio.src = this.mirroredAudioUrl(audioSrc) || audioSrc;\n      this.sewerAudio.mothAudioSource = audioSrc;\n');
  // No unawaited prefetches or allSettled-success on mandatory SFX.
  edit('  prefetchHitSfx() {', '  // The chapter a LOADING card', () => String.raw`  prefetchHitSfx() {
    this.sfxRaw ||= {};
    if (this.hitSfxPrefetch) return this.hitSfxPrefetch;
    const missing = Object.keys(HIT_SFX).filter(name => !this.sfxRaw[name]);
    if (!missing.length) return Promise.resolve();
    let next = 0, failure;
    const prefetch = this.hitSfxPrefetch = Promise.all(Array.from({length: Math.min(3, missing.length)}, async () => {
      while (next < missing.length && !failure) {
        const name = missing[next++];
        try { this.sfxRaw[name] ||= (await fetchGameAsset(HIT_SFX[name])).data.buffer; }
        catch (error) { failure = error; }
      }
    })).then(() => { if (failure) throw failure; })
      .finally(() => { if (this.hitSfxPrefetch === prefetch) this.hitSfxPrefetch = null; });
    return prefetch;
  }

  // The chapter a LOADING card`);
  once("      .then(() => Promise.allSettled(Object.keys(HIT_SFX).filter(name => !this.sfxBuffers[name])\n        .map(name => this.decodeHitSfx(name, this.level1OfficeAudioContext))))", "      .then(() => Promise.all(Object.keys(HIT_SFX).filter(name => !this.sfxBuffers[name])\n        .map(name => this.decodeHitSfx(name, this.level1OfficeAudioContext))))");
  once('      .finally(() => { if (this.hitSfxLoading === loading) this.hitSfxLoading = null; });', '      .then(() => { if (Object.keys(HIT_SFX).some(name => !this.sfxBuffers[name])) throw new Error("Required sound effects are not decoded"); })\n      .finally(() => { if (this.hitSfxLoading === loading) this.hitSfxLoading = null; });');
  once('    rhythm.countdownDuringGraphicsPreparation = true;\n    this.state = \'playing\';', '    // Required bytes and decodes have already completed at the chapter gate.\n    rhythm.countdownDuringGraphicsPreparation = true;\n    this.state = \'playing\';');
  edit('  audioUsing(url) {', '  stageTrackSource(stageId) {', () => String.raw`  audioUsing(url) {
    for (const source of this.sceneAudioSources || []) if (this.audioMirror?.get(source)?.url === url) return true;
    const held = [this.songPreview?.audio, this.pausedBgm?.audio, this.walkPause?.bgm, this.dialogueBgmResume,
      this.memeView?.pausedBgm?.audio, ...(this.audioFades || []).map(fade => fade.audio),
      ...[this.audioInterruption, this.fullscreenGuideResume].flatMap(owner => (owner?.tracks || []).map(saved => saved.track))];
    const players = [...this.getKnownBgmTracks(), ...(this.gameAudioRegistry || []), ...(this.homePlaylistAudioCache?.values() || [])];
    return [...held, ...players.filter(track => !track.paused || this.rhythmTrackPriming?.has(track))]
      .some(track => track?.getAttribute('src') === url);
  }

  trimAudioMirror() {
    if (!this.audioMirror) return;
    const idle = [...this.audioMirror].filter(([, entry]) => entry.url && !this.audioUsing(entry.url)).sort((a, b) => a[1].used - b[1].used);
    // Retain only two recently used idle songs; active and resumable players
    // are always exempt. Old chapter audio is not pinned by paused aliases.
    for (const [source, entry] of idle.slice(0, Math.max(0, idle.length - 2))) {
      const players = new Set([...this.getKnownBgmTracks(), ...(this.gameAudioRegistry || []), ...(this.homePlaylistAudioCache?.values() || [])]);
      for (const track of players) if (track.getAttribute('src') === entry.url) this.replaceIdleAudioPlayer(track, source);
      URL.revokeObjectURL(entry.url);
      this.audioMirror.delete(source);
    }
  }

  stageTrackSource(stageId) {`);
  once("    return theme ? this.getRhythmAudioFor(theme)?.getAttribute('src') : null;", '    return theme ? this.canonicalAudioSource(this.getRhythmAudioFor(theme)) : null;');
  once('    return this.playMusicAudio(audio);\n  }\n\n  resumePausedBgm() {', '    const started = this.playMusicAudio(audio);\n    this.trimAudioMirror();\n    return started;\n  }\n\n  resumePausedBgm() {');
}
