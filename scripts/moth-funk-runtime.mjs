// Full-length Level Select runs share the engine with the Story edits, but
// use their own chart and player. Keep the original Story tracks available.
export function patchFunkRuntime(once, edit) {
  once('  returnToTitle() {\n', '  returnToTitle() {\n    this.stageSelectRhythmId = null;\n');
  once('  startNewStory() {\n', '  startNewStory() {\n    this.stageSelectRhythmId = null;\n');
  once('    if (!freePlay && !this.isStageUnlocked(stageId)) return false;\n',
    `    if (!freePlay && !this.isStageUnlocked(stageId)) return false;
    const selection = freePlay && options.fromLevelSelection && this.config.stageSelectRhythms?.[stageId];
    this.stageSelectRhythmId = selection ? stageId : null;
`);
  once('      // Secret songs use the same exclusive audio registry as the normal fights.',
    `      this.fullSongAudio = {};
      for (const spec of Object.values(this.config.stageSelectRhythms || {})) {
        if (this.fightCutAudio[spec.theme]?.getAttribute("src") === spec.audioSrc
          || this.config.secretLevels?.some(level => level.theme === spec.theme)) continue;
        const track = new Audio(spec.audioSrc);
        track.preload = "none";
        track.volume = BGM_VOLUME;
        this.fullSongAudio[spec.theme] = track;
      }
      // Secret songs use the same exclusive audio registry as the normal fights.`);
  once('    const secret = this.config?.secretLevels?.find(level => level.theme === theme);\n    if (secret) return this.applyRhythmDifficulty(secret.rhythm);',
    `    const selection = this.config?.stageSelectRhythms?.[this.stageSelectRhythmId];
    if (selection && selection.theme === theme) return this.applyRhythmDifficulty(selection);
    const secret = this.config?.secretLevels?.find(level => level.theme === theme);
    if (secret) return this.applyRhythmDifficulty(secret.rhythm);`);
  once('  getRhythmAudioFor(theme) {\n', `  getRhythmAudioFor(theme) {
    const easy = theme && !this.getDifficulty().hardPhrases ? this.getRhythmSpecFor(theme) : null;
    if (easy?.easyAudioSrc) {
      this.easyMusicAudio ||= {};
      let track = this.easyMusicAudio[easy.easyAudioSrc];
      if (!track) {
        track = new Audio(easy.easyAudioSrc);
        track.preload = "none";
        track.volume = BGM_VOLUME;
        this.easyMusicAudio[easy.easyAudioSrc] = track;
        if (easy.fightCut) (this.easyBakedSources ||= new Set()).add(easy.easyAudioSrc);
      }
      return track;
    }
    const full = this.config?.stageSelectRhythms?.[this.stageSelectRhythmId];
    if (full && full.theme === theme && this.fullSongAudio?.[theme]) return this.fullSongAudio[theme];
`);
  once('...Object.values(this.fightCutAudio || {})].filter(Boolean)', '...Object.values(this.fightCutAudio || {}), ...Object.values(this.fullSongAudio || {}), ...Object.values(this.easyMusicAudio || {})].filter(Boolean)');
  once('    for (const name of Object.keys(this.fightCutAudio || {})) this.fightCutAudio[name] = replace(this.fightCutAudio[name]);',
    `    for (const players of [this.fightCutAudio, this.fullSongAudio, this.easyMusicAudio]) {
      for (const name of Object.keys(players || {})) players[name] = replace(players[name]);
    }`);
  once('    for (const name of Object.keys(this.fightCutAudio || {})) if (this.fightCutAudio[name] === track) this.fightCutAudio[name] = fresh;',
    `    for (const players of [this.fightCutAudio, this.fullSongAudio, this.easyMusicAudio]) {
      for (const name of Object.keys(players || {})) if (players[name] === track) players[name] = fresh;
    }`);
  once('      const mixGain = Object.values(this.fightCutAudio || {}).includes(audio) ? 0.50 / BGM_VOLUME : 1;',
    `      const easyMix = Object.values(this.easyMusicAudio || {}).includes(audio);
      const fightTrack = Object.values(this.fightCutAudio || {}).includes(audio) || Object.values(this.fullSongAudio || {}).includes(audio);
      // Easy files already include the normal gameplay music gain.
      const mixGain = easyMix ? 1 / BGM_VOLUME : (fightTrack ? 0.50 / BGM_VOLUME : 1);`);
  once('  isBakedMusicTrack(audio) {\n', `  isBakedMusicTrack(audio) {
    if (this.easyBakedSources?.has(this.canonicalAudioSource(audio))) return true;
`);
  // Fight audio is already primed during loading. Its opening envelope uses
  // the source playhead, so buffering and pause freeze the fade with the song.
  once('    const fresh = audio.currentTime < 0.05 && audio.volume > 0 && !this.isBakedMusicTrack(audio);',
    `    const fightSong = audio.volume > 0 && this.state === "playing" && this.level1OfficeRhythm
      && audio === this.getActiveLevel1OfficeRhythmAudio();
    const fresh = !fightSong && audio.currentTime < 0.05 && audio.volume > 0 && !this.isBakedMusicTrack(audio);`);
  once('    if (newSource) audio.muted = true;\n    const started = audio.play();\n    if (newSource) {',
    `    if (fightSong) audio.muted = false;
    else if (newSource) audio.muted = true;
    const started = audio.play();
    if (newSource && !fightSong) {`);
  once('const SONG_HANDOVER_IN_SECONDS = 0.4;\n', '');
  once('      this.useSongCopy(track);\n      track.currentTime = this.getRhythmAudioStart();\n      track.volume = 0;',
    `      this.useSongCopy(track);
      const start = this.getRhythmAudioStart();
      // The loading screen and countdown have already rewound this track.
      // Another same-position seek at GO can stall the first WebKit samples.
      if (Math.abs(track.currentTime - start) > 0.001) track.currentTime = start;
      track.volume = 0;`);
  once('        if (this.hasBakedFades()) track.volume = BGM_VOLUME;\n        if (this.freePlay',
    `        this.updateFightOpeningFade(track);
        if (this.freePlay`);
  edit('        // A window that opens on a phrase\'s pickup bar', '      } catch {\n        if (rhythm.audioStartAttempt !== startAttempt)',
    () => '        this.updateFightOpeningFade(track);\n      } catch {\n        if (rhythm.audioStartAttempt !== startAttempt)');
  edit('    // Restarted inside the fade-in bar', '    this.soloPlay(track).catch(() => {',
    () => '    this.updateFightOpeningFade(track);\n    this.soloPlay(track).catch(() => {');
  once('      track.volume = BGM_VOLUME;\n      let timer;',
    '      this.updateFightOpeningFade(track);\n      let timer;');
  once('  updateMusicEndFades() {\n', `  updateFightOpeningFade(track = this.getActiveLevel1OfficeRhythmAudio()) {
    const rhythm = this.level1OfficeRhythm;
    if (!track || this.state !== "playing" || rhythm?.tutorial?.mode !== "done"
      || rhythm.skipAudio || rhythm.ending || rhythm.songHandover || this.isRhythmCountIn()) return;
    const seconds = Math.max(0, this.getActiveRhythmSpec()?.fadeInSeconds || 0);
    const elapsed = Math.max(0, track.currentTime - this.getRhythmAudioStart());
    const progress = seconds ? clamp(elapsed / seconds, 0, 1) : 1;
    // A tiny positive level lets the native-clock stall guard advance through
    // the unscored intro. First targets begin only after the full fade ends.
    const volume = BGM_VOLUME * Math.max(0.001, easeInOut(progress));
    if (Math.abs(track.volume - volume) > 0.00001) track.volume = volume;
    const route = this.musicAudioRoutes?.get(track);
    if (route) route.target = BGM_VOLUME;
  }

  updateMusicEndFades() {
    this.updateFightOpeningFade();
`);
  once('if (!playing || (!track.seeking && track.readyState >= 3))',
    `const context = this.musicAudioRoutes?.get(track)?.context;
    if (!playing || (!track.seeking && track.readyState >= 3 && !track.muted && track.volume > 0
      && (!context || context.state === "running")))`);
  once('    if (Array.isArray(chart) && chart.length) {\n', '    if (Array.isArray(chart)) {\n');
  edit('    // The tall track crops out both ends of the wide footer.',
    '    if (coachPrompt) {', () => '    if (coachPrompt) {');
  edit('      // The legend identifies the musical source the player listens for.',
    '        target.textAlign = "right";\n        target.fillStyle = "#17130c";',
    () => '      if (!this.isTallScreenView()) {\n        target.textAlign = "right";');
}
