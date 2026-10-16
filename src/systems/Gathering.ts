/**
 * ============================================================================
 * ⛏️🌾 STONEWALKER — RESOURCE GATHERING & PASSIVE LOOT SYSTEM
 * ============================================================================
 * How Player vs. Enemy Gathering Works:
 * 1. 🛡️ PLAYER uses `BALANCE.PLAYER_ECONOMY` at 100% full strength.
 * 2. 👹 ENEMY AI uses `BALANCE.ENEMY_ECONOMY` scaled by `BALANCE.AI_DIFFICULTY[difficulty].gatherMultiplier`:
 *      - Easy:   0.75x Enemy Gather Speed & Passive Loot
 *      - Normal: 1.00x Enemy Gather Speed & Passive Loot (Matches your ENEMY_ECONOMY numbers)
 *      - Hard:   1.25x Enemy Gather Speed & Passive Loot
 * ============================================================================
 */

import { BALANCE } from '../data/balance';
import { BUILDINGS } from '../data/buildings';
import { TECHS } from '../data/techs';
import type {
  BuildingEntity,
  FactionState,
  ResourceType,
  UnitEntity,
} from '../data/types';
import type { WorldGrid } from '../world/Grid';
import type { ResourceManager } from '../world/Resources';
import { Pathfinder } from './Pathfinding';

export class GatheringSystem {
  /**
   * Returns `PLAYER_ECONOMY` for the player or `ENEMY_ECONOMY` for AI factions.
   */
  private static getEconomyConfig(factionState: FactionState) {
    return factionState.faction === 'player'
      ? BALANCE.PLAYER_ECONOMY
      : BALANCE.ENEMY_ECONOMY;
  }

  /**
   * 🎒 Calculates how many resources a Worker can carry before returning to a drop-off.
   * Controlled by `WORKER_CARRY_CAPACITY` in `balance.ts` + researched basket/harness techs.
   */
  public static getWorkerCarryCapacity(factionState: FactionState): number {
    const econ = this.getEconomyConfig(factionState);
    let cap = econ.WORKER_CARRY_CAPACITY;
    for (const techId of factionState.researchedTechs) {
      const tech = TECHS[techId];
      if (tech && tech.effect.type === 'carry_capacity') {
        cap += tech.effect.value;
      }
    }
    return cap;
  }

  /**
   * ⚡ Calculates the Worker harvest speed multiplier from researched techs, relics,
   * and (for enemies) the active AI difficulty multiplier passed via `externalMultiplier`.
   */
  public static getFactionGatherSpeedMultiplier(
    factionState: FactionState,
    externalMultiplier: number = 1.0,
  ): number {
    let techMult = 1.0;
    for (const techId of factionState.researchedTechs) {
      const tech = TECHS[techId];
      if (tech && tech.effect.type === 'gather_speed') {
        techMult += tech.effect.value;
      }
    }
    return techMult * externalMultiplier;
  }

