/**
 * STONEWALKER — High-Performance Footprint-Aware A* Pathfinder with String-Pulling
 * - Binary Min-Heap open list for fast path queries on 192x192 maps.
 * - Prevents diagonal corner-cutting around buildings and cliffs.
 * - Applies Line-of-Sight smoothing for 1x1 units so armies walk in natural straight lines
 *   instead of stair-stepping on tile centers.
 */

import { BALANCE } from '../data/balance';
import type { EntityId, Vec2 } from '../data/types';
import type { WorldGrid } from '../world/Grid';

export interface PathRequestOptions {
  footprint?: number;
  ignoreEntityId?: EntityId | null;
  allowStompable?: boolean;
  maxNodesVisited?: number;
}

export interface PathPreviewResult {
  path: Vec2[];
  isBlocked: boolean;
  totalDistance: number;
  estimatedSeconds: number;
}

export class Pathfinder {
  public static findPath(
    grid: WorldGrid,
    start: Vec2,
    goal: Vec2,
    options: PathRequestOptions = {},
  ): Vec2[] {
    const footprint = options.footprint ?? 1;
    const ignoreId = options.ignoreEntityId ?? null;
    const allowStompable = options.allowStompable ?? false;
    const maxNodes = options.maxNodesVisited ?? 3200;

    const size = grid.size;
    const halfOffset = footprint * 0.5;

    let sx = Math.max(
      0,
      Math.min(size - footprint, Math.round(start.x - halfOffset)),
    );
    let sz = Math.max(
      0,
      Math.min(size - footprint, Math.round(start.z - halfOffset)),
    );
    let gx = Math.max(
      0,
      Math.min(size - footprint, Math.round(goal.x - halfOffset)),
    );
    let gz = Math.max(
      0,
      Math.min(size - footprint, Math.round(goal.z - halfOffset)),
    );

    // If start tile is temporarily inside a building footprint, nudge to nearest free tile
    if (!grid.canOccupyFootprint(sx, sz, footprint, ignoreId, allowStompable)) {
      const freeStart = this.findNearestWalkableTile(
        grid,
        sx,
        sz,
        footprint,
        ignoreId,
        allowStompable,
      );
      if (freeStart) {
        sx = freeStart.tx;
        sz = freeStart.tz;
      }
    }

    // If goal tile is blocked, spiral-search for closest valid tile
    if (!grid.canOccupyFootprint(gx, gz, footprint, ignoreId, allowStompable)) {
      const fallback = this.findNearestWalkableTile(
        grid,
        gx,
        gz,
        footprint,
        ignoreId,
        allowStompable,
      );
      if (!fallback) {
        return [];
      }
      gx = fallback.tx;
      gz = fallback.tz;
    }

    if (sx === gx && sz === gz) {
      return [{ x: gx + halfOffset, z: gz + halfOffset }];
    }

    const total = size * size;
    const gScore = new Float32Array(total).fill(Infinity);
    const fScore = new Float32Array(total).fill(Infinity);
    const cameFrom = new Int32Array(total).fill(-1);
    const closed = new Uint8Array(total);

    const startIdx = sz * size + sx;
    const goalIdx = gz * size + gx;

    gScore[startIdx] = 0;
    fScore[startIdx] = this.octileHeuristic(sx, sz, gx, gz);

    // Binary Min-Heap storing tile indices ordered by fScore
    const heap: number[] = [startIdx];
    const heapPush = (nodeIdx: number): void => {
      heap.push(nodeIdx);
      let i = heap.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (fScore[heap[i]!]! < fScore[heap[parent]!]!) {
          const tmp = heap[i]!;
          heap[i] = heap[parent]!;
          heap[parent] = tmp;
          i = parent;
        } else {
          break;
        }
      }
    };

