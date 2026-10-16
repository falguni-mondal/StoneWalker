/**
 * STONEWALKER — Context-Sensitive Command & Selection Resolver (Section 11)
 * - Guarantees that tapping a friendly unfinished or damaged building with selected workers
 *   assigns them to build/repair it (`targetEntityId = null`) and NEVER orders an attack on
 *   friendly structures or units.
 */

import type { EventBus } from '../core/EventBus';
import { BUILDINGS } from '../data/buildings';
import { TRIBES } from '../data/heroes';
import type {
  BuildingEntity,
  EntityId,
  ResourceNodeEntity,
  TribeId,
  UnitEntity,
  Vec2,
} from '../data/types';
import { Pathfinder } from '../systems/Pathfinding';
import type { WorldGrid } from '../world/Grid';

export interface CommandContext {
  units: ReadonlyMap<EntityId, UnitEntity>;
  buildings: ReadonlyMap<EntityId, BuildingEntity>;
  resources: Iterable<ResourceNodeEntity>;
  grid: WorldGrid;
  playerTribe: TribeId;
}

export interface PathPreviewResult {
  path: Vec2[];
  estimatedSeconds: number;
  isBlocked: boolean;
}

export class CommandResolver {
  private selectedIds: EntityId[] = [];
  private readonly bus: EventBus;

  public constructor(bus: EventBus) {
    this.bus = bus;
  }

  public getSelectedIds(): readonly EntityId[] {
    return this.selectedIds;
  }

  public setSelectedIds(ids: EntityId[]): void {
    this.selectedIds = [...ids];
    this.bus.emit('selection:changed', { selectedIds: this.selectedIds });
  }

  public clearSelection(): void {
    if (this.selectedIds.length > 0) {
      this.selectedIds = [];
      this.bus.emit('selection:changed', { selectedIds: [] });
    }
  }

  public hasSelectedPlayerWorkers(ctx: CommandContext): boolean {
    return this.selectedIds.some((id) => {
      const u = ctx.units.get(id);
      return u && u.hp > 0 && u.faction === 'player' && u.role === 'worker';
    });
  }

  public hasSelectedUnitsOrMovingBuilding(ctx: CommandContext): boolean {
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
    ctx: CommandContext,
    radius: number = 1.9,
  ): Array<{ kind: 'unit' | 'building' | 'resource'; id: EntityId; dist: number }> {
    const results: Array<{
      kind: 'unit' | 'building' | 'resource';
      id: EntityId;
      dist: number;
    }> = [];

    for (const u of ctx.units.values()) {
      if (u.hp <= 0 || u.isReviving) continue;
      const d = Math.hypot(
        u.position.x - worldPos.x,
        u.position.z - worldPos.z,
      );
      const hitRadius = u.kind === 'machine' ? radius + 0.8 : radius;
      if (d <= hitRadius) {
        results.push({ kind: 'unit', id: u.id, dist: d });
      }
    }

    for (const b of ctx.buildings.values()) {
      if (b.hp <= 0) continue;
      const d = Math.hypot(
        b.position.x - worldPos.x,
        b.position.z - worldPos.z,
      );
      if (d <= b.footprint * 0.65 + 0.8) {
        results.push({ kind: 'building', id: b.id, dist: d });
      }
    }

    for (const r of ctx.resources) {
      if (r.amountRemaining <= 0) continue;
      const d = Math.hypot(
        r.position.x - worldPos.x,
        r.position.z - worldPos.z,
      );
      if (d <= 1.6) {
        results.push({ kind: 'resource', id: r.id, dist: d });
      }
    }

    results.sort((a, b) => a.dist - b.dist);
    return results;
  }

  public handleDoubleTap(worldPos: Vec2, ctx: CommandContext): void {
    const hits = this.findEntitiesNearPoint(worldPos, ctx, 2.2);
    const unitHit = hits.find((h) => h.kind === 'unit');
    if (!unitHit) {
      return;
    }
    const targetUnit = ctx.units.get(unitHit.id);
    if (!targetUnit || targetUnit.faction !== 'player') {
      return;
    }

    const matching: EntityId[] = [];
    for (const u of ctx.units.values()) {
      if (
        u.hp > 0 &&
        u.faction === 'player' &&
        u.role === targetUnit.role &&
        Math.hypot(
          u.position.x - targetUnit.position.x,
          u.position.z - targetUnit.position.z,
        ) <= 22
      ) {
        matching.push(u.id);
      }
    }
    this.setSelectedIds(matching);
  }

  public handleBoxSelect(
    minPos: Vec2,
    maxPos: Vec2,
    ctx: CommandContext,
  ): void {
    const x0 = Math.min(minPos.x, maxPos.x);
    const x1 = Math.max(minPos.x, maxPos.x);
    const z0 = Math.min(minPos.z, maxPos.z);
    const z1 = Math.max(minPos.z, maxPos.z);

    const picked: EntityId[] = [];
    for (const u of ctx.units.values()) {
      if (
        u.hp > 0 &&
        !u.isReviving &&
        u.faction === 'player' &&
        u.position.x >= x0 &&
        u.position.x <= x1 &&
        u.position.z >= z0 &&
        u.position.z <= z1
      ) {
        picked.push(u.id);
      }
    }
    if (picked.length > 0) {
      this.setSelectedIds(picked);
    }
  }

