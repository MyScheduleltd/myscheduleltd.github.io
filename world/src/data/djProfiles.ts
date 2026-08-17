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
