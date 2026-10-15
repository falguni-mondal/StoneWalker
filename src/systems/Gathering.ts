/**
 * STONEWALKER — Resource Gathering, Drop-Off & Passive Loot Trickle System (Section 7)
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
  public static getWorkerCarryCapacity(factionState: FactionState): number {
    let cap = BALANCE.WORKER_CARRY_CAPACITY;
    for (const techId of factionState.researchedTechs) {
      const tech = TECHS[techId];
      if (tech && tech.effect.type === 'carry_capacity') {
        cap += tech.effect.value;
      }
    }
    return cap;
  }

  public static getFactionGatherSpeedMultiplier(
    factionState: FactionState,
    relicMultiplier: number = 1.0,
  ): number {
    let mult = 1.0;
    for (const techId of factionState.researchedTechs) {
      const tech = TECHS[techId];
      if (tech && tech.effect.type === 'gather_speed') {
        mult += tech.effect.value;
      }
    }
    return mult * relicMultiplier;
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

  public static updateWorkerGathering(
    worker: UnitEntity,
    factionState: FactionState,
    buildings: Iterable<BuildingEntity>,
    resources: ResourceManager,
    grid: WorldGrid,
    relicGatherMultiplier: number,
    dt: number,
  ): void {
    if (
      worker.role !== 'worker' ||
      worker.hp <= 0 ||
      worker.jobMemory.jobType !== 'gather'
    ) {
      return;
    }

    const carryCap = this.getWorkerCarryCapacity(factionState);

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
        if (worker.carryAmount > 0 && worker.carryResourceType) {
          const dropOff = this.findNearestDropOff(
            worker,
            worker.carryResourceType,
            buildings,
          );
          if (dropOff) {
            const dist = Math.hypot(
              dropOff.position.x - worker.position.x,
              dropOff.position.z - worker.position.z,
            );
            if (dist <= dropOff.footprint * 0.5 + 1.4) {
              const rType = worker.carryResourceType;
              factionState.resources[rType] = Math.min(
                factionState.storageCaps[rType],
                factionState.resources[rType] + worker.carryAmount,
              );
              worker.carryAmount = 0;
            } else if (worker.path.length === 0) {
              worker.path = Pathfinder.findPath(
                grid,
                worker.position,
                dropOff.position,
              );
            }
            return;
          }
        }
        worker.jobMemory.jobType = 'none';
        worker.status = 'idle';
        return;
      }
    }

    const distToNode = Math.hypot(
      node.position.x - worker.position.x,
      node.position.z - worker.position.z,
    );

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
        ? BALANCE.CAMP_PROXIMITY_GATHER_BONUS
        : 1.0;
      const speedMult =
        this.getFactionGatherSpeedMultiplier(
          factionState,
          relicGatherMultiplier,
        ) * campBonus;

      const amountToGather = Math.min(
        carryCap - worker.carryAmount,
        BALANCE.WORKER_GATHER_RATE_PER_SEC * speedMult * dt,
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
   * Automatically increases gathered resources little by little every second so that
   * even if all Workers die, the player can always afford to train new Workers or Army!
   * -> To change the loot values, edit `BALANCE.PASSIVE_LOOT_PER_SEC` in `src/data/balance.ts`
   *    or change `LOOT_SPEED_MULTIPLIER` right below!
   */
  public static updatePassiveBuildingYields(
    factionState: FactionState,
    buildings: Iterable<BuildingEntity>,
    dt: number,
  ): void {
    // 💰🎁 CHANGE THIS MULTIPLIER (e.g. 1.0, 2.5, 5.0) TO SCALE AUTOMATIC LOOT GAIN!
    const LOOT_SPEED_MULTIPLIER = 2.0;

    for (const bld of buildings) {
      if (
        bld.hp <= 0 ||
        !bld.isConstructed ||
        bld.faction !== factionState.faction
      ) {
        continue;
      }

      // 🏰 Council Walker Base provides steady automatic loot for all resources
      if (bld.buildingType === 'base') {
        const loot = BALANCE.PASSIVE_LOOT_PER_SEC;
        factionState.resources.food = Math.min(
          factionState.storageCaps.food,
          factionState.resources.food + loot.food * LOOT_SPEED_MULTIPLIER * dt,
        );
        factionState.resources.wood = Math.min(
          factionState.storageCaps.wood,
          factionState.resources.wood + loot.wood * LOOT_SPEED_MULTIPLIER * dt,
        );
        factionState.resources.stone = Math.min(
          factionState.storageCaps.stone,
          factionState.resources.stone +
            loot.stone * LOOT_SPEED_MULTIPLIER * dt,
        );
        factionState.resources.hide = Math.min(
          factionState.storageCaps.hide,
          factionState.resources.hide + loot.hide * LOOT_SPEED_MULTIPLIER * dt,
        );
        factionState.resources.bronze = Math.min(
          factionState.storageCaps.bronze,
          factionState.resources.bronze +
            loot.bronze * LOOT_SPEED_MULTIPLIER * dt,
        );
      }

      if (bld.mode !== 'stand') {
        continue;
      }

      // 🏕️ Resource Camps add extra passive income while planted in Stand Mode
      if (bld.buildingType === 'tannery') {
        factionState.resources.hide = Math.min(
          factionState.storageCaps.hide,
          factionState.resources.hide + 0.85 * bld.level * dt,
        );
      } else if (bld.buildingType === 'forager_camp') {
        factionState.resources.food = Math.min(
          factionState.storageCaps.food,
          factionState.resources.food + 0.9 * bld.level * dt,
        );
      } else if (bld.buildingType === 'woodcutter_camp') {
        factionState.resources.wood = Math.min(
          factionState.storageCaps.wood,
          factionState.resources.wood + 0.9 * bld.level * dt,
        );
      } else if (bld.buildingType === 'quarry') {
        factionState.resources.stone = Math.min(
          factionState.storageCaps.stone,
          factionState.resources.stone + 0.75 * bld.level * dt,
        );
      } else if (bld.buildingType === 'bronze_mine') {
        factionState.resources.bronze = Math.min(
          factionState.storageCaps.bronze,
          factionState.resources.bronze + 0.65 * bld.level * dt,
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