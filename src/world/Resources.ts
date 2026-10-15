/**
 * STONEWALKER — Infinite-Health Resource Node Manager (Sections 5 & 7)
 * Resource nodes (trees, berry bushes, hunting grounds, stone deposits, bronze ore veins)
 * now have infinite health so they never run out when Workers harvest them.
 * Trees can still be crushed into bonus Wood if the Walking Base stomps directly over them.
 */

import { BALANCE } from '../data/balance';
import type {
  EntityId,
  ResourceNodeEntity,
  ResourceType,
  TileCoord,
  Vec2,
} from '../data/types';
import type { WorldGrid } from './Grid';

const INFINITE_RESOURCE_AMOUNT = 999999;

export class ResourceManager {
  private readonly nodes = new Map<EntityId, ResourceNodeEntity>();
  private nextIdCounter = 1;

  public clear(): void {
    this.nodes.clear();
    this.nextIdCounter = 1;
  }

  public spawnNode(
    resourceType: ResourceType,
    tile: TileCoord,
    _amount: number,
    grid: WorldGrid,
  ): ResourceNodeEntity {
    const id = `res_${this.nextIdCounter++}`;
    const node: ResourceNodeEntity = {
      id,
      kind: 'resource',
      resourceType,
      tile: { tx: tile.tx, tz: tile.tz },
      position: { x: tile.tx + 0.5, z: tile.tz + 0.5 },
      amountRemaining: INFINITE_RESOURCE_AMOUNT,
      maxAmount: INFINITE_RESOURCE_AMOUNT,
    };
    this.nodes.set(id, node);
    grid.setResourceTile(tile, id);
    return node;
  }

  public getNode(id: EntityId): ResourceNodeEntity | undefined {
    return this.nodes.get(id);
  }

  public getAllNodes(): ResourceNodeEntity[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Harvests `requestedAmount` from a node without depleting it (infinite resource health).
   */
  public harvestFromNode(
    id: EntityId,
    requestedAmount: number,
    _grid: WorldGrid,
  ): { harvested: number; depleted: boolean; resourceType: ResourceType | null } {
    const node = this.nodes.get(id);
    if (!node) {
      return { harvested: 0, depleted: true, resourceType: null };
    }
    // Keep resource node at infinite health so it never depletes
    node.amountRemaining = INFINITE_RESOURCE_AMOUNT;
    return {
      harvested: requestedAmount,
      depleted: false,
      resourceType: node.resourceType,
    };
  }

  /**
   * Called by the Stomp system when the Walking Base steps on a forest/tree tile (Section 5).
   */
  public crushTreeAtTile(
    tx: number,
    tz: number,
    grid: WorldGrid,
  ): number {
    const resId = grid.getResourceAtTile(tx, tz);
    if (resId) {
      const node = this.nodes.get(resId);
      if (node && node.resourceType === 'wood') {
        grid.setResourceTile(node.tile, null);
        grid.heightMap.setTag(tx, tz, 'ground');
        this.nodes.delete(resId);
        return BALANCE.BASE_STOMP_TREE_WOOD_YIELD;
      }
    }
    if (grid.getTerrainTag(tx, tz) === 'forest') {
      grid.heightMap.setTag(tx, tz, 'ground');
      return BALANCE.BASE_STOMP_TREE_WOOD_YIELD;
    }
    return 0;
  }

  public findNearestNode(
    origin: Vec2,
    resourceType?: ResourceType,
    maxDistance: number = Infinity,
  ): ResourceNodeEntity | null {
    let best: ResourceNodeEntity | null = null;
    let bestDistSq = maxDistance * maxDistance;

    for (const node of this.nodes.values()) {
      if (node.amountRemaining <= 0) {
        continue;
      }
      if (resourceType && node.resourceType !== resourceType) {
        continue;
      }
      const dx = node.position.x - origin.x;
      const dz = node.position.z - origin.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = node;
      }
    }
    return best;
  }

  public serialize(): ResourceNodeEntity[] {
    return this.getAllNodes().map((n) => ({
      ...n,
      tile: { ...n.tile },
      position: { ...n.position },
    }));
  }

  public deserialize(list: readonly ResourceNodeEntity[], grid: WorldGrid): void {
    this.clear();
    for (const item of list) {
      const copy: ResourceNodeEntity = {
        ...item,
        tile: { ...item.tile },
        position: { ...item.position },
        amountRemaining: INFINITE_RESOURCE_AMOUNT,
        maxAmount: INFINITE_RESOURCE_AMOUNT,
      };
      this.nodes.set(copy.id, copy);
      grid.setResourceTile(copy.tile, copy.id);
      const numericPart = Number(copy.id.replace('res_', ''));
      if (!Number.isNaN(numericPart) && numericPart >= this.nextIdCounter) {
        this.nextIdCounter = numericPart + 1;
      }
    }
  }
}