    const heapPop = (): number => {
      const top = heap[0]!;
      const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        let i = 0;
        const len = heap.length;
        while (true) {
          const left = (i << 1) + 1;
          const right = left + 1;
          let smallest = i;
          if (left < len && fScore[heap[left]!]! < fScore[heap[smallest]!]!) {
            smallest = left;
          }
          if (right < len && fScore[heap[right]!]! < fScore[heap[smallest]!]!) {
            smallest = right;
          }
          if (smallest !== i) {
            const tmp = heap[i]!;
            heap[i] = heap[smallest]!;
            heap[smallest] = tmp;
            i = smallest;
          } else {
            break;
          }
        }
      }
      return top;
    };

    const neighbors = [
      [1, 0, 1.0],
      [-1, 0, 1.0],
      [0, 1, 1.0],
      [0, -1, 1.0],
      [1, 1, 1.4142],
      [-1, 1, 1.4142],
      [1, -1, 1.4142],
      [-1, -1, 1.4142],
    ] as const;

    let nodesVisited = 0;
    let bestIdx = startIdx;
    let bestHeuristic = fScore[startIdx]!;

    while (heap.length > 0 && nodesVisited < maxNodes) {
      const currentIdx = heapPop();

      if (currentIdx === goalIdx) {
        const rawPath = this.reconstructPath(
          cameFrom,
          currentIdx,
          size,
          halfOffset,
        );
        return footprint === 1
          ? this.smoothUnitPath(grid, start, rawPath, ignoreId)
          : rawPath;
      }

      if (closed[currentIdx]) {
        continue;
      }
      closed[currentIdx] = 1;
      nodesVisited++;

      const cx = currentIdx % size;
      const cz = Math.floor(currentIdx / size);

      for (const [dx, dz, stepCost] of neighbors) {
        const nx = cx + dx;
        const nz = cz + dz;

        if (
          !grid.canOccupyFootprint(nx, nz, footprint, ignoreId, allowStompable)
        ) {
          continue;
        }

        // Prevent diagonal corner-cutting across blocked orthogonal tiles
        if (dx !== 0 && dz !== 0) {
          if (
            !grid.canOccupyFootprint(
              cx + dx,
              cz,
              footprint,
              ignoreId,
              allowStompable,
            ) ||
            !grid.canOccupyFootprint(
              cx,
              cz + dz,
              footprint,
              ignoreId,
              allowStompable,
            )
          ) {
            continue;
          }
        }

        const nIdx = nz * size + nx;
        if (closed[nIdx]) {
          continue;
        }

        const tag = grid.getTerrainTag(nx, nz);
        const terrainPenalty =
          tag === 'swamp' ? 1 / BALANCE.SWAMP_SPEED_MULTIPLIER : 1.0;
        const tentativeG = gScore[currentIdx]! + stepCost * terrainPenalty;

        if (tentativeG < gScore[nIdx]!) {
          cameFrom[nIdx] = currentIdx;
          gScore[nIdx] = tentativeG;
          const h = this.octileHeuristic(nx, nz, gx, gz);
          fScore[nIdx] = tentativeG + h;
          if (h < bestHeuristic) {
            bestHeuristic = h;
            bestIdx = nIdx;
          }
          heapPush(nIdx);
        }
      }
    }

    if (bestIdx !== startIdx) {
      const rawPath = this.reconstructPath(cameFrom, bestIdx, size, halfOffset);
      return footprint === 1
        ? this.smoothUnitPath(grid, start, rawPath, ignoreId)
        : rawPath;
    }
    return [];
  }

  private static octileHeuristic(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
  ): number {
    const dx = Math.abs(x1 - x0);
    const dz = Math.abs(z1 - z0);
    return dx + dz + (1.4142 - 2) * Math.min(dx, dz);
  }

  /**
   * Line-of-Sight string-pulling for 1x1 units so armies march smoothly without grid zig-zags.
   */
  private static smoothUnitPath(
    grid: WorldGrid,
    start: Vec2,
    path: Vec2[],
    ignoreId: EntityId | null,
  ): Vec2[] {
    if (path.length <= 2) {
      return path;
    }
    const smoothed: Vec2[] = [];
    let anchor = start;
    let index = 0;

    while (index < path.length) {
      let furthestVisible = index;
      for (let probe = path.length - 1; probe > index; probe--) {
        if (this.hasLineOfSight(grid, anchor, path[probe]!, ignoreId)) {
          furthestVisible = probe;
          break;
        }
      }
      const nextPt = path[furthestVisible]!;
      smoothed.push(nextPt);
      anchor = nextPt;
      index = furthestVisible + 1;
    }
    return smoothed;
  }

  private static hasLineOfSight(
    grid: WorldGrid,
    from: Vec2,
    to: Vec2,
    ignoreId: EntityId | null,
  ): boolean {
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    const steps = Math.max(1, Math.ceil(dist * 2.5));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = Math.floor(from.x + (to.x - from.x) * t);
      const z = Math.floor(from.z + (to.z - from.z) * t);
      if (!grid.canOccupyFootprint(x, z, 1, ignoreId, false)) {
        return false;
      }
      if (grid.getTerrainTag(x, z) === 'swamp') {
        return false;
      }
    }
    return true;
  }

  public static computePathPreview(
    grid: WorldGrid,
    start: Vec2,
    goal: Vec2,
    moveSpeed: number,
    options: PathRequestOptions = {},
  ): PathPreviewResult {
    const footprint = options.footprint ?? 4;
    const halfOffset = footprint * 0.5;
    const gx = Math.round(goal.x - halfOffset);
    const gz = Math.round(goal.z - halfOffset);

    const destinationWalkable = grid.canOccupyFootprint(
      gx,
      gz,
      footprint,
      options.ignoreEntityId ?? null,
      options.allowStompable ?? true,
    );

    const path = this.findPath(grid, start, goal, options);
    let totalDistance = 0;
    let prev = start;
    for (const pt of path) {
      totalDistance += Math.hypot(pt.x - prev.x, pt.z - prev.z);
      prev = pt;
    }

    const effectiveSpeed = Math.max(0.5, moveSpeed);
    const estimatedSeconds = Math.ceil(totalDistance / effectiveSpeed);
    const isBlocked = !destinationWalkable || path.length === 0;

    return {
      path,
      isBlocked,
      totalDistance,
      estimatedSeconds,
    };
  }

  private static findNearestWalkableTile(
    grid: WorldGrid,
    gx: number,
    gz: number,
    footprint: number,
    ignoreId: EntityId | null,
    allowStompable: boolean,
  ): { tx: number; tz: number } | null {
    for (let radius = 1; radius <= 10; radius++) {
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) {
            continue;
          }
          const tx = gx + dx;
          const tz = gz + dz;
          if (
            grid.canOccupyFootprint(
              tx,
              tz,
              footprint,
              ignoreId,
              allowStompable,
            )
          ) {
            return { tx, tz };
          }
        }
      }
    }
    return null;
  }

  private static reconstructPath(
    cameFrom: Int32Array,
    currentIdx: number,
    size: number,
    halfOffset: number,
  ): Vec2[] {
    const raw: Vec2[] = [];
    let curr = currentIdx;
    while (curr !== -1) {
      const tx = curr % size;
      const tz = Math.floor(curr / size);
      raw.push({ x: tx + halfOffset, z: tz + halfOffset });
      curr = cameFrom[curr]!;
    }
    raw.reverse();
    if (raw.length > 1) {
      raw.shift();
    }
    return raw;
  }
}