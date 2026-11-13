// The scenes Dr. Beauty walks through (owner, 2026-10-18).
//
// The instruction bar ("靠近Bonita", "找梯子回房間" and the rest) sat at the
// bottom of the picture, over the floor he walks on and level 4's basement.
// It sits at the top now, level with the 暫停 button and clear of it: centred
// on a computer, and beside the button on a phone, as wide as its line.
//
// After 祖賢's massage (level 3) and Bonita's game (level 4) Dr. Beauty used to
// land back at a fixed spot (level 3's room entrance). He returns to where he
// stood when the fight began, facing the same way; for a fight resumed from
// the main menu, which has no such spot, beside them.
//
// Level 4's basement chest: once Bonita's game is won in story mode, a chest
// stands in the basement (new art in the game's style, scripts/make-meme-
// chest.py): flat and seen from the front like the crates, their size, and
// against the back wall with them, under the lamp. Near it O opens it: the lid
// lifts, and the owner's private-message recording appears with playback,
// download/save and close controls. The existing chest/save flag names stay
// compatible with earlier saves. No image reward is published any longer.
import { ADDED_ASSETS } from './moth-asset-additions.mjs';

const RECORDING_PATH = 'assets/audio/easter-eggs/dr-beauty-private-message.m4a';

export const MEME_CHEST = {
  sheet: 'assets/sprites/level4_meme_chest/sheet.webp',
  audio: RECORDING_PATH,
  sha256: ADDED_ASSETS[RECORDING_PATH].sha256,
  downloadName: 'A private message from Dr.Beauty.m4a',
  titleEn: 'A private message from Dr.Beauty',
  titleZh: '一段來自美麗本人的錄音',
  // Under the basement's lamp, standing on the back wall's line with the
  // crates and the robot (Dr. Beauty walks in front, his feet at about 670).
  x: 450,
  y: 655,
  // The frame's size, for a closed chest about 52 high (198 of the frame's
  // 256; the red crate is 57).
  size: 67
};

export const MEME_CSS = `
.moth-meme { position: fixed; inset: 0; z-index: 10002; display: grid; place-items: center; box-sizing: border-box;
  padding: max(14px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) max(14px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
  background: #0d110ed9; touch-action: manipulation; color: #f7f2de; font: 700 16px/1.45 "Courier New", "PingFang TC", "Noto Sans TC", monospace; }
.moth-meme section { box-sizing: border-box; width: min(520px, 100%); max-height: 100%; display: flex; flex-direction: column; gap: 12px; padding: 18px;
  background: repeating-linear-gradient(#2c3b30 0 3px, #28362c 3px 4px); border: 4px solid #d8d2b4; outline: 3px solid #141a16; box-shadow: 8px 8px 0 #0b0e0c; overflow-y: auto; overscroll-behavior: contain; }
.moth-meme h2 { margin: 0; padding-left: 12px; border-left: 6px solid #ffd36c; font-size: clamp(20px, 5vw, 26px); letter-spacing: .06em; }
.moth-meme audio { display: block; width: 100%; min-height: 54px; }
.moth-meme h2, .moth-meme p { overflow-wrap: anywhere; }
.moth-meme p { margin: 0; color: #8fe8ff; font-size: 13px; }
.moth-meme-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.moth-meme button { font: inherit; font-weight: 900; font-size: 18px; padding: 12px; background: #344439; color: #f7f2de; border: 3px solid #dcd8bd; box-shadow: 4px 5px 0 #141a16; }
.moth-meme button[data-meme-save] { background: #ffd36c; color: #1b2130; }
.moth-meme button:disabled { opacity: .5; }
.moth-meme [hidden] { display: none !important; }
.moth-meme button:focus-visible { outline: 3px solid #ffd36c; outline-offset: 4px; }
`;

