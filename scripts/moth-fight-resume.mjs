// Fights pick up where they stopped (owner, 2026-10-13). Applied to the
// release's game.js by moth-runtime-patches.mjs (both builds).
//
// Locking the phone or switching apps pauses a fight. Coming back, the arena
// waits frozen at that moment and counts 3 · 2 · 1 in silence, then the song
// plays on from exactly there; 暫停 → 繼續 does the same. If iPhone refuses to
// play outside a tap, the resume card's tap grants it and counts in again.
//
// iPhone may also reload the page while it is locked (a home-screen app
// especially), which used to send 繼續 on the main menu back to the start of
// the level. While the page is hidden the fight's state is kept, and the
// main menu's 繼續 restores it mid-song after the same count. Coming back
// without a reload forgets it.
//
// No note is judged during any count.

export function patchFightResume(once) {
  once('const PROGRESS_KEY = "bobby_progress_v1";', 'const PROGRESS_KEY = "bobby_progress_v1";\nconst FIGHT_RESUME_KEY = "bobby_fight_resume_v1";');
  // Back from the lock screen or another app.
  once('    if (!document.hidden && this.audioInterruption?.fromHidden && !this.audioRecoveryVisible()) {\n      this.recoverGameAudio({ automatic: true });', '    if (!document.hidden && this.audioInterruption?.fromHidden && !this.audioRecoveryVisible()) {\n      if (this.countDownInterruptedFight()) return;\n      this.recoverGameAudio({ automatic: true });');
  once('event.preventDefault(); event.stopPropagation(); this.recoverGameAudio();', 'event.preventDefault(); event.stopPropagation(); if (!this.countDownFightAfterTap()) this.recoverGameAudio();');
  once('    window.addEventListener("pageshow", () => this.resumeAudioAfterReturn());', '    window.addEventListener("pageshow", () => this.resumeAudioAfterReturn());\n    // Kept only while hidden: a page that comes back was not reloaded.\n    document.addEventListener("visibilitychange", () => { if (document.hidden) this.keepFightForReload(); else this.forgetKeptFight(); });\n    window.addEventListener("pagehide", () => this.keepFightForReload());\n    window.addEventListener("pageshow", event => { if (event.persisted) this.forgetKeptFight(); });');
  // 暫停 → 繼續.
  once('    const track = this.getActiveLevel1OfficeRhythmAudio();\n    if (track) track.pause();\n    this.releaseHeldInputs();', '    const track = this.getActiveLevel1OfficeRhythmAudio();\n    this.level1OfficePausedAt = track?.currentTime;\n    if (track) track.pause();\n    this.releaseHeldInputs();');
  once('    this.state = "playing";\n    const resumeTrack = this.getActiveLevel1OfficeRhythmAudio();\n    if (resumeTrack && !this.level1OfficeRhythm?.skipAudio) {\n      const resumed = this.playMusicAudio(resumeTrack);\n      if (resumed?.catch) resumed.catch(() => {});\n    }', '    this.state = "playing";\n    const resumeTrack = this.getActiveLevel1OfficeRhythmAudio();\n    const pausedAt = Number.isFinite(this.level1OfficePausedAt) ? this.level1OfficePausedAt : resumeTrack?.currentTime;\n    // In the tap: keep (or regain) iPhone\'s permission to play after the count.\n    if (resumeTrack && !this.level1OfficeRhythm?.skipAudio) this.primeRhythmTrack(resumeTrack, pausedAt);\n    this.resumeFightAt(this.level1OfficeRhythm, pausedAt);');
  // The main menu's 繼續 restores a kept fight first (after patchScoreboard's continueStory).
  once('    if (this.progress?.storyRun) this.registerStoryRun(this.progress.storyRun);\n', '    if (this.progress?.storyRun) this.registerStoryRun(this.progress.storyRun);\n    if (this.resumeKeptFight()) return true;\n');
  // A press during a count still sounds, but judges nothing.
  once('    if (!this.playRhythmHitSfx(action, false, button)) this.playLevel1OfficeTone("hit", action, "stamp");\n', '    if (!this.playRhythmHitSfx(action, false, button)) this.playLevel1OfficeTone("hit", action, "stamp");\n    if (this.stageCountdown > 0) return true;\n');
}

