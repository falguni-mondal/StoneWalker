/**
 * STONEWALKER — Terrain Tactics Helper (Section 10)
 * High ground grants ranged units +range and +damage; forests provide stealth
 * beyond 3.5 tiles; swamp slows movement.
 */

import { BALANCE } from '../data/balance';
import type { Vec2 } from '../data/types';
import type { WorldGrid } from '../world/Grid';

export class TerrainSystem {
  public static isOnHighGround(pos: Vec2, grid: WorldGrid): boolean {
    return (
      grid.getTerrainTag(Math.floor(pos.x), Math.floor(pos.z)) === 'high_ground'
    );
  }

  public static getEffectiveAttackRange(
    baseRange: number,
    attackerPos: Vec2,
    grid: WorldGrid,
  ): number {
    const isRanged = baseRange > 2.5;
    if (isRanged && this.isOnHighGround(attackerPos, grid)) {
      return baseRange * BALANCE.HIGH_GROUND_RANGE_MULTIPLIER;
    }
    return baseRange;
  }

  public static getEffectiveTerrainDamageMultiplier(
    baseRange: number,
    attackerPos: Vec2,
    grid: WorldGrid,
  ): number {
    const isRanged = baseRange > 2.5;
    if (isRanged && this.isOnHighGround(attackerPos, grid)) {
      return BALANCE.HIGH_GROUND_DAMAGE_MULTIPLIER;
    }
    return 1.0;
  }
}