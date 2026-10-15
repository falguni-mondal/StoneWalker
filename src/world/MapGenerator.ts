/**
 * STONEWALKER — Seeded Procedural Map Generator with Programmatic Validation (Section 11)
 * Generates maps from 96x96 to 192x192, validates start footprints, A* / BFS connectivity
 * between bases, and resource reachability. Retries up to 10 times with derived seeds,
 * then falls back to a guaranteed-valid layout.
 */

import { RNG } from '../core/RNG';
import type { LevelDefinition, MapTheme, Vec2 } from '../data/types';
import { WorldGrid } from './Grid';
import { HeightMap } from './HeightMap';
import { RelicManager } from './Relics';
import { ResourceManager } from './Resources';

export interface GeneratedWorld {
  seedUsed: number;
  size: number;
  theme: MapTheme;
  heightMap: HeightMap;
  grid: WorldGrid;
  resources: ResourceManager;
  relics: RelicManager;
  playerSpawn: Vec2;
  enemySpawns: Vec2[];
}

export class MapGenerator {
  public static generate(level: LevelDefinition): GeneratedWorld {
    const baseRng = new RNG(level.seed);

    for (let attempt = 0; attempt < 10; attempt++) {
      const attemptSeed =
        attempt === 0 ? level.seed : baseRng.deriveSeed(attempt);
      const world = this.tryBuildWorld(level, attemptSeed, false);
      if (this.validateWorld(world)) {
        return world;
      }
    }

    // Safe fallback layout after 10 attempts (guaranteed open corridors & resources)
    return this.tryBuildWorld(level, baseRng.deriveSeed(99), true);
  }

  private static tryBuildWorld(
    level: LevelDefinition,
    seed: number,
    safeFallback: boolean,
  ): GeneratedWorld {
    const rng = new RNG(seed);
    const size = Math.max(96, Math.min(192, level.size));
    const heightMap = new HeightMap(size);
    const grid = new WorldGrid(heightMap);
    const resources = new ResourceManager();
    const relics = new RelicManager();

    // 1. Determine Player & Enemy Base Spawns
    const margin = 18;
    const playerSpawn: Vec2 = { x: margin, z: margin };
    const enemySpawns: Vec2[] = [];

    const candidateCorners: Vec2[] = [
      { x: size - margin, z: size - margin },
      { x: size - margin, z: margin },
      { x: margin, z: size - margin },
    ];
    for (let i = 0; i < Math.min(level.enemyCount, candidateCorners.length); i++) {
      enemySpawns.push(candidateCorners[i]!);
    }

    // 2. Synthesize Elevation & Terrain Tags using deterministic multi-octave value noise
    const phaseX = rng.nextFloat(0, 100);
    const phaseZ = rng.nextFloat(0, 100);

    for (let tz = 0; tz < size; tz++) {
      for (let tx = 0; tx < size; tx++) {
        // Border cliffs on the outermost 2 tiles
        if (tx <= 1 || tz <= 1 || tx >= size - 2 || tz >= size - 2) {
          heightMap.setHeight(tx, tz, 3.2);
          heightMap.setTag(tx, tz, 'cliff');
          continue;
        }

        if (safeFallback) {
          heightMap.setHeight(tx, tz, 0.2);
          heightMap.setTag(tx, tz, 'ground');
          continue;
        }

        const nx = (tx + phaseX) * 0.055;
        const nz = (tz + phaseZ) * 0.055;
        const n1 = Math.sin(nx) * Math.cos(nz);
        const n2 = Math.sin(nx * 2.3 + 1.7) * Math.cos(nz * 2.1 - 0.9) * 0.5;
        const val = (n1 + n2 + 1.5) / 3.0; // Normalized ~ [0, 1]

        this.applyThemeTerrain(heightMap, tx, tz, val, level.theme);
      }
    }

    // 3. Carve flat walkable plateaus around all spawns and wide connecting corridors
    const allSpawns = [playerSpawn, ...enemySpawns];
    for (const sp of allSpawns) {
      this.carveCircle(heightMap, sp.x, sp.z, 13, 0.25, 'ground');
    }

    for (const enemySp of enemySpawns) {
      this.carveRoad(heightMap, playerSpawn, enemySp, 5);
    }
    if (level.objectives.some((o) => o.targetPosition)) {
      for (const obj of level.objectives) {
        if (obj.targetPosition) {
          this.carveCircle(
            heightMap,
            obj.targetPosition.x,
            obj.targetPosition.z,
            8,
            0.35,
            'ground',
          );
          this.carveRoad(heightMap, playerSpawn, obj.targetPosition, 4);
        }
      }
    }

    // 4. Place starting resource clusters near every base spawn (within 10-16 tiles)
    for (const sp of allSpawns) {
      this.placeBaseStarterResources(sp, resources, grid, rng);
    }

    // 5. Place expansion resource pockets & forests across the map to encourage moving the Base
    const expansionClusters = Math.floor((size * size) / 900);
    for (let c = 0; c < expansionClusters; c++) {
      const cx = rng.nextInt(14, size - 15);
      const cz = rng.nextInt(14, size - 15);
      if (this.isNearAnySpawn(cx, cz, allSpawns, 16)) {
        continue;
      }
      this.placeExpansionCluster(cx, cz, resources, grid, rng);
    }

    // 6. Place 2 Relics in neutral territory
    const midX = Math.floor(size / 2);
    const midZ = Math.floor(size / 2);
    this.carveCircle(heightMap, midX, midZ, 6, 0.4, 'ground');
    relics.spawnRelic(
      'Sunstone of Swift Harvest (+15% Gather)',
      { x: midX + 0.5, z: Math.max(16, midZ - 14) + 0.5 },
      'gather_speed',
      0.15,
    );
    relics.spawnRelic(
      'All-Seeing Monolith (+20% Vision)',
      { x: Math.max(16, midX - 14) + 0.5, z: midZ + 0.5 },
      'vision',
      0.2,
    );

    return {
      seedUsed: seed,
      size,
      theme: level.theme,
      heightMap,
      grid,
      resources,
      relics,
      playerSpawn,
      enemySpawns,
    };
  }