export const FIGHT_RESUME_METHODS = String.raw`
  // ---- Fights pick up where they stopped (scripts/moth-fight-resume.mjs) ----
  // Frozen at the song's place under 3 · 2 · 1 · 開始！, then on from there.
  resumeFightAt(rhythm, trackTime) {
    if (!rhythm) return;
    const track = this.getActiveLevel1OfficeRhythmAudio();
    if (track && Number.isFinite(trackTime)) { track.pause(); track.currentTime = trackTime; }
    rhythm.resumeTrackTime = trackTime;
    this.releaseHeldInputs();
    this.armStageCountdown(() => {
      // 暫停 during the count holds it; that 繼續 counts in again.
      if (this.level1OfficeRhythm !== rhythm || this.state !== "playing" || rhythm.ending) return;
      this.playResumedFight(rhythm, trackTime);
    });
  }

  playResumedFight(rhythm, trackTime) {
    const track = this.getActiveLevel1OfficeRhythmAudio();
    rhythm.resumeTrackTime = null;
    if (!track || rhythm.skipAudio) return;
    const refused = () => {
      if (this.level1OfficeRhythm !== rhythm) return;
      track.pause();
      // iPhone wants a tap: the resume card's tap grants it and counts in again.
      this.audioInterruption = { fromHidden: true, rhythm, songTime: this.songTime, tracks: [{ track, time: trackTime, volume: BGM_VOLUME }] };
      this.showAudioRecovery("resume");
    };
    // A priming play still under way would pause this one when it lands.
    (this.rhythmTrackPriming?.get(track) || Promise.resolve()).then(() => {
      if (this.level1OfficeRhythm !== rhythm || this.state !== "playing") return;
      this.useSongCopy(track);
      if (Number.isFinite(trackTime)) track.currentTime = trackTime;
      track.volume = BGM_VOLUME;
      let timer;
      Promise.race([Promise.all([this.soloPlay(track), this.musicAudioContext?.resume()]), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Resume timed out")), 2000);
      })]).then(() => {
        const route = this.musicAudioRoutes?.get(track);
        if (route && route.context.state !== "running") refused();
      }, refused).finally(() => clearTimeout(timer));
    });
  }

  // Back from the lock screen or another app (resumeAudioAfterReturn).
  countDownInterruptedFight() {
    const saved = this.audioInterruption;
    const rhythm = this.level1OfficeRhythm;
    if (!saved?.fromHidden || !rhythm || saved.rhythm !== rhythm || this.state !== "playing" || rhythm.ending
      || rhythm.songHandover || rhythm.tutorial?.mode !== "done") return false;
    // The count-in before the song (or a resume's own count) simply runs again.
    const pending = this.stageCountdown > 0 ? this.stageCountdownAction : null;
    this.audioInterruption = null;
    // The song is tested when the count ends; a tap meanwhile must not swap
    // the engine (refreshStaleAudioEngine) for one that was never granted.
    this.audioEngineStale = null;
    this.lastMusicAt = performance.now();
    this.songTime = saved.songTime;
    if (pending) {
      this.armStageCountdown(pending);
      return true;
    }
    const track = this.getActiveLevel1OfficeRhythmAudio();
    const position = saved.tracks.find(item => item.track === track);
    this.resumeFightAt(rhythm, position ? position.time : rhythm.resumeTrackTime ?? track?.currentTime);
    return true;
  }

  // The resume card's tap in a fight: new engines (a stuck one may never
  // resume), the song granted playback silently at its place, then the count.
  countDownFightAfterTap() {
    const saved = this.audioInterruption;
    const rhythm = this.level1OfficeRhythm;
    if (!saved?.rhythm || saved.rhythm !== rhythm || this.state !== "playing" || rhythm.ending || this.audioRecovering
      || rhythm.songHandover || rhythm.tutorial?.mode !== "done") return false;
    this.rebuildMusicAudioContext();
    this.rebuildToneContext();
    this.audioUnlockSettled = true;
    this.applyPlaybackAudioSession();
    this.audioEngineStale = null;
    const track = this.getActiveLevel1OfficeRhythmAudio();
    const position = saved.tracks.find(item => item.track === track) || saved.tracks[0];
    const trackTime = position ? position.time : rhythm.resumeTrackTime;
    this.musicAudioContext?.resume()?.catch(() => {});
    const primed = track && !rhythm.skipAudio ? this.primeRhythmTrack(track, trackTime) : Promise.resolve();
    this.audioRecovering = true;
    this.audioRecoveryPrompt.querySelector("button").textContent = this.tr("RESTORING SOUND…", "正在恢復音效…");
    primed.then(() => {
      this.audioRecovering = false;
      if (this.level1OfficeRhythm !== rhythm || this.audioInterruption !== saved) return;
      if (track && !rhythm.skipAudio && !this.primedRhythmTracks?.has(track)) {
        this.showAudioRecovery("resume");
        return;
      }
      this.audioInterruption = null;
      this.audioRecoveryPrompt.hidden = true;
      rhythm.audioStartPending = false;
      this.audioRecoveryFailed = false;
      this.lastMusicAt = performance.now();
      this.songTime = saved.songTime;
      this.resumeFightAt(rhythm, trackTime);
    });
    return true;
  }

  // While the page is hidden, the story fight's state, for a reload.
  keepFightForReload() {
    const rhythm = this.level1OfficeRhythm;
    if (this.freePlay || !rhythm || rhythm.ending || rhythm.songHandover || rhythm.tutorial?.mode !== "done"
      || !["playing", "level1OfficePaused"].includes(this.state)) return;
    const saved = this.audioInterruption?.rhythm === rhythm ? this.audioInterruption : null;
    const track = this.getActiveLevel1OfficeRhythmAudio();
    const trackTime = saved?.tracks.find(item => item.track === track)?.time
      ?? (this.state === "level1OfficePaused" ? this.level1OfficePausedAt : null)
      ?? rhythm.resumeTrackTime ?? track?.currentTime;
    const songTime = saved ? saved.songTime : this.songTime;
    if (!(songTime > 0) || !Number.isFinite(trackTime)) return;
    const plain = value => JSON.parse(JSON.stringify(value, (key, item) =>
      item && typeof item === "object" && !Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype ? undefined : item));
    const { notes, ...state } = rhythm;
    for (const key of Object.keys(state)) if (/Telemetry$|Rects$/.test(key)) delete state[key];
    const kept = { v: 1, at: Date.now(), stageId: this.currentStageId, theme: rhythm.theme,
      checkpoint: this.progress?.storyCheckpoint || null, run: this.progress?.storyRun?.id || null,
      difficulty: this.difficultyId, songTime, trackTime, state: plain(state), notes: plain(notes) };
    try { window.localStorage?.setItem(FIGHT_RESUME_KEY, JSON.stringify(kept)); } catch {}
  }

  forgetKeptFight() {
    try { window.localStorage?.removeItem(FIGHT_RESUME_KEY); } catch {}
  }

  // The main menu's 繼續 after a reload: the same fight, the same moment.
  resumeKeptFight() {
    let kept = null;
    try { kept = JSON.parse(window.localStorage?.getItem(FIGHT_RESUME_KEY) || "null"); } catch {}
    this.forgetKeptFight();
    const start = {
      office: () => { this.level1TutorialSeen = true; return this.startLevel({ skipTutorial: true, deferSong: true, useProgressLoadout: true }); },
      bathroom: () => this.startLevel2BathroomFight({ deferSong: true }),
      massage: () => this.startLevel3MassageFight({ deferSong: true }),
      arcade: () => this.startLevel4ArcadeFight({ deferSong: true }),
      studio: () => this.startStudioFight({ deferSong: true }),
      river: () => this.startLevel5RiverFight({ deferSong: true }),
      concert: () => this.startLevel6ConcertFight({ deferSong: true })
    }[kept?.theme];
    if (!start || kept.v !== 1 || !(Date.now() - kept.at < 7 * 864e5) || typeof kept.stageId !== "string"
      || kept.checkpoint !== (this.progress?.storyCheckpoint || null) || kept.run !== (this.progress?.storyRun?.id || null)) return false;
    if (RHYTHM_DIFFICULTIES[kept.difficulty] && kept.difficulty !== this.difficultyId) this.setDifficulty(kept.difficulty, { persist: false, announce: false });
    this.freePlay = false;
    this.startLevelLoading(kept.stageId, async () => {
      this.livesRemaining = TOTAL_LIVES;
      this.stopSongPreview(false);
      this.resetRuntime();
      this.applyConfigDefaults();
      this.applyLatestProgressLoadout();
      this.currentStageId = kept.stageId;
      await start();
      this.restoreKeptFight(kept);
    });
    return true;
  }

  restoreKeptFight(kept) {
    const rhythm = this.level1OfficeRhythm;
    if (!rhythm || rhythm.theme !== kept.theme || this.state !== "playing") return;
    // The fight's own numbers and every note's result; not its loading,
    // audio or effect bookkeeping, which belong to this page.
    const skip = /^(notes|theme|tutorial|skipAudio|ending|result|review.*|graphics.*|audio.*|songHandover|outputDelay|frozenSongTime|resumeTrackTime|celebration.*|countdownDuringGraphicsPreparation|countedInEarly|hitBurstRequest|arcadeEvent|impactKick|bathroomStrike|stampFx)$/;
    const same = (a, b) => a !== null && b !== null && typeof a === typeof b && Array.isArray(a) === Array.isArray(b);
    for (const [key, value] of Object.entries(kept.state || {})) {
      if (skip.test(key) || !(key in rhythm) || !same(rhythm[key], value)) continue;
      rhythm[key] = typeof value === "object" && !Array.isArray(value) ? { ...rhythm[key], ...value } : value;
    }
    (kept.notes || []).forEach((saved, index) => {
      const note = rhythm.notes[index];
      if (!note || note.id !== saved.id || note.time !== saved.time) return;
      for (const [key, value] of Object.entries(saved)) if (value === null || typeof value !== "object") note[key] = value;
    });
    this.songTime = kept.songTime;
    this.resumeFightAt(rhythm, kept.trackTime);
  }
`;
