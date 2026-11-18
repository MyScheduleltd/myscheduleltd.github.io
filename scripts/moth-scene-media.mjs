export function patchSceneMedia(once, edit) {
  once('    this.loadedSceneGroups = new Set();\n  }', `    this.sceneAssetJobs.push({
      key: "level4MusicVideo", group: "level4",
      run: () => this.loadArcadeMusicVideo(),
      release: () => this.releaseArcadeMusicVideo()
    }, {
      key: "riverGoddess", group: "level5",
      run: async () => { this.refs.riverGoddess = await loadImage("assets/sprites/river-goddess.webp"); },
      release: () => { this.refs.riverGoddess = null; }
    });
    this.loadedSceneGroups = new Set();
  }`);
  once('      () => this.update(dt),\n', '      () => this.update(dt),\n      () => this.syncArcadeMusicVideo(),\n');
  once('  primeAudioOnGesture() {\n', `  primeAudioOnGesture() {
    if (this.arcadeVideoRefused) {
      this.arcadeVideoRefused = false;
      this.syncArcadeMusicVideo();
    }
`);
  edit('  // The fighting game on the TV: the night-market stage, the two fighters,', '  renderLevel4ArcadePlayers(target, layout, poses, context) {', () => MEDIA_METHODS + '\n  renderLevel4ArcadePlayers(target, layout, poses, context) {');
  once('    this.renderLevel4ArcadeGame(target, layout, poses, context);', '    this.renderLevel4ArcadeGame(target, layout, context);');
  once('    const groundY = glass.y + glass.h * (this.config?.sprites?.level4ArcadeArena?.groundY ?? 0.9);\n', '');
  once('      glass,\n      groundY,\n      fighterHeight: glass.h * 0.46,\n      bobbyX: glass.x + glass.w * 0.35,\n      bonitaX: glass.x + glass.w * 0.65', '      glass');
  once('    this.level5PostIndex = 0;\n    this.state = "level5PostDialogue";',
    '    this.level5PostIndex = 0;\n    this.riverRevealAt = this.time;\n    this.state = "level5PostDialogue";');
  once('  advanceLevel5PostDialogue() {\n', '  advanceLevel5PostDialogue() {\n    if (this.riverGoddessAge() < 2.6) return;\n');
  once('      this.renderLevel5RiverScene(this.ctx, { frozen: false, motionTime: this.time || 0, sceneHeight: 508, renderTime: 0, rhythm: null, aftermath: true });\n      this.renderLevel5PostDialogue();',
    `      if (this.riverGoddessAge() < 2.6) this.renderRiverReveal(this.ctx, VIEW_W, VIEW_H);
      else {
        this.renderLevel5RiverScene(this.ctx, { frozen: false, motionTime: this.time || 0, sceneHeight: 508, renderTime: 0, rhythm: null, aftermath: true });
        this.renderLevel5PostDialogue();
      }`);
  once('  getTallScreenMode() {\n', '  getTallScreenMode() {\n    if (this.state === "level5PostDialogue" && this.riverGoddessAge() < 2.6) return "riverReveal";\n');
  once('    const mode = this.getTallScreenMode();\n    if (mode === "ending") {\n      this.renderFinaleEndingScene(target, layout.width, layout.height);',
    `    const mode = this.getTallScreenMode();
    if (mode === "riverReveal") {
      this.renderRiverReveal(target, layout.width, layout.height);
      return;
    }
    if (mode === "ending") {
      this.renderFinaleEndingScene(target, layout.width, layout.height);`);
  once("    // Reach: Dr. Beauty's follows his timing, eased; a hit surges it, a miss",
    `    const revealAge = context.aftermath ? this.riverGoddessAge() : (rhythm?.riverRevealAt == null ? -1 : this.time - rhythm.riverRevealAt);
    if (revealAge >= 0) this.drawRiverGoddess(target, farY, bankY, revealAge);

    // Reach: Dr. Beauty's follows his timing, eased; a hit surges it, a miss`);
  once('      rhythm.reviewTimer = spec.reviewDelay || 1.85;',
    `      rhythm.reviewTimer = spec.reviewDelay || 1.85;
      if (this.isRiverRhythm() && this.freePlay) {
        rhythm.riverRevealAt = this.time;
        rhythm.reviewTimer = Math.max(2.6, rhythm.reviewTimer);
      }`);
  once('(context.aftermath ? [] : people).forEach((p) => {', '(context.aftermath || rhythm?.ending ? [] : people).forEach((p) => {');
}

