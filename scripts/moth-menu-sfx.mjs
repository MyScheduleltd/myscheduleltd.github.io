// Menu sounds (owner, 2026-10-14). The tick when a menu's selection moves
// (up, down, left or right) and on the playlist player's buttons; the click
// when something is confirmed or backed out of, and when a dialogue moves on.
// The files are in moth-asset-additions/ (made by scripts/make-menu-sfx.py,
// as loud as the M/O/T/H button sounds) and play the way those do, through
// the game's sound engine at the same level.
//
// The game reads input three ways (keys, the deck, taps on the screen), and
// each way handles every menu itself. Rather than hook every handler, each
// input is compared with the state it left behind: a new screen or dialogue
// line clicks, a press on the music player ticks, and a selection that moved
// ticks for an arrow and clicks for a confirm or a back. Walking and fight
// inputs change none of these, so they stay silent. The scoreboard, which
// keeps its input to itself, plays its own while open
// (moth-scoreboard-client.mjs).

export const MENU_SFX = {
  'menu-tick': 'assets/sfx/menu/menu-tick.wav',
  'menu-click': 'assets/sfx/menu/menu-click.wav'
};

export function patchMenuSfx(once) {
  once('const HIT_SFX_GAIN = 0.95;', `const HIT_SFX_GAIN = 0.95;
const MENU_SFX = ${JSON.stringify(MENU_SFX)};
// What an input asks for: arrows and the d-pad move a selection, O / Enter /
// SPACE confirm, H / Esc go back.
const menuKeyKind = code => /^(Arrow|Key[WASD]$)/.test(code) ? "move"
  : ["Enter", "NumpadEnter", "Space", "KeyO"].includes(code) ? "confirm"
  : ["Escape", "KeyH", "KeyB"].includes(code) ? "back" : "other";
const menuActionKind = action => /^(nav|direction)-/.test(action || "") ? "move"
  : ["advance", "jump", "primary"].includes(action) ? "confirm"
  : ["back", "secondary"].includes(action) ? "back" : "other";

// A 16-bit PCM WAV as a sound buffer, read here rather than by the
// asynchronous decoder, so the sound is ready before the first tap. Anything
// else is left to the decoder (null).
function pcmWavBuffer(bytes) {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0) !== 0x52494646 || view.getUint32(8) !== 0x57415645) return null;
    let format = null;
    for (let at = 12; at + 8 <= view.byteLength;) {
      const id = view.getUint32(at), size = view.getUint32(at + 4, true), body = at + 8;
      if (id === 0x666d7420) {
        format = { type: view.getUint16(body, true), channels: view.getUint16(body + 2, true), rate: view.getUint32(body + 4, true), bits: view.getUint16(body + 14, true) };
      } else if (id === 0x64617461) {
        if (format?.type !== 1 || format.bits !== 16 || !format.channels) return null;
        const frames = Math.floor(Math.min(size, view.byteLength - body) / 2 / format.channels);
        const buffer = new AudioBuffer({ length: frames, numberOfChannels: format.channels, sampleRate: format.rate });
        for (let channel = 0; channel < format.channels; channel++) {
          const samples = buffer.getChannelData(channel);
          for (let i = 0; i < frames; i++) samples[i] = view.getInt16(body + (i * format.channels + channel) * 2, true) / 32768;
        }
        return buffer;
      }
      at = body + size + (size & 1);
    }
  } catch {}
  return null;
}`);
  // 設定 > 音效測試 counts the fights' sounds (the menu's are kept with them).
  once('    const loaded = Object.keys(this.sfxBuffers || {}).length;', '    const loaded = Object.keys(HIT_SFX).filter(name => this.sfxBuffers?.[name]).length;');
  // Fetched from the start, for the title's first tap.
  once('    this.bindInput();\n', '    this.bindInput();\n    this.loadMenuSfx();\n');
  // Listening starts once the game's own listeners are in place, so it hears
  // each input after the game has handled it.
  once('    this.bootDone = true;\n    requestAnimationFrame(this.loop);', '    this.bootDone = true;\n    this.listenForMenuSounds();\n    requestAnimationFrame(this.loop);');
  // The deck's buttons keep their events to themselves; every press comes
  // through here.
  once('  handleMobileControlDown(action, inputTimeStamp) {\n', `  handleMobileControlDown(action, inputTimeStamp) {
    const before = this.menuSoundState();
    this.handleDeckPress(action, inputTimeStamp);
    this.playMenuSoundFor(before, menuActionKind(action));
  }

  handleDeckPress(action, inputTimeStamp) {
`);
}

