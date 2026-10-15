/**
 * STONEWALKER — Building Placement, Base-Level Unlock Checks & Worker Repair System (Section 6)
 */

import type { EventBus } from '../core/EventBus';
import { BASE_TIER_STATS, BUILDINGS } from '../data/buildings';
import type {
  BuildingEntity,
  BuildingType,
  FactionState,
  Resources,
  TileCoord,
  UnitEntity,
} from '../data/types';
import { createBuildingEntity } from '../entities/Building';
import type { WorldGrid } from '../world/Grid';
import { Pathfinder } from './Pathfinding';

export class ConstructionSystem {
  public static canAfford(
    resources: Readonly<Resources>,
    cost: Partial<Resources>,
  ): boolean {
    return (
      resources.food >= (cost.food ?? 0) &&
      resources.wood >= (cost.wood ?? 0) &&
      resources.stone >= (cost.stone ?? 0) &&
      resources.hide >= (cost.hide ?? 0) &&
      resources.bronze >= (cost.bronze ?? 0)
    );
  }

  public static spendResources(
    resources: Resources,
    cost: Partial<Resources>,
  ): void {
    resources.food = Math.max(0, resources.food - (cost.food ?? 0));
    resources.wood = Math.max(0, resources.wood - (cost.wood ?? 0));
    resources.stone = Math.max(0, resources.stone - (cost.stone ?? 0));
    resources.hide = Math.max(0, resources.hide - (cost.hide ?? 0));
    resources.bronze = Math.max(0, resources.bronze - (cost.bronze ?? 0));
  }

  public static getFactionBaseLevel(
    faction: string,
    buildings: Iterable<BuildingEntity>,
  ): number {
    let baseLevel = 1;
    for (const b of buildings) {
      if (b.faction === faction && b.buildingType === 'base' && b.hp > 0) {
        baseLevel = Math.max(baseLevel, b.level);
      }
    }
    return baseLevel;
  }

  public static getMaxCountForBuilding(
    buildingType: BuildingType,
    factionState: FactionState,
    buildings: Iterable<BuildingEntity>,
  ): number {
    const def = BUILDINGS[buildingType];
    const baseLevel = this.getFactionBaseLevel(factionState.faction, buildings);
    const tier = BASE_TIER_STATS[baseLevel - 1] ?? BASE_TIER_STATS[0]!;
    return Math.ceil(def.maxCountBase * tier.buildingCapMultiplier);
  }

  public static getCountForBuilding(
    buildingType: BuildingType,
    factionState: FactionState,
    buildings: Iterable<BuildingEntity>,
  ): number {
    let count = 0;
    for (const b of buildings) {
      if (
        b.hp > 0 &&
        b.faction === factionState.faction &&
        b.buildingType === buildingType
      ) {
        count++;
      }
    }
    return count;
  }

