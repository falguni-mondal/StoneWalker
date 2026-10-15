/**
 * STONEWALKER — Autonomous Worker Job Execution Coordinator (Sections 7 & 9A)
 * Coordinates GatheringSystem and ConstructionSystem for all non-alarmed workers.
 */

import type { EventBus } from '../core/EventBus';
import type {
  BuildingEntity,
  EntityId,
  FactionState,
  UnitEntity,
} from '../data/types';
import { ConstructionSystem } from '../systems/Construction';
import { GatheringSystem } from '../systems/Gathering';
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
    const buildingList = Array.from(buildings.values());

    for (const unit of units) {
      if (unit.role !== 'worker' || unit.hp <= 0) {
        continue;
      }
      const factionState = factionById.get(unit.faction);
      if (!factionState) {
        continue;
      }

      // If an alarm is active and this worker is currently fighting intruders, skip normal jobs
      if (factionState.alarmActive && unit.status === 'fighting') {
        continue;
      }

      if (
        unit.jobMemory.jobType === 'build' ||
        unit.jobMemory.jobType === 'repair'
      ) {
        ConstructionSystem.updateWorkerBuildAndRepair(
          unit,
          buildings,
          grid,
          bus,
          dt,
        );
      } else if (unit.jobMemory.jobType === 'gather') {
        const relicMult =
          relicGatherMultiplierByFaction.get(unit.faction) ?? 1.0;
        GatheringSystem.updateWorkerGathering(
          unit,
          factionState,
          buildingList,
          resources,
          grid,
          relicMult,
          dt,
        );
      }
    }
  }
}