  private static applyThemeTerrain(
    heightMap: HeightMap,
    tx: number,
    tz: number,
    val: number,
    theme: MapTheme,
  ): void {
    if (val > 0.84) {
      heightMap.setHeight(tx, tz, 2.8);
      heightMap.setTag(tx, tz, 'cliff');
    } else if (val > 0.68) {
      heightMap.setHeight(tx, tz, 1.35);
      heightMap.setTag(tx, tz, 'high_ground');
    } else if (val < 0.14 && theme !== 'arid_desert') {
      heightMap.setHeight(tx, tz, -0.35);
      heightMap.setTag(tx, tz, 'water');
    } else if (
      val < 0.24 &&
      (theme === 'misty_swamp' || theme === 'river_crossings')
    ) {
      heightMap.setHeight(tx, tz, 0.05);
      heightMap.setTag(tx, tz, 'swamp');
    } else if (val > 0.48 && val <= 0.62 && theme !== 'arid_desert') {
      heightMap.setHeight(tx, tz, 0.35);
      heightMap.setTag(tx, tz, 'forest');
    } else {
      heightMap.setHeight(tx, tz, 0.25 + val * 0.3);
      heightMap.setTag(tx, tz, 'ground');
    }
  }

  private static carveCircle(
    heightMap: HeightMap,
    cx: number,
    cz: number,
    radius: number,
    height: number,
    tag: 'ground' | 'high_ground',
  ): void {
    const rSq = radius * radius;
    const minX = Math.max(2, Math.floor(cx - radius));
    const maxX = Math.min(heightMap.size - 3, Math.ceil(cx + radius));
    const minZ = Math.max(2, Math.floor(cz - radius));
    const maxZ = Math.min(heightMap.size - 3, Math.ceil(cz + radius));

    for (let tz = minZ; tz <= maxZ; tz++) {
      for (let tx = minX; tx <= maxX; tx++) {
        const dx = tx - cx;
        const dz = tz - cz;
        if (dx * dx + dz * dz <= rSq) {
          heightMap.setHeight(tx, tz, height);
          heightMap.setTag(tx, tz, tag);
        }
      }
    }
  }

