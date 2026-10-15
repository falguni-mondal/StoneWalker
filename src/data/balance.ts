/**
 * STONEWALKER — Central Balance & Gameplay Tuning Constants
 * Every gameplay number lives here with reasoning comments. No magic numbers in systems.
 */

import type { ArmorType, DamageType, Resources } from './types';

export const BALANCE = {
  // ============================================================================
  // 💰🎁 PASSIVE LOOT / AUTOMATIC RESOURCE TRICKLE (PER SECOND)
  // Change these numbers to increase or decrease how fast your tribe gains
  // free resources automatically (ensures you can always train Workers/Army
  // even if all your Workers die!).
  // ============================================================================
  PASSIVE_LOOT_PER_SEC: {
    food: 0.5,    // 🍖 Free Food gained per second
    wood: 0.5,    // 🪵 Free Wood gained per second
    stone: 0.5,   // 🪨 Free Stone gained per second
    hide: 0.5,    // 🦌 Free Hide gained per second
    bronze: 0.0,  // 🔶 Free Bronze Ore gained per second
  } satisfies Resources,

  // ============================================================================
  // 💚✨ OUT-OF-COMBAT AUTO-HEAL (5-SECOND RULE)
  // If any Worker, Troop, Machine, Hero, or Building does not take damage for
  // 5 seconds, it automatically regenerates HP every second.
  // ============================================================================
  OUT_OF_COMBAT_HEAL_DELAY_SECONDS: 5.0,
  UNIT_AUTO_HEAL_HP_PER_SEC: 10.0,     // 💚 HP/sec restored to Workers, Troops, Machines & Heroes
  BUILDING_AUTO_HEAL_HP_PER_SEC: 28.0, // 🏰 HP/sec restored to Buildings & Walking Base

  // --- Day / Night & Weather ---
  /** Default 4 real-time minutes (240 seconds) for a full 24-hour cycle. */
  DAY_NIGHT_CYCLE_SECONDS: 240,
  /** Night begins at 0.70 and ends at 0.20 of normalized cycle time. */
  NIGHT_START_NORMALIZED: 0.7,
  NIGHT_END_NORMALIZED: 0.2,
  /** Unit vision is reduced by 40% at night per design spec (Section 4). */
  NIGHT_VISION_MULTIPLIER: 0.6,
  /** Buildings and the Base emit warm firelight at night that reveals 6 tiles around them. */
  NIGHT_BUILDING_FIRELIGHT_RADIUS: 6,
  /** Rain dampens fire weapons by 35%. */
  WEATHER_RAIN_FIRE_DAMAGE_MULTIPLIER: 0.65,
  /** Fog reduces unit vision by an additional 25%. */
  WEATHER_FOG_VISION_MULTIPLIER: 0.75,
  /** Snow slows ground movement by 15%. */
  WEATHER_SNOW_SPEED_MULTIPLIER: 0.85,

  // --- The Walking Base ("Council Walker") ---
  /** Base firepower is reduced to 60% while walking in Move mode (Section 5). */
  BASE_MOVE_FIREPOWER_MULTIPLIER: 0.6,
  /** Base takes 25% more damage while walking due to exposed leg joints. */
  BASE_MOVE_ARMOR_MULTIPLIER: 0.75,
  /** Stomp crush damage per tick to enemy walls and light buildings in the Base's footprint. */
  BASE_STOMP_BUILDING_DAMAGE_PER_SEC: 220,
  /** Max HP threshold for small enemy units instantaneously crushed under the Base's feet. */
  BASE_STOMP_UNIT_MAX_HP_THRESHOLD: 110,
  /** Wood granted when the Base crushes a tree into a resource pickup. */
  BASE_STOMP_TREE_WOOD_YIELD: 25,
  /** Friendly push-aside impulse speed so friendly units are never harmed by Base stomping. */
  BASE_FRIENDLY_PUSH_SPEED: 8.0,

  // --- Buildings ---
  /** Moving buildings have reduced structural integrity (70% effective max HP). */
  BUILDING_MOVE_HP_MULTIPLIER: 0.7,
  /** Max items in any production building's queue (Section 6). */
  PRODUCTION_QUEUE_MAX: 5,
  /** Fire damage per second applied to burning structures. */
  BUILDING_FIRE_DOT_PER_SEC: 12,
  /** Default duration a structure burns when hit by fire weapons. */
  BUILDING_FIRE_DURATION_SEC: 6,

  // --- Economy & Resources ---
  /** Starting resources for standard campaign/skirmish play. */
  STARTING_RESOURCES: {
    food: 300,
    wood: 300,
    stone: 200,
    hide: 100,
    bronze: 50,
  } satisfies Resources,
  /** Max resource storage capacity set to 10,000 per resource. */
  BASE_STORAGE_CAP: {
    food: 10000,
    wood: 10000,
    stone: 10000,
    hide: 10000,
    bronze: 10000,
  } satisfies Resources,
  /** Storage capacity added by each Storage Pit. */
  STORAGE_PIT_BONUS: {
    food: 2500,
    wood: 2500,
    stone: 2500,
    hide: 2500,
    bronze: 2500,
  } satisfies Resources,
  /** Maximum resource units a Worker can carry before returning to a drop-off (Section 7). */
  WORKER_CARRY_CAPACITY: 10,
  /** Base resource units harvested per second by a Worker. */
  WORKER_GATHER_RATE_PER_SEC: 2.5,
  /** Bonus gather rate multiplier when working within 10 tiles of a matching camp (Woodcutter/Quarry/Forager). */
  CAMP_PROXIMITY_GATHER_BONUS: 1.35,
  CAMP_PROXIMITY_RADIUS: 10,
  /** Production speed multiplier when Food hits zero due to troop upkeep (Section 7). */
  STARVATION_PRODUCTION_SPEED_MULTIPLIER: 0.45,

  // --- Smart Unit Behavior (Section 9) ---
  /** Exact 15-second idle timeout before autonomous Worker/Soldier/Machine behavior kicks in (Section 9A). */
  UNIT_IDLE_TIMEOUT_SECONDS: 15,
  /** Distance (in tiles) within which a unit considers the friendly Base to be "nearby". */
  HOME_BASE_RADIUS_TILES: 24,
  /** Ring distance around the Base where returning soldiers/machines spread out to guard. */
  BASE_GUARD_RING_RADIUS_TILES: 9,
  /** Alarm radius around the Base when attacked (Section 9B). */
  BASE_ALARM_RADIUS_TILES: 28,
  /** Alarm radius around any standard building when attacked. */
  BUILDING_ALARM_RADIUS_TILES: 18,
  /** Seconds without enemies in the alarm zone before the alarm clears and workers return weapons. */
  ALARM_CLEAR_DELAY_SECONDS: 5,
  /** Fallback stone-throwing stats when an alarmed Worker finds 0 weapons at the Weapon Station. */
  WORKER_STONE_THROW_DAMAGE: 4,
  WORKER_STONE_THROW_RANGE: 4.5,
  WORKER_STONE_THROW_COOLDOWN: 1.4,
  /** Bonus stats granted to a Worker equipping a Weapon Station item during an alarm. */
  EMERGENCY_WEAPON_STATS: {
    club: { damage: 13, range: 1.6, cooldown: 1.0, damageType: 'melee' as DamageType },
    spear: { damage: 16, range: 2.1, cooldown: 1.1, damageType: 'pierce' as DamageType },
    sling: { damage: 12, range: 6.5, cooldown: 1.2, damageType: 'pierce' as DamageType },
  },

  // --- Top-Tier Machine Crawler Spawner (Section 8) ---
  /** Top-tier machines spawn 1 free Crawler every 30 seconds. */
  CRAWLER_SPAWN_INTERVAL_SECONDS: 30,
  /** Strict cap of 8 living Crawlers per parent top-tier machine. */
  CRAWLER_MAX_PER_PARENT: 8,

  // --- Veterancy (Section 8B) ---
  /** Kills required for Rank 1, Rank 2, and Rank 3 veterancy chevrons. */
  VETERANCY_KILL_THRESHOLDS: [3, 7, 14] as const,
  /** Damage & HP multiplier per veterancy rank (+10%, +20%, +35%). */
  VETERANCY_STAT_MULTIPLIERS: [1.0, 1.1, 1.2, 1.35] as const,

  // --- Armory Tier Multipliers ---
  WEAPON_TIER_DAMAGE_MULTIPLIERS: [1.0, 1.2, 1.45, 1.75] as const,
  ARMOR_TIER_BONUS_VALUES: [0, 3, 6, 10] as const,

  // --- Terrain Tactics (Section 10) ---
  /** High ground grants ranged units +20% range and +20% damage. */
  HIGH_GROUND_RANGE_MULTIPLIER: 1.2,
  HIGH_GROUND_DAMAGE_MULTIPLIER: 1.2,
  /** Units inside a forest tile are hidden from enemies further than 3.5 tiles away. */
  FOREST_STEALTH_REVEAL_DISTANCE: 3.5,
  /** Swamp reduces movement speed to 65%. */
  SWAMP_SPEED_MULTIPLIER: 0.65,

  // --- Damage vs Armor Counter Matrix ---
  DAMAGE_COUNTER_MATRIX: {
    melee: {
      unarmored: 1.25,
      light: 1.0,
      heavy: 0.75,
      structure: 0.6,
      hero: 0.85,
    },
    pierce: {
      unarmored: 1.35,
      light: 1.15,
      heavy: 0.65,
      structure: 0.35,
      hero: 0.8,
    },
    siege: {
      unarmored: 0.7,
      light: 0.85,
      heavy: 1.1,
      structure: 1.75,
      hero: 0.9,
    },
    fire: {
      unarmored: 1.3,
      light: 1.2,
      heavy: 0.9,
      structure: 1.5,
      hero: 0.9,
    },
    stomp: {
      unarmored: 2.0,
      light: 2.0,
      heavy: 1.2,
      structure: 2.0,
      hero: 0.5,
    },
  } satisfies Record<DamageType, Record<ArmorType, number>>,

  // --- Enemy AI Difficulty & Watchdog (Section 12) ---
  AI_WATCHDOG_TIMEOUT_SECONDS: 60,
  AI_DIFFICULTY: {
    easy: {
      decisionIntervalSec: 4.0,
      attackIntervalSec: 110,
      targetArmySize: 8,
      gatherMultiplier: 1.0,
    },
    normal: {
      decisionIntervalSec: 2.5,
      attackIntervalSec: 75,
      targetArmySize: 14,
      gatherMultiplier: 1.0,
    },
    hard: {
      decisionIntervalSec: 1.5,
      attackIntervalSec: 52,
      targetArmySize: 22,
      gatherMultiplier: 1.2,
    },
  },
} as const;