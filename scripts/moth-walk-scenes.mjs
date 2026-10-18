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
// chest.py), its front turned to Dr. Beauty. Near it O opens it: the lid
// lifts, and a picture comes up to keep, with 儲存 (the share sheet on a
// phone, where 儲存影像 puts it in Photos; a download on a computer; a long
// press on the picture also saves it on a phone) and 關閉. Until it is
// opened, the bar upstairs mentions it. The picture is a stand-in
// (scripts/make-meme-standin.py) until the owner's meme arrives.

export const MEME_CHEST = {
  sheet: 'assets/sprites/level4_meme_chest/sheet.webp',
  picture: 'assets/memes/level4-meme.png',
  // On the basement floor, left of where the ladder comes down.
  x: 540,
  size: 128
};

export const MEME_CSS = `
.moth-meme { position: fixed; inset: 0; z-index: 10002; display: grid; place-items: center; box-sizing: border-box;
  padding: max(14px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) max(14px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
  background: #0d110ed9; touch-action: manipulation; color: #f7f2de; font: 700 16px/1.45 "Courier New", "PingFang TC", "Noto Sans TC", monospace; }
.moth-meme section { box-sizing: border-box; width: min(520px, 100%); max-height: 100%; display: flex; flex-direction: column; gap: 12px; padding: 18px;
  background: repeating-linear-gradient(#2c3b30 0 3px, #28362c 3px 4px); border: 4px solid #d8d2b4; outline: 3px solid #141a16; box-shadow: 8px 8px 0 #0b0e0c; }
.moth-meme h2 { margin: 0; padding-left: 12px; border-left: 6px solid #ffd36c; font-size: clamp(20px, 5vw, 26px); letter-spacing: .06em; }
.moth-meme img { display: block; width: 100%; min-height: 0; flex: 1 1 auto; object-fit: contain; background: #141a16; border: 2px solid #5b6f5e;
  -webkit-touch-callout: default; -webkit-user-select: auto; user-select: auto; }
.moth-meme p { margin: 0; color: #8fe8ff; font-size: 13px; }
.moth-meme-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.moth-meme button { font: inherit; font-weight: 900; font-size: 18px; padding: 12px; background: #344439; color: #f7f2de; border: 3px solid #dcd8bd; box-shadow: 4px 5px 0 #141a16; }
.moth-meme button[data-meme-save] { background: #ffd36c; color: #1b2130; }
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
      const y = walk.worldH - h - 22;`, `      // At the top beside the 暫停 button, centred in the room it leaves.
      const pause = this.getLevel1OfficePauseButtonRect();
      const left = 8 + pause.w + 10, room = PORTRAIT_FIGHT.width - 8 - left;
      const w = Math.min(room, Math.max(300, target.measureText(String(prompt.text)).width + 48));
      const h = pause.h;
      const x = left + (room - w) / 2;
      const y = 8;`);

  // Level 3: back to the spot where the massage began.
  once('    this.startLevel3Dialogue(this.level3Boss.phase === "postBoss" ? "level3PostBoss" : "level3PreBoss");',
    '    if (this.level3Boss.phase !== "postBoss" && this.sewerPlayer) this.level3FightSpot = { x: this.sewerPlayer.x, facing: this.sewerPlayer.facing };\n    this.startLevel3Dialogue(this.level3Boss.phase === "postBoss" ? "level3PostBoss" : "level3PreBoss");');
  once("      // Back to the living room, where 祖賢's post-fight exchange waits.\n      this.level1OfficeRhythm = null;\n      this.enterLevel3Stage1({ postBossReady: true });\n",
    "      // Back to the living room, where 祖賢's post-fight exchange waits, at\n      // the spot where the massage began.\n      this.level1OfficeRhythm = null;\n      const spot = this.getLevel3FightSpot();\n      this.enterLevel3Stage1({ postBossReady: true, spawnX: spot.x });\n      if (this.sewerPlayer) this.sewerPlayer.facing = spot.facing;\n");
  // Level 4: back to the spot where Bonita's game began.
  once('    this.level4DialogueIndex = 0;\n    this.state = "level4Dialogue";\n    this.pocketOpen = false;\n    if (this.chest) this.chest.menuOpen = false;\n    if (this.sewerPlayer) {\n      this.sewerPlayer.vx = 0;\n      this.sewerPlayer.facing = 1;\n    }\n',
    '    this.level4DialogueIndex = 0;\n    this.state = "level4Dialogue";\n    this.pocketOpen = false;\n    if (this.chest) this.chest.menuOpen = false;\n    if (this.sewerPlayer) {\n      this.sewerPlayer.vx = 0;\n      this.sewerPlayer.facing = 1;\n      this.level4FightX = this.sewerPlayer.x;\n    }\n');
  // Level 4's basement chest.
  once('    if (this.level4Rail === "lower" && this.chest?.revealed) {\n      drawables.push({\n        y: stage.hiddenChest?.y ?? 668,\n        draw: () => this.drawLevel4HiddenChest()\n      });\n    }\n',
    '    if (this.level4Rail === "lower" && this.chest?.revealed) {\n      drawables.push({\n        y: stage.hiddenChest?.y ?? 668,\n        draw: () => this.drawLevel4HiddenChest()\n      });\n    }\n    if (this.level4Rail === "lower" && this.hasLevel4MemeChest()) {\n      drawables.push({ y: (side.floorY ?? 650) - 1, draw: () => this.drawLevel4MemeChest(side) });\n    }\n');
  once('      const prompt = this.chest?.state === "revealing"\n', '      const nearMemeChest = this.isLevel4NearMemeChest();\n      const prompt = nearMemeChest\n        ? this.tr("O OPEN THE CHEST", "O 打開寶箱")\n        : this.chest?.state === "revealing"\n');
  once('            ? "往左離開"\n', '            ? (this.hasLevel4MemeChest() && !this.progress?.flags?.level4MemeChestOpened ? "地下室出現了寶箱 · 往左離開" : "往左離開")\n');
  once('        nearChest || nearLadder || nearLeftDoor || this.chest?.state === "revealing" ? "#ffd36c" : "#8fe8ff",',
    '        nearMemeChest || nearChest || nearLadder || nearLeftDoor || this.chest?.state === "revealing" ? "#ffd36c" : "#8fe8ff",');
  once('  tryLevel4Interact() {\n', '  tryLevel4Interact() {\n    if (this.isLevel4NearMemeChest()) {\n      this.openLevel4MemeChest();\n      return;\n    }\n');
  once('      return (this.level4Rail === "lower" && this.chest?.revealed && this.isNearChest())\n', '      return this.isLevel4NearMemeChest()\n        || (this.level4Rail === "lower" && this.chest?.revealed && this.isNearChest())\n');
  once('  updateLevel4(dt) {\n', '  updateLevel4(dt) {\n    this.updateLevel4MemeChest();\n');
  once('    this.level4BossShots = [];\n    const side = this.getLevel4ActiveSideView();\n',
    '    this.level4BossShots = [];\n    this.memeChest = { state: this.progress?.flags?.level4MemeChestOpened ? "open" : "closed", at: 0 };\n    if (!this.memeChestSheet) loadImage(MEME_CHEST.sheet).then(image => { this.memeChestSheet = image; }).catch(() => {});\n    const side = this.getLevel4ActiveSideView();\n');
  // While the picture is up it has the keys and the deck (O 儲存, H 關閉).
  once('    window.addEventListener("keydown", (event) => {\n      if (this.scoreboard) { this.handleScoreboardKey(event); return; }\n',
    '    window.addEventListener("keydown", (event) => {\n      if (this.scoreboard) { this.handleScoreboardKey(event); return; }\n      if (this.memeView) { this.handleMemeKey(event); return; }\n');
  once('  getControlMode() {\n', '  getControlMode() {\n    if (this.memeView) return "menu";\n');
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
  // Once Bonita's game is won in story mode (or previewed from the staff tools).
  hasLevel4MemeChest() {
    const flags = this.progress?.flags || {};
    return this.state === "level4" && !this.freePlay && Boolean(flags.level4BossDefeated || this.debugLevel4Won);
  }

  isLevel4NearMemeChest() {
    return this.level4Rail === "lower" && this.hasLevel4MemeChest() && !this.memeView
      && Math.abs((this.sewerPlayer?.x ?? -999) - MEME_CHEST.x) <= 96;
  }

  openLevel4MemeChest() {
    if (!this.memeChest || this.memeChest.state === "opening") return;
    this.memeChest = { state: "opening", at: this.time || 0 };
    if (this.sewerPlayer) { this.sewerPlayer.vx = 0; this.sewerPlayer.facing = MEME_CHEST.x >= this.sewerPlayer.x ? 1 : -1; }
    this.playMenuSfx?.("click");
    if (!this.progress) this.progress = this.createDefaultProgress();
    this.progress.flags = { ...(this.progress.flags || {}), level4MemeChestOpened: true };
    this.saveProgress();
  }

  // The lid lifts for half a second, then the picture comes up.
  updateLevel4MemeChest() {
    const chest = this.memeChest;
    if (chest?.state === "opening" && (this.time || 0) - chest.at >= 0.5) {
      chest.state = "open";
      this.showMeme();
    }
  }

  // Closed, with a glint on the lock now and then; lifting; open.
  drawLevel4MemeChest(side) {
    const sheet = this.memeChestSheet;
    if (!sheet) return;
    const chest = this.memeChest || { state: "closed", at: 0 };
    const time = this.time || 0;
    const frame = chest.state === "open" ? 3
      : chest.state === "opening" ? (time - chest.at < 0.22 ? 2 : 3)
      : time % 1.6 < 0.2 ? 1 : 0;
    // Its front turned to Dr. Beauty, whichever side he is on.
    const facing = (this.sewerPlayer?.x ?? MEME_CHEST.x + 1) >= MEME_CHEST.x ? 1 : -1;
    drawBundleFrame(this.ctx, sheet, { frameWidth: 256, frameHeight: 256, cols: 2 }, frame, MEME_CHEST.x, side.floorY ?? 650,
      MEME_CHEST.size, MEME_CHEST.size, { x: 0.5, y: 0.985 }, { facing });
  }

  showMeme() {
    if (this.memeView) return;
    const root = document.createElement("div");
    root.className = "moth-meme";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    const phone = this.usesTouchControls();
    root.innerHTML = \`<section><h2>\${this.tr("BONITA'S CHEST", "BONITA 的寶箱")}</h2><img alt="" src="\${MEME_CHEST.picture}">\`
      + (phone ? \`<p>\${this.tr("Or press and hold the picture to save it.", "也可以長按圖片儲存。")}</p>\` : "")
      + \`<div class="moth-meme-actions"><button type="button" data-meme-save>\${this.tr("SAVE", "儲存")}</button><button type="button" data-meme-close>\${this.tr("CLOSE", "關閉")}</button></div></section>\`;
    // Its taps are its own, as the scoreboard's are.
    for (const type of ["pointerdown", "pointerup", "touchstart", "touchend", "click"]) root.addEventListener(type, event => event.stopPropagation());
    root.querySelector("[data-meme-save]").addEventListener("click", () => this.saveMeme());
    root.querySelector("[data-meme-close]").addEventListener("click", () => this.closeMeme());
    document.body.append(root);
    const view = this.memeView = { root, file: null };
    // Read ahead of the tap: iPhone shares only from inside the tap itself.
    fetch(MEME_CHEST.picture).then(response => response.blob())
      .then(blob => { view.file = new File([blob], "dr-beauty-meme.png", { type: blob.type || "image/png" }); }).catch(() => {});
    root.querySelector("[data-meme-save]").focus({ preventScroll: true });
    this.releaseHeldInputs?.();
    this.updateMobileControls(true);
  }

  // A phone's share sheet (儲存影像 keeps it in Photos); otherwise a download.
  saveMeme() {
    const view = this.memeView;
    if (!view) return;
    this.playMenuSfx?.("click");
    const file = view.file;
    if (file && this.usesTouchControls() && navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file], title: "MASTER OF THE HOUSE" }).catch(() => {});
      return;
    }
    const url = file ? URL.createObjectURL(file) : MEME_CHEST.picture;
    const link = document.createElement("a");
    link.href = url;
    link.download = "dr-beauty-meme.png";
    document.body.append(link);
    link.click();
    link.remove();
    if (file) setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  closeMeme() {
    if (!this.memeView) return;
    this.playMenuSfx?.("click");
    this.memeView.root.remove();
    this.memeView = null;
    this.updateMobileControls(true);
  }

  handleMemeKey(event) {
    const code = event.code;
    if (["Enter", "NumpadEnter", "Space", "KeyO"].includes(code)) {
      if (!event.repeat) this.saveMeme();
    } else if (["Escape", "KeyH"].includes(code)) {
      this.closeMeme();
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
