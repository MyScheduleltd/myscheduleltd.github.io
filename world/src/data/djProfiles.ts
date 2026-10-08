import type { VenueKey } from './catalogue';
import type { DjProfile, DjProfiles } from '../network/FestivalClient';

/**
 * Which resident plays which room. The booths are the only places these are
 * read from, so a venue without a DJ simply has no entry.
 */
export const DJ_BY_VENUE: Partial<Record<VenueKey, string>> = {
  club: 'XIEHGAN',
  rooftop: 'DRBEAUTY',
};

/**
 * Introductions as they ship in the build. The festival service overrides
 * these once STAFF edit them, but the build has to carry a copy of its own:
 * on a static host there is no service to ask, and a booth with an empty
 * introduction would read as broken rather than as unwritten.
 */
export const DEFAULT_DJ_PROFILES: DjProfiles = {
  XIEHGAN: {
    id: 'XIEHGAN',
    name: 'XIEH GAN',
    role: 'Resident DJ · The Basement',
    roleZh: '駐場 DJ · 皇宮地下室',
    // Deliberately left as a placeholder. Writing a biography for a real
    // person is STAFF's to do, not this file's to invent.
    introduction: 'Resident DJ at The Basement. STAFF have not written this introduction yet.',
    introductionZh: '皇宮地下室的駐場 DJ。這段介紹尚未由 STAFF 撰寫。',
    // The owner's credits (2026-10-08), carried by the build so the page has
    // something to show on a static host. The service's copy wins once there.
    credits: "The King of Nightmarket — opening theme (A&R / recording & mixing)\nThe Rappers 2 — opening theme (A&R / recording & mixing)\nDR.BEAUTY — 美麗本人精選輯, album (music producer / A&R)\nJ.Sheon — J.Sheon 街巷, self-titled album (album producer / A&R)\nMiss Ko — soul.food 靈食 (music producer / A&R)*\nLai Tzu-hung — 這就是人生啊, album (album producer)\nCoCo Lee — 叩叩, 能不能, 盛開 (producer)\nOne Two Free — 跨出界, album (producer)\nRachel Liang — 黃色夾克, album (producer)\nRicky Hsiao — 無邊際的愛你 (producer)\nElva Hsiao — 愛我不愛, SUPER GIRL, 放愛情一個假 (producer)\nAmber An — 呼呼, 玫瑰公主, 愛的動名片 (producer)\nRichie Jen — 爆掉, 瘋狂的存在 (producer)\nRainie Yang — 離開動物園, 一萬零一種可能 (producer)\nA-Mit — 裂痕 (producer)\nHan Geng — Hope in the Darkness 寒更, album (producer)\nA-Mei — 可樂果快樂Song (producer)\nJane Huang — 只怕想家, 破壞的愛情, 你不是說愛我 (producer)\n*Miss Ko — soul.food: nominated, Best Vocal Recording Album, 37th Golden Melody Awards",
    creditsZh: "夜市王 《夜市王》片頭曲（A&R／錄音混音）\n大嘻哈時代2 《片頭曲》（A&R／錄音混音）\n美麗本人 《美麗本人精選輯》專輯（音樂製作人／A&R）\nJ.Sheon 《J.Sheon街巷》同名專輯（專輯製作人／A&R）\nMiss Ko 葛仲珊《靈食》（音樂製作人／A&R）*\n賴慈泓 《這就是人生啊》專輯（專輯製作人）\n李玟 《叩叩》、《能不能》、《盛開》（執行製作）\n自由發揮 《跨出界》專輯（執行製作）\n梁文音 《黃色夾克》專輯（執行製作）\n蕭煌奇 《無邊際的愛你》（執行製作）\n蕭亞軒 《愛我不愛》、《SUPER GIRL》、《放愛情一個假》（執行製作）\n安心亞 《呼呼》、《玫瑰公主》、《愛的動名片》（執行製作）\n任賢齊 《爆掉》、《瘋狂的存在》（執行製作）\n楊丞琳 《離開動物園》、《一萬零一種可能》（執行製作）\n阿密特 《裂痕》（執行製作）\n韓庚 《寒更》專輯（執行製作）\n張惠妹 《可樂果快樂Song》（執行製作）\n黃美珍 《只怕想家》、《破壞的愛情》、《你不是說愛我》（執行製作）\n*Miss Ko 葛仲珊《靈食》：入圍第 37 屆金曲獎最佳演唱錄音專輯獎",
    updatedAt: 0,
  },
  DRBEAUTY: {
    id: 'DRBEAUTY',
    name: 'DR.BEAUTY',
    role: 'Rooftop DJ · Artist, rapper, music producer, host, YouTuber',
    roleZh: '頂樓 DJ · 藝人、饒舌歌手、音樂製作人、主持人、YouTuber',
    // Taken from the DR.BEAUTY page on myscheduleltd.com so the world and the
    // site say the same thing, rather than being written fresh here.
    introduction: 'Li Baobi — artist, rapper, music producer, host, influencer, YouTuber and party mascot. Opened the 美麗本人 YouTube channel in 2019, known for reaction videos to Mandarin music videos made with animation and effects, and for putting “R爆” and the 醬擠 gesture into everyday use among younger audiences.',
    introductionZh: '李包比，藝人、饒舌歌手、音樂製作人、主持人、網美、YouTuber、派對吉祥物。2019 年開立『美麗本人』YouTube 頻道，以浮誇且具幽默感的表演方式對華語歌曲 MV 做 Reaction 影片，並以一句「R爆」跟經典手勢「醬擠」在年輕族群間瘋傳。',
    updatedAt: 0,
  },
};

/** The live introduction for a booth: STAFF's copy if there is one, else the build's. */
export const djProfileFor = (
  venue: VenueKey,
  fromService: DjProfiles | undefined,
  djName: string,
): DjProfile | undefined => {
  const id = DJ_BY_VENUE[venue];
  if (!id) return undefined;
  const profile = fromService?.[id] ?? DEFAULT_DJ_PROFILES[id];
  if (!profile) return undefined;
  // The booth's nameplate is renameable by STAFF, so it wins over the record.
  return { ...profile, name: djName || profile.name };
};
