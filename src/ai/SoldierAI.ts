/**
 * STONEWALKER — Autonomous Soldier & Machine Auto-Engage AI (Section 9C)
 * Idle or guarding troops and machines automatically acquire enemies that enter their vision.
 */

import { HEROES } from '../data/heroes';
import { MACHINES } from '../data/machines';
import { UNITS } from '../data/units';
import type {
  BuildingEntity,
  EntityId,
  UnitEntity,
  UnitRole,
} from '../data/types';

export class SoldierAI {
  public static update(
    units: ReadonlyMap<EntityId, UnitEntity>,
    buildings: ReadonlyMap<EntityId, BuildingEntity>,
    visionMultiplier: number,
  ): void {
    for (const unit of units.values()) {
      if (
        unit.hp <= 0 ||
        unit.isReviving ||
        unit.role === 'worker' ||
        unit.role === 'shaman' ||
        unit.targetEntityId !== null ||
        unit.status === 'moving'
      ) {
        continue;
      }

      const baseVision =
        unit.kind === 'unit'
          ? UNITS[unit.role as UnitRole]?.vision ?? 11
          : unit.kind === 'machine'
            ? MACHINES[unit.role as keyof typeof MACHINES]?.vision ?? 12
            : HEROES.stonebacks.vision;

      const effectiveVision = baseVision * visionMultiplier;
      const vSq = effectiveVision * effectiveVision;

      let bestTargetId: EntityId | null = null;
      let bestDistSq = vSq;

      for (const other of units.values()) {
        if (
          other.hp <= 0 ||
          other.faction === unit.faction ||
          other.faction === 'neutral'
        ) {
          continue;
        }
        const dx = other.position.x - unit.position.x;
        const dz = other.position.z - unit.position.z;
        const dSq = dx * dx + dz * dz;
        if (dSq <= bestDistSq) {
          bestDistSq = dSq;
          bestTargetId = other.id;
        }
      }

      if (!bestTargetId) {
        for (const bld of buildings.values()) {
          if (
            bld.hp <= 0 ||
            bld.faction === unit.faction ||
            bld.faction === 'neutral'
          ) {
            continue;
          }
          const dx = bld.position.x - unit.position.x;
          const dz = bld.position.z - unit.position.z;
          const dSq = dx * dx + dz * dz;
          if (dSq <= bestDistSq) {
            bestDistSq = dSq;
            bestTargetId = bld.id;
          }
        }
      }

      if (bestTargetId) {
        unit.targetEntityId = bestTargetId;
        unit.status = 'fighting';
      }
    }
  }
}