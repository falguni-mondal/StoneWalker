/**
 * STONEWALKER — Pass-Through Army Movement & Anti-Stuck Steering System
 * - All troops, workers, heroes, beasts, and war machines pass freely through each other
 *   while moving so armies never bottleneck or get stuck on each other.
 * - Stationary units gently fan out (`applyIdleSeparation`) so they don't stack on 1 pixel.
 * - If a newly placed building blocks a moving unit's next waypoint, the unit automatically
 *   re-paths around it.
 */

import { BALANCE } from '../data/balance';
import { BUILDINGS } from '../data/buildings';
import { getBaseEffectiveStats } from '../entities/Base';
import type {
  BuildingEntity,
  TribeId,
  UnitEntity,
  Vec2,
} from '../data/types';
import type { WorldGrid } from '../world/Grid';
import { Pathfinder } from './Pathfinding';

export class MovementSystem {
  public static updateUnits(
    units: Iterable<UnitEntity>,
    grid: WorldGrid,
    weatherSpeedMultiplier: number,
    dt: number,
  ): void {
    const unitList = Array.from(units);

    for (const unit of unitList) {
      if (unit.hp <= 0 || unit.isReviving) {
        continue;
      }

      if (unit.path.length === 0) {
        if (unit.status === 'moving') {
          unit.status = 'idle';
        }
        grid.spatialHash.upsert(unit.id, unit.position);
        continue;
      }

      let target = unit.path[0]!;

      // Dynamic obstacle recovery: if a building was placed on the target waypoint, re-path
      const targetTx = Math.floor(target.x);
      const targetTz = Math.floor(target.z);
      if (
        !grid.heightMap.isWalkableTerrain(targetTx, targetTz) ||
        grid.getBuildingAtTile(targetTx, targetTz) !== null
      ) {
        const finalGoal = unit.path[unit.path.length - 1] ?? target;
        unit.path = Pathfinder.findPath(grid, unit.position, finalGoal, {
          footprint: 1,
          ignoreEntityId: unit.id,
        });
        if (unit.path.length === 0) {
          unit.moveTarget = null;
          if (unit.status === 'moving') {
            unit.status = 'idle';
          }
          continue;
        }
        target = unit.path[0]!;
      }

      const dx = target.x - unit.position.x;
      const dz = target.z - unit.position.z;
      const dist = Math.hypot(dx, dz);

      const tx = Math.floor(unit.position.x);
      const tz = Math.floor(unit.position.z);
      const tag = grid.getTerrainTag(tx, tz);
      const swampMult =
        tag === 'swamp' ? BALANCE.SWAMP_SPEED_MULTIPLIER : 1.0;

      const step = unit.speed * swampMult * weatherSpeedMultiplier * dt;

      if (dist <= step) {
        unit.position.x = target.x;
        unit.position.z = target.z;
        unit.path.shift();
        if (unit.path.length === 0) {
          unit.moveTarget = null;
          if (unit.status === 'moving') {
            unit.status = 'idle';
          }
        }
      } else {
        unit.position.x += (dx / dist) * step;
        unit.position.z += (dz / dist) * step;
        unit.rotation = Math.atan2(dx, dz);
      }

      unit.idleTimer = 0;
      grid.spatialHash.upsert(unit.id, unit.position);
    }

    // Gentle Clash-of-Clans style fan-out only for stationary units so they never block movers
    this.applyIdleSeparation(unitList, grid, dt);
  }

