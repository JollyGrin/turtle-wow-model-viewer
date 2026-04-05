/**
 * Bridge between our viewer's naming conventions and ZamImg's numeric IDs.
 * Isolates all ZamImg-specific knowledge so changes to their API are contained.
 */

/** ZamImg race IDs (classic only — no blood-elf or goblin) */
export const ZAM_RACE_IDS: Record<string, number> = {
  'human': 1,
  'orc': 2,
  'dwarf': 3,
  'night-elf': 4,
  'scourge': 5,
  'tauren': 6,
  'gnome': 7,
  'troll': 8,
};

/** Classic races we can compare (excludes TurtleWoW-only races) */
export const CLASSIC_RACES = Object.keys(ZAM_RACE_IDS);

/** inventory_type → ZamImg equipment slot number */
const INV_TYPE_TO_ZAM_SLOT: Record<number, number> = {
  1: 1,    // Head
  3: 3,    // Shoulders
  5: 5,    // Chest
  20: 5,   // Robe → Chest
  7: 7,    // Legs
  8: 8,    // Feet
  10: 10,  // Hands
  13: 16,  // One-hand weapon → MainHand
  15: 16,  // Ranged → MainHand
  17: 16,  // Two-hand → MainHand
  21: 16,  // Main hand → MainHand
  14: 17,  // Shield → OffHand
  22: 17,  // Offhand weapon → OffHand
  23: 17,  // Held in off-hand → OffHand
  25: 16,  // Thrown → MainHand
  26: 16,  // Ranged right → MainHand
};

/**
 * Get ZamImg model ID for a race/gender combo.
 * Formula: raceId * 2 - 1 + genderNum
 * WoW convention: Gender 0 = male, Gender 1 = female
 */
export function zamModelId(raceSlug: string, gender: 'male' | 'female'): number | null {
  const raceId = ZAM_RACE_IDS[raceSlug];
  if (!raceId) return null;
  const genderNum = gender === 'male' ? 0 : 1;
  return raceId * 2 - 1 + genderNum;
}

/** Convert Chronicle inventory_type to ZamImg slot number. */
export function zamSlot(inventoryType: number): number | null {
  return INV_TYPE_TO_ZAM_SLOT[inventoryType] ?? null;
}

/** Check if a race can be compared against ZamImg. */
export function isClassicRace(raceSlug: string): boolean {
  return raceSlug in ZAM_RACE_IDS;
}
