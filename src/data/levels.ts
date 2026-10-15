/**
 * STONEWALKER — 8 Campaign Levels & Skirmish Generator Presets (Section 11)
 * Maps range from 96x96 to 192x192 with distinct themes, objectives, and 3-star goals.
 */

import type { LevelDefinition, MapTheme, TribeId, WeatherType } from './types';

export const CAMPAIGN_LEVELS: readonly LevelDefinition[] = [
  {
    id: 1,
    name: 'Awakening of the Walker',
    subtitle: 'Green Valley — Learn the Ways of the Moving Camp',
    storyIntro:
      'Winter recedes from the emerald basin. Wake the Council Walker, gather timber and berries, raise a War Barracks, and march your fortress to the Eastern Sun Stone.',
    size: 96,
    seed: 10101,
    theme: 'green_valley',
    weatherDefault: 'clear',
    playerTribeDefault: 'stonebacks',
    enemyCount: 1,
    enemyDifficulty: 'easy',
    enemyNightAttacks: false,
    enemyBaseWalks: false,
    objectives: [
      {
        id: 'obj_move_base',
        description: 'Walk your Council Walker to the Sun Beacon (72, 72)',
        type: 'move_base_to_beacon',
        targetValue: 1,
        targetPosition: { x: 72, z: 72 },
      },
      {
        id: 'obj_destroy_outpost',
        description: 'Destroy the Raider Camp Walker',
        type: 'destroy_enemy_base',
        targetValue: 1,
      },
      {
        id: 'obj_bonus_gather',
        description: 'Bonus: Gather 600 Food before winning',
        type: 'gather_resources',
        targetValue: 600,
        isBonus: true,
      },
    ],
    twoStarTimeLimitSec: 420,
    twoStarMaxLosses: 8,
    threeStarBonusText: 'Gather at least 600 Food and lose 8 or fewer units.',
  },
  {
    id: 2,
    name: 'TheTimberland March',
    subtitle: 'Ancient Forest — Relocate Your Camp & Crush Barricades',
    storyIntro:
      'Starting groves deplete quickly in the deep woods. Use Relocate Camp to walk your buildings alongside the Council Walker, stomp through enemy palisades, and claim the heartwood.',
    size: 112,
    seed: 20202,
    theme: 'ancient_forest',
    weatherDefault: 'clear',
    playerTribeDefault: 'reef_clan',
    enemyCount: 1,
    enemyDifficulty: 'easy',
    enemyNightAttacks: false,
    enemyBaseWalks: false,
    objectives: [
      {
        id: 'obj_destroy_forest_enemy',
        description: 'Destroy the Timber-Stalker Base',
        type: 'destroy_enemy_base',
        targetValue: 1,
      },
      {
        id: 'obj_bonus_wood',
        description: 'Bonus: Harvest 900 Wood across the forest',
        type: 'gather_resources',
        targetValue: 900,
        isBonus: true,
      },
    ],
    twoStarTimeLimitSec: 480,
    twoStarMaxLosses: 10,
    threeStarBonusText: 'Harvest 900 Wood and finish within 8 minutes.',
  },
  {
    id: 3,
    name: 'Fords of Bone and Ironwood',
    subtitle: 'River Crossings — War Machines, Armory & Chieftain Hero',
    storyIntro:
      'Enemy sling towers guard the river shallows. Build a Machine Workshop for Bone Rams, upgrade your troops at the Armory, and lead your Chieftain Hero across the fords.',
    size: 128,
    seed: 30303,
    theme: 'river_crossings',
    weatherDefault: 'rain',
    playerTribeDefault: 'stonebacks',
    enemyCount: 1,
    enemyDifficulty: 'normal',
    enemyNightAttacks: false,
    enemyBaseWalks: false,
    objectives: [
      {
        id: 'obj_destroy_river_base',
        description: 'Destroy the River-Guard Council Walker',
        type: 'destroy_enemy_base',
        targetValue: 1,
      },
      {
        id: 'obj_bonus_stone',
        description: 'Bonus: Gather 800 Stone from river quarries',
        type: 'gather_resources',
        targetValue: 800,
        isBonus: true,
      },
    ],
    twoStarTimeLimitSec: 540,
    twoStarMaxLosses: 14,
    threeStarBonusText: 'Gather 800 Stone and win with 14 or fewer losses.',
  },
  {
    id: 4,
    name: 'Whispers in the Bog',
    subtitle: 'Misty Swamp — Spirit Totem, Powers & Night Alarms',
    storyIntro:
      'Thick mire slows heavy legs and hides nocturnal raiders. Erect a Spirit Totem and Lookouts, stock your Weapon Station for worker alarm defense, and call down Spirit Powers.',
    size: 128,
    seed: 40404,
    theme: 'misty_swamp',
    weatherDefault: 'fog',
    playerTribeDefault: 'reef_clan',
    enemyCount: 1,
    enemyDifficulty: 'normal',
    enemyNightAttacks: true,
    enemyBaseWalks: false,
    objectives: [
      {
        id: 'obj_survive_swamp',
        description: 'Survive for 5 minutes and destroy the Bog Tribe Base',
        type: 'destroy_enemy_base',
        targetValue: 1,
      },
      {
        id: 'obj_bonus_beacon',
        description: 'Bonus: Walk your Base to the Ancient Shrine (96, 36)',
        type: 'move_base_to_beacon',
        targetValue: 1,
        targetPosition: { x: 96, z: 36 },
        isBonus: true,
      },
    ],
    twoStarTimeLimitSec: 600,
    twoStarMaxLosses: 16,
    threeStarBonusText: 'Walk your Base to the Ancient Shrine before victorious.',
  },
  {
    id: 5,
    name: 'Anvil of the Sun Scorched',
    subtitle: 'Arid Desert — Bronze Smelting & Mammoth Fortress',
    storyIntro:
      'Rich bronze veins gleam in the canyon center. Smelt Bronze Ore, unlock Colossus Engineering, and construct a Mammoth Fortress that spawns autonomous Crawlers.',
    size: 144,
    seed: 50505,
    theme: 'arid_desert',
    weatherDefault: 'clear',
    playerTribeDefault: 'ember_tribe',
    enemyCount: 2,
    enemyDifficulty: 'normal',
    enemyNightAttacks: true,
    enemyBaseWalks: false,
    objectives: [
      {
        id: 'obj_destroy_desert_bases',
        description: 'Destroy both Dune Raider Bases',
        type: 'destroy_enemy_base',
        targetValue: 2,
      },
      {
        id: 'obj_bonus_bronze',
        description: 'Bonus: Smelt 500 Bronze Ore',
        type: 'gather_resources',
        targetValue: 500,
        isBonus: true,
      },
    ],
    twoStarTimeLimitSec: 660,
    twoStarMaxLosses: 20,
    threeStarBonusText: 'Smelt 500 Bronze Ore and win under 11 minutes.',
  },
  {
    id: 6,
    name: 'Clash of Walking Citadels',
    subtitle: 'Frost Peaks — Enemy Walking Base on the March',
    storyIntro:
      'Blizzards sweep the high pass as the Frost-Tusk Clan raises its legs and marches its own Council Walker straight toward your valley. Intercept their walking fortress before it crushes your camp!',
    size: 160,
    seed: 60606,
    theme: 'frost_peaks',
    weatherDefault: 'snow',
    playerTribeDefault: 'stonebacks',
    enemyCount: 2,
    enemyDifficulty: 'normal',
    enemyNightAttacks: true,
    enemyBaseWalks: true,
    objectives: [
      {
        id: 'obj_destroy_frost_walkers',
        description: 'Destroy both enemy Walking Bases',
        type: 'destroy_enemy_base',
        targetValue: 2,
      },
      {
        id: 'obj_bonus_losses',
        description: 'Bonus: Keep your Council Walker above 50% HP',
        type: 'survive_time',
        targetValue: 1,
        isBonus: true,
      },
    ],
    twoStarTimeLimitSec: 720,
    twoStarMaxLosses: 22,
    threeStarBonusText: 'Defeat both enemy walkers with fewer than 22 losses.',
  },
  {
    id: 7,
    name: 'Caldera of the Bronze Titan',
    subtitle: 'Volcanic Crag — Defeat the Boss Titan Walker',
    storyIntro:
      'In the ash-choked caldera, the Warlord’s foundry has awakened a Rogue Titan Walker guarded by two tribes. Forge Bronze Scale armor and shatter the colossus.',
    size: 176,
    seed: 70707,
    theme: 'volcanic_crag',
    weatherDefault: 'clear',
    playerTribeDefault: 'ember_tribe',
    enemyCount: 2,
    enemyDifficulty: 'hard',
    enemyNightAttacks: true,
    enemyBaseWalks: true,
    objectives: [
      {
        id: 'obj_defeat_boss_titan',
        description: 'Destroy the Enemy Bases and their Boss Titan Walker',
        type: 'destroy_enemy_base',
        targetValue: 2,
      },
      {
        id: 'obj_bonus_volcano_gather',
        description: 'Bonus: Gather 700 Bronze Ore from caldera veins',
        type: 'gather_resources',
        targetValue: 700,
        isBonus: true,
      },
    ],
    twoStarTimeLimitSec: 780,
    twoStarMaxLosses: 26,
    threeStarBonusText: 'Gather 700 Bronze Ore and triumph under 13 minutes.',
  },
  {
    id: 8,
    name: 'Sovereign of the High Plateau',
    subtitle: 'Titan Plateau — Grand Finale Against Three Rival Tribes',
    storyIntro:
      'All three rival War Walkers converge on the High Plateau. Command your mobile camp, tame great beasts, unleash Earthquakes and Titan Walkers, and unite the prehistoric world!',
    size: 192,
    seed: 80808,
    theme: 'titan_plateau',
    weatherDefault: 'clear',
    playerTribeDefault: 'stonebacks',
    enemyCount: 3,
    enemyDifficulty: 'hard',
    enemyNightAttacks: true,
    enemyBaseWalks: true,
    objectives: [
      {
        id: 'obj_destroy_all_three',
        description: 'Destroy all 3 rival Council Walkers',
        type: 'destroy_enemy_base',
        targetValue: 3,
      },
      {
        id: 'obj_bonus_summit',
        description: 'Bonus: Stand your Base atop the Center Monolith (96, 96)',
        type: 'move_base_to_beacon',
        targetValue: 1,
        targetPosition: { x: 96, z: 96 },
        isBonus: true,
      },
    ],
    twoStarTimeLimitSec: 900,
    twoStarMaxLosses: 32,
    threeStarBonusText: 'Claim the Center Monolith (96, 96) and defeat all 3 tribes.',
  },
];

