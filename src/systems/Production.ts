/**
 * STONEWALKER — Building Production Queues & Repeat Spawning (Sections 5, 6 & 8)
 * Every production building supports a queue up to 5 items, a REPEAT toggle,
 * and a rally point. Production pauses while the Base or building is in Move mode.
 */

import type { EventBus } from '../core/EventBus';
import { BALANCE } from '../data/balance';
import { WEAPON_STATION_ITEMS, WEAPON_STATION_STOCK_CAPS } from '../data/equipment';
import { TRIBES } from '../data/heroes';
import { MACHINES } from '../data/machines';
import { UNITS } from '../data/units';
import type {
  BuildingEntity,
  FactionState,
  MachineRole,
  UnitEntity,
  UnitRole,
  WeaponStationItemType,
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
    itemType: UnitRole | MachineRole | WeaponStationItemType,
    factionState: FactionState,
    bus: EventBus,
  ): boolean {
    if (!building.isConstructed) {
      return false;
    }
    if (building.queue.length >= BALANCE.PRODUCTION_QUEUE_MAX) {
      if (factionState.faction === 'player') {
        bus.emit('ui:toast', {
          message: 'Production queue is full (max 5).',
          level: 'warning',
        });
      }
      return false;
    }

    const { cost, trainTime, requiredTech } = this.getItemCostAndTime(
      itemType,
      factionState,
    );

    if (requiredTech && !factionState.researchedTechs.includes(requiredTech)) {
      if (factionState.faction === 'player') {
        bus.emit('ui:toast', {
          message: `Requires tech: ${requiredTech.replace('_', ' ')}`,
          level: 'warning',
        });
      }
      return false;
    }

    if (!ConstructionSystem.canAfford(factionState.resources, cost)) {
      if (factionState.faction === 'player') {
        bus.emit('ui:toast', {
          message: `Not enough resources to queue ${itemType.replace('_', ' ')}.`,
          level: 'warning',
        });
      }
      return false;
    }

    ConstructionSystem.spendResources(factionState.resources, cost);
    building.queue.push({
      itemType,
      progress: 0,
      totalTime: trainTime,
    });
    return true;
  }

  public static updateBuildings(
    buildings: Iterable<BuildingEntity>,
    factionById: ReadonlyMap<string, FactionState>,
    grid: WorldGrid,
    starvationMultiplier: number,
    bus: EventBus,
    dt: number,
    onSpawnUnit: (unit: UnitEntity) => void,
  ): void {
    for (const bld of buildings) {
      // Production pauses while a building or the Base is in Move mode (Sections 5 & 6)
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

      const current = bld.queue[0]!;
      current.progress += dt * starvationMultiplier;

      if (current.progress < current.totalTime) {
        continue;
      }

      const itemType = current.itemType;

      // Weapon Station physical weapon crafting
      if (
        bld.buildingType === 'weapon_station' &&
        (itemType === 'club' || itemType === 'spear' || itemType === 'sling')
      ) {
        const cap =
          WEAPON_STATION_STOCK_CAPS[bld.level - 1] ??
          WEAPON_STATION_STOCK_CAPS[0];
        const totalStock =
          bld.weaponStock.club + bld.weaponStock.spear + bld.weaponStock.sling;
        if (totalStock < cap) {
          bld.weaponStock[itemType] += 1;
          bld.queue.shift();
          if (bld.repeatQueue) {
            this.enqueueUnitOrItem(bld, itemType, factionState, bus);
          }
        }
        continue;
      }

      // Check population cap before completing unit/machine spawn
      const popNeeded = this.getItemPopCost(itemType);
      if (
        factionState.populationUsed + popNeeded >
        factionState.populationCap
      ) {
        // Hold at 100% until a Hut is built or population frees up
        current.progress = current.totalTime;
        continue;
      }

      bld.queue.shift();
      const spawnPos = {
        x: bld.position.x + bld.footprint * 0.5 + 0.8,
        z: bld.position.z + bld.footprint * 0.5 + 0.8,
      };

      let spawned: UnitEntity;
      if (itemType === 'worker') {
        spawned = createWorkerEntity({
          faction: bld.faction,
          position: spawnPos,
        });
      } else if (itemType in UNITS) {
        spawned = createSoldierEntity({
          role: itemType as Exclude<UnitRole, 'worker'>,
          faction: bld.faction,
          position: spawnPos,
          guardSpot: { ...bld.rallyPoint },
        });
      } else {
        spawned = createMachineEntity({
          role: itemType as MachineRole,
          faction: bld.faction,
          position: spawnPos,
          guardSpot: { ...bld.rallyPoint },
        });
      }

      spawned.path = Pathfinder.findPath(grid, spawnPos, bld.rallyPoint);
      onSpawnUnit(spawned);

      bus.emit('unit:spawned', {
        unitId: spawned.id,
        role: spawned.role,
        faction: spawned.faction,
      });

      if (bld.repeatQueue) {
        this.enqueueUnitOrItem(
          bld,
          itemType as UnitRole | MachineRole,
          factionState,
          bus,
        );
      }
    }
  }

  private static getItemPopCost(itemType: string): number {
    if (itemType in UNITS) {
      return UNITS[itemType as UnitRole].popCost;
    }
    if (itemType in MACHINES) {
      return MACHINES[itemType as MachineRole].popCost;
    }
    return 0;
  }

  private static getItemCostAndTime(
    itemType: string,
    factionState: FactionState,
  ): {
    cost: Partial<FactionState['resources']>;
    trainTime: number;
    requiredTech?: string;
  } {
    if (itemType === 'worker') {
      const def = UNITS.worker;
      const mult = TRIBES[factionState.tribe].bonuses.workerCostMultiplier;
      return {
        cost: { food: Math.round((def.cost.food ?? 50) * mult) },
        trainTime: def.trainTime,
      };
    }
    if (itemType in UNITS) {
      const def = UNITS[itemType as UnitRole];
      return {
        cost: def.cost,
        trainTime: def.trainTime,
        requiredTech: def.requiredTech,
      };
    }
    if (itemType in MACHINES) {
      const def = MACHINES[itemType as MachineRole];
      return {
        cost: def.cost,
        trainTime: def.trainTime,
        requiredTech: def.requiredTech,
      };
    }
    const wDef =
      WEAPON_STATION_ITEMS[itemType as WeaponStationItemType] ??
      WEAPON_STATION_ITEMS.club;
    return {
      cost: wDef.cost,
      trainTime: wDef.craftTimeSec,
    };
  }
}