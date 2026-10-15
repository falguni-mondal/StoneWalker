/**
 * STONEWALKER — HeightMap & Terrain Tag Grid
 * Stores elevation and tactical terrain tags (ground, high_ground, forest, swamp, water, cliff)
 * for maps from 96x96 up to 192x192.
 */

import type { TerrainTag } from '../data/types';

export interface HeightMapSerialized {
  size: number;
  heights: number[];
  tags: TerrainTag[];
}

const TAG_INDEX_TO_NAME: readonly TerrainTag[] = [
  'ground',
  'high_ground',
  'forest',
  'swamp',
  'water',
  'cliff',
];

const TAG_NAME_TO_INDEX: Record<TerrainTag, number> = {
  ground: 0,
  high_ground: 1,
  forest: 2,
  swamp: 3,
  water: 4,
  cliff: 5,
};

export class HeightMap {
  public readonly size: number;
  private readonly heights: Float32Array;
  private readonly tagIndices: Uint8Array;

  public constructor(size: number) {
    this.size = size;
    this.heights = new Float32Array(size * size);
    this.tagIndices = new Uint8Array(size * size);
  }

  public inBounds(tx: number, tz: number): boolean {
    return tx >= 0 && tz >= 0 && tx < this.size && tz < this.size;
  }

  private idx(tx: number, tz: number): number {
    const cx = Math.max(0, Math.min(this.size - 1, Math.floor(tx)));
    const cz = Math.max(0, Math.min(this.size - 1, Math.floor(tz)));
    return cz * this.size + cx;
  }

  public getHeight(tx: number, tz: number): number {
    return this.heights[this.idx(tx, tz)] ?? 0;
  }

  public setHeight(tx: number, tz: number, h: number): void {
    if (!this.inBounds(tx, tz)) {
      return;
    }
    this.heights[this.idx(tx, tz)] = h;
  }

  /**
   * Bilinearly interpolates terrain height at arbitrary world coordinates (x, z).
   */
  public getInterpolatedHeight(x: number, z: number): number {
    const clampedX = Math.max(0, Math.min(this.size - 1.001, x));
    const clampedZ = Math.max(0, Math.min(this.size - 1.001, z));
    const x0 = Math.floor(clampedX);
    const z0 = Math.floor(clampedZ);
    const x1 = Math.min(this.size - 1, x0 + 1);
    const z1 = Math.min(this.size - 1, z0 + 1);

    const fx = clampedX - x0;
    const fz = clampedZ - z0;

    const h00 = this.getHeight(x0, z0);
    const h10 = this.getHeight(x1, z0);
    const h01 = this.getHeight(x0, z1);
    const h11 = this.getHeight(x1, z1);

    const top = h00 * (1 - fx) + h10 * fx;
    const bottom = h01 * (1 - fx) + h11 * fx;
    return top * (1 - fz) + bottom * fz;
  }

  public getTag(tx: number, tz: number): TerrainTag {
    const code = this.tagIndices[this.idx(tx, tz)] ?? 0;
    return TAG_INDEX_TO_NAME[code] ?? 'ground';
  }

  public setTag(tx: number, tz: number, tag: TerrainTag): void {
    if (!this.inBounds(tx, tz)) {
      return;
    }
    this.tagIndices[this.idx(tx, tz)] = TAG_NAME_TO_INDEX[tag];
  }

  public isWalkableTerrain(tx: number, tz: number): boolean {
    if (!this.inBounds(tx, tz)) {
      return false;
    }
    const tag = this.getTag(tx, tz);
    return tag !== 'water' && tag !== 'cliff';
  }

  public serialize(): HeightMapSerialized {
    const tags: TerrainTag[] = new Array<TerrainTag>(this.tagIndices.length);
    for (let i = 0; i < this.tagIndices.length; i++) {
      tags[i] = TAG_INDEX_TO_NAME[this.tagIndices[i] ?? 0] ?? 'ground';
    }
    return {
      size: this.size,
      heights: Array.from(this.heights),
      tags,
    };
  }

  public static deserialize(data: HeightMapSerialized): HeightMap {
    const map = new HeightMap(data.size);
    for (let i = 0; i < data.heights.length; i++) {
      map.heights[i] = data.heights[i] ?? 0;
      const tag = data.tags[i] ?? 'ground';
      map.tagIndices[i] = TAG_NAME_TO_INDEX[tag] ?? 0;
    }
    return map;
  }
}