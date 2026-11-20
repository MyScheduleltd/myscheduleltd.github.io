// Level 7's official video and the DJ anchored to the painted stage booth.
// The shipped video starts at source-frame8.000s. Independent waveform fits
// place the song's first sample at source7.994625s across nine song windows.
export function patchConcertMedia(once, edit) {
  once('    this.loadedSceneGroups = new Set();\n  }', `    this.sceneAssetJobs.push({
      key: "concertMusicVideo", group: "level6",
      run: () => this.loadConcertMusicVideo(),
      release: () => this.releaseConcertMusicVideo()
    });
    this.loadedSceneGroups = new Set();
  }`);
  once('      () => this.syncArcadeMusicVideo(),\n', '      () => this.syncArcadeMusicVideo(),\n      () => this.syncConcertMusicVideo(),\n');
  once('  primeAudioOnGesture() {\n', `  primeAudioOnGesture() {
    if (this.concertVideoRefused) {
      this.concertVideoRefused = false;
      this.syncConcertMusicVideo();
    }
`);
  once('  renderLevel6ConcertScene(target, context) {\n', METHODS + '\n  renderLevel6ConcertScene(target, context) {\n');
  once('  drawLevel6ConcertDrBeauty(target, row, motionTime, pulse, stageY) {\n    const x = 560;',
    '  drawLevel6ConcertDrBeauty(target, row, motionTime, pulse, stageY) {\n    // Portrait framing keeps the singer centered while the DJ stays visible.\n    const x = this.isTallScreenView() ? 790 : 560;');
  once('    // Darker while the crowd is cold.\n', '    this.renderConcertLedVideo(target, stageY);\n    // Darker while the crowd is cold.\n');
  once('    const stageY = 352;\n    target.save();\n    target.imageSmoothingEnabled = false;',
    '    const stageY = 352;\n    target.save();\n    if (this.isTallScreenView()) target.translate(-150, 0);\n    target.imageSmoothingEnabled = false;');
  edit('  drawLevel6ConcertGangan(target, row, motionTime, pulse, stageY) {', '  drawLevel6ConcertCrowd(target, hype, climax, motionTime, pulse, sceneHeight, frozen) {', () => `  drawLevel6ConcertGangan(target, row, motionTime, pulse, stageY) {
    const sheet = this.refs.level6ConcertGanganSheet;
    const spec = this.config?.sprites?.level6ConcertGangan;
    if (!sheet || !spec) return;
    const rows = spec.rowNames || [];
    const rowIndex = Math.max(0, rows.indexOf(row));
    const cols = spec.cols || 4;
    const frame = rowIndex * cols + Math.floor(motionTime * (row === "idle" ? 4 : 7)) % cols;
    const h = spec.displayHeight || 205, scale = h / spec.frameHeight;
    const layout = this.getConcertStageLayout(stageY);
    // Keep the actor and equipment, but discard the duplicate tablecloth.
    // The remaining console rests on the booth already painted into the map.
    const cropHeight = 224;
    const width = spec.frameWidth * scale, height = cropHeight * scale;
    const x = layout.booth.centerX - width / 2, y = layout.booth.deckY - height;
    target.drawImage(sheet, frame % cols * spec.frameWidth, Math.floor(frame / cols) * spec.frameHeight,
      spec.frameWidth, cropHeight, x, y, width, height);
    this.concertBoothTelemetry = {frame, cropHeight, x, y, width, height,
      deckY: layout.booth.deckY, centerX: layout.booth.centerX, duplicateBooth: false};
  }

  drawLevel6ConcertCrowd(target, hype, climax, motionTime, pulse, sceneHeight, frozen) {`);
}

