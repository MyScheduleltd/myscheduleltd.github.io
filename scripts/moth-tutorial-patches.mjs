// Keep the introductory rules in step with the healthless rhythm fights.
// These replace release text before either public or staff builds are emitted.
export const MOTH_OFFICE_TUTORIAL = [
  {
    speaker: 'GANGAN',
    en: "First, a little background: this game was made to accompany Dr. Beauty's album, MASTER OF THE HOUSE.",
    zh: '先說個前情提要：這款遊戲是為美麗本人的音樂專輯《MASTER OF THE HOUSE》而誕生的小品。'
  },
  {
    speaker: 'GANGAN',
    en: "The songs say it all. So let's get straight to how to play.",
    zh: '想說的都在歌曲裡。所以接下來廢話少說，直接看遊戲操作說明。'
  },
  {
    speaker: 'GANGAN',
    en: 'Watch the timing track below. Press the matching button as a note reaches the white hit line. The ring helps you follow the drum timing.',
    zh: '看下方的節奏軌道。音符到達白色判定線時，跟著鼓點按下對應按鍵；圓環會提示時機。'
  },
  {
    speaker: 'GANGAN',
    en: 'All four buttons follow the drums: M for hi-hat, O for snare, T for kick, and H for other percussion. Hold notes with tails until the tail ends.',
    zh: '四個按鍵都跟著鼓點：M 是踩鈸、O 是小鼓、T 是大鼓、H 是其他打擊樂。有尾巴的音符，要按住到尾巴結束。'
  },
  {
    speaker: 'GANGAN',
    en: "First, hit four practice notes, one for each button. Then we'll start the real shift.",
    zh: '先跟準四個練習音符，每個按鍵各一個，接著就開始正式輪班。'
  },
  {
    speaker: 'GANGAN',
    en: 'Missing a note, pressing the wrong button near a note, or releasing a hold early counts as a miss and breaks your combo. Extra taps away from notes are safe.',
    zh: '漏掉音符、在音符附近按錯鍵，或提早放開長按音符，都算失誤，並會中斷連擊。音符之間沒有判定時，多按不會受罰。'
  },
  {
    speaker: 'GANGAN',
    en: 'Your number of misses affects your final rating. Follow the drums and aim for a higher score!',
    zh: '失誤次數會影響最終評級。跟上鼓點，挑戰更高分！'
  },
  {
    speaker: 'GANGAN',
    en: 'In story mode, finish each fight to continue to the next level. Complete the story to unlock two hidden songs.',
    zh: '故事模式中，完成每場戰鬥就能繼續前往下一關。完成故事後，會解鎖兩首隱藏歌曲。'
  }
];

export const MOTH_OFFICE_READY = [{
  speaker: 'GANGAN',
  en: 'Good. The real shift starts now. Follow the drums through to the end of the song!',
  zh: '很好，正式輪班現在開始。跟著鼓點，一路玩到歌曲結束！',
  portraitFrame: 5
}];

export function patchTutorial(once, edit) {
  edit('const LEVEL1_OFFICE_TUTORIAL_DIALOGUE = [\n', '\n];\n', () =>
    'const LEVEL1_OFFICE_TUTORIAL_DIALOGUE = ' + JSON.stringify(MOTH_OFFICE_TUTORIAL, null, 2) + ';\n');
  edit('const LEVEL1_OFFICE_TUTORIAL_COMPLETE_DIALOGUE = [{\n', '\n}];\n', () =>
    'const LEVEL1_OFFICE_TUTORIAL_COMPLETE_DIALOGUE = ' + JSON.stringify(MOTH_OFFICE_READY, null, 2) + ';\n');
  once('this.tr("Your progress and hearts are saved here.", "目前進度與生命已保留。")',
    'this.tr("Your progress, combo and score are saved here.", "目前進度、連擊與分數已保留。")');
  once('"NO HEART LIMIT HERE - MISSES ONLY COST THE RANK"', '"MISS = 0 · S = ALL PERFECT"');
  once('"此處不限血量 — 失誤只會扣評級"', '"失誤得 0 分；全數完美才能獲得 S"');
}
