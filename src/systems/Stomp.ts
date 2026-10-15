/**
 * STONEWALKER — Walking Base Stomp System (Section 5)
 * While the Council Walker is walking in Move mode:
 * - Crushes trees in its 4x4 footprint into wood pickups / faction wood
 * - Flattens enemy walls or light buildings in its way
 * - Kills small enemy units (worker-size and below, maxHp <= 110) under its feet
 * - Friendly units are pushed aside by MovementSystem and NEVER hurt.
 */

import type { EventBus } from '../core/EventBus';
import { BALANCE } from '../data/balance';
import type {
  BuildingEntity,
  FactionState,
  UnitEntity,
} from '../data/types';
import type { WorldGrid } from '../world/Grid';
import type { ResourceManager } from '../world/Resources';

export interface StompTickResult {
  treesCrushed: number;
  woodGained: number;
  enemyUnitsCrushed: number;
  enemyBuildingsDamaged: number;
}

export class StompSystem {
  public static applyBaseStomp(
    base: BuildingEntity,
    allUnits: Iterable<UnitEntity>,
    allBuildings: Iterable<BuildingEntity>,
    factionState: FactionState,
    grid: WorldGrid,
    resources: ResourceManager,
    bus: EventBus,
    dt: number,
  ): StompTickResult {
    const result: StompTickResult = {
      treesCrushed: 0,
      woodGained: 0,
      enemyUnitsCrushed: 0,
      enemyBuildingsDamaged: 0,
    };

    if (
      base.buildingType !== 'base' ||
      base.mode !== 'move' ||
      base.path.length === 0 ||
      base.hp <= 0
    ) {
      return result;
    }

    const minTx = Math.floor(base.position.x - base.footprint * 0.5);
    const minTz = Math.floor(base.position.z - base.footprint * 0.5);

    // 1. Crush trees in the Base's 4x4 footprint
    for (let dz = 0; dz < base.footprint; dz++) {
      for (let dx = 0; dx < base.footprint; dx++) {
        const tx = minTx + dx;
        const tz = minTz + dz;
        const woodYield = resources.crushTreeAtTile(tx, tz, grid);
        if (woodYield > 0) {
          result.treesCrushed += 1;
          result.woodGained += woodYield;
          factionState.resources.wood = Math.min(
            factionState.storageCaps.wood,
            factionState.resources.wood + woodYield,
          );
        }
      }
    }

    const halfFootprint = base.footprint * 0.5 + 0.25;

    // 2. Crush small enemy units under the Base's feet (never hurt friendlies)
    for (const unit of allUnits) {
      if (unit.hp <= 0 || unit.faction === base.faction) {
        continue;
      }
      const dx = Math.abs(unit.position.x - base.position.x);
      const dz = Math.abs(unit.position.z - base.position.z);
      if (dx <= halfFootprint && dz <= halfFootprint) {
        if (unit.maxHp <= BALANCE.BASE_STOMP_UNIT_MAX_HP_THRESHOLD) {
          unit.hp = 0;
          result.enemyUnitsCrushed += 1;
          factionState.enemiesDefeated += 1;
          bus.emit('unit:died', { unitId: unit.id, faction: unit.faction });
        } else {
          // Larger enemy units take heavy stomp damage over time
          unit.hp = Math.max(
            0,
            unit.hp - BALANCE.BASE_STOMP_BUILDING_DAMAGE_PER_SEC * 0.5 * dt,
          );
          if (unit.hp <= 0) {
            result.enemyUnitsCrushed += 1;
            factionState.enemiesDefeated += 1;
            bus.emit('unit:died', { unitId: unit.id, faction: unit.faction });
          }
        }
      }
    }

    // 3. Flatten enemy light buildings in the Base's path
    for (const bld of allBuildings) {
      if (
        bld.hp <= 0 ||
        bld.id === base.id ||
        bld.faction === base.faction ||
        bld.buildingType === 'base'
      ) {
        continue;
      }
      const overlapDist = (base.footprint + bld.footprint) * 0.5;
      const dx = Math.abs(bld.position.x - base.position.x);
      const dz = Math.abs(bld.position.z - base.position.z);
      if (dx <= overlapDist && dz <= overlapDist) {
        bld.hp = Math.max(
          0,
          bld.hp - BALANCE.BASE_STOMP_BUILDING_DAMAGE_PER_SEC * dt,
        );
        result.enemyBuildingsDamaged += 1;
        if (bld.hp <= 0) {
          grid.setBuildingFootprint(bld.tile, bld.footprint, null);
        }
      }
    }

    return result;
  }
}