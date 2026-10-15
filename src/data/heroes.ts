/**
 * STONEWALKER — Playable Tribes & Chieftain Heroes (Sections 8B & 13)
 * 3 distinct tribes with passive bonuses and unique active hero abilities.
 */

import type { HeroDefinition, TribeId } from './types';

export interface TribeDefinition {
  id: TribeId;
  name: string;
  tagline: string;
  description: string;
  bannerColorHex: number;
  bonuses: {
    buildingHpMultiplier: number;
    meleeDamageMultiplier: number;
    baseMoveSpeedMultiplier: number;
    workerCostMultiplier: number;
    fireDamageMultiplier: number;
    machineDamageMultiplier: number;
  };
}

export const TRIBES: Record<TribeId, TribeDefinition> = {
  stonebacks: {
    id: 'stonebacks',
    name: 'Stoneback Clan',
    tagline: 'Unbreakable Highland Builders & Melee Warriors',
    description:
      'Camp buildings have +25% HP and melee infantry deal +15% damage.',
    bannerColorHex: 0x3b82f6,
    bonuses: {
      buildingHpMultiplier: 1.25,
      meleeDamageMultiplier: 1.15,
      baseMoveSpeedMultiplier: 1.0,
      workerCostMultiplier: 1.0,
      fireDamageMultiplier: 1.0,
      machineDamageMultiplier: 1.0,
    },
  },
  reef_clan: {
    id: 'reef_clan',
    name: 'Reef Nomads',
    tagline: 'Swift Relocators & Resource Masters',
    description:
      'Council Walker & buildings walk +30% faster and Workers cost 20% less Food.',
    bannerColorHex: 0x14b8a6,
    bonuses: {
      buildingHpMultiplier: 1.0,
      meleeDamageMultiplier: 1.0,
      baseMoveSpeedMultiplier: 1.3,
      workerCostMultiplier: 0.8,
      fireDamageMultiplier: 1.0,
      machineDamageMultiplier: 1.0,
    },
  },
  ember_tribe: {
    id: 'ember_tribe',
    name: 'Ember Forgers',
    tagline: 'Masters of Fire & War Machines',
    description:
      'Fire attacks deal +25% damage and War Machines deal +15% damage.',
    bannerColorHex: 0xe8742a,
    bonuses: {
      buildingHpMultiplier: 1.0,
      meleeDamageMultiplier: 1.0,
      baseMoveSpeedMultiplier: 1.0,
      workerCostMultiplier: 1.0,
      fireDamageMultiplier: 1.25,
      machineDamageMultiplier: 1.15,
    },
  },
};

export const HEROES: Record<TribeId, HeroDefinition> = {
  stonebacks: {
    id: 'hero_craghorn',
    tribe: 'stonebacks',
    name: 'Chieftain Craghorn',
    title: 'Voice of the Monolith',
    abilityName: 'Earthshatter Slam',
    abilityDescription:
      'Slams his granite maul into the earth, dealing 110 area damage and stunning nearby enemies for 3.5 seconds.',
    abilityCooldown: 28,
    abilityRadius: 5.5,
    maxHp: 620,
    damage: 38,
    armor: 10,
    attackRange: 2.0,
    speed: 4.5,
    vision: 15,
    reviveTime: 35,
  },
  reef_clan: {
    id: 'hero_naya',
    tribe: 'reef_clan',
    name: 'Tidecaller Naya',
    title: 'Wind-Strider of the Atolls',
    abilityName: 'Tempest War Cry',
    abilityDescription:
      'Unleashes a conch war cry that boosts nearby allies’ movement and attack speed by +40% for 8 seconds.',
    abilityCooldown: 30,
    abilityRadius: 8.0,
    maxHp: 520,
    damage: 34,
    armor: 7,
    attackRange: 6.5,
    speed: 5.2,
    vision: 17,
    reviveTime: 30,
  },
  ember_tribe: {
    id: 'hero_ignis',
    tribe: 'ember_tribe',
    name: 'Warlord Ignis',
    title: 'Keeper of the First Flame',
    abilityName: 'Pyre Wave',
    abilityDescription:
      'Sweeps a searing arc of volcanic fire that deals 135 fire damage and ignites enemies and structures.',
    abilityCooldown: 26,
    abilityRadius: 6.5,
    maxHp: 560,
    damage: 42,
    armor: 8,
    attackRange: 3.5,
    speed: 4.6,
    vision: 15,
    reviveTime: 32,
  },
};

export const TRIBE_LIST: readonly TribeDefinition[] = Object.values(TRIBES);