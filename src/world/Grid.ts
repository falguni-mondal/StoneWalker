/**
 * STONEWALKER — Walkability Grid, Footprint Occupancy & Forgiving Building Placement
 * Supports multi-tile footprints (1x1 units up to 4x4 Walking Base),
 * O(1) spatial hash neighbor queries, and automatic nearest-valid-tile snapping.
 */

import { CONFIG } from '../config';
import { BALANCE } from '../data/balance';
import type { EntityId, TerrainTag, TileCoord, Vec2 } from '../data/types';
import type { HeightMap } from './HeightMap';

export class SpatialHash {
  private readonly cellSize: number;
  private readonly buckets = new Map<string, Set<EntityId>>();
  private readonly entityPositions = new Map<EntityId, Vec2>();

  public constructor(cellSize: number = CONFIG.SPATIAL_HASH_CELL_SIZE) {
    this.cellSize = cellSize;
  }

  private key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  public clear(): void {
    this.buckets.clear();
    this.entityPositions.clear();
  }

  public upsert(id: EntityId, pos: Vec2): void {
    this.remove(id);
    const cx = Math.floor(pos.x / this.cellSize);
    const cz = Math.floor(pos.z / this.cellSize);
    const k = this.key(cx, cz);
    let set = this.buckets.get(k);
    if (!set) {
      set = new Set<EntityId>();
      this.buckets.set(k, set);
    }
    set.add(id);
    this.entityPositions.set(id, { x: pos.x, z: pos.z });
  }

  public remove(id: EntityId): void {
    const prev = this.entityPositions.get(id);
    if (!prev) {
      return;
    }
    const cx = Math.floor(prev.x / this.cellSize);
    const cz = Math.floor(prev.z / this.cellSize);
    const set = this.buckets.get(this.key(cx, cz));
    if (set) {
      set.delete(id);
    }
    this.entityPositions.delete(id);
  }

  public queryRadius(center: Vec2, radius: number): EntityId[] {
    const minCx = Math.floor((center.x - radius) / this.cellSize);
    const maxCx = Math.floor((center.x + radius) / this.cellSize);
    const minCz = Math.floor((center.z - radius) / this.cellSize);
    const maxCz = Math.floor((center.z + radius) / this.cellSize);
    const rSq = radius * radius;
    const result: EntityId[] = [];

    for (let cz = minCz; cz <= maxCz; cz++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const set = this.buckets.get(this.key(cx, cz));
        if (!set) {
          continue;
        }
        for (const id of set) {
          const pos = this.entityPositions.get(id);
          if (!pos) {
            continue;
          }
          const dx = pos.x - center.x;
          const dz = pos.z - center.z;
          if (dx * dx + dz * dz <= rSq) {
            result.push(id);
          }
        }
      }
    }
    return result;
  }
}

export class WorldGrid {
  public readonly size: number;
  public readonly heightMap: HeightMap;
  public readonly spatialHash: SpatialHash;
  private readonly buildingOccupancy: (EntityId | null)[];
  private readonly resourceOccupancy: (EntityId | null)[];

  public constructor(heightMap: HeightMap) {
    this.size = heightMap.size;
    this.heightMap = heightMap;
    this.spatialHash = new SpatialHash();
    const total = this.size * this.size;
    this.buildingOccupancy = new Array<EntityId | null>(total).fill(null);
    this.resourceOccupancy = new Array<EntityId | null>(total).fill(null);
  }

  public inBounds(tx: number, tz: number): boolean {
    return tx >= 0 && tz >= 0 && tx < this.size && tz < this.size;
  }

  private idx(tx: number, tz: number): number {
    return tz * this.size + tx;
  }

  public getTerrainTag(tx: number, tz: number): TerrainTag {
    return this.heightMap.getTag(tx, tz);
  }

  public setBuildingFootprint(
    tile: TileCoord,
    footprint: number,
    buildingId: EntityId | null,
  ): void {
    for (let dz = 0; dz < footprint; dz++) {
      for (let dx = 0; dx < footprint; dx++) {
        const tx = tile.tx + dx;
        const tz = tile.tz + dz;
        if (this.inBounds(tx, tz)) {
          this.buildingOccupancy[this.idx(tx, tz)] = buildingId;
          if (buildingId !== null && this.heightMap.getTag(tx, tz) === 'forest') {
            this.heightMap.setTag(tx, tz, 'ground');
          }
        }
      }
    }
  }

  public setResourceTile(tile: TileCoord, resourceId: EntityId | null): void {
    if (this.inBounds(tile.tx, tile.tz)) {
      this.resourceOccupancy[this.idx(tile.tx, tile.tz)] = resourceId;
    }
  }

