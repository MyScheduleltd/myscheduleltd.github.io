// Native audio output latency is independent of the song/chart clock.
// Bluetooth routes may legitimately exceed 250ms. Manual calibration remains
// a total override, never an amount added to automatic output compensation.
//
// 2026-11-20 (owner: the charts feel early or late on every device):
// - Manual calibrations saved before the charts were re-timed to the stems
//   (the owner's own was +96 ms, applied whatever the output) are cleared once
//   (TIMING_RESET_ID), so everyone starts on automatic; anyone can calibrate
//   again in 節拍校正.
// - Each fight records how early or late every hit landed against the game's
//   clock, and the staff build's results card shows the average with the
//   compensation in use, so a song played on each device (speaker, AirPods,
//   computer) measures what that device still needs.
export const TIMING_RESET_ID = '20261120';

export function patchOutputTiming(once, edit) {
  // Every counted hit's signed offset (positive = pressed late), for the staff readout.
  once('    const signedDelta = renderTime - target.time;\n',
    '    const signedDelta = renderTime - target.time;\n    if (tutorial.mode !== "practice") (rhythm.hitOffsets ||= []).push(signedDelta);\n');
  // The readout lives in the staff debug section, which the public build strips.
  once('  loadDeviceModePreference() {', READOUT + '\n  loadDeviceModePreference() {');
  // How long each fight press waited before the game took it (the readout).
  once('    // Sound belongs to the press, including harmless taps between notes.\n',
    '    if (tutorial.mode === "done" && Number.isFinite(inputTimeStamp)) {\n      const wait = performance.now() - inputTimeStamp;\n      if (wait >= 0 && wait < 1000) (rhythm.inputWaits ||= []).push(wait);\n    }\n    // Sound belongs to the press, including harmless taps between notes.\n');
  once('      panel.w - 150,\n      15,\n      900,\n      11\n    );\n\n    if (passed) {',
    '      panel.w - 150,\n      15,\n      900,\n      11\n    );\n    if (this.debugPanel) this.drawTimingReadout?.(target, panel, rhythm);\n\n    if (passed) {');
  edit('  getAudioOffsetSeconds() {', '  isBathroomRhythm() {', () => METHODS + '\n  isBathroomRhythm() {');
  edit('  getRhythmOutputDelay() {', '  primeRhythmTrack(track, start = 0) {', () => `  getRhythmOutputDelay() {
    const rhythm = this.level1OfficeRhythm;
    if (!rhythm || rhythm.skipAudio || this.getAudioOffsetSeconds() !== 0
      || this.getTimingMode?.() === "manual") return 0;
    return this.getReportedOutputDelay();
  }

  primeRhythmTrack(track, start = 0) {`);
  once('calibrate: `${this.tr("TIMING", "節拍校正")}: ${formatOffsetMs(this.getAudioOffsetSeconds())}`',
    'calibrate: `${this.tr("TIMING", "節拍校正")}: ${this.getTimingMode() === "auto" ? this.tr("AUTO", "自動") : formatOffsetMs(this.getAudioOffsetSeconds())}`');
  once('        if (this.homeMenu?.view === "calibrate") {\n          if (["Enter",',
    `        if (this.homeMenu?.view === "calibrate") {
          if (code === "KeyM") {
            if (!event.repeat && this.homeMenu.calibration?.phase !== "running") this.setTimingMode("auto");
            return;
          }
          if (["Enter",`);
  once('      if (this.homeMenu?.view === "calibrate") {\n        this.handleTimingCalibrationTap();',
    `      if (this.homeMenu?.view === "calibrate") {
        const panel = homeGeometry().panel;
        if (this.homeMenu.calibration?.phase !== "running" && point.x >= panel.x + panel.w / 2 - 140
          && point.x <= panel.x + panel.w / 2 + 140 && point.y >= panel.y + 416 && point.y <= panel.y + 458) {
          this.setTimingMode("auto");
          return;
        }
        this.handleTimingCalibrationTap();`);
  once('      offset: this.getAudioOffsetSeconds()\n',
    '      offset: this.getTimingMode() === "auto" ? this.getReportedOutputDelay() : this.getAudioOffsetSeconds(),\n      timingMode: this.getTimingMode()\n');
  once('this.setAudioOffsetSeconds(this.getAudioOffsetSeconds() - delta * 0.005);',
    'this.setAudioOffsetSeconds((this.getTimingMode() === "auto" ? this.getReportedOutputDelay() : this.getAudioOffsetSeconds()) - delta * 0.005);');
  once('target.fillText(uiText("THIS DEVICE\'S OFFSET", "這台裝置的延遲"), panel.x + panel.w / 2, panel.y + 300);',
    'target.fillText(view.timingMode === "auto" ? uiText("AUTOMATIC OUTPUT DELAY", "自動音訊延遲") : uiText("MANUAL TOTAL DELAY", "手動總延遲"), panel.x + panel.w / 2, panel.y + 300);');
  once('  target.restore();\n}\n\n// Draws `text` so the glyph\'s own ink', `  if (view.phase !== "running") {
    target.fillStyle = view.timingMode === "auto" ? "#edcb58" : "#efe3c4";
    target.fillRect(panel.x + panel.w / 2 - 140, panel.y + 416, 280, 42);
    target.strokeStyle = ink; target.lineWidth = 3;
    target.strokeRect(panel.x + panel.w / 2 - 140, panel.y + 416, 280, 42);
    target.fillStyle = ink;
    target.font = "900 18px 'Courier New', 'PingFang TC', 'Noto Sans TC', monospace";
    target.fillText(uiText("M · USE AUTOMATIC", "M・使用自動校正"), panel.x + panel.w / 2, panel.y + 443);
  }
  target.restore();
}

// Draws \`text\` so the glyph's own ink`);
}