  private static carveRoad(
    heightMap: HeightMap,
    from: Vec2,
    to: Vec2,
    halfWidth: number,
  ): void {
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    const steps = Math.max(1, Math.ceil(dist * 1.5));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(from.x + (to.x - from.x) * t);
      const z = Math.round(from.z + (to.z - from.z) * t);
      this.carveCircle(heightMap, x, z, halfWidth, 0.25, 'ground');
    }
  }

  private static placeBaseStarterResources(
    spawn: Vec2,
    resources: ResourceManager,
    grid: WorldGrid,
    rng: RNG,
  ): void {
    const offsets: Array<{
      dx: number;
      dz: number;
      type: 'food' | 'wood' | 'stone' | 'hide';
      amount: number;
    }> = [
      { dx: 8, dz: 2, type: 'food', amount: 220 },
      { dx: 9, dz: 3, type: 'food', amount: 220 },
      { dx: 2, dz: 8, type: 'wood', amount: 200 },
      { dx: 3, dz: 8, type: 'wood', amount: 200 },
      { dx: 4, dz: 8, type: 'wood', amount: 200 },
      { dx: -7, dz: 5, type: 'stone', amount: 240 },
      { dx: -8, dz: 5, type: 'stone', amount: 240 },
      { dx: 6, dz: -6, type: 'hide', amount: 160 },
    ];

    const center = this.clampToInterior(spawn, grid.size, 12);
    for (const off of offsets) {
      const tx = Math.max(3, Math.min(grid.size - 4, Math.round(center.x + off.dx)));
      const tz = Math.max(3, Math.min(grid.size - 4, Math.round(center.z + off.dz)));
      if (
        grid.heightMap.isWalkableTerrain(tx, tz) &&
        !grid.getResourceAtTile(tx, tz)
      ) {
        if (off.type === 'wood') {
          grid.heightMap.setTag(tx, tz, 'forest');
        }
        resources.spawnNode(
          off.type,
          { tx, tz },
          off.amount + rng.nextInt(-20, 30),
          grid,
        );
      }
    }
  }

  private static placeExpansionCluster(
    cx: number,
    cz: number,
    resources: ResourceManager,
    grid: WorldGrid,
    rng: RNG,
  ): void {
    const types: Array<'food' | 'wood' | 'stone' | 'hide' | 'bronze'> = [
      'wood',
      'wood',
      'food',
      'stone',
      'hide',
      'bronze',
    ];
    const pickedType = rng.pick(types);
    const count = pickedType === 'wood' ? rng.nextInt(4, 7) : rng.nextInt(2, 4);

    for (let i = 0; i < count; i++) {
      const tx = cx + rng.nextInt(-2, 2);
      const tz = cz + rng.nextInt(-2, 2);
      if (
        !grid.inBounds(tx, tz) ||
        !grid.heightMap.isWalkableTerrain(tx, tz) ||
        grid.getResourceAtTile(tx, tz)
      ) {
        continue;
      }
      if (pickedType === 'wood') {
        grid.heightMap.setTag(tx, tz, 'forest');
      }
      const baseAmount =
        pickedType === 'bronze' ? 260 : pickedType === 'stone' ? 280 : 220;
      resources.spawnNode(pickedType, { tx, tz }, baseAmount, grid);
    }
  }

  private static isNearAnySpawn(
    x: number,
    z: number,
    spawns: readonly Vec2[],
    minDist: number,
  ): boolean {
    const minSq = minDist * minDist;
    for (const sp of spawns) {
      const dx = sp.x - x;
      const dz = sp.z - z;
      if (dx * dx + dz * dz < minSq) {
        return true;
      }
    }
    return false;
  }

  private static clampToInterior(pos: Vec2, size: number, margin: number): Vec2 {
    return {
      x: Math.max(margin, Math.min(size - margin, pos.x)),
      z: Math.max(margin, Math.min(size - margin, pos.z)),
    };
  }

  /**
   * Programmatic validation (Section 11):
   * 1. Start footprints (4x4 Base) are clear & buildable.
   * 2. Walkable path connects Player spawn to every Enemy spawn.
   * 3. Starter resources exist within 16 tiles of Player spawn.
   */
  public static validateWorld(world: GeneratedWorld): boolean {
    const { grid, playerSpawn, enemySpawns, resources } = world;
    const pTileX = Math.floor(playerSpawn.x) - 2;
    const pTileZ = Math.floor(playerSpawn.z) - 2;

    if (!grid.canOccupyFootprint(pTileX, pTileZ, 4, null, true)) {
      return false;
    }

    for (const enemy of enemySpawns) {
      const eTileX = Math.floor(enemy.x) - 2;
      const eTileZ = Math.floor(enemy.z) - 2;
      if (!grid.canOccupyFootprint(eTileX, eTileZ, 4, null, true)) {
        return false;
      }
      if (!this.hasConnectedPath(grid, playerSpawn, enemy)) {
        return false;
      }
    }

    const nearestFood = resources.findNearestNode(playerSpawn, 'food', 18);
    const nearestWood = resources.findNearestNode(playerSpawn, 'wood', 18);
    if (!nearestFood || !nearestWood) {
      return false;
    }

    return true;
  }

  private static hasConnectedPath(
    grid: WorldGrid,
    start: Vec2,
    goal: Vec2,
  ): boolean {
    const size = grid.size;
    const sx = Math.floor(start.x);
    const sz = Math.floor(start.z);
    const gx = Math.floor(goal.x);
    const gz = Math.floor(goal.z);

    const visited = new Uint8Array(size * size);
    const queueX = new Int16Array(size * size);
    const queueZ = new Int16Array(size * size);
    let head = 0;
    let tail = 0;

    queueX[tail] = sx;
    queueZ[tail] = sz;
    tail++;
    visited[sz * size + sx] = 1;

    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const;

    while (head < tail) {
      const cx = queueX[head]!;
      const cz = queueZ[head]!;
      head++;

      if (Math.abs(cx - gx) <= 2 && Math.abs(cz - gz) <= 2) {
        return true;
      }

      for (const [dx, dz] of dirs) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (!grid.inBounds(nx, nz)) {
          continue;
        }
        const idx = nz * size + nx;
        if (visited[idx]) {
          continue;
        }
        if (!grid.heightMap.isWalkableTerrain(nx, nz)) {
          continue;
        }
        visited[idx] = 1;
        queueX[tail] = nx;
        queueZ[tail] = nz;
        tail++;
      }
    }
    return false;
  }
}