  public static tryStartBuildingPlacement(
    buildingType: Exclude<BuildingType, 'base'>,
    tile: TileCoord,
    factionState: FactionState,
    existingBuildings: Iterable<BuildingEntity>,
    grid: WorldGrid,
    bus: EventBus,
  ): BuildingEntity | null {
    const bldList = Array.from(existingBuildings);
    const def = BUILDINGS[buildingType];
    const currentBaseLevel = this.getFactionBaseLevel(
      factionState.faction,
      bldList,
    );

    if (
      def.requiredBaseLevel !== undefined &&
      currentBaseLevel < def.requiredBaseLevel
    ) {
      if (factionState.faction === 'player') {
        bus.emit('ui:toast', {
          message: `Upgrade your Council Walker Base to Level ${def.requiredBaseLevel} to unlock ${def.name}!`,
          level: 'warning',
        });
      }
      return null;
    }

    if (
      def.requiredTech &&
      !factionState.researchedTechs.includes(def.requiredTech)
    ) {
      if (factionState.faction === 'player') {
        bus.emit('ui:toast', {
          message: `Requires tech: ${def.requiredTech.replace('_', ' ')}`,
          level: 'warning',
        });
      }
      return null;
    }

    const currentCount = this.getCountForBuilding(
      buildingType,
      factionState,
      bldList,
    );
    const maxCount = this.getMaxCountForBuilding(
      buildingType,
      factionState,
      bldList,
    );
    if (currentCount >= maxCount) {
      if (factionState.faction === 'player') {
        bus.emit('ui:toast', {
          message: `Maximum ${def.name} count (${maxCount}) reached. Upgrade your Base!`,
          level: 'warning',
        });
      }
      return null;
    }

    if (!this.canAfford(factionState.resources, def.cost)) {
      if (factionState.faction === 'player') {
        bus.emit('ui:toast', {
          message: `Not enough resources to build ${def.name}.`,
          level: 'warning',
        });
      }
      return null;
    }

    let targetTile = { tx: tile.tx, tz: tile.tz };
    if (!grid.canPlaceBuilding(targetTile.tx, targetTile.tz, def.footprint)) {
      const snapped = grid.findNearestValidBuildTile(
        targetTile.tx,
        targetTile.tz,
        def.footprint,
        6,
      );
      if (grid.canPlaceBuilding(snapped.tx, snapped.tz, def.footprint)) {
        targetTile = snapped;
      } else {
        if (factionState.faction === 'player') {
          bus.emit('ui:toast', {
            message: 'Area blocked — tap an open ground spot to place building.',
            level: 'danger',
          });
        }
        return null;
      }
    }

    this.spendResources(factionState.resources, def.cost);

    const bld = createBuildingEntity({
      buildingType,
      faction: factionState.faction,
      tribe: factionState.tribe,
      tile: targetTile,
      isConstructed: false,
    });
    grid.setBuildingFootprint(bld.tile, bld.footprint, bld.id);
    return bld;
  }

  public static updateWorkerBuildAndRepair(
    worker: UnitEntity,
    buildings: ReadonlyMap<string, BuildingEntity>,
    grid: WorldGrid,
    bus: EventBus,
    dt: number,
  ): void {
    if (
      worker.role !== 'worker' ||
      worker.hp <= 0 ||
      (worker.jobMemory.jobType !== 'build' &&
        worker.jobMemory.jobType !== 'repair')
    ) {
      return;
    }

    const targetId = worker.jobMemory.targetEntityId;
    const bld = targetId ? buildings.get(targetId) : undefined;
    if (!bld || bld.hp <= 0) {
      worker.jobMemory.jobType = 'none';
      worker.status = 'idle';
      return;
    }

    const dist = Math.hypot(
      bld.position.x - worker.position.x,
      bld.position.z - worker.position.z,
    );
    const reach = bld.footprint * 0.5 + 1.5;

    if (dist > reach) {
      if (worker.path.length === 0) {
        worker.status = 'working';
        worker.path = Pathfinder.findPath(grid, worker.position, bld.position);
      }
      return;
    }

    worker.path = [];
    worker.status = 'working';
    worker.idleTimer = 0;

    if (!bld.isConstructed) {
      bld.constructionProgress += dt;
      const hpGain =
        ((bld.maxHp * 0.85) / Math.max(1, bld.constructionTotalTime)) * dt;
      bld.hp = Math.min(bld.maxHp, bld.hp + hpGain);

      if (bld.constructionProgress >= bld.constructionTotalTime) {
        bld.isConstructed = true;
        bld.hp = bld.maxHp;
        bus.emit('building:completed', {
          buildingId: bld.id,
          buildingType: bld.buildingType,
          faction: bld.faction,
        });
        if (bld.faction === 'player') {
          bus.emit('ui:toast', {
            message: `${BUILDINGS[bld.buildingType].name} construction complete!`,
            level: 'success',
          });
        }
        worker.jobMemory.jobType = 'none';
        worker.status = 'idle';
      }
    } else if (bld.hp < bld.maxHp) {
      bld.hp = Math.min(bld.maxHp, bld.hp + 18 * dt);
      if (bld.hp >= bld.maxHp) {
        worker.jobMemory.jobType = 'none';
        worker.status = 'idle';
      }
    } else {
      worker.jobMemory.jobType = 'none';
      worker.status = 'idle';
    }
  }
}