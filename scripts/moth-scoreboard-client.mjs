// M.O.T.H final scoreboard, client side. Applied to the release's game.js by
// moth-runtime-patches.mjs (both public and staff builds).
//
// STORY MODE now asks for the difficulty first (the DIFFICULTY menu item is
// gone): a story run keeps one difficulty. Each cleared story fight records
// the score of the attempt that cleared it. After the level 7 wake-up scene,
// before the credits, the scoreboard shows the run's total and both
// difficulties' top 10 (scrollable); a total that enters the top 10 can be
// posted with an ID of up to 8 characters. The run can be shared as a card
// image or a copied link. The main menu's SCOREBOARD entry shows the boards.
// The API is services/moth-scoreboard/moth-scoreboard.js on beauty-boy. A run
// is posted with the ticket the server issued when the story started (asked
// for again until the first fight is cleared), which the server accepts only
// once the songs could have been played.

export const SCOREBOARD_API = 'https://beauty-boy.vercel.app/api/moth-scoreboard';
export const STORY_FIGHTS = ['level1-stage1', 'level2-stage2', 'level3-stage2', 'level4-stage1', 'studio-stage1', 'level5-stage2', 'level6-stage2'];

export function patchScoreboard(once) {
  // Menu: no DIFFICULTY item; SCOREBOARD after LYRICS.
  once('  { id: "credits", label: "GAME CREDITS" },\n  { id: "difficulty", label: "DIFFICULTY" }\n];', '  { id: "credits", label: "GAME CREDITS" }\n];');
  once('  { id: "lyrics", label: "LYRICS" },\n  { id: "settings", label: "SETTINGS" },', '  { id: "lyrics", label: "LYRICS" },\n  { id: "scoreboard", label: "SCOREBOARD" },\n  { id: "settings", label: "SETTINGS" },');
  once('      lyrics: this.tr("LYRICS", "歌詞"),', '      lyrics: this.tr("LYRICS", "歌詞"),\n      scoreboard: this.tr("SCOREBOARD", "排行榜"),');
  // STORY MODE picks its difficulty on the stage-select card first.
  // The deck's O and SPACE buttons confirm through here rather than the key
  // handler, so an open card starts the story instead of opening again.
  once('      if (item.id === "newGame") {\n        this.startNewStory();\n      } else if', '      if (item.id === "newGame") {\n        if (this.homeMenu.difficultyPick?.story) await this.startStageWithPickedDifficulty();\n        else this.homeMenu.difficultyPick = { story: true, title: this.tr("STORY MODE", "故事模式"), choice: this.difficultyId === "shoot" ? 1 : 0 };\n      } else if (item.id === "scoreboard") {\n        this.openScoreboard();\n      } else if');
  once('    const pick = this.homeMenu?.difficultyPick;\n    if (!pick) return;\n    const chosen', '    const pick = this.homeMenu?.difficultyPick;\n    if (!pick) return;\n    if (pick.story) {\n      this.homeMenu.difficultyPick = null;\n      this.startStoryRun(pick.choice === 1 ? "shoot" : "chill");\n      return;\n    }\n    const chosen');
  // CONTINUE plays on at the run's own difficulty (and still asks for a
  // missing ticket before the first fight).
  once('  continueStory() {\n    const stageId = this.getContinueStageId();\n    if (!stageId) return false;', '  continueStory() {\n    const stageId = this.getContinueStageId();\n    if (!stageId) return false;\n    const runMode = this.progress?.storyRun?.difficulty;\n    if (runMode && runMode !== this.difficultyId) this.setDifficulty(runMode, { persist: false, announce: false });\n    if (this.progress?.storyRun) this.registerStoryRun(this.progress.storyRun);');
  // Story progress keeps the run (normalizeProgress rebuilds a fixed list).
  once('      storyCheckpoint: validStages.has(progress.storyCheckpoint) ? progress.storyCheckpoint : null,', '      storyCheckpoint: validStages.has(progress.storyCheckpoint) ? progress.storyCheckpoint : null,\n      storyRun: progress.storyRun && typeof progress.storyRun === "object" && typeof progress.storyRun.id === "string" && progress.storyRun.scores && typeof progress.storyRun.scores === "object" ? progress.storyRun : null,');
  // Each cleared story fight records its score.
  once('  completeStage(stageId) {\n    if (this.freePlay) return;', '  completeStage(stageId) {\n    if (this.freePlay) return;\n    this.recordStoryFightScore(stageId);');
  // The board comes before the credits, once per run.
  once('  startFinaleEnding() {\n', '  startFinaleEnding() {\n    if (this.maybeShowFinalScoreboard()) return;\n');
  // While it is open, keys go to the board.
  once('    window.addEventListener("keydown", (event) => {\n      if (this.loadError) {', '    window.addEventListener("keydown", (event) => {\n      if (this.scoreboard) { this.handleScoreboardKey(event); return; }\n      if (this.loadError) {');
}

