/**
 * STONEWALKER — Touch & Mouse Command Resolver (Sections 5, 6, 9 & 14)
 * Fixes Worker build/repair targeting when clicking damaged/unfinished friendly buildings
 * and cleanly separates selection from contextual movement/gather/attack orders.
 */

import { CONFIG } from '../config';
import type { EventBus } from '../core/EventBus';
import { BUILDINGS } from '../data/buildings';
import { getBaseEffectiveStats } from '../entities/Base';
import type {
  BuildingEntity,
  EntityId,
  ResourceNodeEntity,
  TribeId,
  UnitEntity,
  Vec2,
} from '../data/types';
import { Pathfinder, type PathPreviewResult } from '../systems/Pathfinding';
import type { WorldGrid } from '../world/Grid';

export interface CommandWorldContext {
  units: Map<EntityId, UnitEntity>;
  buildings: Map<EntityId, BuildingEntity>;
  resources: ResourceNodeEntity[];
  grid: WorldGrid;
  playerTribe: TribeId;
}

export class CommandResolver {
  private readonly bus: EventBus;
  private selectedIds: EntityId[] = [];

  public constructor(bus: EventBus) {
    this.bus = bus;
  }

  public getSelectedIds(): readonly EntityId[] {
    return this.selectedIds;
  }

  public setSelectedIds(ids: readonly EntityId[]): void {
    this.selectedIds = [...ids];
    this.bus.emit('selection:changed', { selectedIds: this.selectedIds });
  }

  public clearSelection(): void {
    if (this.selectedIds.length === 0) {
      return;
    }
    this.selectedIds = [];
    this.bus.emit('selection:changed', { selectedIds: [] });
  }

  public hasSelectedPlayerWorkers(ctx: CommandWorldContext): boolean {
    for (const id of this.selectedIds) {
      const u = ctx.units.get(id);
      if (u && u.hp > 0 && u.faction === 'player' && u.role === 'worker') {
        return true;
      }
    }
    return false;
  }

  public hasSelectedUnitsOrMovingBuilding(ctx: CommandWorldContext): boolean {
    for (const id of this.selectedIds) {
      const u = ctx.units.get(id);
      if (u && u.hp > 0 && u.faction === 'player') {
        return true;
      }
      const b = ctx.buildings.get(id);
      if (b && b.hp > 0 && b.faction === 'player' && b.mode === 'move') {
        return true;
      }
    }
    return false;
  }

  public findEntitiesNearPoint(
    worldPos: Vec2,
    ctx: CommandWorldContext,
  ): Array<{ id: EntityId; label: string; dist: number }> {
    const hits: Array<{ id: EntityId; label: string; dist: number }> = [];
    const radius = CONFIG.TOUCH_FORGIVING_SELECT_RADIUS;

    for (const u of ctx.units.values()) {
      if (u.hp <= 0) {
        continue;
      }
      const d = Math.hypot(u.position.x - worldPos.x, u.position.z - worldPos.z);
      if (d <= radius) {
        hits.push({ id: u.id, label: String(u.role), dist: d });
      }
    }

    for (const b of ctx.buildings.values()) {
      if (b.hp <= 0) {
        continue;
      }
      const half = b.footprint * 0.5 + 0.6;
      const dx = Math.abs(b.position.x - worldPos.x);
      const dz = Math.abs(b.position.z - worldPos.z);
      if (dx <= half && dz <= half) {
        const d = Math.hypot(
          b.position.x - worldPos.x,
          b.position.z - worldPos.z,
        );
        hits.push({
          id: b.id,
          label: BUILDINGS[b.buildingType].name,
          dist: d,
        });
      }
    }

    hits.sort((a, b) => a.dist - b.dist);
    return hits;
  }

  public handleDoubleTap(worldPos: Vec2, ctx: CommandWorldContext): void {
    const near = this.findEntitiesNearPoint(worldPos, ctx);
    if (near.length === 0) {
      return;
    }
    const firstUnit = ctx.units.get(near[0]!.id);
    if (!firstUnit || firstUnit.faction !== 'player') {
      return;
    }
    const matching: EntityId[] = [];
    for (const u of ctx.units.values()) {
      if (
        u.hp > 0 &&
        u.faction === 'player' &&
        u.role === firstUnit.role &&
        Math.hypot(u.position.x - worldPos.x, u.position.z - worldPos.z) <= 20
      ) {
        matching.push(u.id);
      }
    }
    this.setSelectedIds(matching);
  }

  public handleBoxSelect(
    startWorld: Vec2,
    endWorld: Vec2,
    ctx: CommandWorldContext,
  ): void {
    const minX = Math.min(startWorld.x, endWorld.x);
    const maxX = Math.max(startWorld.x, endWorld.x);
    const minZ = Math.min(startWorld.z, endWorld.z);
    const maxZ = Math.max(startWorld.z, endWorld.z);

    const pickedUnits: EntityId[] = [];
    for (const u of ctx.units.values()) {
      if (
        u.hp > 0 &&
        u.faction === 'player' &&
        u.position.x >= minX &&
        u.position.x <= maxX &&
        u.position.z >= minZ &&
        u.position.z <= maxZ
      ) {
        pickedUnits.push(u.id);
      }
    }
    if (pickedUnits.length > 0) {
      this.setSelectedIds(pickedUnits);
    }
  }