export const MENU_SFX_METHODS = `
  // Fetched like every sound (the verified jsDelivr copy, else this site) and
  // kept with the fights' sounds, so an engine rebuild decodes them again too.
  // One that fails is fetched again the next time it is wanted.
  loadMenuSfx() {
    this.sfxRaw ||= {};
    this.sfxBuffers ||= {};
    this.menuSfxLoading ||= {};
    for (const [name, src] of Object.entries(MENU_SFX)) {
      if (this.sfxBuffers[name] || this.menuSfxLoading[name]) continue;
      this.menuSfxLoading[name] = fetchGameAsset(src).then(({ data }) => {
        this.sfxRaw[name] = data.buffer;
        const buffer = pcmWavBuffer(data);
        if (buffer) this.sfxBuffers[name] = buffer;
        else if (this.level1OfficeAudioContext) return this.decodeHitSfx(name, this.level1OfficeAudioContext);
      }).catch(() => {}).finally(() => { delete this.menuSfxLoading[name]; });
    }
  }

  playMenuSfx(kind) {
    const name = kind === "tick" ? "menu-tick" : "menu-click";
    if (!this.sfxBuffers?.[name]) {
      this.loadMenuSfx();
      return false;
    }
    return this.playFeedbackSfx(name, "menu", 1.4);
  }

  // What an input can change that has a sound.
  menuSoundState() {
    const menu = this.homeMenu, rhythm = this.level1OfficeRhythm, preview = this.songPreview;
    const tutorial = rhythm?.tutorial;
    return {
      board: Boolean(this.scoreboard),
      screen: [this.state, menu?.view, Boolean(menu?.difficultyPick), Boolean(this.pocketOpen), Boolean(this.pocketHomeConfirm),
        Boolean(this.chest?.menuOpen), Boolean(this.walkPause), Boolean(this.scoreboard), this.levelLoadingPresentation?.stageId,
        Boolean(this.fullscreenGuide && !this.fullscreenGuide.hidden)].join(),
      // The line on screen, while a dialogue is: every scene keeps its place in
      // a ...DialogueIndex, the office tutorial in its own.
      dialogue: this.getControlMode() !== "dialogue" ? ""
        : Object.keys(this).filter(key => /DialogueIndex$/.test(key)).map(key => key + this[key]).join()
          + [tutorial?.mode, tutorial?.dialogueIndex, tutorial?.readyDialogueIndex].join(),
      player: [menu?.playerSongId, preview?.id, Boolean(preview?.paused)].join(),
      inPlayer: this.state === "title" && menu?.view === "playlistPlayer",
      selection: [menu?.index, menu?.difficultyPick?.choice, this.walkPause?.choice, rhythm?.failureChoice,
        this.level1OfficePauseChoice, this.level1ResultsChoice, this.level1UnlockChoice, this.pocketSelectedIndex,
        this.chest?.selectedIndex, this.difficultyId, this.language, this.deviceMode,
        menu?.view === "calibrate" ? this.getAudioOffsetSeconds() : ""].join()
    };
  }

  playMenuSoundFor(before, kind) {
    if (!before || before.board) return;
    const after = this.menuSoundState();
    if (before.screen !== after.screen || (before.dialogue && before.dialogue !== after.dialogue)) this.playMenuSfx("click");
    // The player's buttons: a song can start a moment after the press.
    else if (before.player !== after.player || (before.inPlayer && (kind === "move" || kind === "confirm"))) this.playMenuSfx("tick");
    else if (before.selection !== after.selection) this.playMenuSfx(kind === "confirm" || kind === "back" ? "click" : "tick");
  }

  // Keys and taps on the screen: the state is noted before the game sees the
  // input and compared once it has.
  listenForMenuSounds() {
    let before = null;
    for (const type of ["keydown", "pointerdown", "pointerup"]) {
      window.addEventListener(type, () => { before = this.menuSoundState(); }, { capture: true });
      window.addEventListener(type, (event) => {
        const state = before;
        before = null;
        if (this.isDebugPanelElement(event.target)) return;
        this.playMenuSoundFor(state, type === "keydown" ? menuKeyKind(event.code) : "tap");
      });
    }
  }
`;
