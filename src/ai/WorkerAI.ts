/**
 * STONEWALKER — Smart Worker AI Coordinator (Sections 6, 7 & 9)
 * - Preserves `worker.jobMemory.resourceType` whenever a worker is pulled to construct
 *   or repair a building.
 * - Executes `updateWorkerBuildAndRepair` first so that the exact moment a building finishes,
 *   the worker immediately transitions back to harvesting their previous resource on the same tick.
 */

import type { EventBus } from '../core/EventBus';
import { BALANCE } from '../data/balance';
import type {
  BuildingEntity,
  EntityId,
  FactionState,
  ResourceType,
  UnitEntity,
} from '../data/types';
import { ConstructionSystem } from '../systems/Construction';
import { GatheringSystem } from '../systems/Gathering';
import { Pathfinder } from '../systems/Pathfinding';
import type { WorldGrid } from '../world/Grid';
import type { ResourceManager } from '../world/Resources';

export class WorkerAI {
  public static update(
    units: Iterable<UnitEntity>,
    buildings: ReadonlyMap<EntityId, BuildingEntity>,
    factionById: ReadonlyMap<string, FactionState>,
    resources: ResourceManager,
    grid: WorldGrid,
    relicGatherMultiplierByFaction: ReadonlyMap<string, number>,
    bus: EventBus,
    dt: number,
  ): void {
    const unitList = Array.from(units);
    const buildingList = Array.from(buildings.values());

    for (const worker of unitList) {
      if (worker.hp <= 0 || worker.role !== 'worker') {
        continue;
      }

      const factionState = factionById.get(worker.faction);
      if (!factionState) {
        continue;
      }

      if (factionState.alarmActive && worker.status === 'fighting') {
        continue;
      }

      if (worker.status !== 'fighting') {
        worker.targetEntityId = null;
      }

      // 1. If there is an unattended unfinished building, pull an idle or gathering worker
      //    while preserving `worker.jobMemory.resourceType` so they remember their previous job!
      if (worker.jobMemory.jobType !== 'build') {
        const unattendedUnfinished = this.findUnattendedUnfinishedBuilding(
          worker,
          unitList,
          buildingList,
        );
        if (
          unattendedUnfinished &&
          (worker.jobMemory.jobType === 'none' ||
            worker.jobMemory.jobType === 'gather')
        ) {
          const previousResource =
            worker.jobMemory.resourceType ?? worker.carryResourceType;
          worker.jobMemory = {
            jobType: 'build',
            targetEntityId: unattendedUnfinished.id,
            resourceType: previousResource,
            targetPosition: { ...unattendedUnfinished.position },
          };
          worker.status = 'working';
          worker.path = Pathfinder.findPath(
            grid,
            worker.position,
            unattendedUnfinished.position,
            {
              footprint: 1,
              ignoreEntityId: unattendedUnfinished.id,
            },
          );
        }
      }

      // 2. Run active Build / Repair job FIRST.
      //    If the building finishes on this tick, `updateWorkerBuildAndRepair` sets
      //    `worker.jobMemory.jobType = 'none'` (keeping `resourceType` intact) so Step 3
      //    immediately sends the worker back to their previous gathering task!
      if (
        worker.jobMemory.jobType === 'build' ||
        worker.jobMemory.jobType === 'repair'
      ) {
        ConstructionSystem.updateWorkerBuildAndRepair(
          worker,
          buildings,
          grid,
          bus,
          dt,
        );
        // NOTE: `updateWorkerBuildAndRepair` mutates `worker.jobMemory`, which TypeScript
        // cannot see, so we re-read the job state through a helper (no stale narrowing).
        if (this.hasActiveJob(worker)) {
          continue;
        }
      }

      // 3. When a worker has no active job (`jobType === 'none'`), either chain to the next
      //    unfinished/damaged building OR return them to the resource they were gathering before!
      if (worker.jobMemory.jobType === 'none') {
        // Respect active manual move commands until the worker reaches the destination
        if (worker.status === 'moving' && worker.path.length > 0) {
          continue;
        }

        const nextBuildOrRepair = this.findNearestBuildOrRepairTarget(
          worker,
          buildingList,
        );
        if (nextBuildOrRepair) {
          const previousResource =
            worker.jobMemory.resourceType ?? worker.carryResourceType;
          worker.jobMemory = {
            jobType: !nextBuildOrRepair.isConstructed ? 'build' : 'repair',
            targetEntityId: nextBuildOrRepair.id,
            resourceType: previousResource,
            targetPosition: { ...nextBuildOrRepair.position },
          };
          worker.status = 'working';
          worker.path = Pathfinder.findPath(
            grid,
            worker.position,
            nextBuildOrRepair.position,
            {
              footprint: 1,
              ignoreEntityId: nextBuildOrRepair.id,
            },
          );
          continue;
        }

        // Return to the exact resource type the worker was gathering before building!
        const rememberedRes =
          worker.jobMemory.resourceType ??
          worker.carryResourceType ??
          this.pickPriorityResource(factionState);

        const node =
          resources.findNearestNode(worker.position, rememberedRes, 250) ??
          resources.findNearestNode(
            worker.position,
            this.pickPriorityResource(factionState),
            250,
          ) ??
          resources.findNearestNode(worker.position, undefined, 250);

        if (node) {
          worker.jobMemory = {
            jobType: 'gather',
            targetEntityId: node.id,
            resourceType: node.resourceType,
            targetPosition: { ...node.position },
          };
          worker.status = 'working';
          worker.path = Pathfinder.findPath(
            grid,
            worker.position,
            node.position,
          );
        }
      }

      // 4. Execute Resource Gathering job
      if (worker.jobMemory.jobType === 'gather') {
        const relicMult =
          relicGatherMultiplierByFaction.get(worker.faction) ??
          BALANCE.AI_DIFFICULTY.normal.gatherMultiplier;
        GatheringSystem.updateWorkerGathering(
          worker,
          factionState,
          buildings.values(),
          resources,
          grid,
          relicMult,
          dt,
        );
      }
    }
  }

