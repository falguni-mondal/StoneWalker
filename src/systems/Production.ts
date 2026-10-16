/**
 * STONEWALKER — Unit & War Machine Production Queue System (Sections 6 & 8)
 * - Guarantees that any unit or top-tier War Machine reaching 100% progress in the queue
 *   immediately spawns into the world (never stalling at 100% due to tight camp footprints
 *   or population rounding).
 */

import type { EventBus } from '../core/EventBus';
import { BALANCE } from '../data/balance';
import { BUILDINGS } from '../data/buildings';
import { TRIBES } from '../data/heroes';
import { MACHINES } from '../data/machines';
import { UNITS } from '../data/units';
import type {
  BuildingEntity,
  FactionState,
  MachineRole,
  Resources,
  UnitEntity,
  UnitRole,
  Vec2,
} from '../data/types';
import { createMachineEntity } from '../entities/Machine';
import { createSoldierEntity } from '../entities/Soldier';
import { createWorkerEntity } from '../entities/Worker';
import type { WorldGrid } from '../world/Grid';
import { ConstructionSystem } from './Construction';
import { Pathfinder } from './Pathfinding';

export class ProductionSystem {
  public static enqueueUnitOrItem(
    building: BuildingEntity,
    itemType: UnitRole | MachineRole,
    factionState: FactionState,
    bus: EventBus,
  ): boolean {
    if (!building.isConstructed || building.hp <= 0) {
      return false;
    }

    if (building.queue.length >= BALANCE.PRODUCTION_QUEUE_MAX) {
      if (factionState.faction === 'player') {
        bus.emit('ui:toast', {
          message: `Production queue full (max ${BALANCE.PRODUCTION_QUEUE_MAX}).`,
          level: 'warning',
        });
      }
      return false;
    }

    const isUnit = itemType in UNITS;
    const def = isUnit
      ? UNITS[itemType as UnitRole]
      : MACHINES[itemType as MachineRole];
    if (!def) {
      return false;
    }

    if (
      def.requiredTech &&
      !factionState.researchedTechs.includes(def.requiredTech)
    ) {
      if (factionState.faction === 'player') {
        bus.emit('ui:toast', {
          message: `Locked — Upgrade this building or research ${def.requiredTech.replace(/_/g, ' ')} in the Lab!`,
          level: 'warning',
        });
      }
      return false;
    }

    // Apply tribe discount for Workers if applicable
    const effectiveCost: Partial<Resources> = { ...def.cost };
    if (itemType === 'worker') {
      const mult = TRIBES[factionState.tribe].bonuses.workerCostMultiplier;
      if (effectiveCost.food) {
        effectiveCost.food = Math.round(effectiveCost.food * mult);
      }
    }

    if (!ConstructionSystem.canAfford(factionState.resources, effectiveCost)) {
      if (factionState.faction === 'player') {
        bus.emit('ui:toast', {
          message: `Not enough resources to train ${def.name}.`,
          level: 'warning',
        });
      }
      return false;
    }

    ConstructionSystem.spendResources(factionState.resources, effectiveCost);

    // Training speed bonus for higher-level production buildings (+15% faster per building level above 1)
    const levelSpeedBonus = 1 + (building.level - 1) * 0.15;
    const adjustedTrainTime = Math.max(
      3,
      Math.round(def.trainTime / levelSpeedBonus),
    );

    building.queue.push({
      itemType,
      progress: 0,
      totalTime: adjustedTrainTime,
    });

    return true;
  }

