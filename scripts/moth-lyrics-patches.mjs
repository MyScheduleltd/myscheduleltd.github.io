// Lyrics changes on top of the release's HOME_SONG_LYRICS (the 歌詞 page of the
// home playlist). Each entry swaps one song's lines, and fails the build if the
// release's lines are not exactly what they were when the owner asked.
//
// 笑死 (owner, 2026-10-14): the new lyrics, as given. The blank line is the
// page's gap between verses, like the other songs.

const RELEASE = {
  'home-xiaosi': ['欸等一下', '還沒準備好啦', '先不要放音樂 拜託', '先不要喔', '欸', 'Intro', '嘿嘿', '嘿嘿嘿嘿', '嘿嘿', '哼哼哼哼',
    '幹我在笑三小 等一下', '不是', '哈！哈！', '啊哈哈哈哈哈哈', '（擦玻璃）', '哈哈哈哈哈哈哈哈', '啊咳咳咳咳', '嘔嘔嘔嘔', '哈哈哈哈哈哈哈',
    '（鴨子叫）', '（倒抽倒抽）', '啊哈～', '哈哈哈哈哈哈', '喔～流口水叻', '', '欸等一下', '還沒準備好啦', '先不要放音樂 拜託', '先不要喔',
    '欸', '', '喔流口水']
};

export const LYRICS = {
  'home-xiaosi': ['欸等一下', '還沒準備好啦', '先不要放音樂 拜託', '先不要喔', '欸', '', '喔流口水']
};

const entry = (id, lines) => `  ${JSON.stringify(id)}: [\n${lines.map(line => `    ${JSON.stringify(line)}`).join(',\n')}\n  ],\n`;

export function patchLyrics(once) {
  for (const [id, lines] of Object.entries(LYRICS)) once(entry(id, RELEASE[id]), entry(id, lines));
}
