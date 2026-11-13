import * as THREE from 'three';
import { loadLightBoxFace, pictureTexture } from './Ps1LightBoxHousing';
import rooftopBoard from '../assets/ps1/signs/rooftop.png';
import clubBoard from '../assets/ps1/signs/club.png';
import palaceBoard from '../assets/ps1/signs/palace.png';
import driveInBoard from '../assets/ps1/signs/drive-in.png';
import shoreBoard from '../assets/ps1/signs/shore.png';
import templeBoard from '../assets/ps1/signs/temple.png';
import entranceFace from '../assets/ps1/signs/entrance.png';
import brandLightBox from '../assets/ps1/lightboxes/brand.png';
import videoLightBox from '../assets/ps1/lightboxes/video.png';
import iceLightBox from '../assets/ps1/lightboxes/icefruit.png';
import billiardsLightBox from '../assets/ps1/lightboxes/billiards.png';
import innLightBox from '../assets/ps1/lightboxes/inn.png';
import photoLightBox from '../assets/ps1/lightboxes/photo.png';
import snacksLightBox from '../assets/ps1/lightboxes/snacks.png';
import newsLightBox from '../assets/ps1/lightboxes/news.png';
import nightmarketPoster from '../assets/ps1/posters/nightmarket.png';
import rappersPoster from '../assets/ps1/posters/rappers2.png';
import surferPoster from '../assets/ps1/posters/surfer.png';
import thousandPoster from '../assets/ps1/posters/thousand.png';
import palaceVerticalSign from '../assets/ps1/lightboxes/palace-vertical.png';
import basementLightBox from '../assets/ps1/lightboxes/basement.png';
import dancehallLightBox from '../assets/ps1/lightboxes/dancehall.png';

/**
 * The PS1 look's venue signs: light-box faces (the owner, 2026-11-10, after
 * Showa-era light-box references, replacing the brush-lettered boards they
 * called "too ugly"). Chinese names only, in bold printed lettering, each
 * with its own invented emblem. Generated whole with Higgsfield GPT Image 2,
 * checked character by character, and reduced to small palette textures
 * (art/ps1-signs-20261110). The owner's names: NIMA ROOFTOP 你媽俱樂部,
 * SLAP AND POP 死懶趴, the Palace 皇宮戲院, the drive-in 露天戲院, the
 * Shore 海岸戲院, the temple 美麗本人. Master of the House keeps its own logo.
 *
 * A board keeps its sign's height and takes the picture's own width.
 * A venue still under its default name shows its board; a name STAFF has
 * changed is lettered as before, on a panel of the board's shape.
 */
export type Ps1BoardKey = 'rooftop' | 'club' | 'palace' | 'drive-in' | 'shore' | 'temple';

interface BoardArt { url: string; width: number; height: number; name: string; defaults: readonly string[] }

export const PS1_BOARDS: Readonly<Record<Ps1BoardKey, BoardArt>> = {
  rooftop: { url: rooftopBoard, width: 512, height: 219, name: '你媽俱樂部', defaults: ['NIMA ROOFTOP'] },
  club: { url: clubBoard, width: 512, height: 219, name: '死懶趴', defaults: ['SLAP AND POP'] },
  palace: { url: palaceBoard, width: 512, height: 219, name: '皇宮戲院', defaults: ['THE PALACE'] },
  'drive-in': { url: driveInBoard, width: 512, height: 219, name: '露天戲院', defaults: ['DRIVE-IN 88'] },
  shore: { url: shoreBoard, width: 512, height: 286, name: '海岸戲院', defaults: ['THE SHORE'] },
  temple: { url: templeBoard, width: 512, height: 219, name: '美麗本人', defaults: [] },
};

export interface Ps1Board { map: THREE.Texture; aspect: number; name: string }

