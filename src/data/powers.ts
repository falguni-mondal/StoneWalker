/**
 * STONEWALKER — Spirit Powers (Section 8B)
 * Cast anywhere on the map on a cooldown (zero resource cost), unlocked via Spirit Totem & Tech.
 */

import type { SpiritPowerDefinition, SpiritPowerId } from './types';

export const SPIRIT_POWERS: Record<SpiritPowerId, SpiritPowerDefinition> = {
  healing_rain: {
    id: 'healing_rain',
    name: 'Healing Rain',
    description:
      'Summons a warm ancestral shower that restores 140 HP over 6 seconds to all friendly units in the circle.',
    cooldown: 45,
    radius: 8.5,
    duration: 6,
    value: 140, // Total HP restored over duration
  },
  rally_roar: {
    id: 'rally_roar',
    name: 'Rally Roar',
    description:
      'Inspires friendly troops and machines in the target circle with +35% movement speed and +30% damage for 10 seconds.',
    cooldown: 55,
    radius: 9.5,
    duration: 10,
    value: 0.35, // Speed & damage buff ratio
    requiredTech: 'totem_awakening',
  },
  fire_rain: {
    id: 'fire_rain',
    name: 'Fire Rain',
    description:
      'Calls down burning volcanic meteors that deal 180 fire damage across the target area and ignite enemy buildings.',
    cooldown: 70,
    radius: 7.5,
    duration: 3,
    value: 180,
    requiredTech: 'sky_fire_ritual',
  },
  earthquake: {
    id: 'earthquake',
    name: 'Earthquake',
    description:
      'Splits the ground beneath enemy buildings and walkers, dealing 280 siege damage and slowing units by 50% for 8 seconds.',
    cooldown: 90,
    radius: 10.0,
    duration: 8,
    value: 280,
    requiredTech: 'bronze_sovereign_frame',
  },
};

export const SPIRIT_POWER_LIST: readonly SpiritPowerDefinition[] =
  Object.values(SPIRIT_POWERS);