  public static findNearestDropOff(
    worker: UnitEntity,
    resourceType: ResourceType,
    buildings: Iterable<BuildingEntity>,
  ): BuildingEntity | null {
    let best: BuildingEntity | null = null;
    let bestDistSq = Infinity;

    for (const bld of buildings) {
      if (
        bld.hp <= 0 ||
        !bld.isConstructed ||
        bld.mode !== 'stand' ||
        bld.faction !== worker.faction
      ) {
        continue;
      }
      const def = BUILDINGS[bld.buildingType];
      if (!def.isResourceDropOff?.includes(resourceType)) {
        continue;
      }
      const dx = bld.position.x - worker.position.x;
      const dz = bld.position.z - worker.position.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = bld;
      }
    }
    return best;
  }

  /**
   * ⛏️ Runs every simulation tick for each Worker assigned to gather resources.
   * - Uses `PLAYER_ECONOMY.WORKER_GATHER_RATE_PER_SEC` (2.6/s) for Player Workers.
   * - Uses `ENEMY_ECONOMY.WORKER_GATHER_RATE_PER_SEC` (2.3/s) * Difficulty Multiplier for Enemy Workers.
   */
  public static updateWorkerGathering(
    worker: UnitEntity,
    factionState: FactionState,
    buildings: Iterable<BuildingEntity>,
    resources: ResourceManager,
    grid: WorldGrid,
    externalGatherMultiplier: number,
    dt: number,
  ): void {
    if (
      worker.role !== 'worker' ||
      worker.hp <= 0 ||
      worker.jobMemory.jobType !== 'gather'
    ) {
      return;
    }

    const econ = this.getEconomyConfig(factionState);
    const carryCap = this.getWorkerCarryCapacity(factionState);

    // 1. Backpack is full -> Walk to nearest Drop-Off Building and deposit resources
    if (worker.carryAmount >= carryCap && worker.carryResourceType) {
      const dropOff = this.findNearestDropOff(
        worker,
        worker.carryResourceType,
        buildings,
      );
      if (!dropOff) {
        return;
      }
      const dist = Math.hypot(
        dropOff.position.x - worker.position.x,
        dropOff.position.z - worker.position.z,
      );
      const reachDist = dropOff.footprint * 0.5 + 1.4;

      if (dist <= reachDist) {
        const rType = worker.carryResourceType;
        factionState.resources[rType] = Math.min(
          factionState.storageCaps[rType],
          factionState.resources[rType] + worker.carryAmount,
        );
        worker.carryAmount = 0;
        worker.path = [];
      } else if (worker.path.length === 0) {
        worker.status = 'working';
        worker.path = Pathfinder.findPath(
          grid,
          worker.position,
          dropOff.position,
        );
      }
      return;
    }

    // 2. Locate target Resource Node (or find nearest replacement of the same type)
    let node = worker.jobMemory.targetEntityId
      ? resources.getNode(worker.jobMemory.targetEntityId)
      : undefined;

    if (!node || node.amountRemaining <= 0) {
      const desiredType = worker.jobMemory.resourceType ?? 'wood';
      const replacement = resources.findNearestNode(
        worker.position,
        desiredType,
        45,
      );
      if (replacement) {
        node = replacement;
        worker.jobMemory.targetEntityId = replacement.id;
        worker.jobMemory.targetPosition = { ...replacement.position };
        worker.targetEntityId = replacement.id;
      } else {
        worker.jobMemory.jobType = 'none';
        worker.status = 'idle';
        return;
      }
    }

    const distToNode = Math.hypot(
      node.position.x - worker.position.x,
      node.position.z - worker.position.z,
    );

    // 3. Harvest from the Node
    if (distToNode <= 1.85) {
      worker.path = [];
      worker.status = 'working';
      worker.idleTimer = 0;

      if (
        worker.carryResourceType &&
        worker.carryResourceType !== node.resourceType
      ) {
        worker.carryAmount = 0;
      }
      worker.carryResourceType = node.resourceType;

      const campBonus = this.hasNearbyMatchingCamp(
        worker,
        node.resourceType,
        buildings,
      )
        ? econ.CAMP_PROXIMITY_GATHER_BONUS
        : 1.0;

      const speedMult =
        this.getFactionGatherSpeedMultiplier(
          factionState,
          externalGatherMultiplier,
        ) * campBonus;

      const amountToGather = Math.min(
        carryCap - worker.carryAmount,
        econ.WORKER_GATHER_RATE_PER_SEC * speedMult * dt,
      );
      const res = resources.harvestFromNode(node.id, amountToGather, grid);
      worker.carryAmount += res.harvested;
    } else if (worker.path.length === 0) {
      worker.status = 'working';
      worker.path = Pathfinder.findPath(grid, worker.position, node.position);
    }
  }

  /**
   * 💰🎁 PASSIVE LOOT & CAMP YIELD GENERATION
   * - For the Player: Uses `BALANCE.PLAYER_ECONOMY.PASSIVE_LOOT_PER_SEC` and `CAMP_PASSIVE_YIELD_MULTIPLIER`.
   * - For Enemy AI: Uses `BALANCE.ENEMY_ECONOMY.PASSIVE_LOOT_PER_SEC` and `CAMP_PASSIVE_YIELD_MULTIPLIER`,
   *   automatically multiplied by `BALANCE.AI_DIFFICULTY[aiDifficulty].gatherMultiplier`!
   */
  public static updatePassiveBuildingYields(
    factionState: FactionState,
    buildings: Iterable<BuildingEntity>,
    dt: number,
    aiDifficulty: 'easy' | 'normal' | 'hard' = 'normal',
  ): void {
    const isPlayer = factionState.faction === 'player';
    const econ = this.getEconomyConfig(factionState);

    // 🎚️ Scale Enemy passive income by Difficulty (Easy = 0.75x, Normal = 1.0x, Hard = 1.25x)
    const difficultyScale = isPlayer
      ? 1.0
      : BALANCE.AI_DIFFICULTY[aiDifficulty].gatherMultiplier;

    const loot = econ.PASSIVE_LOOT_PER_SEC;
    const campMult = econ.CAMP_PASSIVE_YIELD_MULTIPLIER * difficultyScale;

    for (const bld of buildings) {
      if (
        bld.hp <= 0 ||
        !bld.isConstructed ||
        bld.faction !== factionState.faction
      ) {
        continue;
      }

      // 🏰 Council Walker Base passive resource trickle
      if (bld.buildingType === 'base') {
        factionState.resources.food = Math.min(
          factionState.storageCaps.food,
          factionState.resources.food + loot.food * difficultyScale * dt,
        );
        factionState.resources.wood = Math.min(
          factionState.storageCaps.wood,
          factionState.resources.wood + loot.wood * difficultyScale * dt,
        );
        factionState.resources.stone = Math.min(
          factionState.storageCaps.stone,
          factionState.resources.stone + loot.stone * difficultyScale * dt,
        );
        factionState.resources.hide = Math.min(
          factionState.storageCaps.hide,
          factionState.resources.hide + loot.hide * difficultyScale * dt,
        );
        factionState.resources.bronze = Math.min(
          factionState.storageCaps.bronze,
          factionState.resources.bronze + loot.bronze * difficultyScale * dt,
        );
      }

      if (bld.mode !== 'stand') {
        continue;
      }

      // 🏕️ Planted Camp passive resource income (scales with Building Level 1..3)
      if (bld.buildingType === 'tannery') {
        factionState.resources.hide = Math.min(
          factionState.storageCaps.hide,
          factionState.resources.hide + 0.85 * bld.level * campMult * dt,
        );
      } else if (bld.buildingType === 'forager_camp') {
        factionState.resources.food = Math.min(
          factionState.storageCaps.food,
          factionState.resources.food + 0.9 * bld.level * campMult * dt,
        );
      } else if (bld.buildingType === 'woodcutter_camp') {
        factionState.resources.wood = Math.min(
          factionState.storageCaps.wood,
          factionState.resources.wood + 0.9 * bld.level * campMult * dt,
        );
      } else if (bld.buildingType === 'quarry') {
        factionState.resources.stone = Math.min(
          factionState.storageCaps.stone,
          factionState.resources.stone + 0.75 * bld.level * campMult * dt,
        );
      } else if (bld.buildingType === 'bronze_mine') {
        factionState.resources.bronze = Math.min(
          factionState.storageCaps.bronze,
          factionState.resources.bronze + 0.65 * bld.level * campMult * dt,
        );
      }
    }
  }

  private static hasNearbyMatchingCamp(
    worker: UnitEntity,
    resourceType: ResourceType,
    buildings: Iterable<BuildingEntity>,
  ): boolean {
    const rSq =
      BALANCE.CAMP_PROXIMITY_RADIUS * BALANCE.CAMP_PROXIMITY_RADIUS;
    for (const bld of buildings) {
      if (
        bld.hp <= 0 ||
        !bld.isConstructed ||
        bld.mode !== 'stand' ||
        bld.faction !== worker.faction
      ) {
        continue;
      }
      const matches =
        (resourceType === 'wood' && bld.buildingType === 'woodcutter_camp') ||
        (resourceType === 'stone' && bld.buildingType === 'quarry') ||
        (resourceType === 'food' && bld.buildingType === 'forager_camp') ||
        (resourceType === 'bronze' && bld.buildingType === 'bronze_mine');
      if (!matches) {
        continue;
      }
      const dx = bld.position.x - worker.position.x;
      const dz = bld.position.z - worker.position.z;
      if (dx * dx + dz * dz <= rSq) {
        return true;
      }
    }
    return false;
  }
}