export function patchWalkScenes(once, edit) {
  // The bar at the top: as before but for where it sits, which no longer
  // depends on the scene's (the y it is given stays unused).
  once(`  // On phones the joystick/button clusters overlay the bottom of the canvas;
  // keep every stage instruction above them so it stays readable.
  if (typeof document !== "undefined" && document.body?.dataset?.deviceMode === "phone") {
    y = Math.min(y, VIEW_H - 216);
  }
`, `  // At the top, level with the 暫停 button and clear of it on both sides.
  const pause = game?.getLevel1OfficePauseButtonRect?.() || { x: 18, y: 16, w: 112, h: 44 };
  y = pause.y;
`);
  once('  const w = Math.min(VIEW_W - 24, Math.max(520, Math.ceil(measured + 60)));\n  const x = (VIEW_W - w) / 2;\n  target.fillStyle = "rgba(3, 5, 10, 0.72)";',
    '  const w = Math.min(VIEW_W - 2 * (pause.x + pause.w + 12), Math.max(520, Math.ceil(measured + 60)));\n  const x = (VIEW_W - w) / 2;\n  target.fillStyle = "rgba(3, 5, 10, 0.72)";');
  once(`      const w = Math.min(PORTRAIT_FIGHT.width - 24, Math.max(360, target.measureText(String(prompt.text)).width + 48));
      const h = 50;
      const x = (PORTRAIT_FIGHT.width - w) / 2;
      const y = walk.worldH - h - 22;`, `      // In its own row under the 暫停 button, centred across the screen and
      // as wide as its line.
      const pause = this.getLevel1OfficePauseButtonRect();
      const w = Math.min(PORTRAIT_FIGHT.width - 32, Math.max(300, target.measureText(String(prompt.text)).width + 48));
      const h = pause.h;
      const x = (PORTRAIT_FIGHT.width - w) / 2;
      const y = 8 + pause.h + 8;`);
  once('      drawFittedText(target, String(prompt.text), PORTRAIT_FIGHT.width / 2, y + h / 2 + 1, w - 28, 24, 900, 13);',
    '      drawFittedText(target, String(prompt.text), x + w / 2, y + h / 2 + 1, w - 28, 24, 900, 13);');
  // The staff tools' previews run as practice: the chest shows after 'L4
  // After Win Talk', and 'L4 Basement Chest' goes straight to it (both set
  // debugLevel4Won, in moth-runtime-patches.mjs).
  once('            <button type="button" data-debug-stage="level4-postboss-dialogue">L4 After Win Talk</button>\n',
    '            <button type="button" data-debug-stage="level4-postboss-dialogue">L4 After Win Talk</button>\n            <button type="button" data-debug-stage="level4-meme-chest">L4 Basement Chest</button>\n');
  once('      this.startLevel4PostBossDialogue();\n    } else if (stageId === "studio-stage1") {\n      await this.startStudioFight({ skipAudio: true });',
    '      this.startLevel4PostBossDialogue();\n    } else if (stageId === "level4-meme-chest") {\n      this.enterLevel4Stage1({ rail: "lower", spawnX: MEME_CHEST.x + 70 });\n      if (this.sewerPlayer) this.sewerPlayer.facing = -1;\n    } else if (stageId === "studio-stage1") {\n      await this.startStudioFight({ skipAudio: true });');

  // Level 3: back to the spot where the massage began.
  once('    this.startLevel3Dialogue(this.level3Boss.phase === "postBoss" ? "level3PostBoss" : "level3PreBoss");',
    '    if (this.level3Boss.phase !== "postBoss" && this.sewerPlayer) this.level3FightSpot = { x: this.sewerPlayer.x, facing: this.sewerPlayer.facing };\n    this.startLevel3Dialogue(this.level3Boss.phase === "postBoss" ? "level3PostBoss" : "level3PreBoss");');
  once("      // Back to the living room, where 祖賢's post-fight exchange waits.\n      this.level1OfficeRhythm = null;\n      this.enterLevel3Stage1({ postBossReady: true });\n",
    "      // Back to the living room, where 祖賢's post-fight exchange waits, at\n      // the spot where the massage began.\n      this.level1OfficeRhythm = null;\n      const spot = this.getLevel3FightSpot();\n      this.enterLevel3Stage1({ postBossReady: true, spawnX: spot.x });\n      if (this.sewerPlayer) this.sewerPlayer.facing = spot.facing;\n");
  // Level 4: back to the spot where Bonita's game began.
  once('    this.level4DialogueIndex = 0;\n    this.state = "level4Dialogue";\n    this.pocketOpen = false;\n    if (this.chest) this.chest.menuOpen = false;\n    if (this.sewerPlayer) {\n      this.sewerPlayer.vx = 0;\n      this.sewerPlayer.facing = 1;\n    }\n',
    '    this.level4DialogueIndex = 0;\n    this.state = "level4Dialogue";\n    this.pocketOpen = false;\n    if (this.chest) this.chest.menuOpen = false;\n    if (this.sewerPlayer) {\n      this.sewerPlayer.vx = 0;\n      this.sewerPlayer.facing = 1;\n      this.level4FightX = this.sewerPlayer.x;\n    }\n');
  // A room preview can normalize its own loadout without editing the save.
  once('      if (this.progress) {\n        this.progress.latestCollectedSongs = this.normalizeCollectedSongs(this.collectedSongs);\n        this.saveProgress();',
    '      if (this.progress && !this.freePlay) {\n        this.progress.latestCollectedSongs = this.normalizeCollectedSongs(this.collectedSongs);\n        this.saveProgress();');
  // Level 4's basement chest.
  once('    if (this.level4Rail === "lower" && this.chest?.revealed) {\n      drawables.push({\n        y: stage.hiddenChest?.y ?? 668,\n        draw: () => this.drawLevel4HiddenChest()\n      });\n    }\n',
    '    if (this.level4Rail === "lower" && this.chest?.revealed) {\n      drawables.push({\n        y: stage.hiddenChest?.y ?? 668,\n        draw: () => this.drawLevel4HiddenChest()\n      });\n    }\n    if (this.hasLevel4MemeChest()) {\n      drawables.push({ y: MEME_CHEST.y, draw: () => this.drawLevel4MemeChest() });\n    }\n');
  edit('      const nearLadder = this.isLevel4NearLadder();', '      this.renderPocketInterface();', () => `      const lower = this.level4Rail === "lower";
      const nearLadder = this.isLevel4NearLadder();
      const nearLeftDoor = this.isLevel4NearLeftDoor();
      const nearChest = lower && this.chest?.revealed && this.isNearChest();
      const nearMemeChest = this.isLevel4NearMemeChest();
      const hasMemeChest = this.hasLevel4MemeChest();
      const opened = this.memeChest?.state === "open";
      let prompt = lower ? this.tr("Find the ladder", "找梯子回房間") : this.tr("Approach Bonita", "靠近 Bonita");
      if (hasMemeChest) {
        if (opened) prompt = lower ? this.tr("Climb up, then exit left", "爬上梯子，再往左離開")
          : this.tr("Use the left door", "從左門離開");
        else prompt = lower ? this.tr("Find the chest", "找寶箱") : this.tr("Chest in basement", "地下室有寶箱");
      }
      if (nearLadder && !(hasMemeChest && opened && !lower)) {
        if (hasMemeChest && opened) prompt = this.tr("O: Climb up, then exit left", "O 爬上梯子，再往左離開");
        else if (hasMemeChest && !lower) prompt = this.tr("O: Climb down to chest", "O 爬下梯子找寶箱");
        else prompt = lower ? this.tr("O: Climb up", "O 爬上梯子") : this.tr("O: Climb down", "O 爬下梯子");
      }
      if (nearLeftDoor) {
        const won = this.progress?.flags?.level4BossDefeated;
        prompt = won ? this.tr("O: Leave room", "O 離開房間") : this.tr("Finish Bonita’s challenge", "先陪 Bonita 完成挑戰");
      }
      if (this.chest?.state === "revealing") prompt = this.tr("Something behind the wall…", "牆後有東西正在出現…");
      else if (nearChest) prompt = this.tr("O: Open hidden chest", "O 開啟隱藏寶箱");
      if (nearMemeChest && !opened) prompt = this.tr("O: Open chest", "O 打開寶箱");
      drawObjectivePrompt(
        this.ctx,
        prompt,
        nearMemeChest || nearChest || nearLadder || nearLeftDoor || this.chest?.state === "revealing" ? "#ffd36c" : "#8fe8ff",
        this.time
      );
      this.renderPocketInterface();`);
  once('  tryLevel4Interact() {\n', '  tryLevel4Interact() {\n    if (this.isLevel4NearMemeChest()) {\n      this.openLevel4MemeChest();\n      return;\n    }\n');
  once('      return (this.level4Rail === "lower" && this.chest?.revealed && this.isNearChest())\n', '      return this.isLevel4NearMemeChest()\n        || (this.level4Rail === "lower" && this.chest?.revealed && this.isNearChest())\n');
  once('  updateLevel4(dt) {\n', '  updateLevel4(dt) {\n    this.updateLevel4MemeChest();\n');
  once('    this.level4BossShots = [];\n    const side = this.getLevel4ActiveSideView();\n',
    '    this.level4BossShots = [];\n    this.memeChest = { state: this.progress?.flags?.level4MemeChestOpened ? "open" : "closed", at: 0 };\n    if (!this.memeChestSheet) loadImage(MEME_CHEST.sheet).then(image => { this.memeChestSheet = image; }).catch(() => {});\n    const side = this.getLevel4ActiveSideView();\n');
  // While the recording is up it has the keys and the deck (O save, H close).
  once('    window.addEventListener("keydown", (event) => {\n      if (this.scoreboard) { this.handleScoreboardKey(event); return; }\n',
    '    window.addEventListener("keydown", (event) => {\n      if (this.scoreboard) { this.handleScoreboardKey(event); return; }\n      if (this.memeView) { this.handleMemeKey(event); return; }\n');
  once('  getControlMode() {\n', '  getControlMode() {\n    if (this.memeView) return "menu";\n');
  once('  returnToTitle() {\n    this.levelLoadingPresentation = null;\n', '  returnToTitle() {\n    this.levelLoadingPresentation = null;\n    if (this.memeView) this.closeMeme({ resumeBgm: false });\n');
  once('    if (this.levelLoadingPresentation) return;\n    // In a menu every press answers under the finger',
    '    if (this.levelLoadingPresentation) return;\n    if (this.memeView) {\n      if (action === "advance") this.saveMeme();\n      else if (action === "back") this.closeMeme();\n      return;\n    }\n    // In a menu every press answers under the finger');
  once('const HIT_SFX_GAIN = 0.95;', `const HIT_SFX_GAIN = 0.95;
const MEME_CHEST = ${JSON.stringify(MEME_CHEST)};`);

  // The talk after the game stood him at one mark beside Bonita (her x less
  // 168), whichever side of her the game began on: now where it began,
  // facing her.
  once('    this.level4Rail = "upper";\n    this.sewerPlayer = {\n      x: (bonita.x ?? 960) - 168,\n      y: side.floorY ?? 466,\n      vx: 0,\n      vy: 0,\n      facing: 1,\n',
    '    this.level4Rail = "upper";\n    const spotX = this.level4FightX ?? (bonita.x ?? 960) - 168;\n    this.sewerPlayer = {\n      x: spotX,\n      y: side.floorY ?? 466,\n      vx: 0,\n      vy: 0,\n      facing: spotX > (bonita.x ?? 960) ? -1 : 1,\n');
}