const MEDIA_METHODS = String.raw`
  async loadArcadeMusicVideo() {
    if (this.arcadeMusicVideo) return;
    const file = await fetchGameAsset("assets/video/level4-bad-daddy.mp4");
    const video = document.createElement("video");
    const url = URL.createObjectURL(new Blob([file.data], {type: "video/mp4"}));
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = "auto";
    try {
      await new Promise((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timeout);
          video.removeEventListener("loadeddata", ready);
          video.removeEventListener("error", failed);
        };
        const ready = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new Error("Level 4 video could not be decoded")); };
        const timeout = setTimeout(failed, 12000);
        video.addEventListener("loadeddata", ready);
        video.addEventListener("error", failed);
        video.src = url;
      });
      this.arcadeMusicVideo = video;
    } catch (error) {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      throw error;
    }
  }

  releaseArcadeMusicVideo() {
    const video = this.arcadeMusicVideo;
    if (!video) return;
    this.arcadeMusicVideo = null;
    this.arcadeVideoRefused = false;
    const url = video.getAttribute("src");
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }

  syncArcadeMusicVideo() {
    const video = this.arcadeMusicVideo;
    if (!video) return;
    const rhythm = this.level1OfficeRhythm;
    const arcade = rhythm?.theme === "arcade";
    const song = arcade && this.getActiveLevel1OfficeRhythmAudio();
    const active = arcade && this.state === "playing" && !rhythm.ending && rhythm.tutorial?.mode === "done"
      && !rhythm.skipAudio && !this.isRhythmCountIn() && !this.levelLoadingPresentation && !document.hidden
      && song && !song.paused && !song.seeking && !this.isFightSongStalled(song);
    if (!active) {
      if (!video.paused) video.pause();
      return;
    }
    // A given attack lands 151 ms later on the supplied video's timeline.
    const sourceOrigin = this.hasBakedFades() ? this.getActiveRhythmSpec().fightCut.fromSeconds : 0;
    const time = Math.min(video.duration - .02,
      song.currentTime - (song.mothFightLead || 0) + sourceOrigin + .151);
    if (!video.seeking && Math.abs(video.currentTime - time) > .11) video.currentTime = time;
    if (video.paused && !video.seeking && !this.arcadeVideoStarting && !this.arcadeVideoRefused) {
      this.arcadeVideoStarting = video.play().catch(() => { this.arcadeVideoRefused = true; })
        .finally(() => { this.arcadeVideoStarting = null; });
    }
  }

  renderLevel4ArcadeGame(target, layout, context) {
    const {glass} = layout;
    const {rhythm, renderTime, frozen, motionTime} = context;
    const video = this.arcadeMusicVideo;
    target.save();
    target.beginPath();
    target.roundRect(glass.x, glass.y, glass.w, glass.h, glass.w * .035);
    target.clip();
    target.fillStyle = "#080b16";
    target.fillRect(glass.x, glass.y, glass.w, glass.h);
    const width = glass.w - 26;
    const scale = width / 1024;
    const bounds = {x: 0, y: 0, w: 1024, h: 184};
    const bottom = glass.y + glass.h - 13;
    const trackTop = bottom - bounds.h * scale;
    const videoTop = glass.y + 13;
    if (video?.readyState >= 2 && video.videoWidth > 0) {
      const availableHeight = (rhythm ? trackTop - 6 : bottom) - videoTop;
      const factor = Math.min(width / video.videoWidth, availableHeight / video.videoHeight);
      const w = video.videoWidth * factor, h = video.videoHeight * factor;
      target.drawImage(video, glass.x + (glass.w - w) / 2, videoTop + (availableHeight - h) / 2, w, h);
    }
    if (rhythm) {
      const cursorX = 532, railY = 96;
      const groovePulse = frozen ? 0 : (rhythm.groovePulse || 0);
      const railTime = renderTime;
      const speed = this.getRhythmRailGeometry().pixelsPerSecond;
      const cueAt = !frozen && !rhythm.ending && !rhythm.songHandover && !rhythm.audioStarting
        ? (note, time) => this.getRhythmTimingCue(note, time) : null;
      target.translate(glass.x + 13, trackTop);
      target.scale(scale, scale);
      drawRhythmTrackFrame(target, bounds, {pulse: groovePulse});
      drawRhythmRailLines(target, bounds, cursorX, railY, groovePulse);
      const pulse = !frozen && !rhythm.ending && rhythm.trackPulse;
      if (pulse && motionTime - pulse.at < 0.28) {
        drawRhythmHitPulse(target, cursorX, railY, pulse, motionTime - pulse.at,
          window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
      }
      drawRhythmRailNotes(target, this.getLevel1OfficeRenderNotes(), {bounds, cursorX, railY, railTime, speed, cueAt});
    }
    target.restore();
  }

  riverGoddessAge() {
    return this.riverRevealAt == null ? Infinity : this.time - this.riverRevealAt;
  }

  renderRiverReveal(target, width, height) {
    const sceneHeight = 508;
    const scene = this.getScratchLayer("river-reveal", VIEW_W, sceneHeight);
    if (this.riverRevealFrame !== this.time) {
      this.riverRevealFrame = this.time;
      this.renderLevel5RiverScene(scene, {
        frozen: false, motionTime: this.time, sceneHeight, renderTime: 0, rhythm: null, aftermath: true
      });
    }
    const crop = Math.min(VIEW_W, sceneHeight * width / height);
    target.save();
    target.imageSmoothingEnabled = false;
    target.drawImage(scene.canvas, (VIEW_W - crop) / 2, 0, crop, sceneHeight, 0, 0, width, height);
    target.restore();
  }

  drawRiverGoddess(target, farY, bankY, age) {
    const sprite = this.refs.riverGoddess;
    if (!sprite || age < 0) return;
    const x = VIEW_W * .5;
    const water = Math.round(farY + (bankY - farY) * .67);
    const t = clamp(age / 1.75, 0, 1);
    const rise = 1 - Math.pow(1 - t, 3);
    const h = 232;
    const w = Math.round(h * sprite.width / sprite.height);
    const y = Math.round(water - h * rise + (t === 1 ? Math.sin(age * 2.1) * 2 : 0));
    target.save();
    target.beginPath();
    target.rect(x - w, 0, w * 2, water + 2);
    target.clip();
    target.imageSmoothingEnabled = false;
    target.drawImage(sprite, Math.round(x - w / 2), y, w, h);
    target.restore();
    target.save();
    target.lineWidth = 2;
    for (let ring = 0; ring < 3; ring++) {
      const phase = (age * .75 + ring / 3) % 1;
      target.strokeStyle = "rgba(126,224,239," + ((1 - phase) * rise * .65) + ")";
      target.beginPath();
      target.ellipse(x, water + 2, 12 + phase * 104, 2 + phase * 9, 0, 0, TAU);
      target.stroke();
    }
    target.restore();
  }
`;
