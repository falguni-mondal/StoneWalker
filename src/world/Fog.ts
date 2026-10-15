/**
 * STONEWALKER — Three-State Fog of War (Sections 4 & 10)
 * States: 0 = unknown (unexplored), 1 = explored (shrouded), 2 = visible.
 * Accounts for night vision reduction (-40%), building night firelight, and forest stealth.
 */

import { BALANCE } from '../data/balance';
import type { FogState, Vec2 } from '../data/types';
import type { WorldGrid } from './Grid';

export interface VisionEmitter {
  position: Vec2;
  visionRadius: number;
  isBuildingOrBase: boolean;
}

export class FogOfWar {
  public readonly size: number;
  private readonly states: Uint8Array;

  public constructor(size: number) {
    this.size = size;
    this.states = new Uint8Array(size * size);
  }

  private idx(tx: number, tz: number): number {
    return tz * this.size + tx;
  }

  public getState(tx: number, tz: number): FogState {
    if (tx < 0 || tz < 0 || tx >= this.size || tz >= this.size) {
      return 0;
    }
    return (this.states[this.idx(tx, tz)] ?? 0) as FogState;
  }

  public isPositionVisible(pos: Vec2): boolean {
    return this.getState(Math.floor(pos.x), Math.floor(pos.z)) === 2;
  }

  public isPositionExplored(pos: Vec2): boolean {
    return this.getState(Math.floor(pos.x), Math.floor(pos.z)) >= 1;
  }

  /**
   * Checks whether an enemy unit at `enemyPos` is visible to the player,
   * accounting for Fog of War AND Forest Stealth (Section 10: forests hide units unless an observer is within 3.5 tiles).
   */
  public isEnemyVisibleToObservers(
    enemyPos: Vec2,
    grid: WorldGrid,
    observerPositions: readonly Vec2[],
  ): boolean {
    const tx = Math.floor(enemyPos.x);
    const tz = Math.floor(enemyPos.z);
    if (this.getState(tx, tz) !== 2) {
      return false;
    }
    const tag = grid.getTerrainTag(tx, tz);
    if (tag !== 'forest') {
      return true;
    }
    const revealDistSq =
      BALANCE.FOREST_STEALTH_REVEAL_DISTANCE *
      BALANCE.FOREST_STEALTH_REVEAL_DISTANCE;
    for (const obs of observerPositions) {
      const dx = obs.x - enemyPos.x;
      const dz = obs.z - enemyPos.z;
      if (dx * dx + dz * dz <= revealDistSq) {
        return true;
      }
    }
    return false;
  }

  /**
   * Recomputes visibility across the map from friendly emitters.
   */
  public recompute(
    emitters: readonly VisionEmitter[],
    dayNightMultiplier: number,
    weatherMultiplier: number,
    isNight: boolean,
  ): void {
    // Demote currently visible tiles (2) to explored (1)
    for (let i = 0; i < this.states.length; i++) {
      if (this.states[i] === 2) {
        this.states[i] = 1;
      }
    }

    const combinedMultiplier = dayNightMultiplier * weatherMultiplier;

    for (const emitter of emitters) {
      let radius = emitter.visionRadius * combinedMultiplier;
      if (isNight && emitter.isBuildingOrBase) {
        // Section 4: at night, buildings and the base show warm firelight that reveals their surroundings
        radius = Math.max(radius, BALANCE.NIGHT_BUILDING_FIRELIGHT_RADIUS);
      }
      this.revealCircle(emitter.position.x, emitter.position.z, radius);
    }
  }

  public revealCircle(cx: number, cz: number, radius: number): void {
    const r = Math.max(1, radius);
    const rSq = r * r;
    const minX = Math.max(0, Math.floor(cx - r));
    const maxX = Math.min(this.size - 1, Math.ceil(cx + r));
    const minZ = Math.max(0, Math.floor(cz - r));
    const maxZ = Math.min(this.size - 1, Math.ceil(cz + r));

    for (let tz = minZ; tz <= maxZ; tz++) {
      const dz = tz + 0.5 - cz;
      for (let tx = minX; tx <= maxX; tx++) {
        const dx = tx + 0.5 - cx;
        if (dx * dx + dz * dz <= rSq) {
          this.states[this.idx(tx, tz)] = 2;
        }
      }
    }
  }

  public revealAll(): void {
    this.states.fill(2);
  }

  public getRawBuffer(): Uint8Array {
    return this.states;
  }

  public serialize(): number[] {
    return Array.from(this.states);
  }

  public deserialize(arr: readonly number[]): void {
    const len = Math.min(this.states.length, arr.length);
    for (let i = 0; i < len; i++) {
      this.states[i] = arr[i] ?? 0;
    }
  }
}