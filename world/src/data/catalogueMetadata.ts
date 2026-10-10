/**
 * Programme credits checked against the original linked videos on 2026-10-08.
 * Source for each key: https://www.youtube.com/watch?v=<key> (description and
 * public release date). A director is a credited director, never the uploader,
 * musician, producer or camera operator. Two unlisted directors below were
 * confirmed by the owner on 2026-10-08; other unlisted credits stay undefined.
 * Keep the original website catalogue intact; these corrections belong to the
 * festival programme, including videos STAFF added to its live playlists.
 */
export const verifiedProgrammeMetadata: Readonly<Record<string, { creator?: string; year?: number }>> = {
  De33mCT9OW0: { creator: '林宣佑 Loui Lin', year: 2026 },
  rMicadJVzH8: { creator: '體育老師 ZC', year: 2024 },
  lhAvlkYlFc4: { creator: '小惡魔 DVL', year: 2021 },
  TH4iVLVqXAc: { creator: 'XIEH GAN', year: 2023 }, // Owner-confirmed director.
  tLvj_eC8tQQ: { creator: 'Kenny', year: 2024 }, // Owner-confirmed director.
  hXhatbZ5j4k: { creator: '小惡魔 DVL', year: 2024 },
  'U2-OzFANCiA': { creator: '莎賓涂 Sebine. Tu', year: 2023 },
  KH4HNQBlP7U: { creator: '美麗本人 Dr. Beauty', year: 2021 },
  '5pSwEJw53Y8': { year: 2023 },
  // This linked work is the season finale, first broadcast in January 2025:
  // https://ontv.videoland.com.tw/thekingofnightmarket/
  TmvklnJYWA4: { year: 2025 },
  QuNc8b7DxyY: { year: 2017 },
  yOEpwDu7OB4: { year: 2016 },
  tRa3fOlnN7k: { year: 2017 },
  hQkQ2AzdNaY: { creator: '謝乾 / 周湯豪 Nick' },
  YgNGl442hgg: { creator: '謝乾 / 葉丁瑋 Ayeh' },
  XZ9YCADCko8: { year: 2025 },
};

/** Used for both the built-in catalogue and the current live custom entries. */
export const withVerifiedProgrammeMetadata = <T extends { youtubeId: string; creator?: string; year?: number }>(film: T): T => {
  const metadata = verifiedProgrammeMetadata[film.youtubeId];
  return metadata ? { ...film, ...metadata } : film;
};
