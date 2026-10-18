/** Tips describe the actual controls and places available in the festival. */
export function entryTips(language: string, mobile: boolean): string[] {
  return language === 'zh-TW' ? [
    mobile ? '拖曳左下角搖桿移動，使用右側的「跑」與「跳」探索世界。' : '使用 WASD 或方向鍵移動，按住 Shift 奔跑，按空白鍵跳躍。',
    mobile ? '靠近物件時，點選互動提示；點「通行證」可開啟地圖。' : '靠近物件時，按 E 互動；按 Enter 開啟聊天。',
    '到 SLAP AND POP 的酒吧點一杯飲料，和朋友一起坐下休息。',
    '在影展的爆米花攤取得爆米花，帶著它去看電影。',
    '到美麗仙人廟參拜、供養，或看看大家留下的祈福留言。',
    '打開通行證裡的地圖，選擇地點即可快速前往。',
    '有相容的 VR 裝置嗎？試試 VR 模式，親身走進影展世界。',
  ] : [
    mobile ? 'Drag the lower-left stick to move. Use RUN and JUMP on the right to explore.' : 'Move with WASD or the arrow keys. Hold Shift to run and press Space to jump.',
    mobile ? 'Approach an object and tap its interaction prompt. Open your pass to find the map.' : 'Approach an object and press E to interact. Press Enter to chat.',
    'Order a drink at the SLAP AND POP bar and take a seat with friends.',
    'Pick up popcorn at a festival popcorn stand and bring it to a screening.',
    'Visit the Beautiful Immortal temple to worship, make an offering, or read the wish wall.',
    'Open the map in your pass and choose a destination to travel there.',
    'Have a compatible VR device? Try VR mode to step inside the festival.',
  ];
}

/** A shuffled round, with a different tip in each position from the previous round. */
function shuffledOrder(count: number, previous: number[], random: () => number, last?: number): number[] {
  const order = Array.from({ length: count }, (_, index) => index);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (count < 2) return order;
  const validPrevious = previous.length === count && new Set(previous).size === count
    && previous.every(value => Number.isInteger(value) && value >= 0 && value < count);
  if (validPrevious) {
    const fixed = order.map((value, index) => value === previous[index] ? index : -1).filter(index => index >= 0);
    if (fixed.length > 1) {
      const values = fixed.map(index => order[index]);
      fixed.forEach((index, offset) => { order[index] = values[(offset + 1) % values.length]; });
    } else if (fixed.length === 1) {
      const i = fixed[0], j = (i + 1 + Math.floor(random() * (count - 1))) % count;
      [order[i], order[j]] = [order[j], order[i]];
    }
  }
  // Do not immediately repeat the last tip when a complete round ends.
  if (order[0] === last) {
    const j = order.findIndex((value, index) => index > 0 && (!validPrevious
      || (value !== previous[0] && order[0] !== previous[index])));
    if (j > 0) [order[0], order[j]] = [order[j], order[0]];
    else if (validPrevious && count > 2) {
      const offset = previous.findIndex((value, index) => index > 0 && value !== last);
      return [...previous.slice(offset), ...previous.slice(0, offset)];
    } else [order[0], order[1]] = [order[1], order[0]];
  }
  return order;
}

type TipHistory = Pick<Storage, 'getItem' | 'setItem'>;

/** Locale-independent indices keep the same round through language/device changes. */
export class TipRotation {
  private order: number[];
  private cursor = 0;
  constructor(private readonly count: number, private readonly key: string,
    private readonly history?: TipHistory, private readonly random: () => number = Math.random) {
    let previous: number[] = [];
    try {
      const saved: unknown = JSON.parse(history?.getItem(key) ?? 'null');
      if (Array.isArray(saved)) previous = saved;
    } catch { /* Missing, stale or unavailable browser preferences. */ }
    this.order = shuffledOrder(count, previous, random);
    this.remember();
  }
  get current(): number { return this.order[this.cursor] ?? 0; }
  next(): void {
    const last = this.current;
    if (++this.cursor >= this.order.length) {
      this.order = shuffledOrder(this.count, this.order, this.random, last);
      this.cursor = 0;
      // Keep this visit's opening round in history, even on a long loading screen.
    }
  }
  private remember(): void {
    try { this.history?.setItem(this.key, JSON.stringify(this.order)); } catch { /* Storage may be disabled. */ }
  }
}

export function createTipRotation(stage: 'sign-in' | 'loading', count: number): TipRotation {
  let history: TipHistory | undefined;
  try { history = window.localStorage; } catch { /* Private browsing still gets shuffled tips. */ }
  return new TipRotation(count, `myschedule:tips:${stage}:v1`, history);
}
