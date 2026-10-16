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