  public issueContextCommand(
    worldPos: Vec2,
    ctx: CommandContext,
  ): PathPreviewResult | null {
    if (this.selectedIds.length === 0) {
      return null;
    }

    const hits = this.findEntitiesNearPoint(worldPos, ctx, 2.2);
    const selectedUnits: UnitEntity[] = [];
    const selectedBuildings: BuildingEntity[] = [];

    for (const id of this.selectedIds) {
      const u = ctx.units.get(id);
      if (u && u.hp > 0 && u.faction === 'player') {
        selectedUnits.push(u);
      }
      const b = ctx.buildings.get(id);
      if (b && b.hp > 0 && b.faction === 'player') {
        selectedBuildings.push(b);
      }
    }

    // 1. Check if tapping a friendly unfinished or damaged building while Workers are selected
    const bldHit = hits.find((h) => h.kind === 'building');
    if (bldHit) {
      const targetBld = ctx.buildings.get(bldHit.id);
      if (targetBld && targetBld.faction === 'player') {
        let assignedBuilder = false;
        for (const u of selectedUnits) {
          if (u.role === 'worker') {
            u.targetEntityId = null;
            u.jobMemory = {
              jobType: !targetBld.isConstructed ? 'build' : 'repair',
              targetEntityId: targetBld.id,
              resourceType: u.jobMemory.resourceType ?? u.carryResourceType,
              targetPosition: { ...targetBld.position },
            };
            u.status = 'working';
            u.path = Pathfinder.findPath(
              ctx.grid,
              u.position,
              targetBld.position,
              {
                footprint: 1,
                ignoreEntityId: targetBld.id,
              },
            );
            assignedBuilder = true;
          }
        }
        if (assignedBuilder) {
          return {
            path: [targetBld.position],
            estimatedSeconds: 2,
            isBlocked: false,
          };
        }
      }
    }

    // 2. Check if tapping a Resource Node while Workers are selected
    const resHit = hits.find((h) => h.kind === 'resource');
    if (resHit) {
      const rNode = Array.from(ctx.resources).find((r) => r.id === resHit.id);
      if (rNode) {
        let assignedHarvester = false;
        for (const u of selectedUnits) {
          if (u.role === 'worker') {
            u.targetEntityId = null;
            u.jobMemory = {
              jobType: 'gather',
              targetEntityId: rNode.id,
              resourceType: rNode.resourceType,
              targetPosition: { ...rNode.position },
            };
            u.status = 'working';
            u.path = Pathfinder.findPath(ctx.grid, u.position, rNode.position);
            assignedHarvester = true;
          }
        }
        if (assignedHarvester) {
          return {
            path: [rNode.position],
            estimatedSeconds: 2,
            isBlocked: false,
          };
        }
      }
    }

    // 3. Check if tapping an ENEMY Unit or ENEMY Building (strictly never friendly!)
    for (const h of hits) {
      if (h.kind === 'unit') {
        const targetU = ctx.units.get(h.id);
        if (targetU && targetU.faction !== 'player') {
          for (const u of selectedUnits) {
            u.targetEntityId = targetU.id;
            u.status = 'fighting';
            u.path = Pathfinder.findPath(
              ctx.grid,
              u.position,
              targetU.position,
            );
          }
          return {
            path: [targetU.position],
            estimatedSeconds: 2,
            isBlocked: false,
          };
        }
      } else if (h.kind === 'building') {
        const targetB = ctx.buildings.get(h.id);
        if (targetB && targetB.faction !== 'player') {
          for (const u of selectedUnits) {
            u.targetEntityId = targetB.id;
            u.status = 'fighting';
            u.path = Pathfinder.findPath(
              ctx.grid,
              u.position,
              targetB.position,
              {
                footprint: 1,
                ignoreEntityId: targetB.id,
              },
            );
          }
          return {
            path: [targetB.position],
            estimatedSeconds: 3,
            isBlocked: false,
          };
        }
      }
    }

    // 4. Walking Buildings Movement Command
    let previewResult: PathPreviewResult | null = null;
    for (const bld of selectedBuildings) {
      if (bld.mode === 'move') {
        const path = Pathfinder.findPath(ctx.grid, bld.position, worldPos, {
          footprint: bld.footprint,
          ignoreEntityId: bld.id,
          allowStompable: bld.buildingType === 'base',
        });
        bld.path = path;
        bld.moveTarget = { ...worldPos };
        const speed =
          BUILDINGS[bld.buildingType].moveSpeed *
          (bld.buildingType === 'base'
            ? TRIBES[ctx.playerTribe].bonuses.baseMoveSpeedMultiplier
            : 1.0);
        const dist = Math.hypot(
          worldPos.x - bld.position.x,
          worldPos.z - bld.position.z,
        );
        previewResult = {
          path,
          estimatedSeconds: Math.max(1, Math.round(dist / Math.max(0.5, speed))),
          isBlocked: path.length === 0,
        };
      } else {
        bld.rallyPoint = { ...worldPos };
      }
    }

    // 5. Standard Ground Move Command for Selected Units
    if (selectedUnits.length > 0) {
      const cols = Math.ceil(Math.sqrt(selectedUnits.length));
      selectedUnits.forEach((u, idx) => {
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        const offset: Vec2 = {
          x: worldPos.x + (col - (cols - 1) * 0.5) * 1.15,
          z: worldPos.z + (row - (cols - 1) * 0.5) * 1.15,
        };
        u.targetEntityId = null;
        if (u.role === 'worker') {
          u.jobMemory.jobType = 'none';
          u.jobMemory.targetEntityId = null;
        }
        u.status = 'moving';
        u.moveTarget = offset;
        u.path = Pathfinder.findPath(ctx.grid, u.position, offset);
      });

      const lead = selectedUnits[0]!;
      const dist = Math.hypot(
        worldPos.x - lead.position.x,
        worldPos.z - lead.position.z,
      );
      previewResult = {
        path: lead.path,
        estimatedSeconds: Math.max(
          1,
          Math.round(dist / Math.max(0.5, lead.speed)),
        ),
        isBlocked: lead.path.length === 0,
      };
    }

    return previewResult;
  }
}