/** A pixel sign texture (pictureTexture), drawn as chunky pixels. */
export function loadPixelSign(url: string, name: string): THREE.Texture {
  const texture = pictureTexture(url);
  texture.name = name;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

/**
 * Square shop light-boxes for the pilot street (Ps1StreetProps), in the
 * order it hangs them: the company's own name first, where arrivals from the
 * dock see the building, then a video shop, an ice-fruit parlour and a
 * billiard hall, the trades of a 1990s Ximending street.
 */
export const PS1_LIGHT_BOXES = [
  { url: brandLightBox, name: '我的檔期', aspect: 1 },
  { url: videoLightBox, name: '錄影帶', aspect: 1 },
  { url: iceLightBox, name: '冰果室', aspect: 1 },
  { url: billiardsLightBox, name: '撞球', aspect: 1 },
] as const;

/**
 * The dock dormitories' shops (Ps1StreetProps dressDock), in its order: the
 * west block's square end then dock end, then the east block's. A snack bar
 * and an inn greet people stepping off the boat.
 */
/**
 * Palace posters from the company's own catalogue (the owner, 2026-11-09:
 * "use stills from their own catalogue"). Stills from YouTube's thumbnails of
 * the works, cropped clear of channel logos and captions. Billboards are the
 * Palace's own two works; the street cases show two music videos.
 */
export const PS1_PALACE_POSTERS = {
  /** The giant poster on the Palace front, 128 by 102 pixels. */
  giant: { url: rappersPoster, name: 'The Rappers 2', aspect: 128 / 102 },
  /** The billboard down the side facing the square, 128 by 64. */
  side: { url: nightmarketPoster, name: 'The King of Nightmarket', aspect: 2 },
  cases: [{ url: surferPoster, name: "Surfer's Love Story" }, { url: thousandPoster, name: 'A Thousand Words' }],
  /** The tall 皇宮戲院 light-box at the front corner, a tower like the owner's 1970s reference (9:16). */
  vertical: { url: palaceVerticalSign, name: '皇宮戲院 vertical', aspect: 9 / 16 },
} as const;

/** The club front's corner light-boxes (Ps1StreetProps dressClubFront): the north end, then the south. */
export const PS1_CLUB_LIGHT_BOXES = [
  { url: basementLightBox, name: '地下室', aspect: 1 },
  { url: dancehallLightBox, name: '舞廳', aspect: 1 },
] as const;

export const PS1_DOCK_LIGHT_BOXES = [
  { url: newsLightBox, name: '書報', aspect: 1 },
  { url: snacksLightBox, name: '小吃', aspect: 1 },
  { url: photoLightBox, name: '照相館', aspect: 1 },
  { url: innLightBox, name: '旅社', aspect: 1 },
] as const;

const textures = new Map<Ps1BoardKey, THREE.Texture>();
const boardTextures = new WeakSet<THREE.Texture>();

/** The board for this sign. */
export function ps1Board(key: Ps1BoardKey): Ps1Board {
  const art = PS1_BOARDS[key];
  let map = textures.get(key);
  if (!map) {
    map = loadLightBoxFace(art.url, `PS1 board ${art.name}`);
    textures.set(key, map);
    boardTextures.add(map);
  }
  return { map, aspect: art.width / art.height, name: art.name };
}

/** The entrance arch's words while STAFF leave them as they are. */
export const PS1_ENTRANCE_DEFAULT = { title: 'MYSCHEDULE', subtitle: 'VIRTUAL FESTIVAL' } as const;
let entranceTexture: THREE.Texture | undefined;

/**
 * The entrance arch's light-box face in the PS1 look (the owner, 2026-11-10:
 * a long cream light-box keeping its English): the designed face for the
 * default words, and STAFF's own words lettered on the same cream.
 */
export function ps1EntranceFace(title: string, subtitle: string): THREE.Texture {
  if (title === PS1_ENTRANCE_DEFAULT.title && subtitle === PS1_ENTRANCE_DEFAULT.subtitle) {
    if (!entranceTexture) {
      entranceTexture = loadLightBoxFace(entranceFace, 'PS1 entrance MYSCHEDULE');
      boardTextures.add(entranceTexture);
    }
    return entranceTexture;
  }
  return paintEntranceFace(title, subtitle);
}

/** STAFF's words on the entrance's cream face, in the site's condensed type, between thin rules. */
function paintEntranceFace(title: string, subtitle: string): THREE.Texture {
  const canvas = typeof document !== 'undefined' && typeof document.createElement === 'function' ? document.createElement('canvas') : undefined;
  const context = canvas?.getContext?.('2d');
  if (!canvas || !context) return new THREE.Texture();
  canvas.width = 1160; canvas.height = 200;
  context.fillStyle = '#ebe2cd'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#6b2a25'; context.lineWidth = 3; context.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = '#6b2a25';
  const fit = (text: string, weight: number, size: number, width: number) => {
    let px = size;
    do { context.font = `${weight} ${px}px "Barlow Condensed", Impact, sans-serif`; px -= 2; } while (context.measureText(text).width > width && px > 12);
  };
  fit(title.toUpperCase(), 700, 96, 980);
  context.fillText(title.toUpperCase(), canvas.width / 2, 84);
  context.fillStyle = '#1f1e1c'; context.fillRect(330, 132, 500, 2); context.fillRect(330, 178, 500, 2);
  fit(subtitle.toUpperCase().split('').join(' '), 600, 28, 480);
  context.fillText(subtitle.toUpperCase().split('').join(' '), canvas.width / 2, 156);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'PS1 entrance (STAFF words)';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Shared and reused, so never disposed when a renamed sign replaces it. */
export function isPs1BoardTexture(texture: THREE.Texture | null | undefined): boolean {
  return Boolean(texture && boardTextures.has(texture));
}

/** Whether a sign under this name still shows its board: its default English name, or the board's own. */
export function boardKeepsName(key: Ps1BoardKey, name: string): boolean {
  const art = PS1_BOARDS[key];
  const wanted = name.trim().toLocaleUpperCase('en-US');
  return wanted === art.name || art.defaults.some((value) => value === wanted);
}