  public issueContextCommand(
    worldPos: Vec2,
    ctx: CommandWorldContext,
  ): PathPreviewResult | null {
    if (this.selectedIds.length === 0) {
      return null;
    }

    // 1. Check if an enemy entity was targeted
    let targetEnemyId: EntityId | null = null;
    for (const u of ctx.units.values()) {
      if (
        u.hp > 0 &&
        u.faction !== 'player' &&
        Math.hypot(u.position.x - worldPos.x, u.position.z - worldPos.z) <= 2.4
      ) {
        targetEnemyId = u.id;
        break;
      }
    }
    if (!targetEnemyId) {
      for (const b of ctx.buildings.values()) {
        if (
          b.hp > 0 &&
          b.faction !== 'player' &&
          Math.abs(b.position.x - worldPos.x) <= b.footprint * 0.65 &&
          Math.abs(b.position.z - worldPos.z) <= b.footprint * 0.65
        ) {
          targetEnemyId = b.id;
          break;
        }
      }
    }

    // 2. Check if a resource node was targeted
    let targetResource: ResourceNodeEntity | null = null;
    for (const res of ctx.resources) {
      if (
        res.amountRemaining > 0 &&
        Math.hypot(res.position.x - worldPos.x, res.position.z - worldPos.z) <=
          2.0
      ) {
        targetResource = res;
        break;
      }
    }

    // 3. Check if an unfinished or damaged friendly building was targeted
    let targetFriendlyBuilding: BuildingEntity | null = null;
    for (const b of ctx.buildings.values()) {
      if (
        b.hp > 0 &&
        b.faction === 'player' &&
        (!b.isConstructed || b.hp < b.maxHp) &&
        Math.abs(b.position.x - worldPos.x) <= b.footprint * 0.65 &&
        Math.abs(b.position.z - worldPos.z) <= b.footprint * 0.65
      ) {
        targetFriendlyBuilding = b;
        break;
      }
    }

    let previewResult: PathPreviewResult | null = null;
    let unitOffsetIndex = 0;

    for (const id of this.selectedIds) {
      const bld = ctx.buildings.get(id);
      if (bld && bld.faction === 'player') {
        if (bld.mode === 'move') {
          const speed =
            bld.buildingType === 'base'
              ? getBaseEffectiveStats(bld, ctx.playerTribe).moveSpeed
              : BUILDINGS[bld.buildingType].moveSpeed;
          const preview = Pathfinder.computePathPreview(
            ctx.grid,
            bld.position,
            worldPos,
            speed,
            {
              footprint: bld.footprint,
              ignoreEntityId: bld.id,
              allowStompable: bld.buildingType === 'base',
            },
          );
          bld.path = preview.path;
          bld.moveTarget = worldPos;
          previewResult = preview;
        } else {
          bld.rallyPoint = { x: worldPos.x, z: worldPos.z };
        }
        continue;
      }

      const unit = ctx.units.get(id);
      if (!unit || unit.faction !== 'player' || unit.hp <= 0) {
        continue;
      }

      // Reset 15-second idle timer on any player command (Section 9A)
      unit.idleTimer = 0;

      if (targetEnemyId) {
        unit.targetEntityId = targetEnemyId;
        unit.status = 'fighting';
        unit.path = Pathfinder.findPath(ctx.grid, unit.position, worldPos, {
          footprint: 1,
          ignoreEntityId: unit.id,
        });
      } else if (unit.role === 'worker' && targetFriendlyBuilding) {
        unit.targetEntityId = targetFriendlyBuilding.id;
        unit.status = 'working';
        unit.jobMemory = {
          jobType: targetFriendlyBuilding.isConstructed ? 'repair' : 'build',
          targetEntityId: targetFriendlyBuilding.id,
          resourceType: null,
          targetPosition: { ...targetFriendlyBuilding.position },
        };
        unit.path = Pathfinder.findPath(
          ctx.grid,
          unit.position,
          targetFriendlyBuilding.position,
        );
      } else if (unit.role === 'worker' && targetResource) {
        unit.targetEntityId = targetResource.id;
        unit.status = 'working';
        unit.jobMemory = {
          jobType: 'gather',
          targetEntityId: targetResource.id,
          resourceType: targetResource.resourceType,
          targetPosition: { ...targetResource.position },
        };
        unit.path = Pathfinder.findPath(
          ctx.grid,
          unit.position,
          targetResource.position,
        );
      } else {
        const angle = unitOffsetIndex * 2.39996;
        const ring =
          this.selectedIds.length > 1 ? Math.sqrt(unitOffsetIndex) * 0.9 : 0;
        unitOffsetIndex++;
        const dest: Vec2 = {
          x: worldPos.x + Math.cos(angle) * ring,
          z: worldPos.z + Math.sin(angle) * ring,
        };
        unit.targetEntityId = null;
        unit.moveTarget = dest;
        unit.status = 'moving';
        unit.path = Pathfinder.findPath(ctx.grid, unit.position, dest);
      }
    }

    return previewResult;
  }
}