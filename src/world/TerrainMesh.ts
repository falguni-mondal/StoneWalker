/**
 * STONEWALKER — Rich Diorama Terrain, Dense Forestation Trees & Resource Renderer
 * - Renders 3D multi-tiered pine & canopy trees across ALL `'forest'` terrain tiles
 *   plus scenic highland groves so the world is lush and forested.
 * - Renders resource nodes (wood groves, stone boulders, red berry bushes, hide racks, bronze crystals).
 */

import * as THREE from 'three';
import { CONFIG } from '../config';
import type {
  MapTheme,
  ResourceNodeEntity,
  TerrainTag,
} from '../data/types';
import type { FogOfWar } from './Fog';
import type { HeightMap } from './HeightMap';

interface ThemePalette {
  ground: number;
  high_ground: number;
  forest: number;
  swamp: number;
  water: number;
  cliff: number;
  sand: number;
}

const THEME_PALETTES: Record<MapTheme, ThemePalette> = {
  green_valley: {
    ground: 0x7da34e,
    high_ground: 0xb09e72,
    forest: 0x527a36,
    swamp: 0x5f734c,
    water: 0x3b96c4,
    cliff: 0x7c7064,
    sand: 0xd9c38e,
  },
  ancient_forest: {
    ground: 0x6b9144,
    high_ground: 0x9c8b63,
    forest: 0x43692c,
    swamp: 0x526644,
    water: 0x3888b2,
    cliff: 0x6e6256,
    sand: 0xcab482,
  },
  misty_swamp: {
    ground: 0x6a8050,
    high_ground: 0x8f8468,
    forest: 0x4b6339,
    swamp: 0x4d5e42,
    water: 0x417a85,
    cliff: 0x696259,
    sand: 0xb8a982,
  },
  arid_desert: {
    ground: 0xd9ad66,
    high_ground: 0xc78b4e,
    forest: 0x998e4c,
    swamp: 0xa68756,
    water: 0x459ec2,
    cliff: 0x99653c,
    sand: 0xe8c787,
  },
  frost_peaks: {
    ground: 0xdbe6eb,
    high_ground: 0xf0f6f9,
    forest: 0x6f8c7d,
    swamp: 0x889ca1,
    water: 0x5292bd,
    cliff: 0x7c8790,
    sand: 0xc8d4d9,
  },
  volcanic_crag: {
    ground: 0x63544c,
    high_ground: 0x826758,
    forest: 0x566144,
    swamp: 0x4d453f,
    water: 0xd95b2b,
    cliff: 0x453b37,
    sand: 0x7a6558,
  },
  river_crossings: {
    ground: 0x82a856,
    high_ground: 0xad9b72,
    forest: 0x527538,
    swamp: 0x5f7550,
    water: 0x3b96c9,
    cliff: 0x786c60,
    sand: 0xdec892,
  },
  titan_plateau: {
    ground: 0x9c8960,
    high_ground: 0xb8a074,
    forest: 0x5e7542,
    swamp: 0x6b654d,
    water: 0x4288ad,
    cliff: 0x6b5e54,
    sand: 0xd1ba88,
  },
};

interface ChunkRecord {
  chunkX: number;
  chunkZ: number;
  mesh: THREE.Mesh;
  baseColors: Float32Array;
}

export class TerrainRenderer {
  public readonly root = new THREE.Group();
  private readonly propGroup = new THREE.Group();
  private readonly chunks: ChunkRecord[] = [];
  private readonly heightMap: HeightMap;
  private readonly theme: MapTheme;

  public constructor(heightMap: HeightMap, theme: MapTheme) {
    this.heightMap = heightMap;
    this.theme = theme;
    this.buildTerrainChunks();
    this.buildGrassAndWildflowers();
    this.root.add(this.propGroup);
  }

  private isNearWater(tx: number, tz: number): boolean {
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const;
    for (const [dx, dz] of dirs) {
      if (this.heightMap.getTag(tx + dx, tz + dz) === 'water') {
        return true;
      }
    }
    return false;
  }