export const SCOREBOARD_METHODS = String.raw`
  // ---- Final scoreboard (scripts/moth-scoreboard-client.mjs) ----
  startStoryRun(difficulty) {
    this.setDifficulty(difficulty, { announce: false });
    this.storyDifficultyId = null;
    if (!this.progress) this.progress = this.createDefaultProgress();
    const random = () => Math.random().toString(36).slice(2, 10);
    const id = globalThis.crypto?.randomUUID?.() || ('run-' + Date.now().toString(36) + '-' + random() + random());
    const run = this.progress.storyRun = { id, difficulty, scores: {}, startedAt: Date.now(), ticket: null };
    this.startNewStory();
    this.registerStoryRun(run);
  }

  // The server's ticket for this run. Without a connection it is asked for
  // again (5 s, 10 s, ... 2 min apart) until the first fight is cleared; a run
  // that never gets one cannot be posted.
  async registerStoryRun(run, attempt = 0) {
    clearTimeout(this.storyTicketTimer);
    if (!run || run.ticket || run.legacy || this.progress?.storyRun !== run || Object.keys(run.scores || {}).length) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(this.scoreboardApi(), { method: 'POST', cache: 'no-store', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start', mode: run.difficulty === 'shoot' ? 'shoot' : 'chill' }) });
      const data = await response.json().catch(() => ({}));
      if (response.status !== 201 || typeof data.run !== 'string') throw new Error(String(response.status));
      if (this.progress?.storyRun !== run || run.ticket) return;
      run.ticket = data.run;
      this.saveProgress();
    } catch {
      if (this.progress?.storyRun === run) this.storyTicketTimer = setTimeout(() => this.registerStoryRun(run, attempt + 1), Math.min(120, 5 * 2 ** attempt) * 1000);
    } finally {
      clearTimeout(timer);
    }
  }

  recordStoryFightScore(stageId) {
    const run = this.progress?.storyRun;
    const rhythm = this.level1OfficeRhythm;
    if (this.freePlay || !run || !rhythm || !${JSON.stringify(STORY_FIGHTS)}.includes(stageId)) return;
    if (this.difficultyId !== run.difficulty) run.mixed = true;
    run.scores[stageId] = Math.max(0, Math.round(rhythm.roundScore || 0));
  }

  storyRunResult(run = this.progress?.storyRun) {
    if (!run) return null;
    const fights = ${JSON.stringify(STORY_FIGHTS)};
    const total = fights.reduce((sum, id) => sum + (run.scores?.[id] || 0), 0);
    const blocked = run.legacy ? 'legacy' : run.mixed ? 'mixed' : !run.ticket ? 'offline' : null;
    const complete = !blocked && fights.every(id => Number.isFinite(run.scores?.[id]));
    return { run, total, complete, blocked, mode: run.difficulty === 'shoot' ? 'shoot' : 'chill' };
  }

  maybeShowFinalScoreboard() {
    if (this.freePlay || this.scoreboard) return false;
    if (!this.progress) this.progress = this.createDefaultProgress();
    let run = this.progress.storyRun;
    // A story begun before the scoreboard existed still sees it once.
    if (!run) run = this.progress.storyRun = { id: 'legacy-' + Date.now().toString(36), legacy: true, difficulty: this.difficultyId, scores: {} };
    if (run.boardShown) return false;
    run.boardShown = true;
    run.finishedAt = Date.now();
    this.saveProgress();
    this.openScoreboard({ final: true, onClose: () => this.startFinaleEnding() });
    return true;
  }

  scoreboardModeLabel(mode) {
    const spec = RHYTHM_DIFFICULTIES[mode] || RHYTHM_DIFFICULTIES.chill;
    return this.tr(spec.en, spec.zh);
  }

  openScoreboard({ final = false, onClose = null } = {}) {
    this.closeScoreboard({ silent: true });
    const run = this.progress?.storyRun;
    const result = final || run?.boardShown ? this.storyRunResult(run) : null;
    const board = { final, onClose, result, mode: result?.mode || (this.difficultyId === 'shoot' ? 'shoot' : 'chill'),
      entries: {}, status: { chill: 'loading', shoot: 'loading' }, draftId: result?.run.posted?.id || '', message: '', posting: false };
    this.scoreboard = board;
    this.releaseHeldInputs?.();
    const root = document.createElement('div');
    root.className = 'moth-board';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'moth-board-title');
    for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'wheel']) root.addEventListener(type, event => event.stopPropagation(), { passive: true });
    document.body.append(root);
    board.root = root;
    this.renderScoreboard();
    root.querySelector('[data-board-close]')?.focus({ preventScroll: true });
    for (const mode of ['chill', 'shoot']) this.fetchScoreboard(mode);
    this.prepareScoreCard();
  }

  closeScoreboard({ silent = false } = {}) {
    const board = this.scoreboard;
    if (!board) return;
    board.root?.remove();
    this.scoreboard = null;
    if (!silent) board.onClose?.();
    this.updateMobileControls?.(true);
  }

  async fetchScoreboard(mode) {
    const board = this.scoreboard;
    if (!board) return;
    board.status[mode] = 'loading';
    this.renderScoreboard();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(this.scoreboardApi() + '?mode=' + mode, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json();
      if (this.scoreboard !== board) return;
      board.entries[mode] = Array.isArray(data.entries) ? data.entries : [];
      board.status[mode] = 'ready';
    } catch {
      if (this.scoreboard === board) board.status[mode] = 'error';
    } finally {
      clearTimeout(timer);
    }
    if (this.scoreboard === board) this.renderScoreboard();
  }

  scoreboardApi() {
    return '${SCOREBOARD_API}';
  }

  // Where the run stands against the loaded board.
  scoreboardStanding(board = this.scoreboard) {
    const result = board?.result;
    if (!result) return null;
    if (!result.complete) return { kind: 'ineligible', why: result.blocked };
    if (result.run.posted) return { kind: 'posted', rank: result.run.posted.rank };
    if (board.status[result.mode] !== 'ready') return { kind: board.status[result.mode] };
    const entries = board.entries[result.mode] || [];
    if (entries.length < 10 || result.total > entries[entries.length - 1].total) return { kind: 'qualifies' };
    return { kind: 'short', gap: entries[entries.length - 1].total - result.total + 200 };
  }

  renderScoreboard() {
    const board = this.scoreboard;
    if (!board?.root) return;
    const active = document.activeElement;
    const focusKey = board.root.contains(active) ? active.dataset.focusKey : null;
    const caret = active?.tagName === 'INPUT' ? [active.selectionStart, active.selectionEnd] : null;
    const el = (tag, attrs = {}, ...children) => {
      const node = document.createElement(tag);
      for (const [key, value] of Object.entries(attrs)) {
        if (value === false || value == null) continue;
        if (key === 'text') node.textContent = value;
        else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value === true ? '' : value);
      }
      node.append(...children.filter(Boolean));
      return node;
    };
    const tr = (en, zh) => this.tr(en, zh);
    const number = value => Number(value || 0).toLocaleString('en-US');
    const result = board.result;
    const standing = this.scoreboardStanding(board);
    const section = el('section');
    section.append(
      el('small', { text: 'M.O.T.H · DR. BEAUTY' }),
      el('h2', { id: 'moth-board-title', text: board.final ? tr('FINAL SCORE', '最終成績') : tr('SCOREBOARD', '排行榜') })
    );
    if (result) {
      const status = {
        ineligible: standing?.why === 'offline'
          ? tr('This story run cannot enter the scoreboard: it could not reach the scoreboard when it began. Start a new story online to compete.', '這次的故事無法登上排行榜：開始時沒有連上排行榜。連上網路後從故事模式重新開始，即可挑戰排名。')
          : tr('This story run cannot enter the scoreboard (it began before the scoreboard opened). Start a new story to compete.', '這次的故事無法登上排行榜（在排行榜開放前就開始了）。從故事模式重新開始即可挑戰排名。'),
        posted: result.run.posted?.rank ? tr('You are #' + result.run.posted.rank + ' on the ' + this.scoreboardModeLabel(result.mode) + ' board!', '你在' + this.scoreboardModeLabel(result.mode) + '排行榜第 ' + result.run.posted.rank + ' 名！') : tr('This run is already on the scoreboard.', '這次的成績已經登上排行榜。'),
        qualifies: tr('Top 10! Enter an ID to join the scoreboard.', '進入前十名！輸入 ID 登上排行榜。'),
        short: standing?.kind === 'short' ? tr(number(standing.gap) + ' more points would have reached the top 10.', '還差 ' + number(standing.gap) + ' 分就能擠進前十名，再接再厲！') : '',
        loading: tr('Loading the scoreboard…', '正在讀取排行榜…'),
        error: tr('The scoreboard cannot be reached right now.', '排行榜暫時無法連線。')
      }[standing?.kind] || '';
      section.append(el('div', { class: 'moth-board-run' },
        el('span', { text: this.scoreboardModeLabel(result.mode) + ' · ' + tr('7 FIGHTS TOTAL', '七場戰鬥總分') }),
        el('strong', { text: number(result.total) }),
        el('p', { text: status })));
    }
    const tabs = el('div', { class: 'moth-board-tabs', role: 'tablist' });
    for (const mode of ['chill', 'shoot']) {
      tabs.append(el('button', { type: 'button', role: 'tab', 'aria-selected': String(board.mode === mode), 'data-focus-key': 'tab-' + mode, text: this.scoreboardModeLabel(mode),
        onclick: () => { board.mode = mode; this.renderScoreboard(); } }));
    }
    section.append(tabs);
    const list = el('ol', { class: 'moth-board-list', tabindex: '0', 'aria-label': tr('Top 10', '前十名'), 'data-focus-key': 'list' });
    const entries = board.entries[board.mode] || [];
    if (board.status[board.mode] === 'loading' && !entries.length) list.append(el('li', { class: 'state', text: tr('Loading…', '讀取中…') }));
    else if (board.status[board.mode] === 'error' && !entries.length) list.append(el('li', { class: 'state' }, tr('Cannot reach the scoreboard.', '無法連線到排行榜。'), ' ', el('button', { type: 'button', class: 'moth-board-retry', 'data-focus-key': 'retry', text: tr('RETRY', '重試'), onclick: () => this.fetchScoreboard(board.mode) })));
    else if (!entries.length) list.append(el('li', { class: 'state', text: tr('No scores yet. Be the first!', '還沒有人上榜，搶下第一名！') }));
    for (const entry of entries) {
      const mine = result?.run.posted && entry.id === result.run.posted.id && entry.total === result.total && board.mode === result.mode;
      const date = new Date(entry.at);
      list.append(el('li', { class: mine ? 'is-mine' : null, 'data-rank': String(entry.rank) },
        el('span', { class: 'rank', text: String(entry.rank).padStart(2, '0') }),
        el('span', { class: 'id', text: entry.id }),
        el('span', { class: 'score', text: number(entry.total) }),
        el('span', { class: 'date', text: Number.isFinite(date.getTime()) ? date.getFullYear() + '/' + String(date.getMonth() + 1).padStart(2, '0') + '/' + String(date.getDate()).padStart(2, '0') : '' })));
    }
    section.append(list);
    if (board.final && standing?.kind === 'qualifies') {
      const input = el('input', { type: 'text', inputmode: 'text', autocomplete: 'nickname', enterkeyhint: 'send', maxlength: '8', 'data-focus-key': 'id',
        'aria-label': tr('Your ID', '你的 ID'), placeholder: tr('Up to 8 characters', '最多 8 個字'), value: board.draftId });
      input.value = board.draftId;
      input.addEventListener('input', () => { board.draftId = input.value; });
      section.append(el('div', { class: 'moth-board-post' },
        el('label', { text: tr('ID · Chinese, English or numbers', 'ID · 中文、英文或數字') }),
        input,
        el('button', { type: 'button', class: 'is-primary', 'data-focus-key': 'post', disabled: board.posting, text: board.posting ? tr('POSTING…', '上傳中…') : tr('JOIN', '登上排行榜'), onclick: () => this.postScore() })));
    }
    section.append(el('p', { class: 'moth-board-message', role: 'status', text: board.message }));
    const actions = el('div', { class: 'moth-board-actions' });
    if (result?.complete) actions.append(el('button', { type: 'button', 'data-focus-key': 'share', text: tr('SHARE CARD', '分享成績卡'), onclick: () => this.shareScoreCard() }));
    actions.append(el('button', { type: 'button', 'data-focus-key': 'copy', text: tr('COPY LINK', '複製連結'), onclick: () => this.copyScoreLink() }));
    section.append(actions);
    section.append(el('button', { type: 'button', class: 'moth-board-close is-primary', 'data-board-close': true, 'data-focus-key': 'close',
      text: board.final ? tr('CONTINUE · CREDITS', '繼續 · 片尾名單') : tr('BACK', '返回'), onclick: () => this.closeScoreboard() }));
    const scroll = board.root.querySelector('.moth-board-list')?.scrollTop || 0;
    board.root.replaceChildren(section);
    board.root.querySelector('.moth-board-list').scrollTop = scroll;
    const restore = focusKey && board.root.querySelector('[data-focus-key="' + focusKey + '"]');
    if (restore) {
      restore.focus({ preventScroll: true });
      if (caret && restore.tagName === 'INPUT') restore.setSelectionRange(...caret);
    }
  }

  handleScoreboardKey(event) {
    const board = this.scoreboard;
    const typing = event.target?.tagName === 'INPUT';
    const code = event.code;
    if (typing) {
      if (code === 'Enter' || code === 'NumpadEnter') { event.preventDefault(); this.postScore(); }
      else if (code === 'Escape') { event.preventDefault(); event.target.blur(); }
      return;
    }
    const list = board.root.querySelector('.moth-board-list');
    if (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'KeyA' || code === 'KeyD') {
      board.mode = code === 'ArrowLeft' || code === 'KeyA' ? 'chill' : 'shoot';
      this.renderScoreboard();
    } else if (code === 'ArrowUp' || code === 'ArrowDown' || code === 'KeyW' || code === 'KeyS') {
      list?.scrollBy({ top: (code === 'ArrowUp' || code === 'KeyW' ? -1 : 1) * 56 });
    } else if (code === 'Escape' || code === 'KeyH') {
      this.closeScoreboard();
    } else if (code === 'Enter' || code === 'Space' || code === 'KeyO') {
      if (event.repeat) return event.preventDefault();
      const focused = board.root.contains(document.activeElement) && document.activeElement.tagName === 'BUTTON' ? document.activeElement : null;
      (focused || board.root.querySelector('.moth-board-post input') || board.root.querySelector('[data-board-close]'))?.[focused ? 'click' : 'focus']?.();
    } else return;
    event.preventDefault();
  }

  scoreboardMessage(error, status) {
    const tr = (en, zh) => this.tr(en, zh);
    if (error === 'id') return tr('IDs are 1–8 characters: Chinese, English letters or numbers.', 'ID 只能用中文、英文或數字，最多 8 個字。');
    if (error === 'id-blocked') return tr('Please choose a different ID.', '這個 ID 不能使用，請換一個。');
    if (error === 'not-top') return tr('So close! Others posted higher scores first.', '差一點！其他玩家剛搶先登上前十。');
    if (error === 'posted') return tr('This run is already on the scoreboard.', '這次的成績已經登上排行榜。');
    if (error === 'too-fast' || error === 'run') return tr('The scoreboard could not verify this story run, so it cannot be posted.', '排行榜無法驗證這次的故事進度，因此無法登上排行榜。');
    if (error === 'rate' || status === 429) return tr('Too many tries. Please wait a few minutes.', '嘗試太多次了，請稍等幾分鐘再試。');
    return tr('The scoreboard cannot be reached right now.', '排行榜暫時無法連線。');
  }

  async postScore() {
    const board = this.scoreboard;
    const result = board?.result;
    if (!board || board.posting || !result?.complete || result.run.posted) return;
    const id = String(board.draftId || '').normalize('NFKC').trim();
    if (!/^[\p{Script=Han}A-Za-z0-9]{1,8}$/u.test(id)) {
      board.message = this.scoreboardMessage('id');
      this.renderScoreboard();
      return;
    }
    board.posting = true;
    board.message = '';
    this.renderScoreboard();
    try {
      const response = await fetch(this.scoreboardApi(), { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: result.mode, id, run: result.run.ticket, scores: result.run.scores }) });
      const data = await response.json().catch(() => ({}));
      if (Array.isArray(data.entries)) { board.entries[result.mode] = data.entries; board.status[result.mode] = 'ready'; }
      if (response.status === 201) {
        result.run.posted = { rank: data.rank, id, at: Date.now() };
        board.mode = result.mode;
        board.message = '';
        this.prepareScoreCard();
      } else {
        if (data.error === 'posted') result.run.posted = { rank: null, id };
        board.message = this.scoreboardMessage(data.error, response.status);
      }
      this.saveProgress();
    } catch {
      board.message = this.scoreboardMessage(null);
    }
    board.posting = false;
    this.renderScoreboard();
  }

  scoreShareText(result = this.scoreboard?.result) {
    const url = 'https://myscheduleltd.com/moth/';
    if (!result?.complete) return this.tr('Play MASTER OF THE HOUSE: ' + url, '來玩《MASTER OF THE HOUSE》：' + url);
    const total = Number(result.total).toLocaleString('en-US');
    const rank = result.run.posted?.rank;
    return this.tr('I scored ' + total + ' on MASTER OF THE HOUSE (' + this.scoreboardModeLabel(result.mode) + ')' + (rank ? ', #' + rank + ' on the scoreboard' : '') + '! Beat it: ' + url,
      '我在《MASTER OF THE HOUSE》' + this.scoreboardModeLabel(result.mode) + '拿到 ' + total + ' 分' + (rank ? '，排行榜第 ' + rank + ' 名' : '') + '！來挑戰：' + url);
  }

  async copyScoreLink() {
    const board = this.scoreboard;
    const text = this.scoreShareText(board?.result);
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch {
      const area = document.createElement('textarea');
      area.value = text; area.setAttribute('readonly', ''); area.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.append(area); area.select();
      try { copied = document.execCommand('copy'); } catch {}
      area.remove();
    }
    if (this.scoreboard !== board) return;
    board.message = copied ? this.tr('Link copied.', '已複製連結。') : text;
    this.renderScoreboard();
  }

  // The card is drawn ahead of the tap, because iPhone only shares from
  // inside the tap itself.
  async prepareScoreCard() {
    const board = this.scoreboard;
    const result = board?.result;
    if (!result?.complete) return;
    // Dr. Beauty's dialogue portrait (orange suit) is loaded with the fights;
    // from the main menu it may not be, so fetch it for the card.
    let portrait = this.refs?.dialogueProfilesSheet;
    const source = this.config?.sprites?.dialogueProfiles?.source;
    if (!portrait?.naturalWidth && source) portrait = await loadImage(source).catch(() => null);
    if (this.scoreboard !== board) return;
    this.drawScoreCard(result, portrait).toBlob(blob => {
      if (this.scoreboard !== board || !blob) return;
      board.cardFile = new File([blob], 'moth-score-' + result.total + '.png', { type: 'image/png' });
    }, 'image/png');
  }

  shareScoreCard() {
    const board = this.scoreboard;
    const file = board?.cardFile;
    if (!file) return;
    const text = this.scoreShareText(board.result);
    if (navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file], text, title: 'MASTER OF THE HOUSE' }).catch(() => {});
      return;
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url; link.download = file.name;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    board.message = this.tr('Score card saved.', '成績卡已下載。');
    this.renderScoreboard();
  }

  drawScoreCard(result, portrait) {
    const W = 1080, H = 1350;
    const card = document.createElement('canvas');
    card.width = W; card.height = H;
    const g = card.getContext('2d');
    const tr = (en, zh) => this.tr(en, zh);
    g.fillStyle = '#141a16'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(239, 227, 196, 0.035)';
    for (let y = 0; y < H; y += 6) g.fillRect(0, y, W, 2);
    // The main menu's board: dark green, a cream rule, a red marker.
    g.fillStyle = '#2b3a2f'; g.fillRect(48, 48, W - 96, H - 96);
    g.strokeStyle = '#d8d2b4'; g.lineWidth = 8; g.strokeRect(60, 60, W - 120, H - 120);
    g.strokeStyle = '#141a16'; g.lineWidth = 4; g.strokeRect(72, 72, W - 144, H - 144);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f7f2de';
    drawFittedText(g, 'MASTER OF THE HOUSE', W / 2, 150, W - 220, 72, 900, 40);
    g.fillStyle = '#8fe8ff';
    drawFittedText(g, 'BEAUTY BOY · DR. BEAUTY', W / 2, 212, W - 260, 30, 900, 18);
    const profiles = this.config?.sprites?.dialogueProfiles;
    if (portrait?.naturalWidth && profiles) {
      const size = 300, x = W / 2 - size / 2, y = 262;
      g.fillStyle = '#1d2720'; g.fillRect(x - 10, y - 10, size + 20, size + 20);
      g.save(); g.beginPath(); g.rect(x, y, size, size); g.clip();
      g.imageSmoothingEnabled = false;
      drawBundleFrame(g, portrait, profiles, bundleFrameIndex(profiles, 'bobby'), W / 2, y, size, size, { x: 0.5, y: 0 });
      g.restore();
      g.strokeStyle = '#d8d2b4'; g.lineWidth = 6; g.strokeRect(x - 10, y - 10, size + 20, size + 20);
    }
    g.fillStyle = '#ffd36c';
    drawFittedText(g, tr('FINAL SCORE', '最終成績') + ' · ' + this.scoreboardModeLabel(result.mode), W / 2, 640, W - 220, 40, 900, 24);
    g.font = '900 150px ' + CANVAS_UI_FONT;
    const fitted = fitCanvasText(g, Number(result.total).toLocaleString('en-US'), W - 200, 150, 900, 80);
    drawOutlinedText(g, fitted.text, W / 2, 760, { fill: '#f7f2de', shadow: '#0b0e0c', outline: '#141a16', accent: '#ce3f49', accentOffset: 6 });
    const rank = result.run.posted?.rank;
    g.fillStyle = rank ? '#ffd36c' : '#b9c7b4';
    drawFittedText(g, rank ? tr('#' + rank + ' ON THE SCOREBOARD', '排行榜第 ' + rank + ' 名') : tr('7 FIGHTS TOTAL', '七場戰鬥總分'), W / 2, 880, W - 220, 44, 900, 24);
    if (result.run.posted?.id) {
      g.fillStyle = '#f7f2de';
      drawFittedText(g, 'ID · ' + result.run.posted.id, W / 2, 944, W - 260, 36, 900, 22);
    }
    // The seven fights, two columns.
    const fights = ${JSON.stringify(STORY_FIGHTS)};
    g.font = '900 28px ' + CANVAS_UI_FONT;
    fights.forEach((id, index) => {
      const col = index < 4 ? 0 : 1, row = index < 4 ? index : index - 4;
      const x = col ? W / 2 + 30 : 130, y = 1010 + row * 50;
      g.textAlign = 'left'; g.fillStyle = '#8fe8ff';
      g.fillText(tr('LEVEL ', '關卡 ') + (index + 1), x, y);
      g.textAlign = 'right'; g.fillStyle = '#f7f2de';
      g.fillText(Number(result.run.scores?.[id] || 0).toLocaleString('en-US'), x + (W / 2 - 160), y);
    });
    g.textAlign = 'center'; g.fillStyle = '#ffd36c';
    drawFittedText(g, 'myscheduleltd.com/moth', W / 2, H - 100, W - 260, 32, 900, 20);
    return card;
  }
`;

