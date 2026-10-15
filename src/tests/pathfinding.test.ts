/**
 * STONEWALKER — Vitest Unit Tests: Pathfinding with Multi-Tile Footprints (Section 17)
 */

import { describe, expect, it } from 'vitest';
import { Pathfinder } from '../systems/Pathfinding';
import { WorldGrid } from '../world/Grid';
import { HeightMap } from '../world/HeightMap';

describe('Pathfinder & Multi-Tile Footprints', () => {
  it('finds a direct path on open ground for a 1x1 unit', () => {
    const hm = new HeightMap(32);
    const grid = new WorldGrid(hm);

    const path = Pathfinder.findPath(
      grid,
      { x: 4.5, z: 4.5 },
      { x: 14.5, z: 4.5 },
      { footprint: 1 },
    );

    expect(path.length).toBeGreaterThan(0);
    const last = path[path.length - 1]!;
    expect(Math.round(last.x - 0.5)).toBe(14);
    expect(Math.round(last.z - 0.5)).toBe(4);
  });

  it('routes a 4x4 Walking Base around a cliff wall without clipping corners', () => {
    const hm = new HeightMap(48);
    // Create a vertical cliff wall from z = 0..24 at x = 20
    for (let z = 0; z <= 24; z++) {
      hm.setTag(20, z, 'cliff');
    }
    const grid = new WorldGrid(hm);

    const path = Pathfinder.findPath(
      grid,
      { x: 10, z: 10 },
      { x: 32, z: 10 },
      { footprint: 4, allowStompable: true },
    );

    expect(path.length).toBeGreaterThan(10);
    // Verify every waypoint along the path is valid for the 4x4 footprint
    for (const pt of path) {
      const tx = Math.round(pt.x - 2);
      const tz = Math.round(pt.z - 2);
      expect(grid.canOccupyFootprint(tx, tz, 4, null, true)).toBe(true);
    }
  });

  it('computes accurate path preview travel time and blocked flag', () => {
    const hm = new HeightMap(32);
    hm.setTag(20, 20, 'water');
    const grid = new WorldGrid(hm);

    const blockedPreview = Pathfinder.computePathPreview(
      grid,
      { x: 6, z: 6 },
      { x: 20, z: 20 },
      2.0,
      { footprint: 4, allowStompable: true },
    );
    expect(blockedPreview.isBlocked).toBe(true);

    const clearPreview = Pathfinder.computePathPreview(
      grid,
      { x: 6, z: 6 },
      { x: 14, z: 6 },
      2.0,
      { footprint: 4, allowStompable: true },
    );
    expect(clearPreview.isBlocked).toBe(false);
    expect(clearPreview.estimatedSeconds).toBeGreaterThan(0);
  });
});