export const WALK_SCENE_METHODS = `
  // ---- Level 4's basement chest ----
  // Once Bonita's game is won in story mode, or in the staff tools' previews
  // of the win (which run as practice).
  hasLevel4MemeChest() {
    const flags = this.progress?.flags || {};
    return Boolean(this.debugLevel4Won || (!this.freePlay && flags.level4BossDefeated));
  }

  isLevel4NearMemeChest() {
    return this.state === "level4" && this.level4Rail === "lower" && this.hasLevel4MemeChest() && !this.memeView
      && Math.abs((this.sewerPlayer?.x ?? -999) - MEME_CHEST.x) <= 96;
  }

  openLevel4MemeChest() {
    if (!this.memeChest || this.memeChest.state === "opening") return;
    this.memeChest = { state: "opening", at: this.time || 0 };
    if (this.sewerPlayer) { this.sewerPlayer.vx = 0; this.sewerPlayer.facing = MEME_CHEST.x >= this.sewerPlayer.x ? 1 : -1; }
    this.playMenuSfx?.("click");
    // A preview from the staff tools leaves the save as it was.
    if (this.freePlay) return;
    if (!this.progress) this.progress = this.createDefaultProgress();
    this.progress.flags = { ...(this.progress.flags || {}), level4MemeChestOpened: true };
    this.saveProgress();
  }

  // The lid lifts for half a second, then the recording appears.
  updateLevel4MemeChest() {
    const chest = this.memeChest;
    if (chest?.state === "opening" && (this.time || 0) - chest.at >= 0.5) {
      chest.state = "open";
      this.showMeme();
    }
  }

  // Closed, with a glint on the lock now and then; lifting; open. A soft
  // shadow sets it on the floor.
  drawLevel4MemeChest() {
    this.getMemeRecording();
    const sheet = this.memeChestSheet;
    if (!sheet) return;
    const chest = this.memeChest || { state: "closed", at: 0 };
    const time = this.time || 0;
    const frame = chest.state === "open" ? 3
      : chest.state === "opening" ? (time - chest.at < 0.22 ? 2 : 3)
      : time % 1.6 < 0.2 ? 1 : 0;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(MEME_CHEST.x, MEME_CHEST.y);
    ctx.scale(1, 0.16);
    const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, MEME_CHEST.size * 0.5);
    shadow.addColorStop(0, "rgba(6, 4, 2, 0.55)");
    shadow.addColorStop(1, "rgba(6, 4, 2, 0)");
    ctx.fillStyle = shadow;
    ctx.fillRect(-MEME_CHEST.size * 0.5, -MEME_CHEST.size * 0.5, MEME_CHEST.size, MEME_CHEST.size);
    ctx.restore();
    drawBundleFrame(ctx, sheet, { frameWidth: 256, frameHeight: 256, cols: 2 }, frame, MEME_CHEST.x, MEME_CHEST.y,
      MEME_CHEST.size, MEME_CHEST.size, { x: 0.5, y: 252 / 256 });
  }

  // Fetch and hash-check the original bytes before the save gesture. Native
  // sharing needs its File already in hand while the user activates the button.
  getMemeRecording() {
    this.memeRecording ||= fetchGameAsset(MEME_CHEST.audio).then(async ({ data }) => {
      // Mirror copies are checked by the shared loader. Also verify the
      // same-origin copy, including while this newly added file is unpinned.
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
      const hash = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
      if (hash !== MEME_CHEST.sha256) throw new Error("Recording integrity mismatch");
      const file = new File([data], MEME_CHEST.downloadName, { type: "audio/mp4" });
      return { file, url: URL.createObjectURL(file) };
    }).catch(() => null);
    return this.memeRecording;
  }

  showMeme() {
    if (this.memeView) return;
    const root = document.createElement("div");
    root.className = "moth-meme";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "moth-recording-title");
    root.setAttribute("aria-describedby", "moth-recording-help");
    const phone = this.usesTouchControls();
    root.innerHTML = '<section><h2 id="moth-recording-title"></h2><p id="moth-recording-help"></p>'
      + '<audio controls preload="metadata"></audio><p role="status" aria-live="polite"></p>'
      + '<button type="button" data-meme-retry hidden></button>'
      + '<div class="moth-meme-actions"><button type="button" data-meme-save disabled></button><button type="button" data-meme-close></button></div></section>';
    const title = this.tr(MEME_CHEST.titleEn, MEME_CHEST.titleZh);
    root.querySelector("h2").textContent = title;
    root.querySelector("#moth-recording-help").textContent = phone
      ? this.tr("Listen here, then save the recording. If a share menu opens, choose a save option there.", "可以先在這裡聆聽，再儲存錄音。若開啟分享選單，請在選單中選擇儲存方式。")
      : this.tr("Listen here or download the recording to keep it.", "可以在這裡聆聽，或下載錄音收藏。");
    root.querySelector("audio").setAttribute("aria-label", title);
    root.querySelector("[data-meme-save]").textContent = phone ? this.tr("SAVE AUDIO", "儲存錄音") : this.tr("DOWNLOAD AUDIO", "下載錄音");
    root.querySelector("[data-meme-close]").textContent = this.tr("CLOSE", "關閉");
    root.querySelector("[data-meme-retry]").textContent = this.tr("RETRY", "重試");
    // Its taps are its own, as the scoreboard's are.
    for (const type of ["pointerdown", "pointerup", "touchstart", "touchend", "click"]) root.addEventListener(type, event => event.stopPropagation());
    root.querySelector("[data-meme-save]").addEventListener("click", () => this.saveMeme());
    root.querySelector("[data-meme-close]").addEventListener("click", () => this.closeMeme());
    root.querySelector("[data-meme-retry]").addEventListener("click", () => {
      this.memeRecording = null;
      this.loadMemeRecording(this.memeView);
    });
    document.body.append(root);
    const audio = root.querySelector("audio");
    const view = this.memeView = { root, file: null, audio, sharing: false, forceDownload: false, state: this.state };
    // Use the existing preview music ownership, which also survives an audio
    // engine rebuild. Pause immediately so the voice never competes with BGM.
    const alreadyPaused = this.pausedBgm;
    this.pauseCurrentBgmForSong();
    view.pausedBgm = !alreadyPaused ? this.pausedBgm : null;
    if (view.pausedBgm?.audio) {
      this.audioFades = (this.audioFades || []).filter(fade => fade.audio !== view.pausedBgm.audio);
      view.pausedBgm.audio.pause();
    }
    // Keep the native player out of routed BGM ownership. Engine recovery
    // replaces routed Audio objects; replacing this one would orphan its
    // visible controls. Pause it on a hidden page and let native Play resume.
    view.pauseOnHide = () => { if (document.hidden) audio.pause(); };
    view.pauseOnPageHide = () => audio.pause();
    document.addEventListener("visibilitychange", view.pauseOnHide);
    window.addEventListener("pagehide", view.pauseOnPageHide);
    audio.addEventListener("error", () => {
      if (this.memeView === view && view.file) root.querySelector('[role="status"]').textContent = this.tr("This browser cannot preview the recording. You can still download it.", "此瀏覽器無法預覽這段錄音，仍可下載收藏。");
    });
    this.loadMemeRecording(view);
    root.querySelector("[data-meme-close]").focus({ preventScroll: true });
    this.releaseHeldInputs?.();
    this.updateMobileControls(true);
  }

  loadMemeRecording(view) {
    if (!view || this.memeView !== view) return;
    const status = view.root.querySelector('[role="status"]');
    const save = view.root.querySelector("[data-meme-save]");
    const retry = view.root.querySelector("[data-meme-retry]");
    view.file = null; save.disabled = true; retry.hidden = true;
    status.textContent = this.tr("Loading recording…", "正在載入錄音…");
    this.getMemeRecording().then(recording => {
      if (this.memeView !== view) return;
      if (!recording) {
        status.textContent = this.tr("The recording could not load. Please try again.", "錄音載入失敗，請重試。");
        retry.hidden = false;
        return;
      }
      view.file = recording.file;
      view.audio.src = recording.url;
      save.disabled = false;
      status.textContent = this.tr("Ready to listen or save.", "可以聆聽或儲存錄音了。");
    });
  }

  // Keep share() in the original gesture, with no fetch/await in between.
  saveMeme() {
    const view = this.memeView;
    if (!view || !view.file || view.sharing) return;
    this.playMenuSfx?.("click");
    const file = view.file;
    let shareable = false;
    try { shareable = !view.forceDownload && this.usesTouchControls() && typeof navigator.share === "function" && Boolean(navigator.canShare?.({ files: [file] })); } catch {}
    if (shareable) {
      const status = view.root.querySelector('[role="status"]');
      const save = view.root.querySelector("[data-meme-save]");
      view.sharing = true; save.disabled = true;
      const failed = error => {
        if (this.memeView !== view || error?.name === "AbortError") return;
        view.forceDownload = true;
        save.textContent = this.tr("DOWNLOAD AUDIO", "下載錄音");
        save.setAttribute("data-meme-download", "");
        status.textContent = this.tr("The share menu could not open. Tap DOWNLOAD AUDIO to save the file instead.", "無法開啟分享選單，請點「下載錄音」儲存檔案。");
      };
      const finished = () => { view.sharing = false; if (this.memeView === view) save.disabled = false; };
      try {
        Promise.resolve(navigator.share({ files: [file], title: this.tr(MEME_CHEST.titleEn, MEME_CHEST.titleZh) })).catch(failed).finally(finished);
      } catch (error) { failed(error); finished(); }
      return;
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = MEME_CHEST.downloadName;
    link.target = "_blank"; link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  closeMeme({ resumeBgm = true } = {}) {
    const view = this.memeView;
    if (!view) return;
    this.playMenuSfx?.("click");
    document.removeEventListener("visibilitychange", view.pauseOnHide);
    window.removeEventListener("pagehide", view.pauseOnPageHide);
    view.audio.pause();
    view.audio.removeAttribute("src"); view.audio.load();
    view.root.remove();
    this.memeView = null;
    if (view.pausedBgm && this.pausedBgm === view.pausedBgm) {
      if (!resumeBgm || this.state !== view.state) this.pausedBgm = null;
      else if (this.walkPause) {
        // A controller disconnect (or share-sheet blur) can pause the walk
        // while the dialog already owns its music. Hand that ownership to the
        // pause menu so its Continue action can restore the same track.
        this.walkPause.bgm ||= view.pausedBgm.audio;
        this.pausedBgm = null;
      } else if (!document.hidden) this.resumePausedBgm();
    }
    this.updateMobileControls(true);
  }

  handleMemeKey(event) {
    const code = event.code;
    if (event.target?.closest?.("audio") && !["Escape", "KeyH", "Tab"].includes(code)) return;
    if (["Enter", "NumpadEnter", "Space"].includes(code) && event.target?.closest?.("button")) return;
    if (["Enter", "NumpadEnter", "Space", "KeyO"].includes(code)) {
      if (!event.repeat) {
        const retry = this.memeView.root.querySelector("[data-meme-retry]");
        if (!retry.hidden) retry.click(); else this.saveMeme();
      }
    } else if (["Escape", "KeyH"].includes(code)) {
      this.closeMeme();
    } else if (code === "Tab") {
      const controls = [...this.memeView.root.querySelectorAll("audio,button:not(:disabled)")].filter(control => !control.hidden);
      const index = controls.indexOf(document.activeElement);
      if (event.shiftKey && index <= 0 || !event.shiftKey && index === controls.length - 1) {
        controls[event.shiftKey ? controls.length - 1 : 0]?.focus();
      } else return;
    } else return;
    event.preventDefault();
  }

  // Where Dr. Beauty stood when he took up 祖賢's massage; without one (a fight
  // resumed from the main menu), beside her, facing her.
  getLevel3FightSpot() {
    const boss = this.config?.level3?.stage1?.boss || {};
    return this.level3FightSpot || { x: (boss.x ?? 1026) - (boss.triggerRadius ?? 168) * 0.6, facing: 1 };
  }
`;