export const SCOREBOARD_CSS = `
.moth-board { position: fixed; inset: 0; z-index: 10002; display: grid; place-items: center; box-sizing: border-box;
  padding: max(14px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) max(14px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
  background: #0d110ed9; touch-action: manipulation; color: #f7f2de; font: 700 16px/1.45 "Courier New", "PingFang TC", "Noto Sans TC", monospace; }
.moth-board section { box-sizing: border-box; width: min(540px, 100%); max-height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding: 18px;
  background: repeating-linear-gradient(#2c3b30 0 3px, #28362c 3px 4px); border: 4px solid #d8d2b4; outline: 3px solid #141a16; box-shadow: 8px 8px 0 #0b0e0c; }
.moth-board small { color: #8fe8ff; font-size: 12px; letter-spacing: .08em; }
.moth-board h2 { margin: 0; padding-left: 12px; border-left: 6px solid #ce3f49; font-size: clamp(22px, 5.6vw, 30px); letter-spacing: .06em; }
.moth-board-run { padding: 10px 12px; background: #1d2720; border: 2px solid #5b6f5e; }
.moth-board-run span { color: #ffd36c; font-size: 13px; letter-spacing: .04em; }
.moth-board-run strong { display: block; font-size: clamp(34px, 11vw, 54px); line-height: 1.15; letter-spacing: .03em; text-shadow: 3px 3px 0 #ce3f49, 6px 6px 0 #0b0e0c; }
.moth-board-run p { margin: 6px 0 0; font-size: 14px; }
.moth-board-tabs, .moth-board-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.moth-board button { font: inherit; color: #f7f2de; background: #344439; border: 3px solid #6e836f; border-radius: 0; padding: 9px 8px; min-height: 46px; cursor: pointer; box-shadow: 3px 4px 0 #0b0e0c; }
.moth-board button[aria-selected="true"], .moth-board button.is-primary { background: #ece5c8; color: #2a2f2a; border-color: #ece5c8; box-shadow: inset 7px 0 0 #ce3f49, 3px 4px 0 #0b0e0c; }
.moth-board button:focus-visible, .moth-board input:focus-visible, .moth-board-list:focus-visible { outline: 3px solid #ffd36c; outline-offset: 3px; }
.moth-board button[disabled] { opacity: .55; cursor: default; }
.moth-board-list { list-style: none; margin: 0; padding: 0; min-height: 132px; max-height: min(42vh, 400px); overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
  background: #1d2720; border: 2px solid #5b6f5e; }
.moth-board-list li { display: grid; grid-template-columns: 2.4em minmax(0, 1fr) auto; grid-template-areas: "rank id score" "rank date score"; column-gap: 10px; align-items: center; padding: 8px 12px; border-bottom: 1px solid #33443a; }
.moth-board-list li .rank { grid-area: rank; color: #ffd36c; font-size: 20px; }
.moth-board-list li[data-rank="1"] .rank { color: #ffd36c; text-shadow: 2px 2px 0 #ce3f49; }
.moth-board-list li .id { grid-area: id; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.moth-board-list li .score { grid-area: score; font-size: 18px; font-variant-numeric: tabular-nums; }
.moth-board-list li .date { grid-area: date; color: #8fa192; font-size: 11px; }
.moth-board-list li.is-mine { background: #ece5c8; color: #2a2f2a; box-shadow: inset 6px 0 0 #ce3f49; }
.moth-board-list li.is-mine .rank { color: #ce3f49; text-shadow: none; }
.moth-board-list li.is-mine .date { color: #5d6a5f; }
.moth-board-list li.state { display: block; padding: 18px 12px; color: #b9c7b4; text-align: center; }
.moth-board-list .moth-board-retry { min-height: 36px; padding: 4px 12px; margin-left: 8px; }
.moth-board-post { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.moth-board-post label { grid-column: 1 / -1; color: #ffd36c; font-size: 13px; }
.moth-board input { min-width: 0; font: inherit; font-size: 18px; color: #2a2f2a; background: #f4efd8; border: 3px solid #141a16; border-radius: 0; padding: 8px 10px; }
.moth-board-message { margin: 0; min-height: 1.3em; color: #ffd36c; font-size: 14px; overflow-wrap: anywhere; }
`;
