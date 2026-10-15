/**
 * STONEWALKER — Worker Entity Factory (Sections 7, 8 & 9)
 * Tracks job memory for 15-second idle resumption and emergency Weapon Station equipment.
 */

import { UNITS } from '../data/units';
import type { EntityId, FactionId, UnitEntity, Vec2 } from '../data/types';

let workerIdCounter = 1;

export function createWorkerEntity(params: {
  id?: EntityId;
  faction: FactionId;
  position: Vec2;
}): UnitEntity {
  const def = UNITS.worker;
  const id = params.id ?? `wrk_${params.faction}_${workerIdCounter++}`;

  return {
    id,
    kind: 'unit',
    role: 'worker',
    faction: params.faction,
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
    status: 'idle',
    idleTimer: 0,
    veterancyKills: 0,
    veterancyRank: 0,
    guardSpot: null,
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