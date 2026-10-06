export const ACCESSORY_SLOTS = ['cap', 'chain', 'tattoo', 'backpack'] as const;
export type AccessorySlot = (typeof ACCESSORY_SLOTS)[number];

/** Default colour offered for each, the first time somebody switches it on. */
export const DEFAULT_ACCESSORY_COLOURS: Record<AccessorySlot, string> = {
  // Grey, as the owner's reference has it (October 2), with the white badge.
  cap: '#4d5157',
  chain: '#d8b23f',
  tattoo: '#2b2f4a',
  backpack: '#7a3b2c',
};

