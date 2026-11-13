// Keep the introductory rules in step with the healthless rhythm fights.
// These replace release text before either public or staff builds are emitted.
export const MOTH_OFFICE_TUTORIAL = [
  {
    speaker: 'GANGAN',
    en: "We made this little game for Dr. Beauty's album, MASTER OF THE HOUSE.",
    zh: '這款遊戲是為美麗本人的音樂專輯《MASTER OF THE HOUSE》而誕生的小品。'
  },
  {
    speaker: 'GANGAN',
    en: "Let's get straight to the controls!",
    zh: '我們直接來看遊戲操作說明!!'
  },
  {
    speaker: 'GANGAN',
    en: 'Follow the drums. Tap the matching button when the ring closes at the white hit line.',
    zh: '音符到達白色判定線時，白色圓環會提示時機，請跟著鼓點按下對應按鍵。',
    rhythmDemo: 'tap'
  },
  {
    speaker: 'GANGAN',
    en: 'For a hold note, keep the button pressed until the tail ends.',
    zh: '“連續音符”則要長按至音符結束。',
    rhythmDemo: 'hold'
  },
  {
    speaker: 'GANGAN',
    en: 'All four buttons follow the drums. M is cymbals, O is snare, T is kick, and H is other percussion.',
    zh: '四個按鍵都跟著鼓點：M 是鈸、O 是小鼓、T 是大鼓、H 是其他打擊樂。'
  },
  {
    speaker: 'GANGAN',
    en: 'Extra taps between notes are safe! Missing a note, pressing the wrong button within its timing window, or releasing a hold early counts as a miss and breaks your combo.',
    zh: '音符之間多按不會受罰！但漏掉音符、在判定範圍內按錯鍵，或提早放開連續音符，都算失誤，並且會中斷連擊。'
  },
  {
    speaker: 'GANGAN',
    en: "The controls are a little brutal. We're not a game company!",
    zh: '這設計很不人性化，因為我們不是做遊戲的公司！'
  },
  {
    speaker: 'GANGAN',
    en: "Let's give it a try!",
    zh: '我們先來試試看吧！'
  }
];

export const MOTH_OFFICE_READY = [
  {
    speaker: 'GANGAN',
    en: "Nice! If you made it through that, I'm sure you can nail the real thing!",
    zh: '水唷！這樣你都玩得下去，相信你一定可以完美挑戰！',
    portraitFrame: 5
  },
  {
    speaker: 'GANGAN',
    en: 'Finish Story Mode to unlock two hidden songs in Stage Select!',
    zh: '對了！故事模式全破後會解鎖兩首隱藏歌曲，不要忘記去”關卡選擇”聽歌喔！',
    portraitFrame: 5
  },
  {
    speaker: 'GANGAN',
    en: 'Now help Dr. Beauty stamp those papers. Follow the drums and aim for a higher score!',
    zh: '現在！開始協助美麗蓋章章，跟上鼓點，贏得更高的分數吧！',
    portraitFrame: 5
  }
];

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
