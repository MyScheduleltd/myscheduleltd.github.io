/** Fixed outfit identifiers in the legacy top-colour wire slot. This preserves
 * compatibility with saved passes and the deployed presence service. Legacy
 * colours resolve to the first outfit; no arbitrary colour dyes these garments. */
export const TOP_OUTFITS = [
  { id: '1', wire: '#18191b', en: 'OUTFIT 1 · MY SCHEDULE', zh: '服裝 1 · 我的檔期' },
  { id: '2', wire: '#191a1c', en: 'OUTFIT 2 · BROS IN THE SCHEDULE', zh: '服裝 2 · 檔期弟兄' },
  { id: '3', wire: '#1a1b1d', en: 'OUTFIT 3 · UTILITY VEST', zh: '服裝 3 · 機能背心' },
] as const;
export function topOutfit(top?: string): '1' | '2' | '3' {
  return TOP_OUTFITS.find(outfit => outfit.wire === top?.toLowerCase())?.id ?? '1';
}