const METHODS = String.raw`
  getManualAudioOffsetSeconds() {
    if (this.audioOffsetSeconds === undefined) {
      let stored = 0;
      try { stored = Number(localStorage.getItem(AUDIO_OFFSET_STORAGE_KEY)); } catch {}
      this.audioOffsetSeconds = Number.isFinite(stored) ? clamp(stored, AUDIO_OFFSET_RANGE[0], AUDIO_OFFSET_RANGE[1]) : 0;
    }
    return this.audioOffsetSeconds;
  }

  getTimingMode() {
    if (!this.audioTimingMode) {
      let stored, reset;
      try {
        stored = localStorage.getItem(AUDIO_OFFSET_STORAGE_KEY + ".mode");
        reset = localStorage.getItem(AUDIO_OFFSET_STORAGE_KEY + ".reset");
      } catch {}
      // Calibrations from before the stem-timed charts are cleared once.
      if (reset !== "${TIMING_RESET_ID}") {
        stored = "auto";
        this.audioOffsetSeconds = 0;
        try {
          localStorage.removeItem(AUDIO_OFFSET_STORAGE_KEY);
          localStorage.setItem(AUDIO_OFFSET_STORAGE_KEY + ".mode", "auto");
          localStorage.setItem(AUDIO_OFFSET_STORAGE_KEY + ".reset", "${TIMING_RESET_ID}");
        } catch {}
      }
      this.audioTimingMode = stored === "manual" ? "manual" : "auto";
    }
    return this.audioTimingMode;
  }

  setTimingMode(mode) {
    this.audioTimingMode = mode === "auto" ? "auto" : "manual";
    try { localStorage.setItem(AUDIO_OFFSET_STORAGE_KEY + ".mode", this.audioTimingMode); } catch {}
  }

  getAudioOffsetSeconds() {
    return this.getTimingMode() === "auto" ? 0 : this.getManualAudioOffsetSeconds();
  }

  setAudioOffsetSeconds(seconds) {
    this.audioOffsetSeconds = clamp(Math.round(seconds * 1000) / 1000, AUDIO_OFFSET_RANGE[0], AUDIO_OFFSET_RANGE[1]);
    this.setTimingMode("manual");
    try { localStorage.setItem(AUDIO_OFFSET_STORAGE_KEY, String(this.audioOffsetSeconds)); } catch {}
  }

  getReportedOutputDelay() {
    const track = this.getActiveLevel1OfficeRhythmAudio();
    const context = this.musicAudioRoutes?.get(track)?.context || this.level1OfficeAudioContext;
    if (!context || context.state !== "running") return 0;
    // outputLatency is the destination-to-device delay; baseLatency is the
    // graph-to-destination processing delay. Neither has a 250ms API limit.
    const output = Number(context.outputLatency), base = Number(context.baseLatency) || 0;
    if (!Number.isFinite(output) || output < 0 || !Number.isFinite(base) || base < 0) return 0;
    const delay = output + base;
    return delay > 0 && delay <= 1 ? delay : 0;
  }
`;

