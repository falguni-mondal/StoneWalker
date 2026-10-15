/**
 * STONEWALKER — ResourceNode Entity Factory (Section 7)
 */

import type {
  EntityId,
  ResourceNodeEntity,
  ResourceType,
  TileCoord,
} from '../data/types';

let resNodeCounter = 1;

export function createResourceNodeEntity(params: {
  id?: EntityId;
  resourceType: ResourceType;
  tile: TileCoord;
  amount: number;
}): ResourceNodeEntity {
  const id = params.id ?? `res_${resNodeCounter++}`;
  return {
    id,
    kind: 'resource',
    resourceType: params.resourceType,
    tile: { tx: params.tile.tx, tz: params.tile.tz },
    position: { x: params.tile.tx + 0.5, z: params.tile.tz + 0.5 },
    amountRemaining: params.amount,
    maxAmount: params.amount,
  };
}