export const SKIRMISH_MAP_SIZES = [96, 128, 160, 192] as const;

export function createSkirmishLevelDefinition(params: {
  size: number;
  seed: number;
  theme: MapTheme;
  weather: WeatherType;
  playerTribe: TribeId;
  enemyCount: 1 | 2 | 3;
  difficulty: 'easy' | 'normal' | 'hard';
}): LevelDefinition {
  return {
    id: 0,
    name: 'Skirmish Battle',
    subtitle: `${params.size}x${params.size} — ${params.enemyCount} AI (${params.difficulty.toUpperCase()})`,
    storyIntro:
      'Lead your Council Walker across uncharted lands and vanquish all rival tribes.',
    size: params.size,
    seed: params.seed,
    theme: params.theme,
    weatherDefault: params.weather,
    playerTribeDefault: params.playerTribe,
    enemyCount: params.enemyCount,
    enemyDifficulty: params.difficulty,
    enemyNightAttacks: params.difficulty !== 'easy',
    enemyBaseWalks: params.difficulty === 'hard',
    objectives: [
      {
        id: 'skirmish_destroy_all',
        description: `Destroy all ${params.enemyCount} enemy Council Walker(s)`,
        type: 'destroy_enemy_base',
        targetValue: params.enemyCount,
      },
    ],
    twoStarTimeLimitSec: 720,
    twoStarMaxLosses: 25,
    threeStarBonusText: 'Win under 12 minutes with 25 or fewer unit losses.',
  };
}