const METHODS = String.raw`
  getConcertStageLayout(stageY = 352) {
    const bg = this.refs.level6ConcertBgSheet;
    const scale = VIEW_W / (bg?.width || 1280);
    const cropY = Math.max(0, (bg?.height || 853)
      * (this.config?.sprites?.level6ConcertBg?.stageEdgeRatio ?? .647) - stageY / scale);
    // Landmarks measured on the original1280x853 map. One transform keeps
    // both the LED and the existing booth attached during portrait framing.
    const k = (bg?.width || 1280) / 1280;
    return {
      led: {x: 294 * k * scale, y: (198 * k - cropY) * scale,
        w: 692 * k * scale, h: 296 * k * scale},
      booth: {centerX: 1005 * k * scale, deckY: (451 * k - cropY) * scale}
    };
  }

  async loadConcertMusicVideo() {
    if (this.concertMusicVideo) return;
    const file = await fetchGameAsset("assets/video/level7-make-some-noise.mp4");
    const url = URL.createObjectURL(new Blob([file.data], {type: "video/mp4"}));
    const video = document.createElement("video");
    video.muted = video.defaultMuted = true;
    video.playsInline = true;
    video.preload = "auto";
    try {
      await new Promise((resolve, reject) => {
        const cleanup = () => {clearTimeout(timer); video.removeEventListener("loadeddata", ready); video.removeEventListener("error", fail);};
        const ready = () => {cleanup(); resolve();};
        const fail = () => {cleanup(); reject(new Error("Concert video could not be decoded"));};
        const timer = setTimeout(fail, 12000);
        video.addEventListener("loadeddata", ready);
        video.addEventListener("error", fail);
        video.src = url;
        video.load();
      });
      this.concertMusicVideo = video;
    } catch (error) {
      video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); throw error;
    }
  }

  releaseConcertMusicVideo() {
    const video = this.concertMusicVideo;
    if (!video) return;
    this.concertMusicVideo = null;
    this.concertLedFrameCache = null;
    this.concertLedFrameVideo = null;
    this.concertVideoRefused = false;
    this.concertVideoStarting = null;
    const url = video.getAttribute("src");
    video.pause(); video.removeAttribute("src"); video.load();
    URL.revokeObjectURL(url);
  }

  getConcertVideoTime() {
    const song = this.getActiveLevel1OfficeRhythmAudio();
    if (!song || this.level1OfficeRhythm?.theme !== "concert") return 0;
    const spec = this.getActiveRhythmSpec();
    const origin = this.hasBakedFades() ? (spec.fightCut?.fromSeconds || 0) : 0;
    // AAC decoder warm-up belongs to the music player, not the recording.
    return Math.max(0, song.currentTime - (song.mothFightLead || 0) + origin - .005375);
  }

  syncConcertMusicVideo() {
    const video = this.concertMusicVideo;
    if (!video) return;
    const rhythm = this.level1OfficeRhythm;
    const concert = rhythm?.theme === "concert";
    const song = concert && this.getActiveLevel1OfficeRhythmAudio();
    const active = concert && this.state === "playing" && !rhythm.ending && rhythm.tutorial?.mode === "done"
      && !rhythm.skipAudio && !this.isRhythmCountIn() && !this.levelLoadingPresentation && !document.hidden
      && song && !song.paused && !song.seeking && song.playbackRate > 0
      && song.currentTime >= (song.mothFightLead || 0) && !this.isFightSongStalled(song);
    if (!active) {if (!video.paused) video.pause(); return;}
    const desired = this.getConcertVideoTime();
    const time = Math.min(video.duration - .05, desired);
    const rate = clamp(song.playbackRate, .0625, 16);
    if (video.playbackRate !== rate) video.playbackRate = rate;
    if (!video.seeking && Math.abs(video.currentTime - time) > .085) video.currentTime = time;
    if (desired >= video.duration - .05) {video.pause(); return;}
    if (video.paused && !video.seeking && !this.concertVideoStarting && !this.concertVideoRefused) {
      const starting = video.play().catch(error => {
        if (this.concertMusicVideo === video && error?.name === "NotAllowedError") this.concertVideoRefused = true;
      }).finally(() => {if (this.concertVideoStarting === starting) this.concertVideoStarting = null;});
      this.concertVideoStarting = starting;
    }
    this.concertVideoTelemetry = {desired, current: video.currentTime, error: video.currentTime - desired,
      muted: video.muted, blob: video.currentSrc.startsWith("blob:"), active};
  }

  renderConcertLedVideo(target, stageY) {
    const video = this.concertMusicVideo;
    if (!video || video.readyState < 2 || !video.videoWidth) return;
    const led = this.getConcertStageLayout(stageY).led;
    const W = Math.round(led.w), H = Math.round(led.h);
    const frame = Math.floor(video.currentTime * 24);
    const layer = this.getScratchLayer("concert-led", W, H);
    if (!this.concertLedMask || this.concertLedMask.width !== W || this.concertLedMask.height !== H) {
      const mask = document.createElement("canvas"); mask.width = W; mask.height = H;
      const ink = mask.getContext("2d");
      ink.fillStyle = "#fff"; ink.fillRect(0, 0, W, H);
      ink.globalCompositeOperation = "destination-in";
      const horizontal = ink.createLinearGradient(0, 0, W, 0);
      horizontal.addColorStop(0, "transparent"); horizontal.addColorStop(12 / W, "white");
      horizontal.addColorStop(1 - 12 / W, "white"); horizontal.addColorStop(1, "transparent");
      ink.fillStyle = horizontal; ink.fillRect(0, 0, W, H);
      const vertical = ink.createLinearGradient(0, 0, 0, H);
      vertical.addColorStop(0, "transparent"); vertical.addColorStop(10 / H, "white");
      vertical.addColorStop(1 - 10 / H, "white"); vertical.addColorStop(1, "transparent");
      ink.fillStyle = vertical; ink.fillRect(0, 0, W, H);
      // The painted booth is in front of the LED. Remove its silhouette
      // from the video mask instead of painting over the original map face.
      ink.globalCompositeOperation = "destination-out";
      ink.fillStyle = "white";
      const front = [[858,460],[884,451],[1134,451],[1134,499],[1141,499],[1141,518],[848,518],[848,499],[858,499]];
      ink.beginPath();
      front.forEach(([x,y],i)=>ink[i?"lineTo":"moveTo"]((x-294)*W/692,(y-198)*H/296));
      ink.closePath(); ink.fill();
      // Keep the thin rail and posts while allowing the video behind the gaps.
      ink.strokeStyle = "white"; ink.lineWidth = 2;
      ink.beginPath(); ink.moveTo((895-294)*W/692,(442-198)*H/296);
      ink.lineTo((1125-294)*W/692,(442-198)*H/296);
      ink.moveTo((895-294)*W/692,(442-198)*H/296); ink.lineTo((895-294)*W/692,(452-198)*H/296);
      ink.moveTo((1125-294)*W/692,(442-198)*H/296); ink.lineTo((1125-294)*W/692,(452-198)*H/296);
      ink.stroke();
      this.concertLedMask = mask;
      const tile = document.createElement("canvas"); tile.width = tile.height = 4;
      const dot = tile.getContext("2d");
      dot.fillStyle = "rgba(2,6,20,.24)"; dot.fillRect(0, 0, 4, 1); dot.fillRect(0, 0, 1, 4);
      dot.fillStyle = "rgba(100,150,255,.12)"; dot.fillRect(2, 2, 1, 1);
      this.concertLedPattern = layer.createPattern(tile, "repeat");
      this.concertLedFrameCache = null;
    }
    const fit = Math.max(W / video.videoWidth, H / video.videoHeight);
    const w = video.videoWidth * fit, h = video.videoHeight * fit;
    if (!video.seeking && (this.concertLedFrameCache !== frame || this.concertLedFrameVideo !== video)) {
      layer.setTransform(1, 0, 0, 1, 0, 0); layer.globalAlpha = 1;
      layer.globalCompositeOperation = "source-over"; layer.clearRect(0, 0, W, H);
      layer.fillStyle = "#071326"; layer.fillRect(0, 0, W, H);
      layer.globalAlpha = .91;
      layer.drawImage(video, (W - w) / 2, (H - h) / 2, w, h);
      layer.globalAlpha = 1;
      layer.fillStyle = this.concertLedPattern; layer.fillRect(0, 0, W, H);
      layer.globalCompositeOperation = "destination-in";
      layer.drawImage(this.concertLedMask, 0, 0);
      layer.globalCompositeOperation = "source-over";
      this.concertLedFrameCache = frame; this.concertLedFrameVideo = video;
    }
    target.drawImage(layer.canvas, led.x, led.y, led.w, led.h);
    this.concertLedTelemetry = {...led, frameWidth: w, frameHeight: h, behindActors: true,
      featherPixels: 12, ledMatrix: true, occludedByBooth: true, nativeVideoFrame: frame};
  }
`;