  public getBuildingAtTile(tx: number, tz: number): EntityId | null {
    if (!this.inBounds(tx, tz)) {
      return null;
    }
    return this.buildingOccupancy[this.idx(tx, tz)] ?? null;
  }

  public getResourceAtTile(tx: number, tz: number): EntityId | null {
    if (!this.inBounds(tx, tz)) {
      return null;
    }
    return this.resourceOccupancy[this.idx(tx, tz)] ?? null;
  }

  public canOccupyFootprint(
    tx: number,
    tz: number,
    footprint: number = 1,
    ignoreEntityId: EntityId | null = null,
    allowStompable: boolean = false,
  ): boolean {
    for (let dz = 0; dz < footprint; dz++) {
      for (let dx = 0; dx < footprint; dx++) {
        const cx = tx + dx;
        const cz = tz + dz;
        if (!this.inBounds(cx, cz)) {
          return false;
        }
        if (!this.heightMap.isWalkableTerrain(cx, cz)) {
          return false;
        }
        const bId = this.buildingOccupancy[this.idx(cx, cz)];
        if (bId !== null && bId !== ignoreEntityId && !allowStompable) {
          return false;
        }
        if (!allowStompable) {
          const rId = this.resourceOccupancy[this.idx(cx, cz)];
          if (rId !== null && rId !== ignoreEntityId) {
            return false;
          }
        }
      }
    }
    return true;
  }

  /**
   * Checks whether a building can be placed at (tx, tz) with the given footprint.
   * Allows placing on ground, high_ground, swamp, and forest (only deep water, cliffs,
   * existing buildings, and active resource nodes block placement).
   */
  public canPlaceBuilding(
    tx: number,
    tz: number,
    footprint: number,
    ignoreEntityId: EntityId | null = null,
  ): boolean {
    for (let dz = 0; dz < footprint; dz++) {
      for (let dx = 0; dx < footprint; dx++) {
        const cx = tx + dx;
        const cz = tz + dz;
        if (cx < 2 || cz < 2 || cx >= this.size - 2 || cz >= this.size - 2) {
          return false;
        }
        const tag = this.heightMap.getTag(cx, cz);
        if (tag === 'water' || tag === 'cliff') {
          return false;
        }
        const bId = this.buildingOccupancy[this.idx(cx, cz)];
        if (bId !== null && bId !== ignoreEntityId) {
          return false;
        }
        const rId = this.resourceOccupancy[this.idx(cx, cz)];
        if (rId !== null) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Spiral-searches outward from `(originTx, originTz)` up to `maxRadius` tiles
   * to find the closest valid buildable tile for a building of size `footprint`.
   */
  public findNearestValidBuildTile(
    originTx: number,
    originTz: number,
    footprint: number,
    maxRadius: number = 18,
  ): TileCoord {
    const clampedX = Math.max(2, Math.min(this.size - footprint - 2, originTx));
    const clampedZ = Math.max(2, Math.min(this.size - footprint - 2, originTz));

    if (this.canPlaceBuilding(clampedX, clampedZ, footprint)) {
      return { tx: clampedX, tz: clampedZ };
    }

    for (let r = 1; r <= maxRadius; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) {
            continue;
          }
          const cx = clampedX + dx;
          const cz = clampedZ + dz;
          if (this.canPlaceBuilding(cx, cz, footprint)) {
            return { tx: cx, tz: cz };
          }
        }
      }
    }

    return { tx: clampedX, tz: clampedZ };
  }

  public computeGuardSpotAroundBase(
    baseCenter: Vec2,
    slotIndex: number,
    footprint: number = 1,
  ): Vec2 {
    const goldenAngle = 2.399963229728653;
    const baseRadius = BALANCE.BASE_GUARD_RING_RADIUS_TILES;

    for (let attempt = 0; attempt < 24; attempt++) {
      const idx = slotIndex + attempt;
      const ringOffset = Math.floor(idx / 12) * 2.5;
      const radius = baseRadius + ringOffset;
      const angle = idx * goldenAngle;
      const tx = Math.round(baseCenter.x + Math.cos(angle) * radius);
      const tz = Math.round(baseCenter.z + Math.sin(angle) * radius);

      if (this.canOccupyFootprint(tx, tz, footprint)) {
        return { x: tx + 0.5, z: tz + 0.5 };
      }
    }
    return {
      x: Math.max(2, Math.min(this.size - 3, baseCenter.x + 6)),
      z: Math.max(2, Math.min(this.size - 3, baseCenter.z + 6)),
    };
  }
}