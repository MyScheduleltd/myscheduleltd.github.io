import avatarMeta from '../assets/avatars/avatars.json';
import { avatarSex, type AvatarSex } from './CoastalOutfits';
import type { AvatarPalette } from './FestivalWorld';

type DyeSlot = 'skin' | 'hair' | 'bottoms' | 'swimwear';

/**
 * The colours each body was generated in. A palette slot holding its body's
 * native colour shows the texture exactly as Higgsfield painted it; any other
 * colour dyes that class of texel, keeping the texture's light and shade.
 */
export const AVATAR_NATIVE: Record<AvatarSex, Record<DyeSlot, string>> = {
  male: avatarMeta.male.native as Record<DyeSlot, string>,
  female: avatarMeta.female.native as Record<DyeSlot, string>,
};

/** Bodies required to draw the visitor and residents. */
export function avatarVariantsFor(palette: Pick<AvatarPalette, 'top'>): AvatarSex[] {
  return ['male', avatarSex(palette.top)];
}