// Staff results: the fight's hits, how early or late they landed on average,
// and the compensation in use, for measuring each device's output.
const READOUT = String.raw`  drawTimingReadout(target, panel, rhythm) {
    const offsets = rhythm?.hitOffsets || [];
    const ms = value => (value >= 0 ? "+" : "") + Math.round(value * 1000);
    let line;
    if (offsets.length < 8) {
      line = "計時 TIMING · " + offsets.length + " 次 hits · 次數太少 too few to measure";
    } else {
      const sorted = [...offsets].sort((a, b) => a - b);
      const mean = offsets.reduce((sum, value) => sum + value, 0) / offsets.length;
      const median = sorted[Math.floor(sorted.length / 2)];
      const side = Math.abs(mean) < 0.012 ? "準 on time" : mean > 0 ? "偏晚 late" : "偏早 early";
      line = "計時 TIMING · " + offsets.length + " 次 hits · 平均 avg " + ms(mean) + " ms " + side + " · 中位 median " + ms(median) + " ms";
    }
    const track = this.getActiveLevel1OfficeRhythmAudio();
    const context = this.musicAudioRoutes?.get(track)?.context || this.level1OfficeAudioContext;
    const output = Number(context?.outputLatency) || 0, base = Number(context?.baseLatency) || 0;
    const comp = this.getTimingMode() === "manual"
      ? "補償 手動 manual " + ms(this.getManualAudioOffsetSeconds()) + " ms"
      : "補償 自動 auto " + ms(this.getRhythmOutputDelay()) + " ms (out " + Math.round(output * 1000) + " + base " + Math.round(base * 1000) + " ms)";
    // Press to sound: how long a press waited for the game, the median and the
    // slowest tenth; the engine's own delay is the out + base above.
    const waits = [...(rhythm?.inputWaits || [])].sort((a, b) => a - b);
    const tap = waits.length < 8 ? "" : " · 按鍵等待 tap wait " + Math.round(waits[Math.floor(waits.length / 2)])
      + " ms (p90 " + Math.round(waits[Math.min(waits.length - 1, Math.floor(waits.length * 0.9))]) + ")";
    // Under the buttons (which end at y 614), inside what the phone's card view shows (to 670).
    target.save();
    target.textAlign = "center";
    target.textBaseline = "middle";
    target.fillStyle = "#1b2130";
    target.fillRect(panel.x + 40, 620, panel.w - 80, 48);
    target.fillStyle = "#ffd36c";
    drawFittedText(target, line, panel.x + panel.w / 2, 633, panel.w - 110, 17, 900, 11);
    target.fillStyle = "#f7f2de";
    drawFittedText(target, comp + tap, panel.x + panel.w / 2, 655, panel.w - 110, 15, 900, 10);
    target.restore();
  }
`;
