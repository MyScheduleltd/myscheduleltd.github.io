/** Fixed outfit identifiers in the legacy top-colour wire slot. This preserves
 * compatibility with saved passes and the deployed presence service. Legacy
 * colours resolve to the first outfit; no arbitrary colour dyes these garments.
 *
 * The body travels in the same slot. The presence service passes any hex
 * colour through untouched, so a female body needs no change on the service:
 * each outfit has a second wire, and a client that has never heard of it reads
 * the unknown colour as outfit 1 on the male body, which is harmless. */
export const TOP_OUTFITS = [
  { id: '1', wire: '#18191b', wireFemale: '#28191b', en: 'OUTFIT 1 · MY SCHEDULE', zh: '服裝 1 · 我的檔期' },
  { id: '2', wire: '#191a1c', wireFemale: '#291a1c', en: 'OUTFIT 2 · BROS IN THE SCHEDULE', zh: '服裝 2 · 檔期弟兄' },
  { id: '3', wire: '#1a1b1d', wireFemale: '#2a1b1d', en: 'OUTFIT 3 · UTILITY VEST', zh: '服裝 3 · 機能背心' },
  // The swimsuit, worn on land as well as in the water.
  { id: '4', wire: '#1b1c1e', wireFemale: '#2b1c1e', en: 'OUTFIT 4 · SWIMWEAR', zh: '服裝 4 · 泳裝' },
] as const;

export type OutfitId = (typeof TOP_OUTFITS)[number]['id'];

export type AvatarSex = 'male' | 'female';

export function topOutfit(top?: string): OutfitId {
  const wire = top?.toLowerCase();
  return TOP_OUTFITS.find(outfit => outfit.wire === wire || outfit.wireFemale === wire)?.id ?? '1';
}

export function avatarSex(top?: string): AvatarSex {
  const wire = top?.toLowerCase();
  return TOP_OUTFITS.some(outfit => outfit.wireFemale === wire) ? 'female' : 'male';
}

/** The wire for an outfit on a given body. */
export function outfitWire(id: OutfitId, sex: AvatarSex): string {
  const outfit = TOP_OUTFITS.find(o => o.id === id) ?? TOP_OUTFITS[0];
  return sex === 'female' ? outfit.wireFemale : outfit.wire;
}