  /**
   * Reads the worker's current job state from inside a function boundary so TypeScript
   * does not reuse a stale, narrowed `jobType` after a call that mutates `jobMemory`.
   */
  private static hasActiveJob(worker: UnitEntity): boolean {
    return worker.jobMemory.jobType !== 'none';
  }

  private static findUnattendedUnfinishedBuilding(
    worker: UnitEntity,
    allUnits: readonly UnitEntity[],
    allBuildings: readonly BuildingEntity[],
  ): BuildingEntity | null {
    let best: BuildingEntity | null = null;
    let bestDistSq = Infinity;

    for (const bld of allBuildings) {
      if (
        bld.hp <= 0 ||
        bld.faction !== worker.faction ||
        bld.isConstructed
      ) {
        continue;
      }

      const hasBuilder = allUnits.some(
        (u) =>
          u.hp > 0 &&
          u.faction === worker.faction &&
          u.role === 'worker' &&
          u.jobMemory.jobType === 'build' &&
          u.jobMemory.targetEntityId === bld.id,
      );

      if (hasBuilder) {
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

  private static findNearestBuildOrRepairTarget(
    worker: UnitEntity,
    allBuildings: readonly BuildingEntity[],
  ): BuildingEntity | null {
    let bestUnfinished: BuildingEntity | null = null;
    let bestUnfinishedDistSq = Infinity;
    let bestDamaged: BuildingEntity | null = null;
    let bestDamagedDistSq = Infinity;

    for (const bld of allBuildings) {
      if (bld.hp <= 0 || bld.faction !== worker.faction) {
        continue;
      }
      const dx = bld.position.x - worker.position.x;
      const dz = bld.position.z - worker.position.z;
      const dSq = dx * dx + dz * dz;

      if (!bld.isConstructed) {
        if (dSq < bestUnfinishedDistSq) {
          bestUnfinishedDistSq = dSq;
          bestUnfinished = bld;
        }
      } else if (bld.hp < bld.maxHp) {
        if (dSq < bestDamagedDistSq) {
          bestDamagedDistSq = dSq;
          bestDamaged = bld;
        }
      }
    }

    return bestUnfinished ?? bestDamaged;
  }

  private static pickPriorityResource(factionState: FactionState): ResourceType {
    const entries = Object.entries(factionState.workerPriorities) as Array<
      [ResourceType, number]
    >;
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0]?.[0] ?? 'wood';
  }
}