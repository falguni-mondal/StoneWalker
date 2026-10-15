/**
 * STONEWALKER — Wild & Tamed Prehistoric Beast Entity Factory (Section 8 [BONUS])
 */

import { BEASTS } from '../data/beasts';
import type {
  BeastRole,
  EntityId,
  FactionId,
  UnitEntity,
  Vec2,
} from '../data/types';

let beastIdCounter = 1;

export function createBeastEntity(params: {
  id?: EntityId;
  role: BeastRole;
  faction?: FactionId;
  position: Vec2;
}): UnitEntity {
  const def = BEASTS[params.role];
  const faction = params.faction ?? 'neutral';
  const id = params.id ?? `bst_${beastIdCounter++}`;

  return {
    id,
    kind: 'beast',
    role: params.role,
    faction,
    position: { x: params.position.x, z: params.position.z },
    rotation: 0,
    hp: def.maxHp,
    maxHp: def.maxHp,
    shieldHp: 0,
    speed: def.speed,
    attackCooldownTimer: 0,
    path: [],
    targetEntityId: null,
    moveTarget: null,
    stance: 'aggressive',
    status: 'guarding',
    idleTimer: 0,
    veterancyKills: 0,
    veterancyRank: 0,
    guardSpot: { x: params.position.x, z: params.position.z },
    carryResourceType: null,
    carryAmount: 0,
    jobMemory: {
      jobType: 'none',
      targetEntityId: null,
      resourceType: null,
      targetPosition: null,
    },
    equippedEmergencyWeapon: null,
    parentMachineId: null,
    activeCrawlerIds: [],
    crawlerSpawnTimer: 0,
    heroAbilityCooldownTimer: 0,
    isReviving: false,
    reviveTimer: 0,
  };
}