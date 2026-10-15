/**
 * STONEWALKER — Armory Tiers & Weapon Station Items (Sections 8 & 9B)
 * Prehistoric Tribes style progression:
 * Weapons: Wood (0) -> Stone (1) -> Bone (2) -> Bronze (3)
 * Armors:  Hide (0) -> Wood Plate (1) -> Bone Plate (2) -> Bronze Plate (3)
 */

import { BALANCE } from './balance';
import type {
  ArmorTier,
  DamageType,
  Resources,
  WeaponStationItemType,
  WeaponTier,
} from './types';

export interface WeaponTierDefinition {
  tier: WeaponTier;
  name: string;
  damageMultiplier: number;
  visualColorHex: number;
  requiredArmoryLevel: number;
  requiredTech?: string;
  upgradeCost: Partial<Resources>;
  upgradeTimeSec: number;
}

export interface ArmorTierDefinition {
  tier: ArmorTier;
  name: string;
  armorBonus: number;
  visualColorHex: number;
  requiredArmoryLevel: number;
  requiredTech?: string;
  upgradeCost: Partial<Resources>;
  upgradeTimeSec: number;
}

export interface WeaponStationItemDefinition {
  id: WeaponStationItemType;
  name: string;
  description: string;
  cost: Partial<Resources>;
  craftTimeSec: number;
  damage: number;
  range: number;
  cooldown: number;
  damageType: DamageType;
}

export const WEAPON_TIERS: Record<WeaponTier, WeaponTierDefinition> = {
  0: {
    tier: 0,
    name: 'Hardwood Weapons',
    damageMultiplier: BALANCE.WEAPON_TIER_DAMAGE_MULTIPLIERS[0],
    visualColorHex: 0x8b5a2b,
    requiredArmoryLevel: 1,
    upgradeCost: {},
    upgradeTimeSec: 0,
  },
  1: {
    tier: 1,
    name: 'Knapped Stone Weapons',
    damageMultiplier: BALANCE.WEAPON_TIER_DAMAGE_MULTIPLIERS[1],
    visualColorHex: 0x9ca3af,
    requiredArmoryLevel: 1,
    requiredTech: 'stone_weaponry',
    upgradeCost: { wood: 80, stone: 100 },
    upgradeTimeSec: 16,
  },
  2: {
    tier: 2,
    name: 'Serrated Bone Weapons',
    damageMultiplier: BALANCE.WEAPON_TIER_DAMAGE_MULTIPLIERS[2],
    visualColorHex: 0xf3ead6,
    requiredArmoryLevel: 2,
    requiredTech: 'bone_shields',
    upgradeCost: { wood: 120, stone: 140, hide: 80 },
    upgradeTimeSec: 22,
  },
  3: {
    tier: 3,
    name: 'Cast Bronze Weapons',
    damageMultiplier: BALANCE.WEAPON_TIER_DAMAGE_MULTIPLIERS[3],
    visualColorHex: 0xd98a3c,
    requiredArmoryLevel: 3,
    requiredTech: 'bronze_metallurgy',
    upgradeCost: { wood: 150, stone: 150, bronze: 120 },
    upgradeTimeSec: 28,
  },
};

export const ARMOR_TIERS: Record<ArmorTier, ArmorTierDefinition> = {
  0: {
    tier: 0,
    name: 'Cured Hide Tunics',
    armorBonus: BALANCE.ARMOR_TIER_BONUS_VALUES[0],
    visualColorHex: 0x9c6b3b,
    requiredArmoryLevel: 1,
    upgradeCost: {},
    upgradeTimeSec: 0,
  },
  1: {
    tier: 1,
    name: 'Wood Plate Armor',
    armorBonus: BALANCE.ARMOR_TIER_BONUS_VALUES[1],
    visualColorHex: 0x6e4726,
    requiredArmoryLevel: 1,
    requiredTech: 'stone_weaponry',
    upgradeCost: { wood: 110, hide: 70 },
    upgradeTimeSec: 16,
  },
  2: {
    tier: 2,
    name: 'Bone Rib-Plate Armor',
    armorBonus: BALANCE.ARMOR_TIER_BONUS_VALUES[2],
    visualColorHex: 0xe8dec5,
    requiredArmoryLevel: 2,
    requiredTech: 'bone_shields',
    upgradeCost: { wood: 120, stone: 100, hide: 120 },
    upgradeTimeSec: 22,
  },
  3: {
    tier: 3,
    name: 'Bronze Scale Plate',
    armorBonus: BALANCE.ARMOR_TIER_BONUS_VALUES[3],
    visualColorHex: 0xc87d32,
    requiredArmoryLevel: 3,
    requiredTech: 'bronze_metallurgy',
    upgradeCost: { hide: 140, stone: 120, bronze: 130 },
    upgradeTimeSec: 28,
  },
};

export const WEAPON_STATION_ITEMS: Record<
  WeaponStationItemType,
  WeaponStationItemDefinition
> = {
  club: {
    id: 'club',
    name: 'Spiked War Club',
    description: 'Ready-to-grab melee club for alarmed Workers and newly trained troops.',
    cost: { wood: 25, stone: 10 },
    craftTimeSec: 6,
    damage: BALANCE.EMERGENCY_WEAPON_STATS.club.damage,
    range: BALANCE.EMERGENCY_WEAPON_STATS.club.range,
    cooldown: BALANCE.EMERGENCY_WEAPON_STATS.club.cooldown,
    damageType: BALANCE.EMERGENCY_WEAPON_STATS.club.damageType,
  },
  spear: {
    id: 'spear',
    name: 'Barbed Hunting Spear',
    description: 'High-damage piercing spear stocked for camp defense emergencies.',
    cost: { wood: 30, stone: 20 },
    craftTimeSec: 7,
    damage: BALANCE.EMERGENCY_WEAPON_STATS.spear.damage,
    range: BALANCE.EMERGENCY_WEAPON_STATS.spear.range,
    cooldown: BALANCE.EMERGENCY_WEAPON_STATS.spear.cooldown,
    damageType: BALANCE.EMERGENCY_WEAPON_STATS.spear.damageType,
  },
  sling: {
    id: 'sling',
    name: 'Braided War Sling',
    description: 'Allows an alarmed Worker to fight at 6.5 range with heavy sling stones.',
    cost: { hide: 20, stone: 20 },
    craftTimeSec: 7,
    damage: BALANCE.EMERGENCY_WEAPON_STATS.sling.damage,
    range: BALANCE.EMERGENCY_WEAPON_STATS.sling.range,
    cooldown: BALANCE.EMERGENCY_WEAPON_STATS.sling.cooldown,
    damageType: BALANCE.EMERGENCY_WEAPON_STATS.sling.damageType,
  },
};

/** Max total weapons a Weapon Station can hold by building level (1..3). */
export const WEAPON_STATION_STOCK_CAPS: readonly [number, number, number] = [
  6, 12, 18,
];