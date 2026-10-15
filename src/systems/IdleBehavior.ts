/**
 * STONEWALKER — Smart Per-Unit Idle Behavior System (Section 9A — MUST WORK EXACTLY AS DESCRIBED)
 * Evaluated PER UNIT after 15 seconds of being idle (`BALANCE.UNIT_IDLE_TIMEOUT_SECONDS`):
 * - WORKERS:
 *   * If a friendly BASE is NEARBY (within `HOME_BASE_RADIUS_TILES`): returns to its previous job
 *     (the job before the player commanded it) and continues it.
 *   * If the base is NOT nearby: automatically finds the nearest resource node, gathers it,
 *     and carries the load to the base (or nearest drop-off). That resource becomes the
 *     worker's NEW permanent job, replacing the previous one.
 * - SOLDIERS AND MACHINES:
 *   * If the base is nearby: returns to a spread-out GUARD SPOT near the base.
 *   * If the base is not nearby: stays where the player left it, auto-engaging enemies in vision.
 */

import { BALANCE } from '../data/balance';
import type {
  BuildingEntity,
  FactionState,
  ResourceType,
  UnitEntity,
} from '../data/types';
import type { WorldGrid } from '../world/Grid';
import type { ResourceManager } from '../world/Resources';
import { Pathfinder } from './Pathfinding';

export class IdleBehaviorSystem {
  public static isBaseNearby(
    unit: UnitEntity,
    buildings: Iterable<BuildingEntity>,
  ): BuildingEntity | null {
    const rSq =
      BALANCE.HOME_BASE_RADIUS_TILES * BALANCE.HOME_BASE_RADIUS_TILES;
    let bestBase: BuildingEntity | null = null;
    let bestDistSq = rSq;

    for (const bld of buildings) {
      if (
        bld.hp <= 0 ||
        bld.faction !== unit.faction ||
        bld.buildingType !== 'base'
      ) {
        continue;
      }
      const dx = bld.position.x - unit.position.x;
      const dz = bld.position.z - unit.position.z;
      const dSq = dx * dx + dz * dz;
      if (dSq <= bestDistSq) {
        bestDistSq = dSq;
        bestBase = bld;
      }
    }
    return bestBase;
  }

  public static update(
    units: Iterable<UnitEntity>,
    buildings: Iterable<BuildingEntity>,
    factionById: ReadonlyMap<string, FactionState>,
    resources: ResourceManager,
    grid: WorldGrid,
    dt: number,
  ): void {
    let guardSlotIndex = 0;

    for (const unit of units) {
      if (unit.hp <= 0 || unit.isReviving) {
        continue;
      }

      // Only accumulate idle time when the unit has no active movement path or combat target
      const isActivelyBusy =
        unit.path.length > 0 ||
        unit.targetEntityId !== null ||
        unit.status === 'working' ||
        unit.status === 'fighting';

      if (isActivelyBusy) {
        unit.idleTimer = 0;
        continue;
      }

      unit.idleTimer += dt;
      if (unit.idleTimer < BALANCE.UNIT_IDLE_TIMEOUT_SECONDS) {
        continue;
      }

      // 15 seconds reached -> evaluate per-unit smart rule
      unit.idleTimer = 0;
      const nearbyBase = this.isBaseNearby(unit, buildings);
      const factionState = factionById.get(unit.faction);

      if (unit.role === 'worker') {
        this.resolveIdleWorker(
          unit,
          nearbyBase !== null,
          factionState,
          resources,
          grid,
        );
      } else {
        this.resolveIdleSoldierOrMachine(
          unit,
          nearbyBase,
          guardSlotIndex++,
          grid,
        );
      }
    }
  }

  private static resolveIdleWorker(
    worker: UnitEntity,
    baseIsNearby: boolean,
    factionState: FactionState | undefined,
    resources: ResourceManager,
    grid: WorldGrid,
  ): void {
    if (baseIsNearby && worker.jobMemory.jobType !== 'none') {
      // Base IS nearby -> resume previous job
      if (
        worker.jobMemory.jobType === 'gather' &&
        worker.jobMemory.resourceType
      ) {
        const prevNode = worker.jobMemory.targetEntityId
          ? resources.getNode(worker.jobMemory.targetEntityId)
          : undefined;
        const targetNode =
          prevNode && prevNode.amountRemaining > 0
            ? prevNode
            : resources.findNearestNode(
                worker.position,
                worker.jobMemory.resourceType,
              );
        if (targetNode) {
          worker.jobMemory.targetEntityId = targetNode.id;
          worker.jobMemory.targetPosition = { ...targetNode.position };
          worker.status = 'working';
          worker.path = Pathfinder.findPath(
            grid,
            worker.position,
            targetNode.position,
          );
          return;
        }
      } else if (worker.jobMemory.targetPosition) {
        worker.status = 'working';
        worker.path = Pathfinder.findPath(
          grid,
          worker.position,
          worker.jobMemory.targetPosition,
        );
        return;
      }
    }

    // Either Base is NOT nearby (adopt nearest resource node as NEW permanent job)
    // OR worker had no previous job memory (use priority sliders if near base, or nearest node if far)
    const preferredType = baseIsNearby
      ? this.pickPriorityResourceType(factionState, resources, worker)
      : undefined;

    const nearestNode =
      resources.findNearestNode(worker.position, preferredType) ??
      resources.findNearestNode(worker.position);

    if (nearestNode) {
      worker.jobMemory = {
        jobType: 'gather',
        targetEntityId: nearestNode.id,
        resourceType: nearestNode.resourceType,
        targetPosition: { ...nearestNode.position },
      };
      worker.status = 'working';
      worker.path = Pathfinder.findPath(
        grid,
        worker.position,
        nearestNode.position,
      );
    }
  }

  private static resolveIdleSoldierOrMachine(
    unit: UnitEntity,
    nearbyBase: BuildingEntity | null,
    slotIndex: number,
    grid: WorldGrid,
  ): void {
    if (nearbyBase) {
      // Base IS nearby -> return to a spread-out GUARD SPOT near the Base
      const footprint = unit.kind === 'machine' ? 2 : 1;
      const spot = grid.computeGuardSpotAroundBase(
        nearbyBase.position,
        slotIndex,
        footprint,
      );
      unit.guardSpot = spot;
      unit.status = 'guarding';
      const dist = Math.hypot(
        spot.x - unit.position.x,
        spot.z - unit.position.z,
      );
      if (dist > 1.2) {
        unit.path = Pathfinder.findPath(grid, unit.position, spot, {
          footprint,
          ignoreEntityId: unit.id,
        });
      }
    } else {
      // Base is NOT nearby -> stay where the player left them, auto-engaging enemies in vision
      unit.guardSpot = { x: unit.position.x, z: unit.position.z };
      unit.status = 'guarding';
      unit.path = [];
    }
  }

  private static pickPriorityResourceType(
    factionState: FactionState | undefined,
    resources: ResourceManager,
    worker: UnitEntity,
  ): ResourceType | undefined {
    if (!factionState) {
      return undefined;
    }
    const entries = Object.entries(factionState.workerPriorities) as Array<
      [ResourceType, number]
    >;
    entries.sort((a, b) => b[1] - a[1]);
    for (const [rType] of entries) {
      if (resources.findNearestNode(worker.position, rType)) {
        return rType;
      }
    }
    return undefined;
  }
}