/**
 * STONEWALKER — Wild & Tameable Prehistoric Beasts (Section 8 [BONUS] Hook & Catalog)
 * Wild beasts roam neutral camps and can be tamed at a Beast Pen with Food.
 */

import type { ArmorType, BeastRole, DamageType } from './types';

export interface BeastDefinition {
  id: BeastRole;
  name: string;
  description: string;
  strongVs: string;
  weakVs: string;
  maxHp: number;
  armorType: ArmorType;
  armor: number;
  damageType: DamageType;
  damage: number;
  attackRange: number;
  attackCooldown: number;
  speed: number;
  vision: number;
  tameFoodCost: number;
  tameTimeSec: number;
  maxTamedCount: number;
}

export const BEASTS: Record<BeastRole, BeastDefinition> = {
  boar: {
    id: 'boar',
    name: 'Dire Tusk-Boar',
    description:
      'Aggressive charging beast that knocks back light infantry and forages in packs.',
    strongVs: 'Slingers & Clubbers',
    weakVs: 'Spearmen',
    maxHp: 220,
    armorType: 'light',
    armor: 4,
    damageType: 'melee',
    damage: 20,
    attackRange: 1.6,
    attackCooldown: 1.1,
    speed: 5.1,
    vision: 12,
    tameFoodCost: 90,
    tameTimeSec: 10,
    maxTamedCount: 4,
  },
  sabertooth: {
    id: 'sabertooth',
    name: 'Sabertooth Stalker',
    description:
      'Apex ambush predator with lethal pounce speed against ranged troops and scouts.',
    strongVs: 'Bow Hunters, Slingers & Scouts',
    weakVs: 'Spearmen & Shield Bearers',
    maxHp: 310,
    armorType: 'light',
    armor: 5,
    damageType: 'pierce',
    damage: 34,
    attackRange: 1.8,
    attackCooldown: 0.95,
    speed: 6.2,
    vision: 16,
    tameFoodCost: 150,
    tameTimeSec: 14,
    maxTamedCount: 3,
  },
  mammoth: {
    id: 'mammoth',
    name: 'Woolly War Mammoth',
    description:
      'Colossal prehistoric behemoth that absorbs volleys and smashes enemy buildings with its tusks.',
    strongVs: 'Buildings, Infantry & Light Machines',
    weakVs: 'Massed Spearmen',
    maxHp: 780,
    armorType: 'heavy',
    armor: 12,
    damageType: 'siege',
    damage: 58,
    attackRange: 2.3,
    attackCooldown: 1.8,
    speed: 3.0,
    vision: 13,
    tameFoodCost: 260,
    tameTimeSec: 20,
    maxTamedCount: 2,
  },
};

export const BEAST_LIST: readonly BeastDefinition[] = Object.values(BEASTS);