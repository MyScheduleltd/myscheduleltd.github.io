export type QuestId =
  | 'walk'
  | 'run'
  | 'jump'
  | 'camera'
  | 'pass'
  | 'map'
  | 'programme'
  | 'palace'
  | 'drive-in'
  | 'shore'
  | 'basement'
  | 'rooftop'
  | 'public-screening'
  | 'private-screening'
  | 'greet'
  | 'dance'
  | 'feed-mentor'
  | 'carry-mentor'
  | 'eat'
  | 'drink'
  | 'jukebox'
  | 'pamphlet'
  | 'chat'
  | 'offering'
  | 'photo';

export interface QuestDefinition {
  id: QuestId;
  title: { en: string; 'zh-TW': string };
  hint: { en: string; 'zh-TW': string };
}

export interface QuestSection {
  title: { en: string; 'zh-TW': string };
  quests: QuestDefinition[];
}

const quest = (
  id: QuestId,
  en: string,
  zh: string,
  hintEn: string,
  hintZh: string,
): QuestDefinition => ({ id, title: { en, 'zh-TW': zh }, hint: { en: hintEn, 'zh-TW': hintZh } });

/**
 * A visit-sized guided tour. The early steps teach the controls; later steps
 * turn those controls into reasons to explore the festival. Progress belongs
 * to the running App only and is intentionally never serialized.
 */
export const QUEST_SECTIONS: QuestSection[] = [
  {
    title: { en: 'GET YOUR BEARINGS', 'zh-TW': '熟悉基本操作' },
    quests: [
      quest('walk', 'TAKE YOUR FIRST STEPS', '踏出第一步', 'Move with WASD / arrows or the mobile stick.', '使用 WASD／方向鍵或手機搖桿移動。'),
      quest('run', 'BREAK INTO A RUN', '開始奔跑', 'Hold SHIFT or the mobile RUN button while moving.', '移動時按住 SHIFT 或手機的「跑」。'),
      quest('jump', 'JUMP', '跳躍', 'Press SPACE or the mobile JUMP button.', '按 SPACE 或手機的「跳」。'),
      quest('camera', 'CHANGE THE CAMERA', '切換鏡頭', 'Press T, or use the camera control on mobile.', '按 T，或使用手機鏡頭控制。'),
      quest('pass', 'OPEN YOUR FESTIVAL PASS', '開啟影展通行證', 'Open PASS / 通行證.', '開啟「通行證」。'),
      quest('map', 'READ THE MAP', '查看地圖', 'Open MAP from the festival pass.', '從通行證開啟「地圖」。'),
      quest('programme', 'CHECK WHAT IS PLAYING', '查看節目表', 'Open PROGRAMME from the festival pass or a timetable.', '從通行證或場內節目表查看放映資訊。'),
    ],
  },
  {
    title: { en: 'EXPLORE THE WORLD', 'zh-TW': '探索影展世界' },
    quests: [
      quest('palace', 'VISIT THE PALACE', '造訪皇宮影廳', 'Walk there or use the map.', '步行前往，或使用地圖快速移動。'),
      quest('drive-in', 'VISIT DRIVE-IN 88', '造訪汽車戲院', 'Walk there or use the map.', '步行前往，或使用地圖快速移動。'),
      quest('shore', 'REACH THE SHORE', '抵達海岸', 'Follow the promenade towards the sea.', '沿著步道往海邊前進。'),
      quest('basement', 'FIND SLAP AND POP', '找到地下俱樂部', 'Take the club entrance below MY SQUARE.', '從我的廣場找到地下俱樂部入口。'),
      quest('rooftop', 'CLIMB TO NIMA ROOFTOP', '登上屋頂', 'Find the stairs up to NIMA ROOFTOP.', '找到通往屋頂的樓梯。'),
    ],
  },
  {
    title: { en: 'JOIN THE FESTIVAL', 'zh-TW': '參與影展活動' },
    quests: [
      quest('public-screening', 'TAKE A PUBLIC SCREENING SEAT', '入座公開放映', 'Sit in any theatre.', '在任一影廳入座。'),
      quest('private-screening', 'CHOOSE A PRIVATE FILM', '選擇私人放映', 'Open the catalogue from your seat and choose a work.', '入座後打開片單並選擇作品。'),
      quest('greet', 'GREET A RESIDENT', '向居民打招呼', 'Stand near an NPC and interact.', '靠近 NPC 並互動。'),
      quest('dance', 'DANCE', '跳舞', 'Press B or the mobile DANCE button.', '按 B 或手機的「舞」。'),
      quest('feed-mentor', 'GIVE MENTOR A TREAT', '餵 MENTOR 吃點心', 'Stand beside MENTOR and interact.', '靠近 MENTOR 並互動。'),
      quest('carry-mentor', 'PICK UP MENTOR', '抱起 MENTOR', 'Use SHIFT + E, or hold MENTOR\'s mobile prompt.', '按 SHIFT + E，或長按手機上的 MENTOR 提示。'),
      quest('eat', 'EAT FESTIVAL FOOD', '享用影展食物', 'Collect food, then interact to eat it.', '取得食物後，再按互動享用。'),
      quest('drink', 'HAVE A DRINK', '喝一杯', 'Take a basement bar seat, order, then drink.', '在地下俱樂部吧檯入座、點酒並飲用。'),
      quest('jukebox', 'VISIT THE JUKEBOX', '使用點唱機', 'Interact with the jukebox in MY SQUARE.', '與我的廣場中的點唱機互動。'),
      quest('pamphlet', 'COLLECT THE PAMPHLET', '取得影展手冊', 'Pick up a festival pamphlet.', '拿取一本影展手冊。'),
      quest('chat', 'SAY SOMETHING', '傳送一則聊天訊息', 'Open CHAT and send a message.', '開啟「聊天」並傳送訊息。'),
      quest('offering', 'MAKE AN OFFERING', '獻上供養', 'Press O at the altar.', '在祭壇前按 O。'),
      quest('photo', 'ENTER PHOTO MODE', '進入拍照模式', 'Press C or use the mobile camera control.', '按 C，或使用手機鏡頭控制。'),
    ],
  },
];

export const QUESTS = QUEST_SECTIONS.flatMap((section) => section.quests);
export const QUEST_TOTAL = QUESTS.length;
