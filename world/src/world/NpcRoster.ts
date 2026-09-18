/**
 * The festival's residents, and the handful of strings the interface needs
 * before there is a world to show.
 *
 * A leaf module on purpose. These used to live in `FestivalWorld.ts`, and the
 * gate imported them — which meant that naming the residents pulled in the
 * whole world: three.js, the scene, and the avatar model with it. So the entry
 * bundle was 702KB and had to download and parse before the gate could draw a
 * single field. Keeping them here lets the gate ask for the roster without
 * asking for the festival.
 *
 * `FestivalWorld` re-exports everything below, so nothing that already imports
 * these from there needs to change.
 */

export const NPC_NAMES = ['MENTOR', 'KENNY', 'NUNO', 'MICHAEL', 'SEBINE', 'ZC', 'LOUI', 'MINYUN', 'VIOLA', 'XIEHGAN', 'DRBEAUTY', 'YO'] as const;
export type NpcId = string;
export type NpcNames = Record<NpcId, string>;

export interface NpcProfile {
  id: NpcId;
  name: string;
  title: string;
  /**
   * What this resident says about themselves, written by STAFF.
   *
   * Optional and usually absent: the roster is real colleagues and nothing is
   * written on their behalf. A resident with no introduction still has a name
   * and a job title, and that is what their card shows.
   */
  introduction?: string;
}

export interface MentorFollowerTarget {
  kind: 'visitor' | 'npc';
  id: string;
}

export const DEFAULT_NPC_NAMES: NpcNames = Object.fromEntries(NPC_NAMES.map((name) => [name, name]));

export const NPC_TITLES: Record<NpcId, string> = {
  MENTOR: 'Video Editor',
  KENNY: 'Director',
  NUNO: 'Sound Engineer',
  MICHAEL: 'Director',
  SEBINE: 'Director',
  ZC: 'Director',
  LOUI: 'Director',
  MINYUN: 'Director Manager',
  VIOLA: 'Project Manager',
  XIEHGAN: 'Resident DJ',
  DRBEAUTY: 'Rooftop DJ',
  YO: 'Festival Videographer',
};

export const DEFAULT_NPC_PROFILES: NpcProfile[] = NPC_NAMES.map((id) => ({
  id,
  name: DEFAULT_NPC_NAMES[id],
  title: NPC_TITLES[id],
}));

/**
 * What MENTOR's prompt adds, and the exact string the interface matches to
 * translate it. The dog's tap and hold are already spoken for — a treat and a
 * pick-up — so its introduction is a double tap, which is MENTOR's alone.
 */
export const DOUBLE_TAP_INTRODUCTION = ' · DOUBLE TAP / INTRODUCTION';