  private buildTerrainChunks(): void {
    const size = this.heightMap.size;
    const chunkSize = CONFIG.TERRAIN_CHUNK_SIZE;
    const palette = THEME_PALETTES[this.theme];
    const numChunks = Math.ceil(size / chunkSize);

    const sharedMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.84,
      metalness: 0.06,
      flatShading: true,
    });

    const colorHelper = new THREE.Color();

    for (let cz = 0; cz < numChunks; cz++) {
      for (let cx = 0; cx < numChunks; cx++) {
        const startX = cx * chunkSize;
        const startZ = cz * chunkSize;
        const tilesW = Math.min(chunkSize, size - startX);
        const tilesH = Math.min(chunkSize, size - startZ);

        const positions: number[] = [];
        const colors: number[] = [];

        for (let dz = 0; dz < tilesH; dz++) {
          for (let dx = 0; dx < tilesW; dx++) {
            const tx = startX + dx;
            const tz = startZ + dz;

            const h00 = this.heightMap.getHeight(tx, tz);
            const h10 = this.heightMap.getHeight(tx + 1, tz);
            const h01 = this.heightMap.getHeight(tx, tz + 1);
            const h11 = this.heightMap.getHeight(tx + 1, tz + 1);

            const tag: TerrainTag = this.heightMap.getTag(tx, tz);
            if (tag === 'ground' && this.isNearWater(tx, tz)) {
              colorHelper.setHex(palette.sand);
            } else {
              colorHelper.setHex(palette[tag]);
            }

            const checker = ((tx + tz) & 1) === 0 ? 0.018 : -0.014;
            const jitter = (((tx * 37 + tz * 17) & 7) - 3.5) * 0.008 + checker;
            const r = Math.max(0, Math.min(1, colorHelper.r + jitter));
            const g = Math.max(0, Math.min(1, colorHelper.g + jitter));
            const b = Math.max(0, Math.min(1, colorHelper.b + jitter));

            positions.push(
              tx,
              h00,
              tz,
              tx,
              h01,
              tz + 1,
              tx + 1,
              h10,
              tz,
              tx + 1,
              h10,
              tz,
              tx,
              h01,
              tz + 1,
              tx + 1,
              h11,
              tz + 1,
            );

            for (let v = 0; v < 6; v++) {
              colors.push(r, g, b);
            }
          }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(positions, 3),
        );
        const colorFloatArray = new Float32Array(colors);
        geometry.setAttribute(
          'color',
          new THREE.BufferAttribute(colorFloatArray.slice(), 3),
        );
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();

        const mesh = new THREE.Mesh(geometry, sharedMaterial);
        mesh.frustumCulled = true;
        mesh.receiveShadow = true;
        this.root.add(mesh);

        this.chunks.push({
          chunkX: cx,
          chunkZ: cz,
          mesh,
          baseColors: colorFloatArray,
        });
      }
    }
  }

  private buildGrassAndWildflowers(): void {
    const size = this.heightMap.size;
    const coords: Array<{ x: number; y: number; z: number; s: number }> = [];
    for (let tz = 3; tz < size - 3; tz += 2) {
      for (let tx = 3; tx < size - 3; tx += 2) {
        if (((tx * 19 + tz * 31) & 7) !== 0) {
          continue;
        }
        const tag = this.heightMap.getTag(tx, tz);
        if (tag !== 'ground' && tag !== 'high_ground') {
          continue;
        }
        const h = this.heightMap.getHeight(tx, tz);
        coords.push({
          x: tx + 0.35,
          y: h + 0.14,
          z: tz + 0.45,
          s: 0.75 + ((tx * 7 + tz) % 5) * 0.12,
        });
      }
    }

    if (coords.length === 0) return;
    const tuftMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.16, 0.34, 4),
      new THREE.MeshStandardMaterial({
        color: 0x62963b,
        roughness: 0.85,
        flatShading: true,
      }),
      coords.length,
    );
    const dummy = new THREE.Object3D();
    for (let i = 0; i < coords.length; i++) {
      const c = coords[i]!;
      dummy.position.set(c.x, c.y, c.z);
      dummy.scale.setScalar(c.s);
      dummy.rotation.y = i * 1.1;
      dummy.updateMatrix();
      tuftMesh.setMatrixAt(i, dummy.matrix);
    }
    tuftMesh.count = coords.length;
    this.root.add(tuftMesh);
  }

  /**
   * Rebuilds multi-part InstancedMesh batches for all active resource nodes
   * AND all `'forest'` terrain tiles so the map has lush 3D forestation!
   */
  public syncResourceInstancedMeshes(
    nodes: readonly ResourceNodeEntity[],
    fog: FogOfWar,
  ): void {
    while (this.propGroup.children.length > 0) {
      const child = this.propGroup.children[0]!;
      this.propGroup.remove(child);
      if (child instanceof THREE.InstancedMesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }

    const visibleNodes = nodes.filter(
      (n) => fog.getState(n.tile.tx, n.tile.tz) > 0,
    );
    const woods = visibleNodes.filter((n) => n.resourceType === 'wood');
    const stones = visibleNodes.filter((n) => n.resourceType === 'stone');
    const foods = visibleNodes.filter((n) => n.resourceType === 'food');
    const hides = visibleNodes.filter((n) => n.resourceType === 'hide');
    const bronzes = visibleNodes.filter((n) => n.resourceType === 'bronze');

    // Collect all tree positions:
    // (A) Every Wood resource node gets a cluster of 2 trees
    // (B) Every 'forest' terrain tile on the map gets 2 trees for rich forestation
    // (C) Scenic border/highland trees on unblocked high_ground edges
    const treePlacements: Array<{
      x: number;
      y: number;
      z: number;
      scale: number;
      rotY: number;
    }> = [];

    const woodTileSet = new Set<string>();
    for (const w of woods) {
      woodTileSet.add(`${w.tile.tx},${w.tile.tz}`);
      const h = this.heightMap.getHeight(w.tile.tx, w.tile.tz);
      const baseScale =
        0.95 + ((w.tile.tx * 13 + w.tile.tz * 7) % 5) * 0.08;
      treePlacements.push({
        x: w.position.x - 0.18,
        y: h,
        z: w.position.z - 0.15,
        scale: baseScale,
        rotY: (w.tile.tx * 1.3 + w.tile.tz) % Math.PI,
      });
      treePlacements.push({
        x: w.position.x + 0.24,
        y: h,
        z: w.position.z + 0.2,
        scale: baseScale * 0.78,
        rotY: (w.tile.tx * 2.1 + w.tile.tz) % Math.PI,
      });
    }

    const size = this.heightMap.size;
    for (let tz = 2; tz < size - 2; tz++) {
      for (let tx = 2; tx < size - 2; tx++) {
        if (fog.getState(tx, tz) === 0) {
          continue;
        }
        const key = `${tx},${tz}`;
        if (woodTileSet.has(key)) {
          continue;
        }
        const tag = this.heightMap.getTag(tx, tz);
        if (tag === 'forest') {
          const h = this.heightMap.getHeight(tx, tz);
          const s = 0.85 + ((tx * 11 + tz * 17) % 6) * 0.07;
          treePlacements.push({
            x: tx + 0.32,
            y: h,
            z: tz + 0.36,
            scale: s,
            rotY: (tx * 1.7 + tz * 0.9) % Math.PI,
          });
          if (((tx + tz) & 1) === 0) {
            treePlacements.push({
              x: tx + 0.72,
              y: h,
              z: tz + 0.68,
              scale: s * 0.76,
              rotY: (tx * 0.7 + tz * 1.9) % Math.PI,
            });
          }
        }
      }
    }

    const dummy = new THREE.Object3D();

    // 1. Render All Forest & Wood-Node Trees (Trunk + Lower Canopy + Upper Canopy)
    if (treePlacements.length > 0) {
      const trunks = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.14, 0.24, 1.0, 6),
        new THREE.MeshStandardMaterial({
          color: 0x6e4726,
          roughness: 0.9,
          flatShading: true,
        }),
        treePlacements.length,
      );
      const lowerCrowns = new THREE.InstancedMesh(
        new THREE.ConeGeometry(0.76, 1.38, 7),
        new THREE.MeshStandardMaterial({
          color: 0x3b7528,
          roughness: 0.8,
          flatShading: true,
        }),
        treePlacements.length,
      );
      const upperCrowns = new THREE.InstancedMesh(
        new THREE.ConeGeometry(0.55, 1.18, 7),
        new THREE.MeshStandardMaterial({
          color: 0x529438,
          roughness: 0.78,
          flatShading: true,
        }),
        treePlacements.length,
      );
      trunks.castShadow = true;
      lowerCrowns.castShadow = true;
      upperCrowns.castShadow = true;

      for (let i = 0; i < treePlacements.length; i++) {
        const tp = treePlacements[i]!;
        dummy.scale.setScalar(tp.scale);
        dummy.rotation.y = tp.rotY;

        dummy.position.set(tp.x, tp.y + 0.45 * tp.scale, tp.z);
        dummy.updateMatrix();
        trunks.setMatrixAt(i, dummy.matrix);

        dummy.position.set(tp.x, tp.y + 1.25 * tp.scale, tp.z);
        dummy.updateMatrix();
        lowerCrowns.setMatrixAt(i, dummy.matrix);

        dummy.position.set(tp.x, tp.y + 1.95 * tp.scale, tp.z);
        dummy.updateMatrix();
        upperCrowns.setMatrixAt(i, dummy.matrix);
      }
      this.propGroup.add(trunks, lowerCrowns, upperCrowns);
    }

    // 2. Stone Quarry Outcrops
    if (stones.length > 0) {
      const mainRocks = this.buildBatch(
        stones,
        new THREE.DodecahedronGeometry(0.54, 0),
        0x9ca3af,
        0.38,
        1.0,
      );
      const sideRocks = this.buildBatch(
        stones,
        new THREE.DodecahedronGeometry(0.34, 0),
        0x787f8a,
        0.22,
        1.0,
        0.26,
      );
      this.propGroup.add(mainRocks, sideRocks);
    }

    // 3. Berry Bushes
    if (foods.length > 0) {
      const shrubs = this.buildBatch(
        foods,
        new THREE.DodecahedronGeometry(0.46, 1),
        0x488232,
        0.32,
        1.0,
      );
      const berries = this.buildBatch(
        foods,
        new THREE.IcosahedronGeometry(0.28, 0),
        0xe63946,
        0.58,
        1.0,
      );
      this.propGroup.add(shrubs, berries);
    }

    // 4. Hide Hunting Racks
    if (hides.length > 0) {
      const racks = this.buildBatch(
        hides,
        new THREE.ConeGeometry(0.48, 0.85, 5),
        0xb87a42,
        0.42,
        1.0,
      );
      this.propGroup.add(racks);
    }

    // 5. Bronze Ore Veins
    if (bronzes.length > 0) {
      const baseRock = this.buildBatch(
        bronzes,
        new THREE.DodecahedronGeometry(0.48, 0),
        0x5c534a,
        0.3,
        1.0,
      );
      const crystal = new THREE.InstancedMesh(
        new THREE.OctahedronGeometry(0.42, 0),
        new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: 0x78350f,
          roughness: 0.35,
          metalness: 0.65,
          flatShading: true,
        }),
        bronzes.length,
      );
      for (let i = 0; i < bronzes.length; i++) {
        const b = bronzes[i]!;
        const h = this.heightMap.getHeight(b.tile.tx, b.tile.tz);
        dummy.position.set(b.position.x, h + 0.62, b.position.z);
        dummy.scale.set(0.85, 1.35, 0.85);
        dummy.rotation.y = i * 0.8;
        dummy.updateMatrix();
        crystal.setMatrixAt(i, dummy.matrix);
      }
      this.propGroup.add(baseRock, crystal);
    }
  }

  private buildBatch(
    items: readonly ResourceNodeEntity[],
    geometry: THREE.BufferGeometry,
    colorHex: number,
    yOffset: number,
    scale: number,
    xOffset: number = 0,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.76,
        flatShading: true,
      }),
      Math.max(1, items.length),
    );
    mesh.castShadow = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const h = this.heightMap.getHeight(item.tile.tx, item.tile.tz);
      dummy.position.set(
        item.position.x + xOffset,
        h + yOffset,
        item.position.z + xOffset,
      );
      dummy.scale.setScalar(scale);
      dummy.rotation.y = (item.tile.tx * 1.7 + item.tile.tz * 0.9) % Math.PI;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = items.length;
    return mesh;
  }

  public applyFogShading(fog: FogOfWar): void {
    const size = this.heightMap.size;
    const chunkSize = CONFIG.TERRAIN_CHUNK_SIZE;

    for (const record of this.chunks) {
      const startX = record.chunkX * chunkSize;
      const startZ = record.chunkZ * chunkSize;
      const tilesW = Math.min(chunkSize, size - startX);
      const tilesH = Math.min(chunkSize, size - startZ);

      const colorAttr = record.mesh.geometry.getAttribute(
        'color',
      ) as THREE.BufferAttribute;
      const arr = colorAttr.array as Float32Array;
      const base = record.baseColors;

      let vOffset = 0;
      for (let dz = 0; dz < tilesH; dz++) {
        for (let dx = 0; dx < tilesW; dx++) {
          const state = fog.getState(startX + dx, startZ + dz);
          const shade = state === 2 ? 1.0 : state === 1 ? 0.76 : 0.42;

          for (let v = 0; v < 6; v++) {
            arr[vOffset] = (base[vOffset] ?? 0) * shade;
            arr[vOffset + 1] = (base[vOffset + 1] ?? 0) * shade;
            arr[vOffset + 2] = (base[vOffset + 2] ?? 0) * shade;
            vOffset += 3;
          }
        }
      }
      colorAttr.needsUpdate = true;
    }
  }

  public dispose(): void {
    for (const c of this.chunks) {
      c.mesh.geometry.dispose();
    }
    this.root.clear();
  }
}