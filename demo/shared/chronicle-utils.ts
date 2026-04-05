/**
 * Shared utilities for bridging Chronicle API item data with the viewer's EquipmentOptions.
 * Used by both the chronicle demo and the regression test pages.
 */
import type { BodyArmor, EquipmentOptions } from '../../packages/viewer/src/index';

// --- Chronicle API types ---

export interface ChronicleItem {
  entry: number;
  name: string;
  quality: number;
  inventory_type: number;
  display_id: number;
  model_name: string[];
  model_texture: string[];
  geoset_group: number[];
  texture: string[];
  geoset_vis_id: number[];
}

export const QUALITY_COLOR: Record<number, string> = {
  0: '#9d9d9d', 1: '#ffffff', 2: '#1eff00', 3: '#0070dd', 4: '#a335ee', 5: '#ff8000',
};

const TEXTURE_REGION_DIRS = [
  'ArmUpperTexture', 'ArmLowerTexture', 'HandTexture',
  'TorsoUpperTexture', 'TorsoLowerTexture',
  'LegUpperTexture', 'LegLowerTexture', 'FootTexture',
];

export type SlotKey = 'weapon' | 'offhand' | 'head' | 'shoulder' | 'chest' | 'legs' | 'feet' | 'hands';

// --- Helpers ---

export function slugify(filename: string): string {
  return filename.replace(/\.\w+$/, '').toLowerCase().replace(/_/g, '-');
}

function texBase(regionIdx: number, texName: string): string {
  return `/item-textures/${TEXTURE_REGION_DIRS[regionIdx]}/${texName.replace(/\.blp$/i, '')}`;
}

export function invTypeToSlot(invType: number): SlotKey | null {
  switch (invType) {
    case 13: case 15: case 17: case 21: case 25: case 26: return 'weapon';
    case 14: case 22: case 23: return 'offhand';
    case 1: return 'head';
    case 3: return 'shoulder';
    case 5: case 20: return 'chest';
    case 7: return 'legs';
    case 8: return 'feet';
    case 10: return 'hands';
    default: return null;
  }
}

/** Map equipped items to viewer EquipmentOptions. */
export function buildEquipment(equipped: Partial<Record<SlotKey, ChronicleItem>>): EquipmentOptions {
  const eq: EquipmentOptions = {};
  const armor: BodyArmor = {};

  // Weapon
  const w = equipped.weapon;
  if (w?.model_name?.[0]) {
    const slug = slugify(w.model_name[0]);
    eq.weapon = {
      path: `/items/weapon/${slug}`,
      texture: w.model_texture?.[0] ? `/items/weapon/${slug}/textures/${slugify(w.model_texture[0])}.tex` : undefined,
    };
  }

  // Offhand
  const oh = equipped.offhand;
  if (oh?.model_name?.[0]) {
    const dir = oh.inventory_type === 14 ? 'shield' : 'weapon';
    const slug = slugify(oh.model_name[0]);
    eq.offhand = {
      path: `/items/${dir}/${slug}`,
      texture: oh.model_texture?.[0] ? `/items/${dir}/${slug}/textures/${slugify(oh.model_texture[0])}.tex` : undefined,
    };
  }

  // Head
  const head = equipped.head;
  if (head?.model_name?.[0]) {
    armor.helmet = slugify(head.model_name[0]);
    if (head.geoset_vis_id?.[0] || head.geoset_vis_id?.[1]) {
      armor.helmetGeosetVisID = [head.geoset_vis_id[0], head.geoset_vis_id[1]];
    }
    if (head.model_texture?.[0]) armor.helmetTexture = slugify(head.model_texture[0]);
  }

  // Shoulder
  const shoulder = equipped.shoulder;
  if (shoulder?.model_name?.[0]) {
    armor.shoulderSlug = slugify(shoulder.model_name[0].replace(/^[LR]Shoulder_/i, ''));
    armor.shoulderHasRight = true;
    if (shoulder.model_texture?.[0]) armor.shoulderTexture = slugify(shoulder.model_texture[0]);
  }

  // Chest
  const chest = equipped.chest;
  if (chest) {
    const tex = chest.texture;
    const gg = chest.geoset_group;
    if (tex[0]) armor.armUpperBase = texBase(0, tex[0]);
    if (tex[3]) armor.torsoUpperBase = texBase(3, tex[3]);
    if (tex[4]) armor.torsoLowerBase = texBase(4, tex[4]);
    if (gg[0] > 0) armor.sleeveGeoset = gg[0] + 1;
    if (gg[2] > 0) armor.robeGeoset = gg[2] + 1;
    if (armor.robeGeoset) {
      if (tex[5]) armor.legUpperBase = texBase(5, tex[5]);
      if (tex[6]) armor.legLowerBase = texBase(6, tex[6]);
      if (tex[1]) armor.armLowerBase = texBase(1, tex[1]);
    }
  }

  // Legs
  const legs = equipped.legs;
  if (legs && !armor.robeGeoset) {
    if (legs.texture[5]) armor.legUpperBase = texBase(5, legs.texture[5]);
    if (legs.texture[6]) armor.legLowerBase = texBase(6, legs.texture[6]);
    if (legs.geoset_group[2] > 0) armor.robeGeoset = legs.geoset_group[2] + 1;
  }

  // Boots
  const boots = equipped.feet;
  if (boots) {
    if (boots.texture[7]) armor.footBase = texBase(7, boots.texture[7]);
    if (boots.geoset_group[0] > 0) armor.footGeoset = boots.geoset_group[0] + 1;
    if (!armor.robeGeoset && boots.texture[6]) armor.legLowerBase = texBase(6, boots.texture[6]);
  }

  // Gloves
  const gloves = equipped.hands;
  if (gloves) {
    if (gloves.texture[2]) armor.handBase = texBase(2, gloves.texture[2]);
    if (gloves.geoset_group[0] > 0) armor.handGeoset = gloves.geoset_group[0] + 1;
    if (gloves.texture[1]) armor.armLowerBase = texBase(1, gloves.texture[1]);
    if (!armor.robeGeoset && gloves.geoset_group[1] > 0) armor.wristGeoset = gloves.geoset_group[1] + 1;
  }

  if (Object.values(armor).some(v => v)) eq.armor = armor;
  return eq;
}