  public static updateBuildings(
    buildings: Iterable<BuildingEntity>,
    factionById: ReadonlyMap<string, FactionState>,
    grid: WorldGrid,
    globalSpeedMultiplier: number,
    bus: EventBus,
    dt: number,
    onSpawnUnit: (unit: UnitEntity) => void,
  ): void {
    for (const bld of buildings) {
      if (
        bld.hp <= 0 ||
        !bld.isConstructed ||
        bld.mode !== 'stand' ||
        bld.queue.length === 0
      ) {
        continue;
      }

      const factionState = factionById.get(bld.faction);
      if (!factionState) {
        continue;
      }

      const head = bld.queue[0]!;
      head.progress += dt * globalSpeedMultiplier;

      if (head.progress < head.totalTime) {
        continue;
      }

      // Item has reached 100% — dequeue and spawn immediately into the world!
      bld.queue.shift();

      const role = head.itemType as UnitRole | MachineRole;
      const isUnit = role in UNITS;
      const isMachine = role in MACHINES;

      if (!isUnit && !isMachine) {
        continue;
      }

      const spawnPos = this.findGuaranteedSpawnPosition(bld, grid);

      let spawned: UnitEntity;
      if (role === 'worker') {
        spawned = createWorkerEntity({
          faction: bld.faction,
          position: spawnPos,
        });
      } else if (isUnit) {
        spawned = createSoldierEntity({
          role: role as Exclude<UnitRole, 'worker'>,
          faction: bld.faction,
          position: spawnPos,
        });
      } else {
        spawned = createMachineEntity({
          role: role as MachineRole,
          faction: bld.faction,
          position: spawnPos,
        });
      }

      // Ensure population tracking stays consistent even when spawning large machines
      const popCost = isUnit
        ? UNITS[role as UnitRole].popCost
        : MACHINES[role as MachineRole].popCost;
      factionState.populationUsed += popCost;
      if (factionState.populationUsed > factionState.populationCap) {
        factionState.populationCap = factionState.populationUsed;
      }

      // Walk the newly spawned unit or machine toward the building's rally point
      if (bld.rallyPoint && role !== 'worker') {
        const rallyDist = Math.hypot(
          bld.rallyPoint.x - spawnPos.x,
          bld.rallyPoint.z - spawnPos.z,
        );
        if (rallyDist > 1.2) {
          const path = Pathfinder.findPath(grid, spawnPos, bld.rallyPoint, {
            footprint: 1,
            ignoreEntityId: bld.id,
          });
          spawned.path = path.length > 0 ? path : [{ ...bld.rallyPoint }];
        }
      }

      onSpawnUnit(spawned);

      bus.emit('unit:spawned', {
        unitId: spawned.id,
        role: spawned.role,
        faction: spawned.faction,
      });

      if (bld.faction === 'player') {
        const unitName = isUnit
          ? UNITS[role as UnitRole].name
          : MACHINES[role as MachineRole].name;
        bus.emit('ui:toast', {
          message: `${isMachine ? '⚙️' : '⚔️'} ${unitName} deployed from ${BUILDINGS[bld.buildingType].name}!`,
          level: 'success',
          jumpTo: spawnPos,
        });
      }

      // If Repeat Queue is active and the player can afford another, re-enqueue automatically
      if (bld.repeatQueue) {
        this.enqueueUnitOrItem(bld, role, factionState, bus);
      }
    }
  }

  /**
   * Searches outward around the building's perimeter for a walkable tile.
   * Always returns a valid world coordinate so large war machines never get stuck at 100%.
   */
  private static findGuaranteedSpawnPosition(
    bld: BuildingEntity,
    grid: WorldGrid,
  ): Vec2 {
    const minX = bld.tile.tx;
    const minZ = bld.tile.tz;
    const fp = bld.footprint;

    // Expand in rings from 1 tile outside the building up to 10 tiles out
    for (let ring = 1; ring <= 10; ring++) {
      for (let dz = -ring; dz < fp + ring; dz++) {
        for (let dx = -ring; dx < fp + ring; dx++) {
          const isPerimeter =
            dx === -ring ||
            dx === fp + ring - 1 ||
            dz === -ring ||
            dz === fp + ring - 1;
          if (!isPerimeter) continue;

          const tx = minX + dx;
          const tz = minZ + dz;
          if (grid.canPlaceBuilding(tx, tz, 1)) {
            return { x: tx + 0.5, z: tz + 0.5 };
          }
        }
      }
    }

    // Ultimate fallback: place right next to the building's south-east corner within map bounds
    const clamp = (v: number) => Math.max(2, Math.min(grid.size - 3, v));
    return {
      x: clamp(bld.position.x + fp * 0.5 + 1.5),
      z: clamp(bld.position.z + fp * 0.5 + 1.5),
    };
  }
}