  private static applyIdleSeparation(
    unitList: readonly UnitEntity[],
    grid: WorldGrid,
    dt: number,
  ): void {
    const minSep = 0.62;
    const minSepSq = minSep * minSep;

    for (let i = 0; i < unitList.length; i++) {
      const a = unitList[i]!;
      if (a.hp <= 0 || a.isReviving || a.path.length > 0) {
        continue;
      }
      const nearbyIds = grid.spatialHash.queryRadius(a.position, 1.2);
      for (const bId of nearbyIds) {
        if (bId === a.id) continue;
        const b = unitList.find((u) => u.id === bId);
        if (!b || b.hp <= 0 || b.isReviving || b.path.length > 0) {
          continue;
        }
        const dx = a.position.x - b.position.x;
        const dz = a.position.z - b.position.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < minSepSq) {
          const dist = Math.sqrt(dSq) || 0.01;
          const overlap = (minSep - dist) * 1.8 * dt;
          const nx = (dx / dist) * overlap;
          const nz = (dz / dist) * overlap;
          const candX = a.position.x + nx;
          const candZ = a.position.z + nz;
          if (
            grid.canOccupyFootprint(
              Math.floor(candX),
              Math.floor(candZ),
              1,
              a.id,
              false,
            )
          ) {
            a.position.x = candX;
            a.position.z = candZ;
          }
        }
      }
    }
  }

  public static updateWalkingBuildings(
    buildings: Iterable<BuildingEntity>,
    units: Iterable<UnitEntity>,
    grid: WorldGrid,
    tribeByFaction: ReadonlyMap<string, TribeId>,
    weatherSpeedMultiplier: number,
    dt: number,
    onBaseStep?: (base: BuildingEntity) => void,
  ): void {
    const unitArray = Array.from(units);
    for (const bld of buildings) {
      if (bld.hp <= 0 || bld.mode !== 'move' || bld.path.length === 0) {
        continue;
      }

      grid.setBuildingFootprint(bld.tile, bld.footprint, null);

      const tribe = tribeByFaction.get(bld.faction) ?? 'stonebacks';
      const moveSpeed =
        bld.buildingType === 'base'
          ? getBaseEffectiveStats(bld, tribe).moveSpeed
          : BUILDINGS[bld.buildingType].moveSpeed;

      const target = bld.path[0]!;
      const dx = target.x - bld.position.x;
      const dz = target.z - bld.position.z;
      const dist = Math.hypot(dx, dz);
      const step = moveSpeed * weatherSpeedMultiplier * dt;

      if (dist <= step) {
        bld.position.x = target.x;
        bld.position.z = target.z;
        bld.path.shift();
      } else {
        bld.position.x += (dx / dist) * step;
        bld.position.z += (dz / dist) * step;
      }

      bld.tile = {
        tx: Math.round(bld.position.x - bld.footprint * 0.5),
        tz: Math.round(bld.position.z - bld.footprint * 0.5),
      };

      this.pushFriendlyUnitsAside(bld, unitArray, grid, dt);

      if (bld.buildingType === 'base' && onBaseStep) {
        onBaseStep(bld);
      }

      grid.setBuildingFootprint(bld.tile, bld.footprint, bld.id);
    }
  }

  public static relocateBuildingGroup(
    buildings: readonly BuildingEntity[],
    targetCenter: Vec2,
    grid: WorldGrid,
  ): void {
    if (buildings.length === 0) {
      return;
    }
    let sumX = 0;
    let sumZ = 0;
    for (const b of buildings) {
      sumX += b.position.x;
      sumZ += b.position.z;
    }
    const centroid: Vec2 = {
      x: sumX / buildings.length,
      z: sumZ / buildings.length,
    };

    for (const b of buildings) {
      if (!b.isConstructed) {
        continue;
      }
      b.mode = 'move';
      const offsetX = b.position.x - centroid.x;
      const offsetZ = b.position.z - centroid.z;
      const dest: Vec2 = {
        x: Math.max(4, Math.min(grid.size - 4, targetCenter.x + offsetX)),
        z: Math.max(4, Math.min(grid.size - 4, targetCenter.z + offsetZ)),
      };
      b.moveTarget = dest;
      b.path = Pathfinder.findPath(grid, b.position, dest, {
        footprint: b.footprint,
        ignoreEntityId: b.id,
        allowStompable: b.buildingType === 'base',
      });
    }
  }

  private static pushFriendlyUnitsAside(
    bld: BuildingEntity,
    units: readonly UnitEntity[],
    grid: WorldGrid,
    dt: number,
  ): void {
    const half = bld.footprint * 0.5 + 0.55;
    for (const u of units) {
      if (u.hp <= 0 || u.faction !== bld.faction) {
        continue;
      }
      const dx = u.position.x - bld.position.x;
      const dz = u.position.z - bld.position.z;
      if (Math.abs(dx) < half && Math.abs(dz) < half) {
        const len = Math.hypot(dx, dz) || 0.01;
        const nx = dx / len;
        const nz = dz / len;
        const nextX = u.position.x + nx * BALANCE.BASE_FRIENDLY_PUSH_SPEED * dt;
        const nextZ = u.position.z + nz * BALANCE.BASE_FRIENDLY_PUSH_SPEED * dt;
        if (
          grid.heightMap.isWalkableTerrain(
            Math.floor(nextX),
            Math.floor(nextZ),
          )
        ) {
          u.position.x = nextX;
          u.position.z = nextZ;
        }
      }
    }
  }
}