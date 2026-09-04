import legacySource from '../../../docs/js/allData.js';

export type VenueKey = 'palace' | 'drive-in' | 'shore' | 'club' | 'rooftop';

export interface CatalogueEntry {
  id: string;
  title: string;
  titleZh?: string;
  creator?: string;
  year?: number;
  category: string;
  venue: VenueKey;
  youtubeId: string;
  embedUrl: string;
  sourceUrl: string;
}

interface LegacyFilm {
  id: string;
  title: string;
  chinese_title?: string;
  url: string;
  author?: string;
  date?: number;
}

interface LegacyCategory {
  name: string;
  profilo: LegacyFilm[];
}

interface LegacyData {
  drBeautyVideos: LegacyFilm[];
  profilo: LegacyCategory[];
}

const legacyData = legacySource as LegacyData;

const venueForCategory = (category: string): VenueKey => {
  // The three theatres traded catalogues. Kept in step with
  // `programmeCategoryForVenue` in the service, which is the other half of
  // this mapping — a venue holding one catalogue here and another there is a
  // programme board that disagrees with the screen underneath it.
  if (category === 'TELEVISION') return 'palace';
  if (category === 'MUSIC VIDEO') return 'drive-in';
  if (category === 'COMMERCIAL') return 'shore';
  // The DR.BEAUTY originals are the club's record box.
  if (category === 'ORIGINALS') return 'club';
  return 'shore';
};

const youtubeIdFromUrl = (value: string): string => {
  try {
    const url = new URL(value);
    if (url.hostname === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] ?? '';

    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') {
      return parts[1] ?? '';
    }

    return url.searchParams.get('v') ?? '';
  } catch {
    return '';
  }
};

const normalizeFilm = (film: LegacyFilm, category: string): CatalogueEntry | null => {
  const youtubeId = youtubeIdFromUrl(film.url);
  if (!youtubeId) return null;

  return {
    id: `${category.toLowerCase().replaceAll(' ', '-')}-${film.id}`,
    title: film.title.trim(),
    titleZh: film.chinese_title?.trim(),
    creator: film.author?.trim(),
    year: typeof film.date === 'number' ? film.date : undefined,
    category,
    venue: venueForCategory(category),
    youtubeId,
    embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}`,
    sourceUrl: film.url,
  };
};

const portfolioEntries = legacyData.profilo.flatMap((category) =>
  category.profilo
    .map((film) => normalizeFilm(film, category.name))
    .filter((film): film is CatalogueEntry => film !== null),
);

const originalEntries = legacyData.drBeautyVideos
  .map((film) => normalizeFilm(film, 'ORIGINALS'))
  .filter((film): film is CatalogueEntry => film !== null);

export const catalogue = [...portfolioEntries, ...originalEntries];

export const catalogueByVenue = {
  palace: catalogue.filter((film) => film.category === 'TELEVISION'),
  'drive-in': catalogue.filter((film) => film.category === 'MUSIC VIDEO'),
  shore: catalogue.filter((film) => film.category === 'COMMERCIAL'),
  club: catalogue.filter((film) => film.category === 'ORIGINALS'),
  // The rooftop spins the same DR.BEAUTY box as the basement.
  rooftop: catalogue.filter((film) => film.category === 'ORIGINALS'),
} satisfies Record<VenueKey, CatalogueEntry[]>;

export const catalogueSummary = {
  total: catalogue.length,
  palace: catalogueByVenue.palace.length,
  'drive-in': catalogueByVenue['drive-in'].length,
  shore: catalogueByVenue.shore.length,
  club: catalogueByVenue.club.length,
  rooftop: catalogueByVenue.rooftop.length,
};
